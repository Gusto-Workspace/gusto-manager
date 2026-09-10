const test = require("node:test");
const assert = require("node:assert/strict");

const TakeAwayOrderModel = require("../models/take-away-order.model");
const TakeAwaySlotLockModel = require("../models/take-away-slot-lock.model");
const RestaurantModel = require("../models/restaurant.model");
const CustomerModel = require("../models/customer.model");
const notificationsServicePath = require.resolve(
  "../services/notifications.service",
);
let notificationCalls = 0;
require.cache[notificationsServicePath] = {
  id: notificationsServicePath,
  filename: notificationsServicePath,
  loaded: true,
  exports: {
    createAndBroadcastNotification: async () => {
      notificationCalls += 1;
      return { _id: "notif-1" };
    },
  },
};
const takeAwayMailerServicePath = require.resolve(
  "../services/take-away-mailer.service",
);
const { buildTakeAwayEmail } = require(takeAwayMailerServicePath);
const emailCalls = [];
require.cache[takeAwayMailerServicePath] = {
  id: takeAwayMailerServicePath,
  filename: takeAwayMailerServicePath,
  loaded: true,
  exports: {
    sendTakeAwayOrderEmail: async (payload) => {
      emailCalls.push(payload);
      return { messageId: `email-${emailCalls.length}` };
    },
  },
};
const {
  assertPaymentIntentMatchesOrder,
  assertStatusTransition,
  buildOrderItems,
  confirmOrderPayment,
  createOrderPaymentIntent,
  createTakeAwayOrder,
  expirePendingTakeAwayOrders,
  getOrderPaymentMethod,
  getAvailableSlots,
  getBlockedTakeAwayDates,
  isTakeAwayDateBlocked,
  hashPublicAccessToken,
  handleTakeAwayStripeWebhookEvent,
  findPublicOrderByAccessToken,
  findPublicOrderByAttempt,
  refundPaidOrder,
  resolveAuthoritativeSlot,
  updateOrderStatus,
  validateCustomerInput,
  validateDeliveryAddress,
  validateTakeAwayStripeEventEnvelope,
} = require("../services/take-away.service");
const {
  authorizeRestaurantAccess,
  userCanAccessRestaurant,
} = require("../middleware/authorize-restaurant-access");

function orderDocument(fields = {}) {
  return {
    _id: "order-1",
    restaurant_id: "restaurant-1",
    orderNumber: "TA-TEST",
    source: "public",
    status: "pending",
    paymentMethod: "online",
    paymentStatus: "pending",
    total: 12.5,
    currency: "eur",
    customer: null,
    restaurantNotifiedAt: new Date(),
    crmRecordedAt: null,
    $locals: {},
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
    ...fields,
  };
}

function matchingPaymentIntent(order, overrides = {}) {
  return {
    id: order.stripePaymentIntentId,
    status: "succeeded",
    amount: 1250,
    amount_received: 1250,
    currency: "eur",
    metadata: {
      type: "takeaway_order",
      restaurantId: String(order.restaurant_id),
      orderId: String(order._id),
    },
    ...overrides,
  };
}

function futureRestaurant({ maxOrders = 1 } = {}) {
  const date = new Date(2099, 8, 7);
  const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
  const slots = Array.from({ length: 7 }, (_, index) => ({
    isClosed: index !== dayIndex,
    slots:
      index === dayIndex
        ? [
            {
              start: "19:00",
              end: "20:00",
              intervalMinutes: 60,
              maxOrders,
            },
          ]
        : [],
  }));

  return {
    _id: "restaurant-1",
    options: { take_away: true },
    takeAwaySettings: {
      enabled: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      paymentPolicy: "online_required",
      same_hours_as_restaurant: false,
      slots,
      minimumPickupOrder: 0,
      auto_accept: true,
    },
    takeAwayCatalog: [
      {
        _id: "catalog-1",
        name: "Plat",
        price: 12.5,
        active: true,
        visible: true,
        sourceType: "dish",
        options: [],
      },
    ],
  };
}

function validPayload(idempotencyKey = "checkout-security-0001") {
  return {
    idempotencyKey,
    publicAccessToken: "public_order_token_1234567890abcdefghijklmno",
    customerFirstName: "Ada",
    customerLastName: "Lovelace",
    customerPhone: "+33612345678",
    customerEmail: "ada@example.com",
    fulfillmentMode: "pickup",
    slotId: "2099-09-07-19:00",
    scheduledFor: new Date(2099, 8, 7, 19, 0, 0, 0).toISOString(),
    items: [{ catalogItemId: "catalog-1", quantity: 1 }],
    paymentMethod: "online",
  };
}

test("an empty confirmation body cannot mark an order paid", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  TakeAwayOrderModel.findOne = async () =>
    orderDocument({ stripePaymentIntentId: "" });
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  await assert.rejects(
    confirmOrderPayment({
      restaurant: { _id: "restaurant-1" },
      orderId: "order-1",
    }),
    (error) => error.status === 409,
  );
});

test("a browser-supplied PaymentIntent cannot replace the stored one", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  TakeAwayOrderModel.findOne = async () =>
    orderDocument({ stripePaymentIntentId: "pi_authoritative" });
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  await assert.rejects(
    confirmOrderPayment({
      restaurant: { _id: "restaurant-1" },
      orderId: "order-1",
      paymentIntentId: "pi_attacker",
    }),
    /non correspondant/,
  );
});

test("payment amount, currency and metadata are all authoritative", () => {
  const order = orderDocument({ stripePaymentIntentId: "pi_1" });
  assert.throws(
    () =>
      assertPaymentIntentMatchesOrder(
        matchingPaymentIntent(order, { amount: 1200 }),
        order,
      ),
    /Montant/,
  );
  assert.throws(
    () =>
      assertPaymentIntentMatchesOrder(
        matchingPaymentIntent(order, { amount_received: 1200 }),
        order,
      ),
    /encaissé/,
  );
  assert.throws(
    () =>
      assertPaymentIntentMatchesOrder(
        matchingPaymentIntent(order, { currency: "usd" }),
        order,
      ),
    /Devise/,
  );
  assert.throws(
    () =>
      assertPaymentIntentMatchesOrder(
        matchingPaymentIntent(order, {
          metadata: {
            type: "takeaway_order",
            restaurantId: "restaurant-2",
            orderId: "order-1",
          },
        }),
        order,
      ),
    /Métadonnées/,
  );
});

test("an existing usable PaymentIntent is reused", async () => {
  const order = orderDocument({
    stripePaymentIntentId: "pi_reused",
    paymentExpiresAt: new Date(Date.now() + 60_000),
  });
  const existing = matchingPaymentIntent(order, {
    status: "requires_action",
    amount_received: 0,
    client_secret: "secret_reused",
  });
  let createCalls = 0;
  const stripe = {
    paymentIntents: {
      retrieve: async () => existing,
      create: async () => {
        createCalls += 1;
      },
    },
  };

  const result = await createOrderPaymentIntent({
    restaurant: { _id: "restaurant-1" },
    order,
    stripeInstance: stripe,
  });
  assert.equal(result.id, "pi_reused");
  assert.equal(createCalls, 0);
});

test("PaymentIntent creation uses a stable order-scoped idempotency key", async () => {
  const order = orderDocument({
    stripePaymentIntentId: "",
    paymentExpiresAt: new Date(Date.now() + 60_000),
  });
  let options;
  const stripe = {
    paymentIntents: {
      create: async (_params, receivedOptions) => {
        options = receivedOptions;
        return { id: "pi_created", client_secret: "secret_created" };
      },
    },
  };

  await createOrderPaymentIntent({
    restaurant: { _id: "restaurant-1" },
    order,
    stripeInstance: stripe,
  });
  assert.equal(options.idempotencyKey, "takeaway-order-order-1-payment");
  assert.equal(order.stripePaymentIntentId, "pi_created");
});

test("a signed success event finalizes payment without the browser and is replay-safe", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const originalUpdateOne = TakeAwayOrderModel.updateOne;
  notificationCalls = 0;
  emailCalls.length = 0;
  let current = orderDocument({
    stripePaymentIntentId: "pi_webhook",
    restaurantNotifiedAt: null,
    pendingCustomerEmailEvents: [],
    customerEmailEventsSent: [],
  });
  let paymentWrites = 0;
  TakeAwayOrderModel.findOne = async () => current;
  TakeAwayOrderModel.findOneAndUpdate = async (filter, update) => {
    if (filter.pendingCustomerEmailEvents) {
      const eventType = filter.pendingCustomerEmailEvents;
      if (
        !current.pendingCustomerEmailEvents.includes(eventType) ||
        current.customerEmailEventsSent.includes(eventType)
      ) {
        return null;
      }
      current.pendingCustomerEmailEvents =
        current.pendingCustomerEmailEvents.filter(
          (event) => event !== eventType,
        );
      current.customerEmailEventsSent.push(eventType);
      return current;
    }
    if (current.paymentStatus === "paid") return null;
    paymentWrites += 1;
    Object.assign(current, update.$set);
    if (update.$addToSet?.pendingCustomerEmailEvents) {
      current.pendingCustomerEmailEvents.push(
        update.$addToSet.pendingCustomerEmailEvents,
      );
    }
    return current;
  };
  TakeAwayOrderModel.updateOne = async () => ({ modifiedCount: 1 });
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
    TakeAwayOrderModel.updateOne = originalUpdateOne;
  });

  const restaurant = {
    _id: "restaurant-1",
    takeAwaySettings: { auto_accept: false },
  };
  const event = {
    type: "payment_intent.succeeded",
    data: { object: matchingPaymentIntent(current) },
  };

  await handleTakeAwayStripeWebhookEvent({ event, restaurant });
  await handleTakeAwayStripeWebhookEvent({ event, restaurant });

  assert.equal(current.paymentStatus, "paid");
  assert.equal(current.status, "pending");
  assert.equal(paymentWrites, 1);
  assert.equal(notificationCalls, 1);
  assert.deepEqual(
    emailCalls.map((call) => call.eventType),
    ["received"],
  );
});

test("failed and canceled PaymentIntent webhooks reuse the existing handler", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const initialPaymentExpiry = new Date(Date.now() + 60_000);
  const current = orderDocument({
    stripePaymentIntentId: "pi_webhook_failure",
    paymentExpiresAt: initialPaymentExpiry,
  });
  TakeAwayOrderModel.findOne = async () => current;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(current, update.$set || {});
    return current;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const paymentIntent = matchingPaymentIntent(current, {
    id: "pi_webhook_failure",
    status: "requires_payment_method",
    amount_received: 0,
  });
  const failed = await handleTakeAwayStripeWebhookEvent({
    restaurant: { _id: "restaurant-1" },
    event: {
      type: "payment_intent.payment_failed",
      data: { object: paymentIntent },
    },
  });
  assert.equal(failed.handled, true);
  assert.equal(current.paymentStatus, "failed");
  assert.equal(current.paymentExpiresAt, initialPaymentExpiry);

  const canceled = await handleTakeAwayStripeWebhookEvent({
    restaurant: { _id: "restaurant-1" },
    event: {
      type: "payment_intent.canceled",
      data: { object: paymentIntent },
    },
  });
  assert.equal(canceled.handled, true);
  assert.equal(current.status, "canceled");
  assert.ok(current.paymentExpiresAt.getTime() <= Date.now());
});

test("a public order cannot be loaded with its id alone", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const token = "public_order_token_1234567890abcdefghijklmno";
  const order = orderDocument({
    publicAccessTokenHash: hashPublicAccessToken(token),
  });
  TakeAwayOrderModel.findOne = () => ({
    select: async () => order,
  });
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  assert.equal(
    await findPublicOrderByAccessToken({
      restaurantId: "restaurant-1",
      orderId: "order-1",
      token: "",
    }),
    null,
  );
  assert.equal(
    await findPublicOrderByAccessToken({
      restaurantId: "restaurant-1",
      orderId: "order-1",
      token: "public_order_token_wrong_1234567890abcdefgh",
    }),
    null,
  );
  assert.equal(
    await findPublicOrderByAccessToken({
      restaurantId: "restaurant-1",
      orderId: "order-1",
      token,
    }),
    order,
  );
});

test("a lost create response can recover the order with the attempt secrets", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const token = "public_order_token_1234567890abcdefghijklmno";
  const order = orderDocument({
    idempotencyKey: "order_attempt_1234567890abcdefghijklmno",
    publicAccessTokenHash: hashPublicAccessToken(token),
  });
  let receivedFilter = null;
  TakeAwayOrderModel.findOne = (filter) => {
    receivedFilter = filter;
    return { select: async () => order };
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  assert.equal(
    await findPublicOrderByAttempt({
      restaurantId: "restaurant-1",
      idempotencyKey: order.idempotencyKey,
      token,
    }),
    order,
  );
  assert.equal(receivedFilter.restaurant_id, "restaurant-1");
  assert.equal(receivedFilter.source, "public");
  assert.equal(receivedFilter.idempotencyKey, order.idempotencyKey);
  assert.equal(
    await findPublicOrderByAttempt({
      restaurantId: "restaurant-1",
      idempotencyKey: order.idempotencyKey,
      token: "public_order_token_wrong_1234567890abcdefgh",
    }),
    null,
  );
});

test("status transitions send only the matching customer emails once", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const originalUpdateOne = TakeAwayOrderModel.updateOne;
  emailCalls.length = 0;
  const current = orderDocument({
    fulfillmentMode: "pickup",
    paymentMethod: "on_site",
    paymentStatus: "not_required",
    pendingCustomerEmailEvents: [],
    customerEmailEventsSent: [],
  });

  TakeAwayOrderModel.findOne = async () => current;
  TakeAwayOrderModel.findOneAndUpdate = async (filter, update) => {
    if (filter.pendingCustomerEmailEvents) {
      const eventType = filter.pendingCustomerEmailEvents;
      if (
        !current.pendingCustomerEmailEvents.includes(eventType) ||
        current.customerEmailEventsSent.includes(eventType)
      ) {
        return null;
      }
      current.pendingCustomerEmailEvents =
        current.pendingCustomerEmailEvents.filter(
          (candidate) => candidate !== eventType,
        );
      current.customerEmailEventsSent.push(eventType);
      return current;
    }

    if (filter.status && current.status !== filter.status) return null;
    Object.assign(current, update.$set || {});
    const queued = update.$addToSet?.pendingCustomerEmailEvents;
    if (queued && !current.pendingCustomerEmailEvents.includes(queued)) {
      current.pendingCustomerEmailEvents.push(queued);
    }
    return current;
  };
  TakeAwayOrderModel.updateOne = async (_filter, update) => {
    const queued = update.$addToSet?.pendingCustomerEmailEvents;
    if (
      queued &&
      !current.customerEmailEventsSent.includes(queued) &&
      !current.pendingCustomerEmailEvents.includes(queued)
    ) {
      current.pendingCustomerEmailEvents.push(queued);
    }
    return { modifiedCount: 1 };
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
    TakeAwayOrderModel.updateOne = originalUpdateOne;
  });

  const restaurant = { _id: "restaurant-1" };
  await updateOrderStatus({
    restaurant,
    orderId: current._id,
    status: "confirmed",
  });
  await updateOrderStatus({
    restaurant,
    orderId: current._id,
    status: "preparing",
  });
  await updateOrderStatus({
    restaurant,
    orderId: current._id,
    status: "ready",
  });
  await updateOrderStatus({
    restaurant,
    orderId: current._id,
    status: "ready",
  });

  assert.deepEqual(
    emailCalls.map((call) => call.eventType),
    ["confirmed", "ready"],
  );
});

test("take-away customer emails use business wording for every useful event", () => {
  const restaurant = { name: "Les Capuccins", takeAwaySettings: {} };
  const baseOrder = orderDocument({
    customerFirstName: "Ada",
    customerLastName: "Lovelace",
    customerEmail: "ada@example.com",
    fulfillmentMode: "pickup",
    paymentMethod: "online",
    paymentStatus: "paid",
    scheduledFor: new Date("2099-09-07T17:00:00.000Z"),
    items: [{ name: "Plat", quantity: 1, lineTotal: 12.5, options: [] }],
  });

  const received = buildTakeAwayEmail({
    eventType: "received",
    order: baseOrder,
    restaurant,
  });
  const confirmed = buildTakeAwayEmail({
    eventType: "confirmed",
    order: baseOrder,
    restaurant,
  });
  const rejectedPending = buildTakeAwayEmail({
    eventType: "rejected",
    order: {
      ...baseOrder,
      status: "rejected",
      stripeRefundStatus: "pending",
      refundTargetStatus: "rejected",
    },
    restaurant,
  });
  const canceledPending = buildTakeAwayEmail({
    eventType: "canceled",
    order: {
      ...baseOrder,
      status: "canceled",
      stripeRefundStatus: "failed",
      refundTargetStatus: "canceled",
    },
    restaurant,
  });
  const rejectedRefunded = buildTakeAwayEmail({
    eventType: "rejected",
    order: {
      ...baseOrder,
      status: "rejected",
      paymentStatus: "refunded",
      stripeRefundStatus: "succeeded",
    },
    restaurant,
  });
  const canceledRefunded = buildTakeAwayEmail({
    eventType: "canceled",
    order: {
      ...baseOrder,
      status: "canceled",
      paymentStatus: "refunded",
      stripeRefundStatus: "succeeded",
    },
    restaurant,
  });
  const ready = buildTakeAwayEmail({
    eventType: "ready",
    order: baseOrder,
    restaurant,
  });
  const delivery = buildTakeAwayEmail({
    eventType: "out_for_delivery",
    order: { ...baseOrder, fulfillmentMode: "delivery" },
    restaurant,
  });

  assert.match(received.htmlContent, /doit encore la confirmer/);
  assert.match(confirmed.htmlContent, /commande est confirmée/i);
  assert.match(rejectedPending.htmlContent, /commande a été refusée/i);
  assert.match(rejectedPending.htmlContent, /remboursement.*initié/i);
  assert.doesNotMatch(rejectedPending.htmlContent, /a été remboursé/i);
  assert.match(canceledPending.htmlContent, /commande a été annulée/i);
  assert.match(canceledPending.htmlContent, /remboursement.*initié/i);
  assert.doesNotMatch(canceledPending.htmlContent, /a été remboursé/i);
  assert.match(rejectedRefunded.htmlContent, /a été remboursé/i);
  assert.match(canceledRefunded.htmlContent, /a été remboursé/i);
  assert.match(ready.htmlContent, /commande est prête/i);
  assert.match(delivery.htmlContent, /commande est en route/i);
});

test("the signed service envelope accepts every take-away Stripe event", () => {
  for (const eventType of [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "refund.created",
    "refund.updated",
  ]) {
    const metadataType = eventType.startsWith("refund.")
      ? "takeaway_order_refund"
      : "takeaway_order";
    const result = validateTakeAwayStripeEventEnvelope({
      restaurantId: "restaurant-1",
      event: {
        id: `evt_${eventType}`,
        type: eventType,
        data: {
          object: {
            metadata: {
              type: metadataType,
              restaurantId: "restaurant-1",
            },
          },
        },
      },
    });
    assert.equal(result.supported, true);
  }
});

test("the signed service envelope rejects another restaurant", () => {
  assert.throws(
    () =>
      validateTakeAwayStripeEventEnvelope({
        restaurantId: "restaurant-1",
        event: {
          id: "evt_cross_restaurant",
          type: "payment_intent.succeeded",
          data: {
            object: {
              metadata: {
                type: "takeaway_order",
                restaurantId: "restaurant-2",
              },
            },
          },
        },
      }),
    /Restaurant webhook Stripe non correspondant/,
  );
});

test("the same public idempotency key returns the existing order", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const existing = orderDocument({ idempotencyPayloadHash: "" });
  TakeAwayOrderModel.findOne = async () => existing;
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  const result = await createTakeAwayOrder({
    restaurant: { _id: "restaurant-1", options: { take_away: false } },
    payload: validPayload(),
    source: "public",
  });
  assert.equal(result, existing);
  assert.equal(result.$locals.idempotentReplay, true);
});

test("reusing an idempotency key with another payload is rejected", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  TakeAwayOrderModel.findOne = async () =>
    orderDocument({ idempotencyPayloadHash: "another-payload-hash" });
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  await assert.rejects(
    createTakeAwayOrder({
      restaurant: futureRestaurant(),
      payload: validPayload(),
      source: "public",
    }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("concurrent creates cannot exceed slot capacity", async (t) => {
  const originals = {
    orderFindOne: TakeAwayOrderModel.findOne,
    orderFindOneAndUpdate: TakeAwayOrderModel.findOneAndUpdate,
    orderAggregate: TakeAwayOrderModel.aggregate,
    orderCreate: TakeAwayOrderModel.create,
    lockFindOneAndUpdate: TakeAwaySlotLockModel.findOneAndUpdate,
    lockDeleteOne: TakeAwaySlotLockModel.deleteOne,
    customerFindOneAndUpdate: CustomerModel.findOneAndUpdate,
    customerUpdateOne: CustomerModel.updateOne,
  };
  let locked = false;
  let activeLockOwner = null;
  let creatingLockOwner = null;
  let activeCount = 0;
  let createdOrder = null;
  const releaseFilters = [];
  const releasedOwners = [];
  const customerAfterCreatingLockRelease = [];
  notificationCalls = 0;
  TakeAwayOrderModel.findOne = async () => null;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(createdOrder, update.$set);
    return createdOrder;
  };
  TakeAwayOrderModel.aggregate = async () =>
    activeCount ? [{ _id: "2099-09-07-19:00", count: activeCount }] : [];
  TakeAwayOrderModel.create = async (input) => {
    creatingLockOwner = activeLockOwner;
    await new Promise((resolve) => setTimeout(resolve, 40));
    activeCount += 1;
    createdOrder = orderDocument({ ...input, _id: `order-${activeCount}` });
    return createdOrder;
  };
  TakeAwaySlotLockModel.findOneAndUpdate = async (_filter, update) => {
    if (locked) return null;
    locked = true;
    activeLockOwner = update.$set.owner;
    return { owner: update.$set.owner };
  };
  TakeAwaySlotLockModel.deleteOne = async (filter) => {
    releaseFilters.push(filter);
    releasedOwners.push(filter.owner);
    if (filter.owner === activeLockOwner) {
      locked = false;
      activeLockOwner = null;
    }
  };
  CustomerModel.findOneAndUpdate = async (_query, update) => {
    customerAfterCreatingLockRelease.push(
      releasedOwners.includes(creatingLockOwner),
    );
    return {
      _id: "customer-1",
      firstName: update.$setOnInsert.firstName,
      lastName: update.$setOnInsert.lastName,
      email: update.$set.email,
      phone: update.$setOnInsert.phone,
    };
  };
  CustomerModel.updateOne = async () => ({ modifiedCount: 1 });
  t.after(() => {
    TakeAwayOrderModel.findOne = originals.orderFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originals.orderFindOneAndUpdate;
    TakeAwayOrderModel.aggregate = originals.orderAggregate;
    TakeAwayOrderModel.create = originals.orderCreate;
    TakeAwaySlotLockModel.findOneAndUpdate = originals.lockFindOneAndUpdate;
    TakeAwaySlotLockModel.deleteOne = originals.lockDeleteOne;
    CustomerModel.findOneAndUpdate = originals.customerFindOneAndUpdate;
    CustomerModel.updateOne = originals.customerUpdateOne;
  });

  const restaurant = futureRestaurant({ maxOrders: 1 });
  const results = await Promise.allSettled([
    createTakeAwayOrder({
      restaurant,
      payload: validPayload("checkout-concurrent-0001"),
      source: "public",
    }),
    createTakeAwayOrder({
      restaurant,
      payload: validPayload("checkout-concurrent-0002"),
      source: "public",
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(
    results.find((result) => result.status === "rejected").reason.status,
    409,
  );
  assert.equal(activeCount, 1);
  assert.equal(notificationCalls, 0);
  assert.deepEqual(customerAfterCreatingLockRelease, [true]);
  assert.equal(releaseFilters.length, 2);
  for (const filter of releaseFilters) {
    assert.equal(filter.restaurant_id, "restaurant-1");
    assert.equal(filter.slotId, "2099-09-07-19:00");
    assert.equal(typeof filter.owner, "string");
    assert.ok(filter.owner.length > 0);
  }
});

test("a customer upsert failure stays non-fatal after order creation", async (t) => {
  const originals = {
    orderFindOne: TakeAwayOrderModel.findOne,
    orderAggregate: TakeAwayOrderModel.aggregate,
    orderCreate: TakeAwayOrderModel.create,
    lockFindOneAndUpdate: TakeAwaySlotLockModel.findOneAndUpdate,
    lockDeleteOne: TakeAwaySlotLockModel.deleteOne,
    customerFindOneAndUpdate: CustomerModel.findOneAndUpdate,
    consoleError: console.error,
  };
  let released = false;
  let customerAttemptedAfterRelease = false;
  let createdOrder = null;

  TakeAwayOrderModel.findOne = async () => null;
  TakeAwayOrderModel.aggregate = async () => [];
  TakeAwayOrderModel.create = async (input) => {
    createdOrder = orderDocument({ ...input, _id: "order-crm-failure" });
    return createdOrder;
  };
  TakeAwaySlotLockModel.findOneAndUpdate = async (_filter, update) => ({
    owner: update.$set.owner,
  });
  TakeAwaySlotLockModel.deleteOne = async () => {
    released = true;
  };
  CustomerModel.findOneAndUpdate = async () => {
    customerAttemptedAfterRelease = released;
    throw new Error("CRM unavailable");
  };
  console.error = () => {};
  t.after(() => {
    TakeAwayOrderModel.findOne = originals.orderFindOne;
    TakeAwayOrderModel.aggregate = originals.orderAggregate;
    TakeAwayOrderModel.create = originals.orderCreate;
    TakeAwaySlotLockModel.findOneAndUpdate = originals.lockFindOneAndUpdate;
    TakeAwaySlotLockModel.deleteOne = originals.lockDeleteOne;
    CustomerModel.findOneAndUpdate = originals.customerFindOneAndUpdate;
    console.error = originals.consoleError;
  });

  const result = await createTakeAwayOrder({
    restaurant: futureRestaurant(),
    payload: validPayload("checkout-crm-failure-0001"),
    source: "public",
  });

  assert.equal(result, createdOrder);
  assert.equal(result.customer, null);
  assert.equal(released, true);
  assert.equal(customerAttemptedAfterRelease, true);
});

test("expired unpaid orders are canceled and release capacity", async (t) => {
  const originals = {
    find: TakeAwayOrderModel.find,
    findOneAndUpdate: TakeAwayOrderModel.findOneAndUpdate,
    restaurantFindById: RestaurantModel.findById,
  };
  const due = orderDocument({
    paymentExpiresAt: new Date(Date.now() - 60_000),
    stripePaymentIntentId: "",
  });
  TakeAwayOrderModel.find = () => ({ limit: async () => [due] });
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) =>
    Object.assign(due, update.$set);
  RestaurantModel.findById = () => {
    const query = {
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve({ _id: "restaurant-1" }).then(resolve, reject);
      },
    };
    return query;
  };
  t.after(() => {
    TakeAwayOrderModel.find = originals.find;
    TakeAwayOrderModel.findOneAndUpdate = originals.findOneAndUpdate;
    RestaurantModel.findById = originals.restaurantFindById;
  });

  const result = await expirePendingTakeAwayOrders();
  assert.equal(result.expired, 1);
  assert.equal(due.status, "canceled");
  assert.equal(due.paymentStatus, "failed");
});

test("status transitions enforce graph and fulfillment mode", () => {
  assert.throws(
    () => assertStatusTransition({ status: "pending" }, "preparing"),
    /interdite/,
  );
  assert.throws(
    () =>
      assertStatusTransition(
        {
          status: "ready",
          fulfillmentMode: "pickup",
          paymentMethod: "on_site",
        },
        "out_for_delivery",
      ),
    /retrait/,
  );
});

test("canceling a paid order performs one confirmed Stripe refund", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const order = orderDocument({
    source: "dashboard",
    status: "confirmed",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
  });
  let receivedIdempotencyKey = "";
  let statusWhenStripeWasCalled = "";
  let paymentWhenStripeWasCalled = "";
  let refundStatusWhenStripeWasCalled = "";
  const stripe = {
    refunds: {
      create: async (_params, options) => {
        receivedIdempotencyKey = options.idempotencyKey;
        statusWhenStripeWasCalled = order.status;
        paymentWhenStripeWasCalled = order.paymentStatus;
        refundStatusWhenStripeWasCalled = order.stripeRefundStatus;
        return {
          id: "re_1",
          status: "succeeded",
          amount: 1250,
          payment_intent: "pi_paid",
          metadata: {
            type: "takeaway_order_refund",
            restaurantId: "restaurant-1",
            orderId: "order-1",
            targetStatus: "canceled",
          },
        };
      },
    },
  };
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(order, update.$set || {});
    return order;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const refunded = await refundPaidOrder({
    restaurant: { _id: "restaurant-1" },
    order,
    targetStatus: "canceled",
    stripeInstance: stripe,
  });
  assert.equal(refunded.paymentStatus, "refunded");
  assert.equal(refunded.status, "canceled");
  assert.equal(refunded.stripeRefundStatus, "succeeded");
  assert.equal(statusWhenStripeWasCalled, "canceled");
  assert.equal(paymentWhenStripeWasCalled, "paid");
  assert.equal(refundStatusWhenStripeWasCalled, "pending");
  assert.match(receivedIdempotencyKey, /order-1-refund$/);
});

test("a pending Stripe refund keeps the rejection and payment paid", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const order = orderDocument({
    source: "dashboard",
    status: "pending",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
  });
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(order, update.$set || {});
    return order;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const pending = await refundPaidOrder({
    restaurant: { _id: "restaurant-1" },
    order,
    targetStatus: "rejected",
    stripeInstance: {
      refunds: {
        create: async () => ({
          id: "re_pending",
          status: "pending",
          amount: 1250,
          payment_intent: "pi_paid",
          metadata: {
            type: "takeaway_order_refund",
            restaurantId: "restaurant-1",
            orderId: "order-1",
            targetStatus: "rejected",
          },
        }),
      },
    },
  });

  assert.equal(pending.status, "rejected");
  assert.equal(pending.paymentStatus, "paid");
  assert.equal(pending.stripeRefundStatus, "pending");
  assert.equal(pending.stripeRefundId, "re_pending");
});

test("a pending refund sends the business decision email only once", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const originalUpdateOne = TakeAwayOrderModel.updateOne;
  emailCalls.length = 0;
  const order = orderDocument({
    status: "pending",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
    pendingCustomerEmailEvents: [],
    customerEmailEventsSent: [],
  });
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (filter, update) => {
    const claimedEvent = filter.pendingCustomerEmailEvents;
    if (claimedEvent) {
      if (
        !order.pendingCustomerEmailEvents.includes(claimedEvent) ||
        order.customerEmailEventsSent.includes(claimedEvent)
      ) {
        return null;
      }
      order.pendingCustomerEmailEvents =
        order.pendingCustomerEmailEvents.filter(
          (eventType) => eventType !== claimedEvent,
        );
      order.customerEmailEventsSent.push(claimedEvent);
      return order;
    }
    Object.assign(order, update.$set || {});
    const queued = update.$addToSet?.pendingCustomerEmailEvents;
    if (queued && !order.pendingCustomerEmailEvents.includes(queued)) {
      order.pendingCustomerEmailEvents.push(queued);
    }
    return order;
  };
  TakeAwayOrderModel.updateOne = async (_filter, update) => {
    const pulled = update.$pull?.pendingCustomerEmailEvents;
    if (typeof pulled === "string") {
      order.pendingCustomerEmailEvents =
        order.pendingCustomerEmailEvents.filter(
          (eventType) => eventType !== pulled,
        );
    }
    return { modifiedCount: 1 };
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
    TakeAwayOrderModel.updateOne = originalUpdateOne;
  });

  let refundCreationCalls = 0;
  const stripeInstance = {
    refunds: {
      create: async () => {
        refundCreationCalls += 1;
        return {
          id: "re_pending",
          status: "pending",
          amount: 1250,
          payment_intent: "pi_paid",
          metadata: {
            type: "takeaway_order_refund",
            restaurantId: "restaurant-1",
            orderId: "order-1",
            targetStatus: "rejected",
          },
        };
      },
    },
  };
  const restaurant = { _id: "restaurant-1" };
  await refundPaidOrder({
    restaurant,
    order,
    targetStatus: "rejected",
    stripeInstance,
  });
  await refundPaidOrder({
    restaurant,
    order,
    targetStatus: "rejected",
    stripeInstance,
  });

  assert.deepEqual(
    emailCalls.map((call) => call.eventType),
    ["rejected"],
  );
  assert.equal(refundCreationCalls, 1);
});

test("a failed Stripe refund keeps the cancellation and payment paid", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const originalConsoleError = console.error;
  const order = orderDocument({
    source: "dashboard",
    status: "confirmed",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
  });
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(order, update.$set || {});
    return order;
  };
  console.error = () => {};
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
    console.error = originalConsoleError;
  });

  const failed = await refundPaidOrder({
    restaurant: { _id: "restaurant-1" },
    order,
    targetStatus: "canceled",
    stripeInstance: {
      refunds: { create: async () => Promise.reject(new Error("declined")) },
    },
  });

  assert.equal(failed.paymentStatus, "paid");
  assert.equal(failed.status, "canceled");
  assert.equal(failed.stripeRefundStatus, "failed");
});

test("retrying a failed refund uses the failed refund id for idempotency", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const order = orderDocument({
    source: "dashboard",
    status: "rejected",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
    stripeRefundId: "re_failed",
    stripeRefundStatus: "failed",
    refundTargetStatus: "rejected",
  });
  let receivedIdempotencyKey = "";
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(order, update.$set || {});
    return order;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const retried = await refundPaidOrder({
    restaurant: { _id: "restaurant-1" },
    order,
    targetStatus: "rejected",
    stripeInstance: {
      refunds: {
        create: async (_params, options) => {
          receivedIdempotencyKey = options.idempotencyKey;
          return {
            id: "re_retry_pending",
            status: "pending",
            amount: 1250,
            payment_intent: "pi_paid",
            metadata: {
              type: "takeaway_order_refund",
              restaurantId: "restaurant-1",
              orderId: "order-1",
              targetStatus: "rejected",
            },
          };
        },
      },
    },
  });

  assert.equal(retried.status, "rejected");
  assert.equal(retried.paymentStatus, "paid");
  assert.equal(retried.stripeRefundStatus, "pending");
  assert.match(receivedIdempotencyKey, /refund-after-re_failed$/);
});

test("refund webhooks preserve the decision and reconcile the final payment state", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const order = orderDocument({
    source: "dashboard",
    status: "rejected",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
    stripeRefundId: "re_webhook",
    stripeRefundStatus: "pending",
    refundTargetStatus: "rejected",
  });
  TakeAwayOrderModel.findOne = async () => order;
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) => {
    Object.assign(order, update.$set || {});
    return order;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const baseRefund = {
    id: "re_webhook",
    amount: 1250,
    currency: "eur",
    payment_intent: "pi_paid",
    metadata: {
      type: "takeaway_order_refund",
      restaurantId: "restaurant-1",
      orderId: "order-1",
      targetStatus: "rejected",
    },
  };
  await handleTakeAwayStripeWebhookEvent({
    restaurant: { _id: "restaurant-1" },
    event: {
      type: "refund.created",
      data: { object: { ...baseRefund, status: "failed" } },
    },
  });
  assert.equal(order.status, "rejected");
  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.stripeRefundStatus, "failed");

  await handleTakeAwayStripeWebhookEvent({
    restaurant: { _id: "restaurant-1" },
    event: {
      type: "refund.updated",
      data: { object: { ...baseRefund, status: "succeeded" } },
    },
  });
  assert.equal(order.status, "rejected");
  assert.equal(order.paymentStatus, "refunded");
  assert.equal(order.stripeRefundStatus, "succeeded");
});

test("cross-restaurant access is denied", async () => {
  const restaurantB = {
    _id: "restaurant-b",
    owner_id: "owner-b",
    employees: [],
  };
  assert.equal(
    await userCanAccessRestaurant(
      { id: "owner-a", role: "owner" },
      restaurantB,
    ),
    false,
  );
});

test("restaurant authorization middleware returns 403 for another owner", async (t) => {
  const originalFindById = RestaurantModel.findById;
  RestaurantModel.findById = () => {
    const query = {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve({
          _id: "restaurant-b",
          owner_id: "owner-b",
          employees: [],
        }).then(resolve, reject);
      },
    };
    return query;
  };
  t.after(() => {
    RestaurantModel.findById = originalFindById;
  });

  let nextCalled = false;
  const result = { status: 200, body: null };
  const res = {
    status(value) {
      result.status = value;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  await authorizeRestaurantAccess({ paramName: "restaurantId" })(
    {
      params: { restaurantId: "restaurant-b" },
      user: { id: "owner-a", role: "owner" },
    },
    res,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, false);
  assert.equal(result.status, 403);
  assert.equal(result.body.message, "Forbidden");
});

test("invalid quantity, options, contact and delivery schedule are rejected", () => {
  const restaurant = futureRestaurant();
  assert.throws(
    () =>
      buildOrderItems(restaurant, [
        { catalogItemId: "catalog-1", quantity: 1.5 },
      ]),
    /entier/,
  );
  restaurant.takeAwayCatalog[0].options = [
    { _id: "option-1", name: "A", price: 0 },
    { _id: "option-2", name: "B", price: 1 },
  ];
  assert.throws(
    () =>
      buildOrderItems(restaurant, [
        {
          catalogItemId: "catalog-1",
          quantity: 1,
          optionIds: ["option-1", "option-2"],
        },
      ]),
    /Une seule option/,
  );

  const wineRestaurant = futureRestaurant();
  wineRestaurant.takeAwayCatalog[0] = {
    _id: "wine-1",
    name: "Cuvée test",
    price: 0,
    active: true,
    visible: true,
    sourceType: "wine",
    options: [
      { _id: "volume-free", name: "12 cl", price: 0 },
      { _id: "volume-bottle", name: "75 cl", price: 24 },
    ],
  };
  assert.throws(
    () =>
      buildOrderItems(wineRestaurant, [
        { catalogItemId: "wine-1", quantity: 1 },
      ]),
    /Une option est requise/,
  );
  assert.throws(
    () =>
      buildOrderItems(wineRestaurant, [
        {
          catalogItemId: "wine-1",
          quantity: 1,
          optionIds: ["volume-unknown"],
        },
      ]),
    /Option d'article invalide/,
  );
  assert.throws(
    () =>
      buildOrderItems(wineRestaurant, [
        {
          catalogItemId: "wine-1",
          quantity: 1,
          optionIds: ["volume-free"],
        },
      ]),
    /prix de l'article doit être supérieur à 0/,
  );
  const [wineLine] = buildOrderItems(wineRestaurant, [
    {
      catalogItemId: "wine-1",
      quantity: 2,
      optionIds: ["volume-bottle"],
    },
  ]);
  assert.equal(wineLine.unitPrice, 0);
  assert.equal(wineLine.optionsTotal, 24);
  assert.equal(wineLine.lineTotal, 48);

  assert.throws(
    () => validateCustomerInput({ customerFirstName: "Ada" }),
    /Nom requis/,
  );
  assert.throws(
    () => validateDeliveryAddress({ zipCode: "75001", city: "Paris" }),
    /Adresse requis/,
  );
  assert.throws(
    () =>
      resolveAuthoritativeSlot({
        restaurant,
        payload: {
          slotId: "2099-09-07-19:00",
          scheduledFor: new Date(2099, 8, 7, 20, 0).toISOString(),
        },
      }),
    /ne correspond pas/,
  );
  assert.throws(
    () =>
      resolveAuthoritativeSlot({
        restaurant,
        payload: { slotId: "2099-09-07-19:00" },
        now: new Date(2100, 0, 1),
      }),
    /passé/,
  );
});

test("public delivery is online-only while pickup and dashboard policies remain intact", () => {
  assert.equal(
    getOrderPaymentMethod(
      { paymentPolicy: "customer_choice" },
      "on_site",
      "public",
      "pickup",
    ),
    "on_site",
  );
  assert.equal(
    getOrderPaymentMethod(
      { paymentPolicy: "on_site" },
      "online",
      "public",
      "delivery",
    ),
    "online",
  );
  assert.throws(
    () =>
      getOrderPaymentMethod(
        { paymentPolicy: "customer_choice" },
        "on_site",
        "public",
        "delivery",
      ),
    /paiement en ligne/,
  );
  assert.equal(
    getOrderPaymentMethod(
      { paymentPolicy: "online_required" },
      "online",
      "dashboard",
      "delivery",
    ),
    "on_site",
  );
});

test("a blocked take-away date is normalized and has no public slots", async (t) => {
  const originalAggregate = TakeAwayOrderModel.aggregate;
  TakeAwayOrderModel.aggregate = async () => [];
  t.after(() => {
    TakeAwayOrderModel.aggregate = originalAggregate;
  });

  const restaurant = futureRestaurant();
  restaurant.takeAwaySettings.blockedDates = [
    "2099-09-07",
    "2099-09-07",
    "not-a-date",
  ];

  assert.deepEqual(getBlockedTakeAwayDates(restaurant.takeAwaySettings), [
    "2099-09-07",
  ]);
  assert.equal(isTakeAwayDateBlocked(restaurant, "2099-09-07"), true);
  assert.deepEqual(
    await getAvailableSlots({ restaurant, dateKey: "2099-09-07" }),
    [],
  );

  const manualSlots = await getAvailableSlots({
    restaurant,
    dateKey: "2099-09-07",
    respectPublicBlock: false,
  });
  assert.equal(manualSlots.length, 2);

  assert.deepEqual(
    await getAvailableSlots({ restaurant, dateKey: "2099-08-38" }),
    [],
  );
});

test("public take-away slots respect the configured preparation time", async (t) => {
  const originalAggregate = TakeAwayOrderModel.aggregate;
  TakeAwayOrderModel.aggregate = async () => [];
  t.after(() => {
    TakeAwayOrderModel.aggregate = originalAggregate;
  });

  const restaurant = futureRestaurant();
  const openDay = restaurant.takeAwaySettings.slots.find(
    (day) => day.isClosed === false,
  );
  openDay.slots = [
    {
      start: "20:45",
      end: "21:30",
      intervalMinutes: 15,
      maxOrders: 1,
    },
  ];
  restaurant.takeAwaySettings.preparationTimeMinutes = 30;

  const slotsAt2015 = await getAvailableSlots({
    restaurant,
    dateKey: "2099-09-07",
    now: new Date(2099, 8, 7, 20, 15),
  });
  assert.equal(slotsAt2015[0]?.time, "20:45");

  const slotsAt2044 = await getAvailableSlots({
    restaurant,
    dateKey: "2099-09-07",
    now: new Date(2099, 8, 7, 20, 44),
  });
  assert.equal(
    slotsAt2044.some((slot) => slot.time === "20:45"),
    false,
  );
  assert.equal(slotsAt2044[0]?.time, "21:15");
});

test("an unexpired failed payment attempt still consumes slot capacity", async (t) => {
  const originalAggregate = TakeAwayOrderModel.aggregate;
  let aggregateMatch = null;
  TakeAwayOrderModel.aggregate = async (pipeline) => {
    aggregateMatch = pipeline[0]?.$match || null;
    return [];
  };
  t.after(() => {
    TakeAwayOrderModel.aggregate = originalAggregate;
  });

  await getAvailableSlots({
    restaurant: futureRestaurant(),
    dateKey: "2099-09-07",
  });

  const pendingOrderBranch = aggregateMatch?.$or?.find(
    (branch) => branch.status === "pending",
  );
  const expiringPaymentBranch = pendingOrderBranch?.$or?.find(
    (branch) => branch.paymentExpiresAt,
  );
  assert.deepEqual(expiringPaymentBranch?.paymentStatus?.$in, [
    "pending",
    "failed",
  ]);
});

test("a direct public create is rejected for a blocked date", async (t) => {
  const originalFindOne = TakeAwayOrderModel.findOne;
  TakeAwayOrderModel.findOne = async () => null;
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
  });

  const restaurant = futureRestaurant();
  restaurant.takeAwaySettings.blockedDates = ["2099-09-07"];

  await assert.rejects(
    createTakeAwayOrder({
      restaurant,
      payload: validPayload("checkout-blocked-date-0001"),
      source: "public",
    }),
    (error) => error.status === 403 && error.code === "TAKE_AWAY_DATE_BLOCKED",
  );
});

test("a dashboard order remains allowed on a blocked date", async (t) => {
  const originals = {
    findOne: TakeAwayOrderModel.findOne,
    aggregate: TakeAwayOrderModel.aggregate,
    create: TakeAwayOrderModel.create,
    lockFindOneAndUpdate: TakeAwaySlotLockModel.findOneAndUpdate,
    lockDeleteOne: TakeAwaySlotLockModel.deleteOne,
  };
  TakeAwayOrderModel.findOne = async () => null;
  TakeAwayOrderModel.aggregate = async () => [];
  TakeAwayOrderModel.create = async (input) =>
    orderDocument({
      ...input,
      _id: "order-dashboard-blocked-date",
      customer: "customer-1",
      crmRecordedAt: new Date(),
    });
  TakeAwaySlotLockModel.findOneAndUpdate = async (_filter, update) => ({
    owner: update.$set.owner,
  });
  TakeAwaySlotLockModel.deleteOne = async () => ({ deletedCount: 1 });
  t.after(() => {
    TakeAwayOrderModel.findOne = originals.findOne;
    TakeAwayOrderModel.aggregate = originals.aggregate;
    TakeAwayOrderModel.create = originals.create;
    TakeAwaySlotLockModel.findOneAndUpdate = originals.lockFindOneAndUpdate;
    TakeAwaySlotLockModel.deleteOne = originals.lockDeleteOne;
  });

  const restaurant = futureRestaurant();
  restaurant.takeAwaySettings.blockedDates = ["2099-09-07"];
  const order = await createTakeAwayOrder({
    restaurant,
    payload: validPayload("checkout-dashboard-blocked-date-0001"),
    source: "dashboard",
  });

  assert.equal(order.source, "dashboard");
  assert.equal(order.status, "confirmed");
  assert.equal(order.slotId, "2099-09-07-19:00");
});
