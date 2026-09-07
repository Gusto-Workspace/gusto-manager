const test = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");

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
const {
  assertPaymentIntentMatchesOrder,
  assertStatusTransition,
  buildOrderItems,
  confirmOrderPayment,
  createOrderPaymentIntent,
  createTakeAwayOrder,
  expirePendingTakeAwayOrders,
  getOrderPaymentMethod,
  handleTakeAwayStripeWebhookEvent,
  refundPaidOrder,
  resolveAuthoritativeSlot,
  validateCustomerInput,
  validateDeliveryAddress,
  verifyTakeAwayWebhookSignature,
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
  notificationCalls = 0;
  let current = orderDocument({
    stripePaymentIntentId: "pi_webhook",
    restaurantNotifiedAt: null,
  });
  let paymentWrites = 0;
  TakeAwayOrderModel.findOne = async () => current;
  TakeAwayOrderModel.findOneAndUpdate = async (filter, update) => {
    if (current.paymentStatus === "paid") return null;
    paymentWrites += 1;
    Object.assign(current, update.$set);
    return current;
  };
  t.after(() => {
    TakeAwayOrderModel.findOne = originalFindOne;
    TakeAwayOrderModel.findOneAndUpdate = originalFindOneAndUpdate;
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
});

test("the webhook rejects an invalid Stripe signature", () => {
  const stripe = new Stripe("sk_test_take_away_signature");
  const rawBody = Buffer.from(
    JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" }),
  );
  assert.throws(
    () =>
      verifyTakeAwayWebhookSignature({
        stripe,
        rawBody,
        signature: "t=1,v1=invalid",
        webhookSecret: "whsec_take_away_test",
      }),
    /Signature webhook Stripe invalide/,
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
  const originalFindOneAndUpdate = TakeAwayOrderModel.findOneAndUpdate;
  const order = orderDocument({
    status: "confirmed",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
  });
  let receivedIdempotencyKey = "";
  const stripe = {
    refunds: {
      create: async (_params, options) => {
        receivedIdempotencyKey = options.idempotencyKey;
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
  TakeAwayOrderModel.findOneAndUpdate = async (_filter, update) =>
    orderDocument({ ...order, ...update.$set });
  t.after(() => {
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
  assert.match(receivedIdempotencyKey, /order-1-refund$/);
});

test("a refused Stripe refund leaves the order paid", async () => {
  const order = orderDocument({
    status: "confirmed",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_paid",
  });
  await assert.rejects(
    refundPaidOrder({
      restaurant: { _id: "restaurant-1" },
      order,
      targetStatus: "canceled",
      stripeInstance: {
        refunds: { create: async () => Promise.reject(new Error("declined")) },
      },
    }),
    (error) => error.status === 502,
  );
  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.status, "confirmed");
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

test("dashboard orders remain on-site under an online-required public policy", () => {
  assert.equal(
    getOrderPaymentMethod(
      { paymentPolicy: "online_required" },
      "online",
      "dashboard",
    ),
    "on_site",
  );
});
