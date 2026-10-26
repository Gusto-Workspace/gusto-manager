const test = require("node:test");
const assert = require("node:assert/strict");
const Order = require("../models/take-away-order.model");
const {
  monthlyPeriod,
  monthlySeries,
} = require("../services/transaction-financials.service");
const {
  readOnSiteOrders,
  monthlyActivitySeries,
} = require("../services/take-away-sales.service");

const period = monthlyPeriod(new Date("2026-10-26T12:00:00Z"));
const order = (extra = {}) => ({
  _id: "order-a",
  paymentMethod: "on_site",
  paymentStatus: "not_required",
  status: "confirmed",
  createdAt: new Date("2026-10-10T10:00:00Z"),
  scheduledFor: new Date("2026-11-01T10:00:00Z"),
  total: 50,
  remainingAmountCents: 5000,
  currency: "eur",
  ...extra,
});
const series = (orders, rows = []) =>
  monthlyActivitySeries(rows, orders, period);
const current = (orders, rows = []) =>
  series(orders, rows).take_away[0].monthlySales.at(-1);

test("combines retained on-site orders with unchanged Stripe net, without subtracting local refunds twice", () => {
  const rows = [
    {
      module: "take_away",
      currency: "eur",
      date: Date.parse("2026-10-01T10:00Z") / 1000,
      netCents: 9800,
    },
    {
      module: "take_away",
      currency: "eur",
      date: Date.parse("2026-10-03T10:00Z") / 1000,
      netCents: -2000,
    },
    {
      module: "take_away",
      currency: "eur",
      date: Date.parse("2026-10-04T10:00Z") / 1000,
      netCents: -50,
    },
    {
      module: "gift_card",
      currency: "eur",
      date: Date.parse("2026-10-04T10:00Z") / 1000,
      netCents: 4000,
    },
  ];
  const result = series(
    [
      order({
        remainingAmountCents: 3000,
        adjustments: [{ amountCents: 2000, state: "not_required" }],
      }),
      order({
        _id: "online",
        paymentMethod: "online",
        paymentStatus: "paid",
        refundedAmountCents: 2000,
      }),
    ],
    rows,
  );
  assert.deepEqual(result.gift_card, monthlySeries(rows, period).gift_card);
  assert.deepEqual(result.take_away[0].monthlySales.at(-1), {
    month: "10/2026",
    monthKey: "2026-10",
    total: 107.5,
    onlineNet: 77.5,
    onSiteOrders: 30,
  });
  assert.deepEqual(
    monthlyActivitySeries(rows, [order()], period, ["gift_card"]),
    monthlySeries(rows, period, ["gift_card"]),
  );
});

test("all active fulfillment statuses count as recorded orders; terminal and unsuccessful payments do not", () => {
  for (const status of [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "completed",
  ])
    assert.equal(current([order({ status })]).onSiteOrders, 50, status);
  for (const status of ["rejected", "canceled", "unknown"])
    assert.equal(current([order({ status })]).total, 0, status);
  for (const paymentStatus of ["pending", "failed", "refunded", "unknown"])
    assert.equal(current([order({ paymentStatus })]).total, 0, paymentStatus);
  assert.equal(current([order({ paymentStatus: "paid" })]).onSiteOrders, 50);
});

test("uses remaining cents including zero; legacy totals include delivery and are rounded in cents", () => {
  assert.equal(current([order({ remainingAmountCents: 0 })]).total, 0);
  assert.equal(
    current([
      order({
        remainingAmountCents: null,
        subtotal: 18,
        deliveryFee: 1.95,
        total: 19.95,
      }),
    ]).total,
    19.95,
  );
  assert.equal(
    current([order({ remainingAmountCents: undefined, total: 0.1 + 0.2 })])
      .total,
    0.3,
  );
  // The persisted retained amount already reflects every refusal, regardless
  // of a refund's queued/failed/uncertain provider state. Never subtract twice.
  for (const state of [
    "not_required",
    "queued",
    "pending",
    "succeeded",
    "failed",
    "uncertain",
  ])
    assert.equal(
      current([
        order({
          remainingAmountCents: 1234,
          adjustments: [{ amountCents: 3766, state }],
        }),
      ]).total,
      12.34,
    );
});

test("retains negative online-only refund months, and returns zeros for empty months", () => {
  const result = series(
    [],
    [
      {
        module: "take_away",
        currency: "eur",
        date: Date.parse("2026-09-15T10:00Z") / 1000,
        netCents: -1234,
      },
    ],
  ).take_away[0].monthlySales;
  assert.equal(result.length, 6);
  assert.deepEqual(result[4], {
    month: "09/2026",
    monthKey: "2026-09",
    total: -12.34,
    onlineNet: -12.34,
    onSiteOrders: 0,
  });
  assert.equal(result[0].total, 0);
});

test("deduplicates order IDs and keeps online or Stripe-linked orders exclusively in the Stripe path", () => {
  assert.equal(
    current([
      order(),
      order(),
      order({
        _id: "stripe-linked",
        stripePaymentIntentId: "pi_paid",
        paymentStatus: "paid",
      }),
      order({ _id: "online", paymentMethod: "online", paymentStatus: "paid" }),
      order({ _id: "second", total: 20, remainingAmountCents: 2000 }),
    ]).total,
    70,
  );
});

test("uses creation dates and Paris boundaries, including DST, without counting future or out-of-period orders", () => {
  const dates = [
    "2026-04-30T21:59:59.999Z", // before May in Paris
    "2026-04-30T22:00:00Z", // May 1 in Paris
    "2026-09-30T22:00:00Z", // October 1 in Paris
    "2026-10-25T00:30:00Z", // both repeated autumn hours
    "2026-10-25T01:30:00Z",
    "2026-10-26T22:59:59.999Z", // last included day
    "2026-10-26T23:00:00Z", // October 27 excluded
  ];
  const points = series(
    dates.map((createdAt, index) => order({ _id: String(index), createdAt })),
  ).take_away[0].monthlySales;
  assert.equal(points[0].total, 50);
  assert.equal(points[4].total, 0);
  assert.equal(points[5].total, 200);
  assert.equal(
    points.reduce((sum, point) => sum + point.total, 0),
    250,
  );
});

test("separates currencies including on-site-only currencies, with no phantom EUR series", () => {
  const result = series([order({ currency: "USD" })]).take_away;
  assert.deepEqual(
    result.map((entry) => entry.currency),
    ["usd"],
  );
  const mixed = series([
    order(),
    order({ _id: "usd", currency: "usd", remainingAmountCents: 1000 }),
  ]).take_away;
  assert.deepEqual(
    mixed.map((entry) => [entry.currency, entry.monthlySales.at(-1).total]),
    [
      ["eur", 50],
      ["usd", 10],
    ],
  );
});

test("ignores invalid financial data instead of inventing sales", () => {
  for (const extra of [
    { remainingAmountCents: -1 },
    { remainingAmountCents: 1.2 },
    { remainingAmountCents: Infinity },
    { remainingAmountCents: NaN },
    { remainingAmountCents: Number.MAX_SAFE_INTEGER + 1 },
    { total: undefined, remainingAmountCents: null },
    { createdAt: null },
    { createdAt: "invalid" },
    { currency: "INVALID" },
    { _id: "" },
  ])
    assert.equal(current([order(extra)]).total, 0, JSON.stringify(extra));
});

test("Mongo read is scoped to the authorized restaurant, creation period, on-site statuses and unlinked orders", async () => {
  const previous = Order.find;
  let filter;
  let selection;
  Order.find = (value) => {
    filter = value;
    return {
      select(fields) {
        selection = fields;
        return this;
      },
      lean: async () => [order()],
    };
  };
  try {
    assert.equal((await readOnSiteOrders("restaurant-a", period)).length, 1);
    assert.equal(filter.restaurant_id, "restaurant-a");
    assert.equal(filter.paymentMethod, "on_site");
    assert.deepEqual(filter.paymentStatus, { $in: ["not_required", "paid"] });
    assert.deepEqual(filter.status.$in, [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "out_for_delivery",
      "completed",
    ]);
    assert.deepEqual(filter.stripePaymentIntentId, { $in: ["", null] });
    assert.equal(filter.createdAt.$gte.getTime(), period.start * 1000);
    assert.equal(filter.createdAt.$lt.getTime(), period.end * 1000);
    assert.match(selection, /remainingAmountCents/);
    assert.doesNotMatch(selection, /customer|businessEvents/);
  } finally {
    Order.find = previous;
  }
});
