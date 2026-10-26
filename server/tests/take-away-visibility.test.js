const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_synthetic_no_network";
const Order = require("../models/take-away-order.model");
const Restaurant = require("../models/restaurant.model");
const sse = require("../services/sse-bus.service");
const notifications = require.resolve("../services/notifications.service");
require.cache[notifications] = { id: notifications, filename: notifications, loaded: true,
  exports: { createAndBroadcastNotification: async () => ({ _id: "mock-only" }) } };
const mailer = require.resolve("../services/take-away-mailer.service");
require.cache[mailer] = { id: mailer, filename: mailer, loaded: true,
  exports: { sendTakeAwayOrderEmail: async () => ({ messageId: "mock-only" }) } };
const service = require("../services/take-away.service");
const router = require("../routes/take-away.routes");
const { isRestaurantOrderVisible, restaurantOrderVisibilityFilter } = require("../services/take-away-visibility.service");

function match(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((entry) => match(doc, entry));
    if (key === "$and") return expected.every((entry) => match(doc, entry));
    const value = doc[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, operand]) => {
        if (op === "$in") return operand.includes(value);
        if (op === "$nin") return !operand.includes(value);
        if (op === "$ne") return operand == null ? value != null : value !== operand;
        if (op === "$gt") return value != null && value > operand;
        if (op === "$gte") return value != null && value >= operand;
        if (op === "$lt") return value != null && value < operand;
        if (op === "$lte") return value != null && value <= operand;
        throw new Error(`Unexpected query operator ${op}`);
      });
    }
    return expected == null ? value == null : value === expected;
  });
}
function query(value) {
  const promise = Promise.resolve(structuredClone(value));
  for (const name of ["select", "populate", "sort", "limit", "lean"]) promise[name] = () => promise;
  return promise;
}
function memory(t, docs) {
  const original = { find: Order.find, findOne: Order.findOne,
    findOneAndUpdate: Order.findOneAndUpdate, updateOne: Order.updateOne, exists: Order.exists };
  Order.find = (filter) => query(docs.filter((doc) => match(doc, filter)));
  Order.findOne = (filter) => query(docs.find((doc) => match(doc, filter)) || null);
  Order.exists = async (filter) => Boolean(docs.find((doc) => match(doc, filter)));
  function update(filter, change) {
    const doc = docs.find((entry) => match(entry, filter));
    if (!doc) return null;
    Object.assign(doc, structuredClone(change.$set || {}));
    return doc;
  }
  Order.findOneAndUpdate = (filter, change) => query(update(filter, change));
  Order.updateOne = async (filter, change) => ({ modifiedCount: update(filter, change) ? 1 : 0 });
  t.after(() => Object.assign(Order, original));
  return docs;
}
const restaurant = { _id: "restaurant-1", owner_id: "owner-1", options: { take_away: true },
  employees: [{ _id: "employee-1", restaurantProfiles: [{ restaurant: "restaurant-1", options: { take_away: false } }] }] };
function order(extra = {}) {
  return { _id: "order-1", restaurant_id: restaurant._id, source: "public",
    paymentMethod: "online", paymentStatus: "pending", status: "pending",
    stripePaymentIntentId: "pi_test", total: 10, currency: "eur", ...extra };
}
async function endpoint(method, suffix, req = {}) {
  const route = router.stack.find((layer) => layer.route?.methods[method] &&
    layer.route.path === `/restaurants/:restaurantId/take-away/orders${suffix}`).route;
  assert.equal(route.stack[0].handle.name, "authenticateToken");
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await route.stack.at(-1).handle({ params: { restaurantId: restaurant._id, orderId: "order-1" },
    query: {}, body: {}, user: { role: "owner", id: "owner-1" }, ...req }, response);
  return response;
}
function authorizedRestaurant(t) {
  const original = Restaurant.findById;
  Restaurant.findById = () => query(restaurant);
  t.after(() => { Restaurant.findById = original; });
}
function capture(t) {
  const events = [];
  const client = { locals: { gustoEventModules: { take_away: true } },
    write(line) { events.push(JSON.parse(line.slice(6))); } };
  sse._addClient(restaurant._id, client);
  t.after(() => sse._removeClient(restaurant._id, client));
  return events;
}

test("the Mongo visibility filter and runtime predicate agree across the payment lifecycle", () => {
  const cases = [
    [order(), false],
    [order({ paymentStatus: "failed" }), false],
    [order({ status: "canceled", paymentStatus: "failed" }), false],
    [order({ source: "dashboard" }), false],
    [order({ paymentMethod: "on_site", paymentStatus: "not_required" }), true],
    [order({ paymentStatus: "paid" }), true],
    [order({ status: "canceled", paymentStatus: "paid" }), true],
    [order({ status: "rejected", paymentStatus: "refunded" }), true],
    [order({ status: "canceled", paidAt: new Date() }), true],
    [order({ status: "completed", paymentStatus: "paid", deletedAt: new Date() }), false],
  ];
  for (const [doc, visible] of cases) {
    assert.equal(isRestaurantOrderVisible(doc), visible);
    assert.equal(match(doc, restaurantOrderVisibilityFilter()), visible);
  }
});

test("an unpaid cancellation/cron replay emits no restaurant order, even with no active articles", async (t) => {
  const doc = order({ status: "canceled", items: [{ quantity: 1, refusedQuantity: 1 }] });
  memory(t, [doc]);
  const events = capture(t);
  await service.runOrderStatusEffects(doc, restaurant);
  assert.deepEqual(events, []);
});

test("list, detail and mutation endpoints reject unpaid and deleted records", async (t) => {
  authorizedRestaurant(t);
  const docs = memory(t, [order(), order({ _id: "paid", paymentStatus: "paid" }),
    order({ _id: "hidden", paymentStatus: "paid", deletedAt: new Date() })]);
  const list = await endpoint("get", "");
  assert.deepEqual(list.body.orders.map((doc) => doc._id), ["paid"]);
  assert.equal((await endpoint("get", "/:orderId")).statusCode, 404);
  assert.equal((await endpoint("patch", "/:orderId/status")).statusCode, 404);
  assert.equal((await endpoint("post", "/:orderId/rejections")).statusCode, 404);
  docs[0] = order({ paymentStatus: "paid", deletedAt: new Date() });
  assert.equal((await endpoint("get", "/:orderId")).statusCode, 404);
});

test("deletion is scoped, idempotent, terminal-only, and retains all money/item data", async (t) => {
  authorizedRestaurant(t);
  const doc = order({ paymentStatus: "paid", status: "completed", paidAt: new Date(),
    total: 10, refundedAmountCents: 200, items: [{ quantity: 1, unitPrice: 10 }],
    adjustments: [{ id: "refund", amountCents: 200, state: "succeeded" }] });
  memory(t, [doc]);
  const before = structuredClone(doc);
  const events = capture(t);
  assert.equal((await endpoint("delete", "/:orderId")).statusCode, 200);
  const deletedAt = doc.deletedAt;
  assert.ok(deletedAt instanceof Date);
  assert.deepEqual({ ...doc, deletedAt: undefined }, { ...before, deletedAt: undefined });
  assert.equal((await endpoint("delete", "/:orderId")).statusCode, 200);
  assert.equal(doc.deletedAt, deletedAt);
  assert.equal((await endpoint("get", "")).body.orders.length, 0);
  assert.equal((await endpoint("get", "/:orderId")).statusCode, 404);
  await service.runOrderStatusEffects(before, restaurant); // stale pre-delete snapshot
  assert.ok(events.every((event) => event.type === "takeaway_order_deleted"));
  assert.ok(events.every((event) => !event.order));
});

test("canceled orders can be deleted but active, rejected and cross-restaurant orders cannot", async (t) => {
  authorizedRestaurant(t);
  const docs = memory(t, [order({ paymentMethod: "on_site", status: "canceled" })]);
  assert.equal((await endpoint("delete", "/:orderId")).statusCode, 200);
  for (const status of ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "rejected"]) {
    docs[0] = order({ paymentStatus: "paid", status });
    assert.equal((await endpoint("delete", "/:orderId")).statusCode, 409);
    assert.equal(docs[0].deletedAt, undefined);
  }
  docs[0] = order({ paymentStatus: "paid", status: "completed", restaurant_id: "other" });
  assert.equal((await endpoint("delete", "/:orderId")).statusCode, 404);
});

test("deletion uses the module owner/employee authorization and authentication middleware", async (t) => {
  authorizedRestaurant(t);
  memory(t, [order({ paymentStatus: "paid", status: "completed" })]);
  for (const user of [{ role: "owner", id: "another-owner" }, { role: "employee", id: "employee-1", restaurantId: restaurant._id }]) {
    assert.equal((await endpoint("delete", "/:orderId", { user })).statusCode, 403);
  }
  const route = router.stack.find((layer) => layer.route?.methods.delete && layer.route.path.endsWith("orders/:orderId")).route;
  let denied = false;
  await route.stack[0].handle({ headers: {} }, { status(code) { assert.equal(code, 403); return this; },
    json() { denied = true; } }, () => assert.fail("Unauthenticated request passed"));
  assert.equal(denied, true);
  const permitted = { role: "employee", id: "employee-1", restaurantId: restaurant._id, options: { take_away: true } };
  assert.equal((await endpoint("delete", "/:orderId", { user: permitted })).statusCode, 200);
});

test("the customer detail endpoint omits hidden orders but retains historical CRM counts", async (t) => {
  authorizedRestaurant(t);
  const Customer = require("../models/customer.model");
  const oldFind = Customer.findOne;
  Customer.findOne = () => query({ _id: "customer", stats: { takeAwayOrdersTotal: 3 },
    lastTakeAwayOrders: [{ orderId: "visible" }, { orderId: "hidden" }, { orderId: "unpaid" }] });
  t.after(() => { Customer.findOne = oldFind; });
  memory(t, [order({ _id: "visible", paymentStatus: "paid" }),
    order({ _id: "hidden", paymentStatus: "paid", deletedAt: new Date() }), order({ _id: "unpaid" })]);
  const customerRouter = require("../routes/customers.routes");
  const route = customerRouter.stack.find((layer) => layer.route?.methods.get &&
    layer.route.path === "/restaurants/:id/customers/:customerId").route;
  // Valid ObjectIds exercise the route's input validation too.
  const id = "0123456789abcdef01234567";
  const docRestaurantId = restaurant._id;
  const docsFind = Order.find;
  Order.find = (filter) => docsFind({ ...filter, restaurant_id: docRestaurantId });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await route.stack.at(-1).handle({ params: { id, customerId: id }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.history.takeAwayOrders.items.map((item) => item.orderId), ["visible"]);
  assert.equal(res.body.customer.stats.takeAwayOrdersTotal, 3);
});

test("logically deleted pickup orders remain in historical financial activity", async (t) => {
  const { readOnSiteOrders, monthlyActivitySeries } = require("../services/take-away-sales.service");
  const period = { start: Date.parse("2026-10-01T00:00:00Z") / 1000,
    end: Date.parse("2026-11-01T00:00:00Z") / 1000 };
  const doc = order({ paymentMethod: "on_site", paymentStatus: "not_required", status: "completed",
    createdAt: new Date("2026-10-10T12:00:00Z"), deletedAt: new Date(), stripePaymentIntentId: "" });
  memory(t, [doc]);
  const orders = await readOnSiteOrders(restaurant._id, period);
  assert.equal(orders.length, 1);
  const before = monthlyActivitySeries([], [{ ...doc, deletedAt: undefined }], period, ["take_away"]);
  assert.deepEqual(monthlyActivitySeries([], orders, period, ["take_away"]), before);
});

test("a verified payment becomes visible once; browser claims alone cannot mark it paid", async (t) => {
  const doc = order({ status: "pending", financialVersion: 1, financialRevision: 0,
    confirmationRequired: false, scheduledFor: new Date("2099-01-01"),
    customer: "customer-1", crmRecordedAt: new Date(), restaurantNotifiedAt: new Date() });
  memory(t, [doc]);
  const events = capture(t);
  const payment = { id: "pi_test", status: "requires_payment_method", amount: 1000,
    currency: "eur", amount_received: 0,
    metadata: { type: "takeaway_order", restaurantId: restaurant._id, orderId: doc._id } };
  const stripeInstance = { paymentIntents: { retrieve: async () => payment } };
  await assert.rejects(service.confirmOrderPayment({ restaurant, orderId: doc._id, stripeInstance }));
  assert.equal(doc.paymentStatus, "pending");
  payment.status = "succeeded";
  payment.amount_received = 1000;
  await service.confirmOrderPayment({ restaurant, orderId: doc._id, stripeInstance });
  await service.confirmOrderPayment({ restaurant, orderId: doc._id, stripeInstance });
  assert.equal(doc.paymentStatus, "paid");
  assert.equal(doc.status, "confirmed");
  assert.ok(doc.paidAt);
  assert.equal(new Set(events.map((event) => event.order._id)).size, 1);
  assert.equal(isRestaurantOrderVisible(doc), true);
});
