const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  parsePeriod,
  monthlyPeriod,
  parseModules,
  resolveAttribution,
  normalizeMovement,
  readFinancialTransactions,
  monthlySeries,
  summarize,
} = require("../services/transaction-financials.service");
const {
  renderTransactionsExport,
} = require("../services/pdf/render-transactions-export.service");

const restaurant = { _id: "restaurant-a", purchasesGiftCards: [] };
const timestamp = (iso) => Date.parse(iso) / 1000;
function charge(
  id = "ch_ta",
  module = "takeaway_order",
  restaurantId = restaurant._id,
) {
  return {
    id,
    object: "charge",
    paid: true,
    captured: true,
    status: "succeeded",
    payment_intent: {
      id: `pi_${id}`,
      metadata: { type: module, restaurantId },
    },
  };
}
function bt(
  id,
  source,
  created,
  amount = 10000,
  fee = 200,
  type = "charge",
  currency = "eur",
) {
  return {
    id,
    source,
    created: timestamp(created),
    amount,
    fee,
    net: amount - fee,
    type,
    currency,
  };
}
function fixture(pages, objects = {}) {
  const calls = [];
  const stripe = {
    balanceTransactions: {
      list: async (params) => {
        calls.push(params);
        return pages[calls.length - 1] || { data: [], has_more: false };
      },
    },
  };
  for (const kind of ["charges", "refunds", "paymentIntents", "disputes"])
    stripe[kind] = {
      retrieve: async (id) => {
        if (!objects[id]) throw new Error(`Missing mock ${kind}:${id}`);
        return objects[id];
      },
    };
  return { stripe, calls };
}
const matches = async () => ({ gifts: [], orders: [] });
const read = (f, extra = {}) =>
  readFinancialTransactions({
    stripe: f.stripe,
    restaurant,
    findMatches: matches,
    ...extra,
  });

test("inclusive Paris dates handle spring and autumn DST and reject invalid input", () => {
  const spring = parsePeriod("2026-03-29", "2026-03-29");
  assert.equal(spring.end - spring.start, 23 * 3600);
  const autumn = parsePeriod("2026-10-25", "2026-10-25");
  assert.equal(autumn.end - autumn.start, 25 * 3600);
  assert.throws(() => parsePeriod("2026-02-30", "2026-03-01"));
  assert.throws(() => parsePeriod("2026-10-14", "2026-10-13"));
  assert.throws(() => parsePeriod("2020-01-01", "2026-10-13"));
  assert.throws(() => parseModules([]));
  assert.throws(() => parseModules(["reservations"]));
});

test("six calendar months include Paris month changes and zero-filled current month", () => {
  const period = monthlyPeriod(new Date("2026-09-30T22:30:00Z"));
  assert.equal(period.from, "2026-05-01");
  assert.equal(period.to, "2026-10-01");
  const result = monthlySeries([], period);
  for (const module of ["gift_card", "take_away"]) {
    assert.equal(result[module][0].monthlySales.length, 6);
    assert.deepEqual(
      result[module][0].monthlySales.map((point) => point.month),
      ["05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026"],
    );
    assert.ok(
      result[module][0].monthlySales.every((point) => point.total === 0),
    );
  }
});

test("certain metadata assigns the right module; wrong-restaurant and ambiguous metadata are excluded", () => {
  const resolve = (value, extra = {}) =>
    resolveAttribution({
      charge: value,
      restaurantId: restaurant._id,
      ...extra,
    });
  assert.equal(resolve(charge()).module, "take_away");
  assert.equal(resolve(charge("ch_gift", "gift_card")).module, "gift_card");
  assert.equal(resolve(charge("ch_other", "gift_card", "restaurant-b")), null);
  assert.equal(
    resolve({ ...charge(), metadata: { restaurantId: "restaurant-b" } }),
    null,
  );
  assert.equal(resolve(charge("ch_ambiguous", "gift_card", "")), null);
  assert.equal(
    resolve({
      ...charge(),
      metadata: { type: "gift_card", restaurantId: restaurant._id },
    }),
    null,
  );
  assert.equal(
    resolve(charge("ch_reservation", "reservation_bank_hold_capture")),
    null,
  );
});

test("historical and durable gift records identify one payment, never two", async () => {
  const payment = {
    ...charge("ch_old", "gift_card", ""),
    payment_intent: { id: "pi_old", metadata: {} },
  };
  const f = fixture([
    {
      data: [
        bt("txn_old", payment, "2026-06-15T10:00:00Z"),
        bt("txn_old", payment, "2026-06-15T10:00:00Z"),
      ],
      has_more: false,
    },
  ]);
  const result = await read(f, {
    restaurant: {
      ...restaurant,
      purchasesGiftCards: [
        { paymentIntentId: "pi_old", purchaseCode: "GC-HISTORY" },
      ],
    },
    findMatches: async (scope, ids) => {
      assert.equal(scope, restaurant._id);
      assert.deepEqual(ids, ["pi_old"]);
      return {
        gifts: [{ paymentIntentId: "pi_old", purchaseCode: "GC-HISTORY" }],
        orders: [],
      };
    },
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].reference, "GC-HISTORY");
  assert.equal(summarize(result.rows).byCurrency[0].receiptsCents, 10000);
});

test("conflicting local modules or refund payment identities are not attributed", () => {
  const ch = charge();
  assert.equal(
    resolveAttribution({
      charge: ch,
      restaurantId: restaurant._id,
      gifts: [{ paymentIntentId: ch.payment_intent.id }],
      orders: [{ stripePaymentIntentId: ch.payment_intent.id }],
    }),
    null,
  );
  assert.equal(
    resolveAttribution({
      charge: ch,
      source: { payment_intent: "pi_wrong" },
      restaurantId: restaurant._id,
    }),
    null,
  );
  assert.equal(
    resolveAttribution({
      restaurantId: restaurant._id,
      source: {
        object: "refund",
        metadata: {
          restaurantId: restaurant._id,
          type: "takeaway_order_refund",
        },
      },
    }),
    null,
  );
});

test("new adjustment refund identifiers can identify a historical refund with no expanded sale", async () => {
  const refund = { id: "re_adjustment", object: "refund", status: "succeeded" };
  const f = fixture([
    {
      data: [
        bt(
          "txn_adjustment",
          refund,
          "2026-10-01T10:00:00Z",
          -1234,
          0,
          "refund",
        ),
      ],
      has_more: false,
    },
  ]);
  const result = await read(f, {
    findMatches: async (scope, pis, refundIds) => {
      assert.equal(scope, restaurant._id);
      assert.deepEqual(pis, []);
      assert.deepEqual(refundIds, [refund.id]);
      return {
        gifts: [],
        orders: [
          {
            orderNumber: "TA-HISTORY",
            refundedAmountCents: 1234,
            adjustments: [
              {
                stripeRefundId: refund.id,
                amountCents: 1234,
                state: "succeeded",
              },
            ],
          },
        ],
      };
    },
  });
  assert.equal(result.rows[0].reference, "TA-HISTORY");
  assert.equal(result.rows[0].grossCents, -1234);
  assert.equal(summarize(result.rows).byCurrency[0].refundsCents, 1234);
});

test("two partial refunds survive retries and are counted at their own dates, including an old sale", async () => {
  const ch = charge();
  const r1 = {
    id: "re_one",
    object: "refund",
    charge: ch.id,
    payment_intent: ch.payment_intent.id,
    status: "succeeded",
  };
  const r2 = { ...r1, id: "re_two" };
  const f = fixture(
    [
      {
        data: [
          bt("txn_r2", r2, "2026-10-03T10:00:00Z", -1250, 0, "refund"),
          bt("txn_r1", r1, "2026-09-03T10:00:00Z", -2000, 0, "refund"),
        ],
        has_more: true,
      },
      {
        data: [
          bt("txn_r1", r1, "2026-09-03T10:00:00Z", -2000, 0, "refund"),
          bt("txn_pay", ch, "2026-08-01T10:00:00Z"),
        ],
        has_more: false,
      },
    ],
    { [ch.id]: ch },
  );
  const result = await read(f, {
    findMatches: async () => ({
      gifts: [],
      orders: [
        {
          stripePaymentIntentId: ch.payment_intent.id,
          orderNumber: "TA-1",
          refundedAmountCents: 3250,
          adjustments: [
            { stripeRefundId: "re_one", amountCents: 2000 },
            { stripeRefundId: "re_two", amountCents: 1250 },
          ],
        },
      ],
    }),
  });
  assert.equal(result.rows.length, 3);
  const summary = summarize(result.rows).byCurrency[0];
  assert.deepEqual(
    [
      summary.receiptsCents,
      summary.refundsCents,
      summary.feesCents,
      summary.netCents,
    ],
    [10000, 3250, 200, 6550],
  );
  const series = monthlySeries(
    result.rows,
    monthlyPeriod(new Date("2026-10-13T10:00:00Z")),
  ).take_away[0].monthlySales;
  assert.deepEqual(
    series.slice(3).map((point) => point.total),
    [98, -20, -12.5],
  );
  assert.equal(f.calls[1].starting_after, "txn_r1");
  const old = fixture(
    [
      {
        data: [bt("txn_r2", r2, "2026-10-03T10:00:00Z", -1250, 0, "refund")],
        has_more: false,
      },
    ],
    { [ch.id]: ch },
  );
  const onlyRefund = await read(old, {
    period: parsePeriod("2026-10-01", "2026-10-31"),
  });
  assert.equal(onlyRefund.rows[0].grossCents, -1250);
  assert.equal(summarize(onlyRefund.rows).byCurrency[0].receiptsCents, 0);
});

test("full refunds use Stripe amounts and fee reversals, not order totals", async () => {
  const ch = charge();
  const refund = {
    id: "re_full",
    object: "refund",
    charge: ch,
    status: "succeeded",
  };
  const f = fixture([
    {
      data: [
        bt("txn_pay", ch, "2026-10-01T10:00:00Z"),
        bt("txn_full", refund, "2026-10-02T10:00:00Z", -10000, -50, "refund"),
      ],
      has_more: false,
    },
  ]);
  const result = await read(f);
  const summary = summarize(result.rows).byCurrency[0];
  assert.equal(summary.refundsCents, 10000);
  assert.equal(summary.feesCents, 150);
  assert.equal(summary.netCents, -150);
});

test("pending refunds and failed refund returns remain distinct financial adjustments", async () => {
  const ch = charge();
  const pending = {
    id: "re_pending",
    object: "refund",
    charge: ch,
    status: "pending",
  };
  const failed = { ...pending, id: "re_failed", status: "failed" };
  const f = fixture([
    {
      data: [
        bt("txn_pending", pending, "2026-10-01T10:00:00Z", -500, 0, "refund"),
        bt("txn_failed", failed, "2026-10-02T10:00:00Z", -1000, 0, "refund"),
        bt(
          "txn_return",
          failed,
          "2026-10-03T10:00:00Z",
          1000,
          0,
          "refund_failure",
        ),
      ],
      has_more: false,
    },
  ]);
  const result = await read(f);
  const total = summarize(result.rows).byCurrency[0];
  assert.equal(total.refundsCents, 0);
  assert.equal(total.adjustmentsCents, -500);
  assert.equal(total.netCents, -500);
  assert.ok(result.rows.every((row) => row.operation === "adjustment"));
});

test("payouts, unattributed account fees and unrelated transactions are excluded", async () => {
  const f = fixture([
    {
      data: [
        bt("txn_pay", charge(), "2026-10-01T10:00:00Z"),
        bt(
          "txn_payout",
          { id: "po_one" },
          "2026-10-01T10:00:00Z",
          -9800,
          0,
          "payout",
        ),
        bt("txn_fee", null, "2026-10-01T10:00:00Z", -500, 0, "stripe_fee"),
        bt(
          "txn_other",
          charge("ch_other", "gift_card", "restaurant-b"),
          "2026-10-01T10:00:00Z",
        ),
      ],
      has_more: false,
    },
  ]);
  const result = await read(f);
  assert.equal(result.rows.length, 1);
  assert.equal(summarize(result.rows).byCurrency[0].netCents, 9800);
  assert.ok(result.notes.some((note) => note.includes("exclus")));
});

test("payment on site, pending charges and missing financial fields are never invented", () => {
  const attribution = { module: "take_away" };
  const payment = bt("txn", charge(), "2026-10-01T10:00:00Z");
  assert.equal(
    normalizeMovement(
      { ...payment, fee: undefined },
      payment.source,
      attribution,
    ),
    null,
  );
  assert.equal(
    normalizeMovement(
      payment,
      { ...payment.source, paid: false, status: "pending" },
      attribution,
    ),
    null,
  );
  assert.equal(
    resolveAttribution({
      restaurantId: restaurant._id,
      orders: [{ paymentMethod: "on_site", total: 200 }],
    }),
    null,
  );
});

test("one or both modules export independently and currency totals are separate", async () => {
  const pages = [
    {
      data: [
        bt("txn_gift", charge("ch_gift", "gift_card"), "2026-10-01T10:00:00Z"),
        bt("txn_ta", charge(), "2026-10-01T10:00:00Z", 2000, 100),
        bt(
          "txn_usd",
          charge("ch_usd"),
          "2026-10-01T10:00:00Z",
          3000,
          150,
          "charge",
          "usd",
        ),
      ],
      has_more: false,
    },
  ];
  const one = await read(fixture(pages), { modules: ["gift_card"] });
  assert.equal(one.rows.length, 1);
  const all = await read(fixture(pages));
  assert.equal(all.rows.length, 3);
  const totals = summarize(all.rows);
  assert.equal(totals.byCurrency.length, 2);
  assert.equal(totals.byModule.length, 3);
  assert.equal(
    totals.byCurrency.find((total) => total.currency === "eur").netCents,
    11700,
  );
  assert.equal(
    totals.byCurrency.find((total) => total.currency === "usd").netCents,
    2850,
  );
});

test("period filters include the first instant and exclude the next Paris day", async () => {
  const period = parsePeriod("2026-10-25", "2026-10-25");
  const rows = [period.start - 1, period.start, period.end - 1, period.end].map(
    (date, index) => ({
      ...bt(`txn_${index}`, charge(), "2026-10-25T00:00:00Z"),
      created: date,
    }),
  );
  const f = fixture([{ data: rows, has_more: false }]);
  const result = await read(f, { period });
  assert.equal(result.rows.length, 2);
  assert.deepEqual(f.calls[0].created, { gte: period.start, lt: period.end });
});

test("read failures and pagination limits fail instead of returning a truncated report", async () => {
  const f = fixture([
    { data: [bt("txn", charge(), "2026-10-01T10:00:00Z")], has_more: true },
  ]);
  await assert.rejects(
    read(f, { maxPages: 1 }),
    (error) => error.status === 422,
  );
  const missing = fixture([
    {
      data: [
        bt(
          "txn",
          {
            id: "re_missing",
            object: "refund",
            charge: "ch_missing",
            status: "succeeded",
          },
          "2026-10-01T10:00:00Z",
          -500,
          0,
          "refund",
        ),
      ],
      has_more: false,
    },
  ]);
  await assert.rejects(read(missing), /Missing mock/);
});

test("frontend module matrix and selection preserve per-module series without mixing currencies", async () => {
  const code = fs.readFileSync(
    path.join(
      __dirname,
      "../../client/src/components/dashboard/dashboard/financial-dashboard.utils.js",
    ),
    "utf8",
  );
  const ui = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  assert.deepEqual(ui.activeFinancialModules({ gift_card: true }), [
    "gift_card",
  ]);
  assert.deepEqual(ui.activeFinancialModules({ take_away: true }), [
    "take_away",
  ]);
  assert.deepEqual(
    ui.activeFinancialModules({ gift_card: true, take_away: true }),
    ["gift_card", "take_away"],
  );
  assert.deepEqual(ui.activeFinancialModules({}), []);
  const series = {
    gift_card: [{ currency: "eur", monthlySales: [{ total: 10 }] }],
    take_away: [{ currency: "usd", monthlySales: [{ total: -2 }] }],
  };
  assert.equal(
    ui.selectedFinancialSeries(series, ["take_away"], "gift_card", "eur")
      .currency,
    "usd",
  );
  assert.equal(
    ui.selectedFinancialSeries(
      series,
      ["gift_card", "take_away"],
      "take_away",
      "usd",
    ).data[0].total,
    -2,
  );
  assert.equal(
    ui.selectedFinancialSeries(
      series,
      ["gift_card", "take_away"],
      "gift_card",
      "eur",
    ).data[0].total,
    10,
  );
  assert.equal(
    ui.selectedFinancialSeries(series, [], "gift_card", "eur").module,
    undefined,
  );
  assert.equal(
    ui.validExportSelection(
      "2026-10-01",
      "2026-10-13",
      ["gift_card"],
      ["gift_card"],
    ),
    true,
  );
  assert.equal(
    ui.validExportSelection("2026-10-01", "2026-10-13", [], ["gift_card"]),
    false,
  );
  assert.equal(
    ui.validExportSelection(
      "2026-02-30",
      "2026-10-13",
      ["gift_card"],
      ["gift_card"],
    ),
    false,
  );
  assert.equal(
    ui.validExportSelection(
      "2026-10-01",
      "2026-10-13",
      ["take_away"],
      ["gift_card"],
    ),
    false,
  );
});

test("dashboard renders one shared chart for each active-module scenario and a selector only for both", () => {
  const vm = require("node:vm");
  const clientRoot = path.join(__dirname, "../../client");
  const React = require(path.join(clientRoot, "node_modules/react"));
  const { renderToStaticMarkup } = require(
    path.join(clientRoot, "node_modules/react-dom/server"),
  );
  const babel = require(
    path.join(clientRoot, "node_modules/next/dist/compiled/babel/core"),
  );
  const packages = require(
    path.join(clientRoot, "node_modules/next/dist/compiled/babel-packages"),
  );
  function load(file, stubs = {}) {
    const filename = path.join(
      clientRoot,
      "src/components/dashboard/dashboard",
      file,
    );
    const source = fs.readFileSync(filename, "utf8");
    const code = babel.transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      presets: [[packages.presetReact().default, { runtime: "classic" }]],
      plugins: [packages.pluginTransformModulesCommonjs().default],
    }).code;
    const exports = {};
    vm.runInNewContext(code, {
      exports,
      React,
      process: { env: {} },
      require: (name) => {
        if (name === "react") return React;
        if (name in stubs) return stubs[name];
        throw new Error(`Unexpected UI import: ${name}`);
      },
    });
    return exports;
  }
  const utils = load("financial-dashboard.utils.js");
  const empty = () => null;
  const Chart = (props) =>
    React.createElement(
      "div",
      { "data-financial-chart": "true" },
      props.title,
      props.children,
    );
  const Dashboard = load("dashboard.component.js", {
    "@/_assets/data/dashboard.data": { dashboardData: [] },
    "@/_assets/data/gift-dashboard.data": { giftDashboardData: [] },
    axios: {},
    "./data-card.dashboard.component": empty,
    "./donut-chart.dashboard.component": empty,
    "./monthly-gift-card-sales-chart.dashboard.component": Chart,
    "./transactions.dashboard.component": empty,
    "./last-payout.dashboard.component": empty,
    "./montly-counter-visits.component": empty,
    "./financial-dashboard.utils": utils,
  }).default;
  for (const [options, count, selector, label] of [
    [{ gift_card: true }, 1, false, "Vente cartes cadeaux"],
    [{ take_away: true }, 1, false, "Ventes à emporter"],
    [{ gift_card: true, take_away: true }, 1, true, "Vente cartes cadeaux"],
    [{}, 0, false, ""],
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(Dashboard, {
        restaurantData: { _id: "a", options },
        dataLoading: false,
      }),
    );
    assert.equal((html.match(/data-financial-chart/g) || []).length, count);
    assert.equal(html.includes('aria-label="Module des ventes"'), selector);
    if (label) assert.ok(html.includes(label));
  }
});

test("PDF generates empty reports and a paginated mixed-module financial table", async () => {
  const period = parsePeriod("2026-10-01", "2026-10-31");
  const { notes } = await read(fixture([{ data: [], has_more: false }]));
  const empty = await renderTransactionsExport({
    restaurantName: "Restaurant Test",
    period,
    modules: ["gift_card"],
    rows: [],
    notes,
  });
  assert.equal(empty.subarray(0, 5).toString(), "%PDF-");
  const rows = Array.from({ length: 120 }, (_, index) => ({
    id: `txn_reference_${index}`,
    sourceId: `re_reference_${index}`,
    date: timestamp("2026-10-05T12:30:00Z") + index,
    module: index % 2 ? "gift_card" : "take_away",
    reference: `TA-2026-${index}`,
    currency: index === 119 ? "usd" : "eur",
    label: index % 3 ? "Paiement" : "Remboursement",
    operation: index % 3 ? "payment" : "refund",
    grossCents: index % 3 ? 123456 : -5678,
    feeCents: index % 3 ? 1250 : 0,
    netCents: index % 3 ? 122206 : -5678,
  }));
  const pdf = await renderTransactionsExport({
    restaurantName: "Les Artistes - Restaurant",
    period,
    modules: ["gift_card", "take_away"],
    rows,
    notes,
  });
  const pageCount = (pdf.toString("latin1").match(/\/Type \/Page\b/g) || [])
    .length;
  assert.ok(pageCount > 3);
  if (process.env.FINANCIAL_PDF_PREVIEW_DIR) {
    fs.mkdirSync(process.env.FINANCIAL_PDF_PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(
        process.env.FINANCIAL_PDF_PREVIEW_DIR,
        "transactions-preview.pdf",
      ),
      pdf,
    );
    fs.writeFileSync(
      path.join(
        process.env.FINANCIAL_PDF_PREVIEW_DIR,
        "transactions-empty.pdf",
      ),
      empty,
    );
  }
});
