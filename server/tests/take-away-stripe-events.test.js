const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: { sendPushToModule: async () => ({ sent: 0 }) },
};
const {
  createEventProcessor,
  refreshEvent,
} = require("../services/take-away-stripe-events.service");

const restaurant = { _id: "69f0bb675a8008341d6706c2" };
function event(type = "payment_intent.succeeded", id = "evt_synthetic") {
  return {
    id,
    type,
    data: {
      object: {
        id: "pi_synthetic",
        status: "succeeded",
        metadata: {
          type: type.startsWith("refund.")
            ? "takeaway_order_refund"
            : "takeaway_order",
          restaurantId: restaurant._id,
          orderId: "6ad8f25a2dfb120938c29167",
        },
      },
    },
  };
}

// An atomic repository double. Production uses Mongo's unique _id and CAS
// operations; these tests never connect to the environment's database/Stripe.
function repository() {
  const rows = new Map();
  let failCompletion = false;
  return {
    rows,
    failNextCompletion() {
      failCompletion = true;
    },
    async create(row) {
      if (rows.has(row._id))
        throw Object.assign(new Error("duplicate"), { code: 11000 });
      rows.set(row._id, {
        ...row,
        processedAt: null,
        leaseUntil: null,
        leaseOwner: "",
        attempts: 0,
      });
    },
    async findById(id) {
      return rows.has(id) ? { ...rows.get(id) } : null;
    },
    async findOneAndUpdate(filter, update) {
      const row = rows.get(filter._id);
      if (
        row.processedAt ||
        (row.leaseUntil && row.leaseUntil > filter.$or[1].leaseUntil.$lte)
      )
        return null;
      Object.assign(row, update.$set);
      row.attempts += update.$inc.attempts;
      return { ...row };
    },
    async updateOne(filter, update) {
      const row = rows.get(filter._id);
      if (!row || row.leaseOwner !== filter.leaseOwner || row.processedAt)
        return { modifiedCount: 0 };
      if (update.$set.processedAt && failCompletion) {
        failCompletion = false;
        throw new Error("DB unavailable after business commit");
      }
      Object.assign(row, update.$set);
      return { modifiedCount: 1 };
    },
  };
}

test("processed receipts survive processor restart and isolate restaurants", async () => {
  const receipts = repository();
  let calls = 0;
  const options = {
    receipts,
    refresh: async (e) => e,
    handle: async () => {
      calls++;
      return { handled: true };
    },
  };
  await createEventProcessor(options)({ restaurant, event: event() });
  assert.equal(
    (await createEventProcessor(options)({ restaurant, event: event() }))
      .duplicate,
    true,
  );
  assert.equal(calls, 1);
  const other = { _id: "69f0bb675a8008341d6706c3" };
  const otherEvent = event();
  otherEvent.data.object.metadata.restaurantId = other._id;
  await createEventProcessor(options)({ restaurant: other, event: otherEvent });
  assert.equal(calls, 2);
});

test("simultaneous deliveries return non-2xx while the first is in progress", async () => {
  const receipts = repository();
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const process = createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => {
      calls++;
      entered();
      await gate;
      return { handled: true };
    },
  });
  const first = process({ restaurant, event: event() });
  await waiting;
  await assert.rejects(process({ restaurant, event: event() }), {
    status: 503,
    code: "STRIPE_EVENT_BUSY",
  });
  release();
  await first;
  assert.equal(calls, 1);
});

test("backend failure releases the receipt and permits a successful retry", async () => {
  const receipts = repository();
  let calls = 0;
  const process = createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => {
      if (++calls === 1) throw new Error("DB down");
      return { handled: true };
    },
  });
  await assert.rejects(process({ restaurant, event: event() }), /DB down/);
  assert.equal([...receipts.rows.values()][0].processedAt, null);
  await process({ restaurant, event: event() });
  assert.equal(calls, 2);
  assert.ok([...receipts.rows.values()][0].processedAt);
});

test("a crash after business commit does not acknowledge an unsaved receipt", async () => {
  const receipts = repository();
  receipts.failNextCompletion();
  let paid = false;
  let confirmations = 0;
  const process = createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => {
      if (!paid) {
        paid = true;
        confirmations++;
      }
      return { handled: true };
    },
  });
  await assert.rejects(
    process({ restaurant, event: event() }),
    /DB unavailable/,
  );
  await process({ restaurant, event: event() });
  assert.equal(confirmations, 1);
});

test("an expired lease can be recovered but an unfinished event is not acknowledged", async () => {
  const receipts = repository();
  const process = createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => ({ handled: false }),
  });
  await assert.rejects(process({ restaurant, event: event() }), {
    code: "STRIPE_EVENT_NOT_HANDLED",
  });
  const row = [...receipts.rows.values()][0];
  row.leaseOwner = "dead-worker";
  row.leaseUntil = new Date(Date.now() - 1);
  await createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => ({ handled: true }),
  })({ restaurant, event: event() });
  assert.ok(row.processedAt);
});

test("receipt storage and Stripe read outages never produce a successful acknowledgement", async () => {
  await assert.rejects(
    createEventProcessor({
      receipts: {
        create: async () => {
          throw new Error("DB down");
        },
      },
    })({ restaurant, event: event() }),
    /DB down/,
  );
  const receipts = repository();
  let handleCalls = 0;
  await assert.rejects(
    createEventProcessor({
      receipts,
      refresh: async () => {
        throw new Error("Stripe temporarily down");
      },
      handle: async () => {
        handleCalls++;
      },
    })({ restaurant, event: event() }),
    /Stripe temporarily down/,
  );
  assert.equal(handleCalls, 0);
  assert.equal([...receipts.rows.values()][0].processedAt, null);
});

test("stale failures are reconciled to succeeded/canceled/current processing states", async () => {
  for (const [status, expected] of [
    ["succeeded", "payment_intent.succeeded"],
    ["canceled", "payment_intent.canceled"],
    ["requires_payment_method", "payment_intent.payment_failed"],
    ["processing", null],
  ]) {
    const e = event("payment_intent.payment_failed");
    const stripe = {
      paymentIntents: { retrieve: async () => ({ ...e.data.object, status }) },
    };
    const result = await refreshEvent(e, restaurant, stripe);
    assert.equal(result?.type || null, expected);
  }
});

test("refund processing reads the latest refund and verifies its restaurant", async () => {
  const e = event("refund.updated");
  const result = await refreshEvent(e, restaurant, {
    refunds: {
      retrieve: async () => ({ ...e.data.object, status: "succeeded" }),
    },
  });
  assert.equal(result.data.object.status, "succeeded");
  await assert.rejects(
    refreshEvent(e, restaurant, {
      refunds: { retrieve: async () => ({ ...e.data.object, metadata: {} }) },
    }),
    /Restaurant webhook/,
  );
});

test("payment audit: PaymentIntent responses return the refreshed stored payment state", async (t) => {
  const service = require("../services/take-away.service");
  const Restaurant = require("../models/restaurant.model");
  const path = require.resolve("../routes/take-away.routes");
  const original = { find: service.findPublicOrderByAccessToken,
    create: service.createOrderPaymentIntent, restaurantFind: Restaurant.findById,
    stripeKey: process.env.STRIPE_API_SECRET_KEY, router: require.cache[path] };
  process.env.STRIPE_API_SECRET_KEY = "sk_test_synthetic_no_network";
  let reads = 0;
  service.findPublicOrderByAccessToken = async () => ({ _id: "order-synthetic",
    paymentMethod: "online", paymentStatus: ++reads === 1 ? "pending" : "paid",
    status: reads === 1 ? "pending" : "confirmed", stripeRefundStatus: "pending", items: [] });
  service.createOrderPaymentIntent = async () => ({ id: "pi_synthetic", client_secret: "synthetic_only" });
  Restaurant.findById = () => { const p = Promise.resolve(restaurant); p.populate = () => p; return p; };
  delete require.cache[path];
  t.after(() => {
    service.findPublicOrderByAccessToken = original.find; service.createOrderPaymentIntent = original.create;
    Restaurant.findById = original.restaurantFind;
    if (original.stripeKey === undefined) delete process.env.STRIPE_API_SECRET_KEY;
    else process.env.STRIPE_API_SECRET_KEY = original.stripeKey;
    if (original.router) require.cache[path] = original.router; else delete require.cache[path];
  });
  const route = require(path).stack.find((layer) => layer.route?.path.endsWith("/:orderId/payment-intent")).route;
  const req = { params: { restaurantId: restaurant._id, orderId: "order-synthetic" }, get: () => "synthetic_token" };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await route.stack.at(-1).handle(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(reads, 2);
  assert.equal(res.body.order.paymentStatus, "paid");
  assert.equal(res.body.order.status, "confirmed");
  assert.equal(res.body.order.stripeRefundStatus, "pending");
});

test("the actual Express endpoint requires HMAC and only acknowledges committed receipts", async (t) => {
  const express = require("express");
  const { createServiceSignature } = require("../middleware/service-signature");
  const Restaurant = require("../models/restaurant.model");
  const service = require("../services/take-away-stripe-events.service");
  const routerPath = require.resolve("../routes/take-away.routes");
  const oldStripeKey = process.env.STRIPE_API_SECRET_KEY;
  process.env.STRIPE_API_SECRET_KEY = "sk_test_synthetic_no_network";
  const find = Restaurant.findById;
  const originalProcessor = service.processTakeAwayStripeEvent;
  const oldSecret = process.env.GUSTO_SHARED_SECRET;
  const receipts = repository();
  let calls = 0;
  let unavailable = false;
  service.processTakeAwayStripeEvent = createEventProcessor({
    receipts,
    refresh: async (e) => e,
    handle: async () => {
      calls++;
      if (unavailable) throw new Error("Backend failure");
      return { handled: true };
    },
  });
  Restaurant.findById = () => {
    const result = Promise.resolve({
      ...restaurant,
      options: { take_away: false },
    });
    result.populate = () => result;
    return result;
  };
  process.env.GUSTO_SHARED_SECRET = "synthetic_hmac_key";
  delete require.cache[routerPath];
  const app = express();
  app.use(express.json());
  app.use("/api", require(routerPath));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Restaurant.findById = find;
    service.processTakeAwayStripeEvent = originalProcessor;
    delete require.cache[routerPath];
    if (oldStripeKey === undefined) delete process.env.STRIPE_API_SECRET_KEY;
    else process.env.STRIPE_API_SECRET_KEY = oldStripeKey;
    if (oldSecret === undefined) delete process.env.GUSTO_SHARED_SECRET;
    else process.env.GUSTO_SHARED_SECRET = oldSecret;
  });
  async function send(e, signatureValid = true) {
    const payload = { restaurantId: restaurant._id, event: e };
    const timestamp = String(Date.now());
    return fetch(
      `http://127.0.0.1:${server.address().port}/api/take-away/stripe-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gusto-timestamp": timestamp,
          "x-gusto-signature": signatureValid
            ? createServiceSignature({
                timestamp,
                payload,
                secret: process.env.GUSTO_SHARED_SECRET,
              })
            : "invalid",
        },
        body: JSON.stringify(payload),
      },
    );
  }
  assert.equal((await send(event(), false)).status, 401);
  assert.equal(calls, 0);
  const success = await send(event());
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { received: true, handled: true });
  assert.equal((await send(event())).status, 200);
  assert.equal(calls, 1);
  unavailable = true;
  assert.equal(
    (await send(event("payment_intent.payment_failed", "evt_failure"))).status,
    500,
  );
  unavailable = false;
  assert.equal(
    (await send(event("payment_intent.payment_failed", "evt_failure"))).status,
    200,
  );
});
