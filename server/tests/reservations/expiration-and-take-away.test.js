const test = require("node:test");
const assert = require("node:assert/strict");
const webpushPath = require.resolve("../../services/shared/webpush.service");
require.cache[webpushPath] = { id: webpushPath, filename: webpushPath, loaded: true, exports: { sendPushToModule: async () => ({ sent: 0 }) } };

test("reservation customer search is restaurant-scoped and returns separate homonyms", async (t) => {
  const Customer = require("../../models/customer.model");
  const router = require("../../routes/customers.routes");
  const { userCanAccessRestaurant } = require("../../middleware/authorize-restaurant-access");
  const handler = router.stack.find((layer) => layer.route?.path === "/restaurants/:id/reservation-customers").route.stack.at(-1).handle;
  const original = Customer.find;
  t.after(() => { Customer.find = original; });
  Customer.find = (filter) => {
    assert.equal(filter.restaurant_id, "restaurant-a");
    assert.equal(filter.$or.some((entry) => entry.phoneNorm), false);
    return { select: () => ({ limit: () => ({ lean: async () => [{ _id: "1", lastName: "Martin" }, { _id: "2", lastName: "Martin" }] }) }) };
  };
  let body;
  await handler({ params: { id: "restaurant-a" }, query: { query: "Martin" } }, { json: (value) => { body = value; } });
  assert.equal(body.customers.length, 2);
  assert.equal(await userCanAccessRestaurant({ role: "owner", id: "owner-a" }, { _id: "restaurant-b", owner_id: "owner-b" }, { requiredOption: "reservations" }), false);
});

test("overdue orders use the scheduled time or creation fallback and do not enqueue SMS", async (t) => {
  const Order = require("../../models/take-away-order.model");
  const { finishOverdueTakeAwayOrders } = require("../../services/take-away/take-away.service");
  const original = { find: Order.find, update: Order.findOneAndUpdate, findOne: Order.findOne };
  const now = new Date("2026-11-17T12:00:00Z");
  let updated = false;
  Order.find = (filter) => {
    assert.deepEqual(filter.status.$in, ["pending", "confirmed", "preparing", "ready", "out_for_delivery"]);
    assert.equal(filter.$and[1].$or[0].scheduledFor.$lte.toISOString(), "2026-11-16T12:00:00.000Z");
    assert.equal(filter.$and[1].$or[1].createdAt.$lte.toISOString(), "2026-11-16T12:00:00.000Z");
    return { limit: async () => updated ? [] : [{ _id: "o1", status: "ready" }] };
  };
  Order.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.status, "ready");
    assert.equal(update.$set.status, "completed");
    assert.equal(update.$push, undefined);
    updated = true;
    return { _id: "o1", restaurant_id: "restaurant", status: "completed" };
  };
  Order.findOne = async () => null;
  t.after(() => { Order.find = original.find; Order.findOneAndUpdate = original.update; Order.findOne = original.findOne; });
  assert.deepEqual(await finishOverdueTakeAwayOrders({ now }), { finished: 1 });
  assert.deepEqual(await finishOverdueTakeAwayOrders({ now }), { finished: 0 });
});
