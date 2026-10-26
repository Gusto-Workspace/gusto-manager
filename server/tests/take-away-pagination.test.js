const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_synthetic_no_network";
const webPushPath = require.resolve("web-push");
require.cache[webPushPath] = { id: webPushPath, filename: webPushPath, loaded: true,
  exports: { setVapidDetails() {}, async sendNotification() {} } };
const Order = require("../models/take-away-order.model");
const Restaurant = require("../models/restaurant.model");
const router = require("../routes/take-away.routes");

const restaurant = { _id: "restaurant", owner_id: "owner", options: { take_away: true } };
const id = (n) => n.toString(16).padStart(24, "0");
function orders(count) {
  return Array.from({ length: count }, (_, n) => ({
    _id: id(n + 1), restaurant_id: restaurant._id,
    scheduledFor: new Date("2026-10-15T12:00:00Z"),
    createdAt: new Date("2026-10-01T12:00:00Z"),
    status: "confirmed", fulfillmentMode: "pickup",
    paymentMethod: "on_site", paymentStatus: "not_required", deletedAt: null,
  }));
}
function matches(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((part) => matches(doc, part));
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, value]) => {
        if (op === "$lt") return doc[key] < value;
        if (op === "$gte") return doc[key] >= value;
        if (op === "$ne") return value == null ? doc[key] != null : doc[key] !== value;
        if (op === "$in") return value.includes(doc[key]);
        throw new Error(`Unexpected operator ${op}`);
      });
    }
    return expected == null ? doc[key] == null : doc[key] === expected;
  });
}
function memory(t, docs) {
  const originals = { find: Order.find, restaurant: Restaurant.findById };
  const reads = [];
  Restaurant.findById = () => {
    const result = Promise.resolve(restaurant);
    result.populate = () => result;
    return result;
  };
  Order.find = (filter) => {
    const read = { filter };
    reads.push(read);
    return { sort(sort) {
      read.sort = sort;
      return { async limit(limit) {
        read.limit = limit;
        return structuredClone(docs.filter((doc) => matches(doc, filter)).sort((a, b) => {
          for (const [key, direction] of Object.entries(sort)) {
            if (a[key] < b[key]) return -direction;
            if (a[key] > b[key]) return direction;
          }
          return 0;
        }).slice(0, limit));
      } };
    } };
  };
  t.after(() => { Order.find = originals.find; Restaurant.findById = originals.restaurant; });
  return reads;
}
async function endpoint(query = {}, user = { role: "owner", id: "owner" }) {
  const route = router.stack.find((layer) => layer.route?.methods.get &&
    layer.route.path === "/restaurants/:restaurantId/take-away/orders").route;
  assert.equal(route.stack[0].handle.name, "authenticateToken");
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await route.stack.at(-1).handle({ params: { restaurantId: restaurant._id }, query, user }, res);
  return res;
}
const period = { pagination: "cursor", limit: "200", dateFrom: "2026-10-01", dateTo: "2026-10-31" };
async function collect(query = period, betweenPages = () => {}) {
  const result = [];
  let cursor;
  let pages = 0;
  do {
    const res = await endpoint({ ...query, ...(cursor ? { cursor } : {}) });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.orders.length <= Number(query.limit));
    result.push(...res.body.orders);
    cursor = res.body.pagination.nextCursor;
    assert.equal(res.body.pagination.hasMore, Boolean(cursor));
    if (cursor) await betweenPages(++pages, res.body.orders);
  } while (cursor);
  return result;
}

for (const count of [0, 199, 200, 201, 300, 301, 701]) {
  test(`${count} orders: all pages are complete, stable and unique despite identical dates`, async (t) => {
    const docs = orders(count).reverse();
    const reads = memory(t, docs);
    const all = await collect();
    assert.deepEqual(all.map((order) => order._id), docs.map((order) => order._id));
    assert.equal(new Set(all.map((order) => order._id)).size, count);
    assert.equal(reads.length, Math.max(1, Math.ceil(count / 200)));
    assert.ok(reads.every((read) => read.limit === 201));
  });
}

test("every page preserves restaurant, Paris period, status, mode and payment/deletion visibility", async (t) => {
  const docs = orders(450);
  docs.push(...orders(1).map((doc) => ({ ...doc, _id: id(600), paymentMethod: "online", paymentStatus: "paid" })),
    { ...docs[0], _id: id(601), paymentMethod: "online", paymentStatus: "failed", paidAt: new Date() },
    { ...docs[0], _id: id(602), paymentMethod: "online", paymentStatus: "refunded" });
  const excluded = [
    { restaurant_id: "other" }, { status: "canceled" }, { fulfillmentMode: "delivery" },
    { deletedAt: new Date() }, { paymentMethod: "online", paymentStatus: "pending" },
    { paymentMethod: "online", paymentStatus: "failed" },
    { scheduledFor: new Date("2026-09-30T21:59:59.999Z") },
    { scheduledFor: new Date("2026-10-31T23:00:00Z") },
  ];
  docs.push(...excluded.map((extra, n) => ({ ...docs[0], _id: id(700 + n), ...extra })));
  // October spans the Paris DST change (UTC+2 -> UTC+1).
  docs.push({ ...docs[0], _id: id(800), scheduledFor: new Date("2026-09-30T22:00:00Z") },
    { ...docs[0], _id: id(801), scheduledFor: new Date("2026-10-31T22:59:59.999Z") });
  const reads = memory(t, docs);
  const result = await collect({ ...period, status: "confirmed", fulfillmentMode: "pickup" });
  assert.equal(result.length, 455);
  assert.ok(result.every((order) => !excluded.some((_, n) => order._id === id(700 + n))));
  assert.ok(reads.every(({ filter }) => filter.restaurant_id === "restaurant" &&
    filter.status === "confirmed" && filter.fulfillmentMode === "pickup" && filter.deletedAt === null));
  const day = await collect({ pagination: "cursor", limit: "200", date: "2026-10-15" });
  assert.equal(day.length, 455); // includes the canceled/delivery orders on that day
});

test("deleting the cursor row, inserting and rescheduling cannot shift unread pages", async (t) => {
  const docs = orders(701);
  memory(t, docs);
  const result = await collect(period, (page, current) => {
    if (page !== 1) return;
    docs.find((doc) => doc._id === current.at(-1)._id).deletedAt = new Date();
    docs[0].scheduledFor = new Date("2026-10-30T12:00:00Z");
    docs.push({ ...docs[0], _id: id(900) }); // delivered separately via SSE
  });
  assert.deepEqual(result.map((doc) => doc._id), orders(701).reverse().map((doc) => doc._id));
});

test("legacy clients keep their response, cap and chronological order with a unique tie-breaker", async (t) => {
  const docs = orders(301);
  docs[0].scheduledFor = new Date("2026-10-30T12:00:00Z");
  memory(t, docs);
  const res = await endpoint({ limit: "300" });
  assert.deepEqual(Object.keys(res.body), ["orders"]);
  assert.equal(res.body.orders.length, 200);
  assert.equal(res.body.orders[0]._id, id(1));
  assert.equal(res.body.orders[1]._id, id(301));
});

test("invalid limits/cursors/dates fail before reading orders; authorization still applies", async (t) => {
  const reads = memory(t, orders(1));
  for (const query of [{ limit: "0" }, { limit: "-1" }, { limit: "NaN" }, { limit: "1.5" },
    { cursor: "invalid" }, { cursor: [id(1)] }, { pagination: "offset" }, { dateFrom: "invalid" }]) {
    assert.equal((await endpoint(query)).statusCode, 400);
  }
  assert.equal((await endpoint(period, { role: "owner", id: "other" })).statusCode, 403);
  assert.equal(reads.length, 0);
});
