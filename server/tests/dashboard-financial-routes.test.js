const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Restaurant = require("../models/restaurant.model");
const GiftOrder = require("../models/gift-card-order.model");
const TakeAwayOrder = require("../models/take-away-order.model");
const Employee = require("../models/employee.model");

// Synthetic claims, database fixtures and read-only Stripe stub; no env file,
// network listener, live Stripe key or real payment operation is involved.
process.env.JWT_SECRET = "dashboard-financial-tests-only";
const sessionPath = require.resolve("../services/account-session.service");
require.cache[sessionPath] = {
  id: sessionPath,
  filename: sessionPath,
  loaded: true,
  exports: { isAccountSessionValid: async (user) => user.id !== "revoked" },
};
const cryptoPath = require.resolve("../services/encryption.service");
require.cache[cryptoPath] = {
  id: cryptoPath,
  filename: cryptoPath,
  loaded: true,
  exports: { decryptApiKey: () => "sk_test_fixture" },
};
let stripeReads = 0;
let movements = [];
let searchEnabled = false;
const searches = [];
const stripePath = require.resolve("stripe");
require.cache[stripePath] = {
  id: stripePath,
  filename: stripePath,
  loaded: true,
  exports: () => ({
    balanceTransactions: {
      list: async () => {
        stripeReads += 1;
        return { data: movements, has_more: false };
      },
    },
    paymentIntents: {
      search: searchEnabled
        ? async ({ query }) => {
            searches.push(query);
            return {
              data: [
                {
                  id: "pi_search",
                  status: "succeeded",
                  amount_received: 5000,
                  metadata: {
                    restaurantId: query.includes("'gift_card'")
                      ? otherId
                      : restaurantId,
                    type: query.includes("'gift_card'")
                      ? "gift_card"
                      : "takeaway_order",
                  },
                },
              ],
            };
          }
        : undefined,
    },
    charges: { search: searchEnabled ? async () => ({ data: [] }) : undefined },
  }),
};

const restaurantId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const restaurants = {
  [restaurantId]: {
    _id: restaurantId,
    name: "Restaurant A",
    owner_id: "owner-a",
    employees: [
      {
        _id: "employee-a",
        restaurantProfiles: [
          { restaurant: restaurantId, options: { dashboard: true } },
        ],
      },
      {
        _id: "employee-no-dashboard",
        restaurantProfiles: [
          { restaurant: restaurantId, options: { dashboard: false } },
        ],
      },
    ],
    options: { gift_card: false, take_away: false },
    stripeSecretKey: "fixture",
    purchasesGiftCards: [
      { paymentIntentId: "pi_historical", purchaseCode: "GC-OLD" },
    ],
  },
  [otherId]: {
    _id: otherId,
    name: "Restaurant B",
    owner_id: "owner-b",
    employees: [],
    stripeSecretKey: "fixture",
    purchasesGiftCards: [],
  },
};
function query(value) {
  return {
    select() {
      return this;
    },
    populate() {
      return this;
    },
    lean: async () => value,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}
Restaurant.findById = (id) => query(restaurants[id] || null);
GiftOrder.exists = async () => null;
TakeAwayOrder.exists = async (filter) =>
  filter.restaurant_id === restaurantId ? { _id: "order-paid" } : null;
GiftOrder.find = (filter) => {
  assert.ok(filter.restaurantId);
  return query([]);
};
TakeAwayOrder.find = (filter) => {
  assert.ok(filter.restaurant_id);
  return query([]);
};
Employee.findById = () => query(null);
const router = require("../routes/transactions.routes");

function request({
  endpoint = "export-pdf",
  method = "POST",
  id = restaurantId,
  user = { role: "owner", id: "owner-a" },
  body = { from: "2026-10-01", to: "2026-10-13", modules: ["gift_card"] },
  query: params = {},
} = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const req = {
      method,
      url: `/owner/restaurants/${id}/payments/${endpoint}`,
      headers: user
        ? { authorization: `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}` }
        : {},
      body,
      query: params,
    };
    const res = {
      statusCode: 200,
      status(value) {
        this.statusCode = value;
        return this;
      },
      set(name, value) {
        headers[name] = value;
        return this;
      },
      json(value) {
        resolve({ status: this.statusCode, body: value, headers });
        return this;
      },
      send(value) {
        resolve({ status: this.statusCode, body: value, headers });
        return this;
      },
    };
    router.handle(req, res, (error) =>
      error ? reject(error) : reject(new Error("Route did not respond")),
    );
  });
}

test("all financial routes require a token and isolate restaurant ownership before Stripe reads", async () => {
  for (const [endpoint, method] of [
    ["export-pdf", "POST"],
    ["export-modules", "GET"],
    ["monthly-sales", "GET"],
  ]) {
    const before = stripeReads;
    assert.equal((await request({ endpoint, method, user: null })).status, 403);
    assert.equal(
      (await request({ endpoint, method, id: otherId })).status,
      403,
    );
    assert.equal(
      (
        await request({
          endpoint,
          method,
          user: { role: "owner", id: "revoked" },
        })
      ).status,
      403,
    );
    assert.equal(stripeReads, before);
  }
});

test("employee membership and dashboard permission are enforced, including for exports", async () => {
  const before = stripeReads;
  assert.equal(
    (
      await request({
        user: {
          role: "employee",
          id: "employee-no-dashboard",
          restaurantId,
          options: { dashboard: false },
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request({
        user: {
          role: "employee",
          id: "unlisted",
          restaurantId,
          options: { dashboard: true },
        },
      })
    ).status,
    403,
  );
  assert.equal(stripeReads, before);
  const allowed = await request({
    user: {
      role: "employee",
      id: "employee-a",
      restaurantId,
      options: { dashboard: true },
    },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["Content-Type"], "application/pdf");
});

test("historical paid modules remain selectable when both subscription flags are off", async () => {
  const result = await request({ endpoint: "export-modules", method: "GET" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.modules, ["gift_card", "take_away"]);
});

test("dates and modules are validated before Stripe, empty and combined PDFs are valid", async () => {
  const before = stripeReads;
  assert.equal(
    (
      await request({
        body: { from: "2026-02-30", to: "2026-10-13", modules: ["gift_card"] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request({
        body: { from: "2026-10-01", to: "2026-10-13", modules: [] },
      })
    ).status,
    400,
  );
  assert.equal(stripeReads, before);
  const result = await request({
    body: {
      from: "2026-10-01",
      to: "2026-10-13",
      modules: ["gift_card", "take_away"],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.subarray(0, 5).toString(), "%PDF-");
  assert.match(result.headers["Content-Disposition"], /2026-10-01-2026-10-13/);
});

test("monthly endpoint preserves gift default and exposes both currencies/modules without unrelated charges", async () => {
  const ch = (id, type, scope = restaurantId) => ({
    id,
    object: "charge",
    paid: true,
    captured: true,
    status: "succeeded",
    payment_intent: { id: `pi_${id}`, metadata: { type, restaurantId: scope } },
  });
  const created = Math.floor(Date.now() / 1000);
  movements = [
    {
      id: "txn_gift",
      type: "charge",
      source: ch("ch_gift", "gift_card"),
      amount: 5000,
      fee: 100,
      net: 4900,
      currency: "eur",
      created,
    },
    {
      id: "txn_ta",
      type: "charge",
      source: ch("ch_ta", "takeaway_order"),
      amount: 2000,
      fee: 100,
      net: 1900,
      currency: "eur",
      created,
    },
    {
      id: "txn_wrong",
      type: "charge",
      source: ch("ch_wrong", "gift_card", otherId),
      amount: 90000,
      fee: 100,
      net: 89900,
      currency: "eur",
      created,
    },
  ];
  const result = await request({ endpoint: "monthly-sales", method: "GET" });
  assert.equal(result.status, 200);
  assert.equal(result.body.monthlySales.length, 6);
  assert.equal(result.body.monthlySales.at(-1).total, 49);
  const all = await request({
    endpoint: "monthly-sales",
    method: "GET",
    query: { module: "all" },
  });
  assert.equal(
    all.body.seriesByModule.take_away[0].monthlySales.at(-1).total,
    19,
  );
});

test("Stripe-only history is discovered with scoped metadata searches and no full-account scan", async () => {
  searchEnabled = true;
  const before = stripeReads;
  const result = await request({
    endpoint: "export-modules",
    method: "GET",
    id: otherId,
    user: { role: "owner", id: "owner-b" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.modules, ["gift_card"]);
  assert.equal(stripeReads, before);
  assert.equal(searches.length, 2);
  assert.ok(
    searches.every(
      (query) =>
        query.includes(otherId) && query.includes("status:'succeeded'"),
    ),
  );
  searchEnabled = false;
});
