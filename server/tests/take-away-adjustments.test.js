const test = require("node:test");
const assert = require("node:assert/strict");
const Order = require("../models/take-away-order.model");
const mailerPath = require.resolve("../services/take-away-mailer.service");
const { buildTakeAwayEmail } = require(mailerPath);
const emails = [];
let failEmail = false;
require.cache[mailerPath].exports = {
  sendTakeAwayOrderEmail: async (payload) => {
    if (failEmail) throw new Error("mock email failure");
    emails.push(payload);
    return { messageId: "mock" };
  },
};
const notificationPath = require.resolve("../services/notifications.service");
require.cache[notificationPath] = {
  id: notificationPath,
  filename: notificationPath,
  loaded: true,
  exports: {
    createAndBroadcastNotification: async () => ({ _id: "mock-notification" }),
  },
};
const service = require("../services/take-away.service");
const adjustment = require("../services/take-away-adjustments.service");
const restaurant = {
  _id: "restaurant-1",
  name: "Restaurant",
  takeAwaySettings: {
    auto_accept: false,
    confirmationDeadlineEnabled: true,
    confirmationDeadlineMinutes: 30,
  },
};

function fixture(extra = {}) {
  return {
    _id: "order-1",
    restaurant_id: restaurant._id,
    orderNumber: "TA-TEST",
    source: "public",
    securityVersion: 1,
    financialVersion: 1,
    financialRevision: 0,
    status: "pending",
    fulfillmentMode: "delivery",
    slotId: "2099-09-07-20:00",
    paymentMethod: "online",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_test",
    stripeRefundId: "",
    refundTargetStatus: "",
    currency: "eur",
    customer: null,
    crmRecordedAt: new Date(),
    restaurantNotifiedAt: new Date(),
    customerFirstName: "Ada",
    customerLastName: "Client",
    customerEmail: "ada@example.com",
    scheduledFor: new Date("2099-09-07T18:00:00Z"),
    confirmationRequired: true,
    confirmationDeadlineAt: new Date("2099-09-07T17:30:00Z"),
    items: [
      {
        lineId: "burger",
        name: "Burger",
        catalogItemId: "burger",
        quantity: 3,
        unitPrice: 10,
        optionsTotal: 2,
        options: [{ name: "Option", price: 2 }],
        lineTotal: 36,
      },
      {
        lineId: "dessert",
        name: "Dessert",
        catalogItemId: "dessert",
        quantity: 2,
        unitPrice: 5,
        optionsTotal: 0,
        options: [],
        lineTotal: 10,
      },
    ],
    subtotal: 46,
    deliveryFee: 4,
    total: 50,
    remainingAmountCents: 5000,
    refundedAmountCents: 0,
    adjustments: [],
    businessEvents: [],
    pendingCrmAdjustmentIds: [],
    pendingCustomerEmailEvents: [],
    customerEmailEventsSent: [],
    ...extra,
  };
}
function equal(a, b) {
  return a instanceof Date || b instanceof Date
    ? new Date(a).getTime() === new Date(b).getTime()
    : a === b || (a == null && b == null);
}
function match(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some((entry) => match(doc, entry));
    if (key === "$and") return condition.every((entry) => match(doc, entry));
    const value = doc[key];
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    ) {
      return Object.entries(condition).every(([operator, expected]) => {
        const values = Array.isArray(value) ? value : [value];
        if (operator === "$in")
          return values.some((actual) =>
            expected.some((entry) => equal(actual, entry)),
          );
        if (operator === "$nin")
          return !values.some((actual) =>
            expected.some((entry) => equal(actual, entry)),
          );
        if (operator === "$ne")
          return !values.some((actual) => equal(actual, expected));
        if (operator === "$gt") return value != null && value > expected;
        if (operator === "$lte") return value != null && value <= expected;
        if (operator === "$exists") return (value !== undefined) === expected;
        if (operator === "$elemMatch")
          return (value || []).some((entry) => match(entry, expected));
        throw new Error(`Unsupported mock operator ${operator}`);
      });
    }
    return (Array.isArray(value) ? value : [value]).some((actual) =>
      equal(actual, condition),
    );
  });
}
function update(doc, change) {
  // Exercise the actual embedded casting before the atomic write. A plain
  // object mock alone would silently accept invalid Boolean values.
  for (const field of ["adjustments", "businessEvents"]) {
    const pushed = change.$push?.[field];
    const values =
      change.$set?.[field] ?? (pushed ? pushed.$each || [pushed] : null);
    if (values) {
      const cast = Order.schema.path(field).cast(values);
      for (const embedded of cast) {
        const error = embedded.validateSync();
        if (error) throw error;
      }
    }
  }
  Object.assign(doc, structuredClone(change.$set || {}));
  for (const [key, value] of Object.entries(change.$inc || {}))
    doc[key] = (doc[key] || 0) + value;
  for (const [key, value] of Object.entries(change.$push || {}))
    doc[key] = [
      ...(doc[key] || []),
      ...structuredClone(value.$each || [value]),
    ];
  for (const [key, value] of Object.entries(change.$addToSet || {}))
    if (!(doc[key] || []).some((entry) => equal(entry, value)))
      doc[key] = [...(doc[key] || []), structuredClone(value)];
  for (const [key, value] of Object.entries(change.$pull || {}))
    doc[key] = (doc[key] || []).filter((entry) =>
      value?.$in ? !value.$in.includes(entry) : !equal(entry, value),
    );
}
function query(value) {
  const promise = Promise.resolve(structuredClone(value));
  promise.select = () => promise;
  promise.limit = () => promise;
  return promise;
}
function memory(t, initial) {
  const doc = structuredClone(initial);
  const originals = {
    findOne: Order.findOne,
    findOneAndUpdate: Order.findOneAndUpdate,
    updateOne: Order.updateOne,
    find: Order.find,
    aggregate: Order.aggregate,
  };
  Order.findOne = (filter) => query(match(doc, filter) ? doc : null);
  Order.findOneAndUpdate = (filter, change) => {
    if (!match(doc, filter)) return query(null);
    update(doc, change);
    return query(doc);
  };
  Order.updateOne = async (filter, change) => {
    if (!match(doc, filter)) return { modifiedCount: 0 };
    update(doc, change);
    return { modifiedCount: 1 };
  };
  Order.find = (filter) => query(match(doc, filter) ? [doc] : []);
  Order.aggregate = async () => [];
  t.after(() => Object.assign(Order, originals));
  emails.length = 0;
  return doc;
}
function stripeMock(
  doc,
  { status = "succeeded", lostResponse = false, failBefore = false } = {},
) {
  const refunds = [];
  const keys = new Map();
  let calls = 0;
  const payment = {
    id: "pi_test",
    status: "succeeded",
    amount: 5000,
    amount_received: 5000,
    latest_charge: "ch_test",
    currency: "eur",
    metadata: {
      type: "takeaway_order",
      restaurantId: restaurant._id,
      orderId: doc._id,
    },
  };
  const stripe = {
    paymentIntents: {
      retrieve: async () => structuredClone(payment),
      cancel: async () => {
        payment.status = "canceled";
        return structuredClone(payment);
      },
    },
    charges: {
      retrieve: async () => ({
        id: "ch_test",
        amount_refunded: refunds
          .filter((refund) => refund.status === "succeeded")
          .reduce((sum, refund) => sum + refund.amount, 0),
      }),
    },
    refunds: {
      list: async () => ({ data: structuredClone(refunds), has_more: false }),
      retrieve: async (id) =>
        structuredClone(refunds.find((refund) => refund.id === id)),
      create: async (payload, options) => {
        calls += 1;
        assert.ok(
          doc.adjustments.some(
            (entry) =>
              entry.id === payload.metadata.operationId && entry.submittedAt,
          ),
          "decision persisted before Stripe",
        );
        if (keys.has(options.idempotencyKey))
          return structuredClone(keys.get(options.idempotencyKey));
        if (failBefore) {
          failBefore = false;
          throw new Error("network before response");
        }
        const refund = {
          ...structuredClone(payload),
          id: `re_${refunds.length + 1}`,
          currency: "eur",
          status,
        };
        refunds.push(refund);
        keys.set(options.idempotencyKey, refund);
        if (lostResponse) {
          lostResponse = false;
          throw new Error("response lost after Stripe success");
        }
        return structuredClone(refund);
      },
    },
  };
  return { stripe, refunds, keys, payment, calls: () => calls };
}
const refuse = (stripe, extra = {}) => ({
  restaurant,
  orderId: "order-1",
  requestKey: "refusal:test-0001",
  lines: [{ lineId: "burger", quantity: 1 }],
  stripeInstance: stripe,
  ...extra,
});

test("Paris deadlines respect DST, J+3 validation and optional preparation", async (t) => {
  assert.equal(
    service.mergeTakeAwaySettingsInput(
      { confirmationDeadlineEnabled: true },
      { confirmationDeadlineEnabled: false },
    ).confirmationDeadlineEnabled,
    true,
  );
  assert.equal(
    adjustment.parisDate("2026-03-29", "20:00").toISOString(),
    "2026-03-29T18:00:00.000Z",
  );
  assert.equal(
    adjustment.parisDate("2026-10-25", "20:00").toISOString(),
    "2026-10-25T19:00:00.000Z",
  );
  assert.equal(adjustment.parisDate("2026-03-29", "02:30"), null);
  assert.equal(
    adjustment.parisDate("2026-10-25", "02:30").toISOString(),
    "2026-10-25T00:30:00.000Z",
  );
  const pickup = adjustment.parisDate("2026-10-13", "20:00");
  assert.equal(
    adjustment
      .deadlineFor(
        {
          takeAwaySettings: { auto_accept: false, preparationTimeMinutes: 45 },
        },
        pickup,
      )
      .toISOString(),
    "2026-10-13T17:15:00.000Z",
  );
  assert.equal(
    adjustment.deadlineFor({ takeAwaySettings: { auto_accept: true } }, pickup),
    null,
  );
  assert.equal(
    adjustment
      .deadlineFor(
        {
          takeAwaySettings: {
            auto_accept: false,
            confirmationDeadlineEnabled: false,
          },
        },
        pickup,
      )
      .toISOString(),
    "2026-10-13T17:30:00.000Z",
  );
  const doc = memory(
    t,
    fixture({
      paymentMethod: "on_site",
      paymentStatus: "not_required",
      scheduledFor: new Date(Date.now() + 3 * 86400000),
      confirmationDeadlineAt: new Date(Date.now() + 3 * 86400000 - 1800000),
    }),
  );
  await service.updateOrderStatus({
    restaurant,
    orderId: doc._id,
    status: "confirmed",
  });
  assert.equal(doc.status, "confirmed");
});
test("public slots and authoritative creation reject expired confirmation limits", async (t) => {
  memory(t, fixture());
  const slots = Array.from({ length: 7 }, () => ({
    isClosed: false,
    slots: [
      { start: "20:00", end: "20:00", intervalMinutes: 15, maxOrders: 6 },
    ],
  }));
  // Use a valid range with two slots.
  slots.forEach((day) => {
    day.slots[0].end = "20:15";
  });
  const config = {
    _id: restaurant._id,
    takeAwaySettings: {
      ...restaurant.takeAwaySettings,
      same_hours_as_restaurant: false,
      slots,
      preparationTimeMinutes: 10,
    },
  };
  const now = adjustment.parisDate("2099-09-07", "19:40");
  assert.equal(
    (
      await service.getAvailableSlots({
        restaurant: config,
        dateKey: "2099-09-07",
        now,
      })
    ).some((slot) => slot.time === "20:00"),
    false,
  );
  assert.throws(
    () =>
      service.resolveAuthoritativeSlot({
        restaurant: config,
        payload: { slotId: "2099-09-07-20:00" },
        now,
      }),
    /confirmation/,
  );
  config.takeAwaySettings.auto_accept = true;
  assert.equal(
    (
      await service.getAvailableSlots({
        restaurant: config,
        dateKey: "2099-09-07",
        now,
      })
    )[0].time,
    "20:00",
  );
});
test("one refusal containing multiple lines preserves originals and confirms pending remainder", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  await adjustment.rejectItems(
    refuse(remote.stripe, {
      lines: [
        { lineId: "burger", quantity: 1 },
        { lineId: "dessert", quantity: 1 },
      ],
      reason: "Rupture",
    }),
  );
  assert.equal(doc.status, "confirmed");
  assert.equal(doc.total, 50);
  assert.equal(doc.items[0].quantity, 3);
  assert.equal(doc.items[0].refusedQuantity, 1);
  assert.equal(doc.refundedAmountCents, 1700);
  assert.equal(doc.remainingAmountCents, 3300);
  assert.equal(doc.paymentStatus, "paid");
  assert.equal(remote.calls(), 1);
  assert.equal(doc.adjustments.length, 1);
  assert.equal(
    emails.filter((email) => email.eventType.startsWith("partial_rejection:"))
      .length,
    1,
  );
  assert.equal(emails.length, 1, "one recap when refund succeeds immediately");
  assert.ok(
    doc.businessEvents.some((event) => event.type === "refund_requested"),
  );
  assert.ok(
    doc.businessEvents.some((event) => event.type === "refund_confirmed"),
  );
});
test("confirmed/preparing orders keep their status; historical lines use deterministic identifiers", async (t) => {
  const doc = memory(
    t,
    fixture({
      financialVersion: 0,
      status: "preparing",
      paymentMethod: "on_site",
      paymentStatus: "not_required",
    }),
  );
  delete doc.items[0].lineId;
  await adjustment.rejectItems(
    refuse(null, { lines: [{ lineId: "order-1:line:0", quantity: 1 }] }),
  );
  assert.equal(doc.status, "preparing");
  assert.equal(doc.items[0].lineId, "order-1:line:0");
  assert.equal(doc.remainingAmountCents, 3800);
  assert.equal(doc.refundedAmountCents, 0);
  assert.equal(doc.adjustments[0].state, "not_required");
  const email = buildTakeAwayEmail({
    eventType: `partial_rejection:${doc.adjustments[0].id}`,
    order: doc,
    restaurant,
  });
  assert.match(
    email.htmlContent,
    /montant à régler à la livraison a été ajusté/,
  );
  assert.doesNotMatch(email.htmlContent, /en ligne|rembours/i);
  await adjustment.recordDecision(
    refuse(null, {
      requestKey: "refusal:test-0002",
      lines: [{ lineId: "dessert", quantity: 1 }],
    }),
  );
  doc.status = "ready";
  await assert.rejects(
    adjustment.recordDecision(
      refuse(null, { requestKey: "refusal:test-0003" }),
    ),
    /ce stade/,
  );
});
test("full cancellation after a partial refund refunds only the balance including delivery fees", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  await adjustment.rejectItems(refuse(remote.stripe));
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    targetStatus: "canceled",
    stripeInstance: remote.stripe,
  });
  assert.deepEqual(
    remote.refunds.map((refund) => refund.amount),
    [1200, 3800],
  );
  assert.equal(doc.paymentStatus, "refunded");
  assert.equal(doc.refundedAmountCents, 5000);
  assert.equal(doc.remainingAmountCents, 0);
  assert.equal(doc.total, 50);
  assert.equal(doc.status, "canceled");
});
test("refusing every remaining article is terminal and includes delivery fees", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  await adjustment.rejectItems(
    refuse(remote.stripe, {
      lines: [
        { lineId: "burger", quantity: 3 },
        { lineId: "dessert", quantity: 2 },
      ],
    }),
  );
  assert.equal(doc.status, "rejected");
  assert.equal(doc.refundedAmountCents, 5000);
});
test("double requests and concurrent decisions never over-refuse or double-refund", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  await Promise.all([
    adjustment.rejectItems(refuse(remote.stripe)),
    adjustment.rejectItems(refuse(remote.stripe)),
  ]);
  assert.equal(doc.adjustments.length, 1);
  assert.equal(remote.refunds.length, 1);
  await assert.rejects(
    adjustment.rejectItems(
      refuse(remote.stripe, { lines: [{ lineId: "burger", quantity: 2 }] }),
    ),
    /autre décision/,
  );
  const results = await Promise.allSettled([
    adjustment.rejectItems(
      refuse(remote.stripe, {
        requestKey: "refusal:test-0002",
        lines: [{ lineId: "burger", quantity: 2 }],
      }),
    ),
    adjustment.rejectItems(
      refuse(remote.stripe, {
        requestKey: "refusal:test-0003",
        lines: [{ lineId: "burger", quantity: 2 }],
      }),
    ),
  ]);
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(doc.items[0].refusedQuantity, 3);
  assert.ok(doc.refundedAmountCents <= 5000);
});
test("uncertain response reconciles the original refund even after losing cached Stripe keys", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc, { lostResponse: true });
  await adjustment.rejectItems(refuse(remote.stripe));
  assert.equal(doc.adjustments[0].state, "uncertain");
  assert.equal(doc.refundedAmountCents, 0);
  remote.keys.clear();
  await adjustment.processRefunds({
    restaurant,
    orderId: doc._id,
    stripeInstance: remote.stripe,
    now: new Date(Date.now() + 600000),
  });
  assert.equal(doc.adjustments[0].state, "succeeded");
  assert.equal(remote.calls(), 1);
  assert.equal(doc.refundedAmountCents, 1200);
});
test("a pending refund that fails retries the same business operation with a new attempt", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc, { status: "pending" });
  await adjustment.rejectItems(refuse(remote.stripe));
  assert.equal(doc.adjustments[0].state, "pending");
  remote.refunds[0].status = "failed";
  const id = doc.adjustments[0].id;
  // Only subsequent creations succeed.
  const originalCreate = remote.stripe.refunds.create;
  remote.stripe.refunds.create = async (...args) => {
    const refund = await originalCreate(...args);
    refund.status = "succeeded";
    remote.refunds[remote.refunds.length - 1].status = "succeeded";
    return refund;
  };
  await adjustment.processRefunds({
    restaurant,
    orderId: doc._id,
    stripeInstance: remote.stripe,
    now: new Date(Date.now() + 600000),
  });
  assert.equal(doc.adjustments.length, 1);
  assert.equal(doc.adjustments[0].id, id);
  assert.equal(doc.adjustments[0].attempt, 1);
  assert.equal(doc.adjustments[0].state, "succeeded");
  assert.equal(doc.refundedAmountCents, 1200);
  const failedEvent = doc.businessEvents.find(
    (event) => event.type === "refund_failed",
  );
  assert.equal(failedEvent.snapshot.stripeRefundId, "re_1");
});
test("repeated/out-of-order webhooks validate each operation without undoing success", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc, { status: "pending" });
  await adjustment.rejectItems(refuse(remote.stripe));
  assert.equal(doc.paymentStatus, "paid");
  assert.equal(doc.refundedAmountCents, 0);
  const refund = { ...remote.refunds[0], status: "succeeded" };
  await assert.rejects(
    adjustment.reconcileRefund({
      restaurant,
      order: structuredClone(doc),
      refund: { ...refund, amount: 9999 },
    }),
    /non correspondant/,
  );
  await Promise.all([
    adjustment.reconcileRefund({
      restaurant,
      order: structuredClone(doc),
      refund,
    }),
    adjustment.reconcileRefund({
      restaurant,
      order: structuredClone(doc),
      refund,
    }),
  ]);
  await adjustment.reconcileRefund({
    restaurant,
    order: structuredClone(doc),
    refund: { ...refund, status: "pending" },
  });
  assert.equal(doc.refundedAmountCents, 1200);
  assert.equal(doc.adjustments[0].state, "succeeded");
  assert.equal(
    doc.businessEvents.filter((event) => event.type === "refund_confirmed")
      .length,
    1,
  );
});
test("expiration handles paid and on-site orders but never already-confirmed or historical pending orders", async (t) => {
  const doc = memory(
    t,
    fixture({ confirmationDeadlineAt: new Date(Date.now() - 1000) }),
  );
  const remote = stripeMock(doc);
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    expiration: true,
    targetStatus: "canceled",
    requestKey: "confirmation:expiration",
    stripeInstance: remote.stripe,
  });
  assert.equal(doc.status, "canceled");
  assert.equal(doc.paymentStatus, "refunded");
  assert.ok(
    doc.businessEvents.some((event) => event.type === "confirmation_expired"),
  );
  Object.assign(
    doc,
    fixture({
      paymentMethod: "on_site",
      paymentStatus: "not_required",
      confirmationDeadlineAt: new Date(Date.now() - 1000),
    }),
  );
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    expiration: true,
    targetStatus: "canceled",
    requestKey: "confirmation:expiration",
  });
  assert.equal(doc.status, "canceled");
  assert.equal(doc.refundedAmountCents, 0);
  Object.assign(
    doc,
    fixture({
      status: "confirmed",
      confirmationDeadlineAt: new Date(Date.now() - 1000),
    }),
  );
  await adjustment.recordDecision({
    restaurant,
    orderId: doc._id,
    expiration: true,
    targetStatus: "canceled",
    requestKey: "confirmation:expiration",
  });
  assert.equal(doc.status, "confirmed");
  Object.assign(
    doc,
    fixture({ financialVersion: 0, confirmationDeadlineAt: null }),
  );
  await adjustment.recordDecision({
    restaurant,
    orderId: doc._id,
    expiration: true,
    targetStatus: "canceled",
    requestKey: "confirmation:expiration",
  });
  assert.equal(doc.status, "pending");
});
test("confirmation and expiration compete atomically, with confirmation checked at write time", async (t) => {
  const doc = memory(
    t,
    fixture({
      paymentMethod: "on_site",
      paymentStatus: "not_required",
      confirmationDeadlineAt: new Date(Date.now() + 60000),
    }),
  );
  const deadline = doc.confirmationDeadlineAt;
  const results = await Promise.allSettled([
    service.updateOrderStatus({
      restaurant,
      orderId: doc._id,
      status: "confirmed",
    }),
    adjustment.recordDecision({
      restaurant,
      orderId: doc._id,
      targetStatus: "canceled",
      expiration: true,
      now: deadline,
      requestKey: "confirmation:expiration",
    }),
  ]);
  assert.ok(["confirmed", "canceled"].includes(doc.status));
  assert.ok(results.some((entry) => entry.status === "fulfilled"));
  if (doc.status === "confirmed") assert.equal(doc.adjustments.length, 0);
  Object.assign(
    doc,
    fixture({ confirmationDeadlineAt: new Date(Date.now() - 1) }),
  );
  await assert.rejects(
    service.updateOrderStatus({
      restaurant,
      orderId: doc._id,
      status: "confirmed",
    }),
    /expiré/,
  );
});
test("an unpaid expiration cancels authorization without creating a fictitious refund", async (t) => {
  const doc = memory(
    t,
    fixture({
      paymentStatus: "pending",
      confirmationDeadlineAt: new Date(Date.now() - 1000),
    }),
  );
  const remote = stripeMock(doc);
  remote.payment.status = "requires_payment_method";
  remote.payment.amount_received = 0;
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    expiration: true,
    targetStatus: "canceled",
    requestKey: "confirmation:expiration",
    stripeInstance: remote.stripe,
  });
  assert.equal(remote.payment.status, "canceled");
  assert.equal(remote.calls(), 0);
  assert.equal(doc.adjustments[0].state, "not_required");
  assert.equal(doc.paymentStatus, "failed");
});
test("emails state the actual refund status and the partial-email switch is respected", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc, { status: "pending" });
  await adjustment.rejectItems(
    refuse(remote.stripe, {
      lines: [
        { lineId: "burger", quantity: 1 },
        { lineId: "dessert", quantity: 1 },
      ],
    }),
  );
  const email = buildTakeAwayEmail({
    eventType: `partial_rejection:${doc.adjustments[0].id}`,
    order: doc,
    restaurant,
  });
  assert.match(email.htmlContent, /Burger.*Dessert/);
  assert.match(email.htmlContent, /pas encore confirmé/);
  assert.doesNotMatch(email.htmlContent, /remboursement.*est confirmé/);
  Object.assign(doc, fixture());
  emails.length = 0;
  await adjustment.rejectItems(
    refuse(remote.stripe, {
      restaurant: {
        ...restaurant,
        takeAwaySettings: {
          ...restaurant.takeAwaySettings,
          partialRejectionEmailEnabled: false,
        },
      },
    }),
  );
  assert.equal(emails.length, 0);
});

test("a deadline crossed between read and confirmation cannot be accepted", async (t) => {
  const doc = memory(
    t,
    fixture({ confirmationDeadlineAt: new Date(Date.now() + 60000) }),
  );
  const write = Order.findOneAndUpdate;
  Order.findOneAndUpdate = (filter, change) => {
    if (change.$set?.status === "confirmed")
      doc.confirmationDeadlineAt = new Date(Date.now() - 1000);
    return write(filter, change);
  };
  await assert.rejects(
    service.updateOrderStatus({
      restaurant,
      orderId: doc._id,
      status: "confirmed",
    }),
    /modifiée/,
  );
  assert.equal(doc.status, "pending");
});
test("an in-flight partial refund is reconciled before refunding the terminal balance", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc, { status: "pending" });
  await adjustment.rejectItems(refuse(remote.stripe));
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    targetStatus: "canceled",
    stripeInstance: remote.stripe,
  });
  assert.equal(remote.calls(), 1);
  assert.equal(doc.adjustments.length, 2);
  const firstRefund = remote.refunds[0];
  firstRefund.status = "succeeded";
  await service.handleTakeAwayStripeWebhookEvent({
    restaurant,
    event: {
      type: "refund.updated",
      data: { object: structuredClone(firstRefund) },
    },
  });
  const create = remote.stripe.refunds.create;
  remote.stripe.refunds.create = async (...args) => {
    const result = await create(...args);
    result.status = "succeeded";
    remote.refunds.at(-1).status = "succeeded";
    return result;
  };
  await adjustment.processRefunds({
    restaurant,
    orderId: doc._id,
    stripeInstance: remote.stripe,
    now: new Date(Date.now() + 600000),
  });
  assert.deepEqual(
    remote.refunds.map((refund) => refund.amount),
    [1200, 3800],
  );
  assert.equal(doc.paymentStatus, "refunded");
  assert.equal(doc.refundedAmountCents, 5000);
});
test("a late payment success after unpaid expiration reopens the same refund operation", async (t) => {
  const events = [];
  const sse = require("../services/sse-bus.service");
  const client = { locals: { gustoEventModules: { take_away: true } },
    write(line) { events.push(JSON.parse(line.slice(6))); } };
  sse._addClient(restaurant._id, client);
  t.after(() => sse._removeClient(restaurant._id, client));
  const doc = memory(
    t,
    fixture({
      paymentStatus: "pending",
      confirmationDeadlineAt: new Date(Date.now() - 1000),
    }),
  );
  const remote = stripeMock(doc);
  remote.payment.status = "requires_payment_method";
  remote.payment.amount_received = 0;
  await adjustment.terminateOrder({
    restaurant,
    orderId: doc._id,
    targetStatus: "canceled",
    expiration: true,
    requestKey: "confirmation:expiration",
    stripeInstance: remote.stripe,
  });
  const id = doc.adjustments[0].id;
  assert.equal(events.filter((event) => event.order).length, 0);
  const getStripe = service.getStripeForRestaurant;
  service.getStripeForRestaurant = () => remote.stripe;
  t.after(() => {
    service.getStripeForRestaurant = getStripe;
  });
  remote.payment.status = "succeeded";
  remote.payment.amount_received = 5000;
  await service.handleTakeAwayStripeWebhookEvent({
    restaurant,
    event: {
      type: "payment_intent.succeeded",
      data: { object: structuredClone(remote.payment) },
    },
  });
  assert.equal(doc.status, "canceled");
  assert.equal(doc.paymentStatus, "refunded");
  assert.equal(doc.adjustments.length, 1);
  assert.equal(doc.adjustments[0].id, id);
  assert.equal(doc.refundedAmountCents, 5000);
  assert.equal(remote.calls(), 1);
  assert.ok(events.some((event) => event.order?._id === doc._id));
  await service.deleteRestaurantOrder({ restaurant, orderId: doc._id });
  const hiddenAt = doc.deletedAt;
  events.length = 0;
  await service.handleTakeAwayStripeWebhookEvent({
    restaurant,
    event: { type: "payment_intent.succeeded", data: { object: structuredClone(remote.payment) } },
  });
  await adjustment.runAdjustmentLifecycle();
  assert.deepEqual(doc.deletedAt, hiddenAt);
  assert.equal(remote.calls(), 1);
  assert.equal(events.filter((event) => event.order).length, 0);
});
test("the server lifecycle expires and retries refunds without a dashboard", async (t) => {
  const doc = memory(
    t,
    fixture({ confirmationDeadlineAt: new Date(Date.now() - 1000) }),
  );
  const remote = stripeMock(doc, { failBefore: true });
  const oldStripe = service.getStripeForRestaurant;
  const oldRestaurant = service.loadRestaurantForTakeAway;
  service.getStripeForRestaurant = () => remote.stripe;
  service.loadRestaurantForTakeAway = async () => restaurant;
  t.after(() => {
    service.getStripeForRestaurant = oldStripe;
    service.loadRestaurantForTakeAway = oldRestaurant;
  });
  const first = await adjustment.runAdjustmentLifecycle();
  assert.equal(first.expired, 1);
  assert.equal(doc.status, "canceled");
  assert.equal(doc.adjustments[0].state, "uncertain");
  await adjustment.runAdjustmentLifecycle({
    now: new Date(Date.now() + 600000),
  });
  assert.equal(doc.refundedAmountCents, 5000);
  assert.equal(doc.paymentStatus, "refunded");
  assert.equal(doc.adjustments.length, 1);
});
test("email failures do not undo successful refunds and the persisted queue is replayed", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  failEmail = true;
  t.after(() => {
    failEmail = false;
  });
  await adjustment.rejectItems(refuse(remote.stripe));
  assert.equal(doc.refundedAmountCents, 1200);
  assert.equal(doc.adjustments[0].state, "succeeded");
  assert.equal(doc.pendingCustomerEmailEvents.length, 1);
  failEmail = false;
  const load = service.loadRestaurantForTakeAway;
  // The replay function has a local binding; mock its Restaurant model instead.
  const Restaurant = require("../models/restaurant.model");
  const find = Restaurant.findById;
  Restaurant.findById = () => {
    const result = query(restaurant);
    result.populate = () => result;
    return result;
  };
  t.after(() => {
    Restaurant.findById = find;
    service.loadRestaurantForTakeAway = load;
  });
  await service.replayPendingTakeAwayEffects();
  assert.equal(doc.pendingCustomerEmailEvents.length, 0);
  assert.equal(emails.length, 1);
  assert.equal(remote.calls(), 1);
});

test("automatic acceptance still requires enough real preparation time when payment completes", async (t) => {
  const doc = memory(
    t,
    fixture({
      paymentStatus: "pending",
      confirmationRequired: false,
      confirmationDeadlineAt: null,
      preparationTimeMinutesSnapshot: 45,
      scheduledFor: new Date(Date.now() + 20 * 60000),
    }),
  );
  const remote = stripeMock(doc);
  const oldStripe = service.getStripeForRestaurant;
  service.getStripeForRestaurant = () => remote.stripe;
  t.after(() => {
    service.getStripeForRestaurant = oldStripe;
  });
  await service.handleTakeAwayStripeWebhookEvent({
    restaurant,
    event: {
      type: "payment_intent.succeeded",
      data: { object: structuredClone(remote.payment) },
    },
  });
  assert.equal(doc.status, "canceled");
  assert.equal(doc.refundedAmountCents, 5000);
  assert.ok(doc.canceledAt);
  assert.match(doc.adjustments[0].reason, /préparation/);
});

test("new PaymentIntents cannot attach after a concurrent cancellation", async (t) => {
  const doc = memory(
    t,
    fixture({
      paymentStatus: "pending",
      stripePaymentIntentId: "",
      paymentExpiresAt: new Date(Date.now() + 900000),
    }),
  );
  let canceled = false;
  const stripe = {
    paymentIntents: {
      create: async () => {
        doc.status = "canceled";
        return { id: "pi_new" };
      },
      cancel: async () => {
        canceled = true;
      },
    },
  };
  await assert.rejects(
    service.createOrderPaymentIntent({
      restaurant,
      order: structuredClone(doc),
      stripeInstance: stripe,
    }),
    /plus être payée/,
  );
  assert.equal(doc.stripePaymentIntentId, "");
  assert.equal(canceled, true);
});

test("payment audit: retrying a declined card cannot overwrite a concurrent success or cancellation", async (t) => {
  for (const next of [{ status: "confirmed", paymentStatus: "paid" },
    { status: "canceled", paymentStatus: "failed" }]) {
    await t.test(next.status, async (subtest) => {
      const doc = memory(subtest, fixture({ paymentStatus: "failed",
        paymentExpiresAt: new Date(Date.now() + 900000) }));
      const stale = structuredClone(doc);
      // Exercise the old document.save path as well: it would revert paid/canceled.
      stale.save = async () => Object.assign(doc, { paymentStatus: stale.paymentStatus });
      const stripe = { paymentIntents: { retrieve: async () => {
        Object.assign(doc, next);
        return { id: stale.stripePaymentIntentId, status: "requires_payment_method",
          amount: 5000, amount_received: 0, currency: "eur", metadata: {
            type: "takeaway_order", restaurantId: stale.restaurant_id, orderId: stale._id } };
      }, create: async () => { throw new Error("No second PaymentIntent"); } } };
      await assert.rejects(service.createOrderPaymentIntent({ restaurant, order: stale,
        stripeInstance: stripe }), { code: "ORDER_PAYMENT_STATE_CHANGED", status: 409 });
      assert.equal(doc.status, next.status);
      assert.equal(doc.paymentStatus, next.paymentStatus);
    });
  }
});

test("payment audit: a declined card can retry the same PaymentIntent before expiry", async (t) => {
  const doc = memory(t, fixture({ paymentStatus: "failed",
    paymentExpiresAt: new Date(Date.now() + 900000) }));
  const paymentIntent = { id: doc.stripePaymentIntentId, status: "requires_payment_method",
    amount: 5000, amount_received: 0, currency: "eur", metadata: {
      type: "takeaway_order", restaurantId: doc.restaurant_id, orderId: doc._id } };
  const result = await service.createOrderPaymentIntent({ restaurant, order: structuredClone(doc),
    stripeInstance: { paymentIntents: { retrieve: async () => paymentIntent,
      create: async () => { throw new Error("No second PaymentIntent"); } } } });
  assert.equal(result.id, paymentIntent.id);
  assert.equal(doc.paymentStatus, "pending");
  assert.equal(doc.status, "pending");
});

test("an externally reduced Stripe balance never produces an excessive refund", async (t) => {
  const doc = memory(t, fixture());
  const remote = stripeMock(doc);
  remote.stripe.charges.retrieve = async () => ({ amount_refunded: 4500 });
  await adjustment.rejectItems(refuse(remote.stripe));
  assert.equal(remote.calls(), 0);
  assert.equal(doc.refundedAmountCents, 0);
  assert.equal(doc.adjustments[0].state, "uncertain");
  assert.match(doc.adjustments[0].lastError, /Solde Stripe insuffisant/);
});

test("new schemas retain operation snapshots and reject fractional confirmation settings", () => {
  const Restaurant = require("../models/restaurant.model");
  const restaurantDoc = new Restaurant({
    takeAwaySettings: { confirmationDeadlineMinutes: 1.5 },
  });
  assert.ok(
    restaurantDoc.validateSync()?.errors[
      "takeAwaySettings.confirmationDeadlineMinutes"
    ],
  );
  const data = fixture({
    restaurant_id: "507f1f77bcf86cd799439011",
    _id: "507f1f77bcf86cd799439012",
  });
  data.items = data.items.map((item) => ({
    ...item,
    catalogItemId: "507f1f77bcf86cd799439013",
  }));
  data.adjustments = [
    {
      id: "operation",
      requestKey: "refusal:0001",
      payloadHash: "hash",
      type: "partial_rejection",
      state: "queued",
      amountCents: 1200,
      emailEnabled: false,
      lines: [{ lineId: "burger", quantity: 1 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const doc = new Order(data);
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.toObject().adjustments[0].emailEnabled, false);
  assert.equal(doc.toObject().items[0].lineId, "burger");
});

test("termination: pending on-site rejection casts correctly and never calls Stripe", async (t) => {
  const doc = memory(
    t,
    fixture({
      fulfillmentMode: "pickup",
      paymentMethod: "on_site",
      paymentStatus: "not_required",
      stripePaymentIntentId: "",
      subtotal: 32,
      total: 32,
      deliveryFee: 0,
      remainingAmountCents: 3200,
      items: [
        {
          lineId: "burger",
          catalogItemId: "burger",
          name: "Burger",
          quantity: 1,
          unitPrice: 20,
          optionsTotal: 0,
          options: [],
          lineTotal: 20,
        },
        {
          lineId: "dessert",
          catalogItemId: "dessert",
          name: "Dessert",
          quantity: 1,
          unitPrice: 12,
          optionsTotal: 0,
          options: [],
          lineTotal: 12,
        },
      ],
    }),
  );
  const originalItems = structuredClone(doc.items);
  const oldStripe = service.getStripeForRestaurant;
  let stripeCalls = 0;
  service.getStripeForRestaurant = () => {
    stripeCalls += 1;
    throw new Error("Stripe must not be used");
  };
  t.after(() => {
    service.getStripeForRestaurant = oldStripe;
  });
  await service.updateOrderStatus({
    restaurant,
    orderId: doc._id,
    status: "rejected",
  });
  const firstHistory = structuredClone({
    adjustments: doc.adjustments,
    events: doc.businessEvents,
  });
  await service.updateOrderStatus({
    restaurant,
    orderId: doc._id,
    status: "rejected",
  });
  assert.equal(doc.status, "rejected");
  assert.equal(doc.paymentStatus, "not_required");
  assert.equal(doc.total, 32);
  assert.equal(doc.refundedAmountCents, 0);
  assert.equal(doc.remainingAmountCents, 0);
  assert.deepEqual(
    doc.items.map(({ refusedQuantity, ...item }) => item),
    originalItems,
  );
  assert.ok(doc.items.every((item) => item.refusedQuantity === item.quantity));
  assert.equal(doc.adjustments.length, 1);
  const operation = doc.adjustments[0];
  assert.equal(operation.type, "termination");
  assert.equal(operation.requestKey, "terminal:rejected");
  assert.equal(operation.amountCents, 3200);
  assert.equal(operation.state, "not_required");
  assert.equal(operation.emailEnabled, true);
  assert.equal(operation.actorId, "");
  assert.deepEqual(
    { adjustments: doc.adjustments, events: doc.businessEvents },
    firstHistory,
  );
  assert.ok(
    doc.businessEvents.some(
      (event) =>
        event.type === "order_terminated" && event.operationId === operation.id,
    ),
  );
  assert.ok(
    !doc.businessEvents.some((event) => event.type.startsWith("refund_")),
  );
  assert.deepEqual(doc.customerEmailEventsSent, ["rejected"]);
  assert.equal(emails.length, 1);
  const email = buildTakeAwayEmail(emails[0]);
  assert.match(email.htmlContent, /Votre commande a été refusée\./);
  assert.doesNotMatch(email.htmlContent, /en ligne|rembours/i);
  assert.equal(stripeCalls, 0);
});

test("termination: online rejection refunds once through the status workflow", async (t) => {
  const doc = memory(t, fixture());
  const originalItems = structuredClone(doc.items);
  const remote = stripeMock(doc);
  const oldStripe = service.getStripeForRestaurant;
  service.getStripeForRestaurant = () => remote.stripe;
  t.after(() => {
    service.getStripeForRestaurant = oldStripe;
  });
  await service.updateOrderStatus({
    restaurant,
    orderId: doc._id,
    status: "rejected",
  });
  const firstEvents = structuredClone(doc.businessEvents);
  await service.updateOrderStatus({
    restaurant,
    orderId: doc._id,
    status: "rejected",
  });
  assert.equal(doc.status, "rejected");
  assert.equal(doc.paymentStatus, "refunded");
  assert.equal(doc.total, 50);
  assert.equal(doc.refundedAmountCents, 5000);
  assert.deepEqual(
    doc.items.map(({ refusedQuantity, ...item }) => item),
    originalItems,
  );
  assert.equal(doc.adjustments.length, 1);
  assert.equal(doc.adjustments[0].emailEnabled, true);
  assert.equal(remote.calls(), 1);
  assert.deepEqual(doc.businessEvents, firstEvents);
  assert.equal(
    doc.businessEvents.filter((event) => event.type === "refund_requested")
      .length,
    1,
  );
  assert.equal(
    doc.businessEvents.filter((event) => event.type === "refund_confirmed")
      .length,
    1,
  );
  assert.equal(
    emails.filter((email) => email.eventType === "rejected").length,
    1,
  );
});

test("termination: both terminal statuses accept optional or missing actor identifiers", async (t) => {
  for (const targetStatus of ["rejected", "canceled"]) {
    for (const actorId of [undefined, null, ""]) {
      await t.test(
        `${targetStatus}, actor ${JSON.stringify(actorId)}`,
        async (subtest) => {
          const doc = memory(
            subtest,
            fixture({
              paymentMethod: "on_site",
              paymentStatus: "not_required",
            }),
          );
          await adjustment.recordDecision({
            restaurant: {
              ...restaurant,
              takeAwaySettings: {
                ...restaurant.takeAwaySettings,
                partialRejectionEmailEnabled: false,
              },
            },
            orderId: doc._id,
            requestKey: `terminal:${targetStatus}`,
            targetStatus,
            actorId,
          });
          assert.equal(doc.adjustments[0].actorId, "");
          assert.equal(doc.adjustments[0].emailEnabled, true);
          assert.deepEqual(doc.pendingCustomerEmailEvents, [targetStatus]);
          assert.equal(
            doc.businessEvents[0].operationId,
            doc.adjustments[0].id,
          );
        },
      );
    }
  }
});

test("termination: cast and storage failures leave the decision entirely unchanged", async (t) => {
  for (const failure of ["cast", "storage"]) {
    await t.test(failure, async (subtest) => {
      const doc = memory(subtest, fixture());
      const before = structuredClone(doc);
      const write = Order.findOneAndUpdate;
      Order.findOneAndUpdate = (filter, change) => {
        if (change.$push?.adjustments) {
          if (failure === "storage") throw new Error("mock storage failure");
          change.$push.adjustments.emailEnabled = "rejected";
        }
        return write(filter, change);
      };
      const oldStripe = service.getStripeForRestaurant;
      let stripeCalls = 0;
      service.getStripeForRestaurant = () => {
        stripeCalls += 1;
        throw new Error("Stripe must not be used");
      };
      subtest.after(() => {
        service.getStripeForRestaurant = oldStripe;
      });
      await assert.rejects(
        service.updateOrderStatus({
          restaurant,
          orderId: doc._id,
          status: "rejected",
        }),
        (error) => {
          if (failure === "storage")
            return error.message === "mock storage failure";
          assert.equal(error.name, "CastError");
          assert.equal(error.reason.path, "emailEnabled");
          return true;
        },
      );
      assert.deepEqual(doc, before);
      assert.equal(emails.length, 0);
      assert.equal(stripeCalls, 0);
    });
  }
});
