const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");

function load(file, stubs = {}) {
  const filename = path.join(
    __dirname,
    "../src/components/dashboard/take-away",
    file,
  );
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[packages.presetReact().default, { runtime: "automatic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => (name in stubs ? stubs[name] : require(name)),
    mod,
    mod.exports,
  );
  return mod.exports;
}

const utils = load("order-details.take-away.utils.js");
const { getOrderDetailsPresentation: present } = utils;
const Details = load("order-details.take-away.component.js", {
  "./order-details.take-away.utils": utils,
}).default;
const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value,
  );
const render = (order) =>
  renderToStaticMarkup(React.createElement(Details, { order }));
const base = {
  _id: "order",
  financialVersion: 1,
  paymentMethod: "online",
  paymentStatus: "paid",
  status: "confirmed",
  fulfillmentMode: "delivery",
  total: 52.92,
  subtotal: 32.92,
  deliveryFee: 20,
  remainingAmountCents: 5292,
  refundedAmountCents: 0,
  adjustments: [],
  items: [
    {
      lineId: "souvenir",
      name: "Souvenir",
      quantity: 2,
      refusedQuantity: 0,
      unitPrice: 12.96,
      lineTotal: 25.92,
    },
    {
      lineId: "beer",
      name: "Grimbergen (50cl)",
      quantity: 1,
      refusedQuantity: 0,
      unitPrice: 7,
      lineTotal: 7,
    },
  ],
};
function partial(state = "succeeded") {
  return {
    ...base,
    remainingAmountCents: 3996,
    refundedAmountCents: state === "succeeded" ? 1296 : 0,
    items: [{ ...base.items[0], refusedQuantity: 1 }, base.items[1]],
    adjustments: [
      {
        id: "one",
        type: "partial_rejection",
        state,
        amountCents: 1296,
        lines: [{ lineId: "souvenir", quantity: 1, unitAmountCents: 1296 }],
      },
    ],
  };
}

test("commande normale : montants inchangés et aucun remboursement affiché", () => {
  const view = present(base);
  assert.equal(view.remainingCents, 5292);
  assert.equal(view.adjusted, false);
  assert.equal(view.refundedCents, 0);
  assert.doesNotMatch(render(base), /Rembours|À rembourser/);
});

test("capture historique : remboursement intégral des produits et de la livraison malgré les compteurs à zéro", () => {
  const order = {
    ...base,
    financialVersion: 0,
    status: "canceled",
    paymentStatus: "refunded",
  };
  const snapshot = JSON.stringify(order);
  const view = present(order);
  assert.equal(view.remainingCents, 0);
  assert.equal(view.refundedCents, 5292);
  assert.equal(view.productRefundedCents, 3292);
  assert.equal(view.deliveryRefundedCents, 2000);
  assert.deepEqual(
    view.rows.map((row) => [
      row.quantity,
      row.retained,
      row.refunds[0].quantity,
      row.refunds[0].amountCents,
    ]),
    [
      [2, 0, 2, 2592],
      [1, 0, 1, 700],
    ],
  );
  const html = render(order);
  assert.match(html, /Produits remboursés/);
  assert.match(html, /Livraison remboursée/);
  assert.match(html, /Remboursement intégral confirmé/);
  for (const amount of [25.92, 7, 32.92, 20, 52.92, 0])
    assert(html.includes(money(amount)));
  assert.doesNotMatch(html, /Total de la commande|0[×x]/);
  assert.equal(JSON.stringify(order), snapshot);
});

test("refus d'une seule unité : seul le produit concerné porte le remboursement", () => {
  const view = present(partial());
  assert.deepEqual(view.rows[0].refunds, [
    { state: "succeeded", quantity: 1, amountCents: 1296 },
  ]);
  assert.deepEqual(view.rows[1].refunds, []);
  assert.equal(view.rows[0].retained, 1);
  assert.equal(view.rows[1].retained, 1);
  assert.equal(view.refundedCents, 1296);
  assert.equal(view.productRefundedCents, 1296);
  assert.equal(view.deliveryRefundedCents, 0);
  const html = render(partial());
  assert.match(html, /Remboursement partiel confirmé/);
  assert(html.includes(money(39.96)));
  assert.doesNotMatch(
    html,
    /Livraison remboursée|Remboursement intégral confirmé/,
  );
});

test("refus complet d'un seul produit : les autres lignes restent conservées", () => {
  const order = partial();
  order.items = [{ ...base.items[0], refusedQuantity: 2 }, base.items[1]];
  order.adjustments[0].lines[0].quantity = 2;
  order.adjustments[0].amountCents = 2592;
  order.refundedAmountCents = 2592;
  order.remainingAmountCents = 2700;
  const view = present(order);
  assert.deepEqual(
    view.rows.map((row) => row.retained),
    [0, 1],
  );
  assert.equal(view.rows[0].refunds[0].amountCents, 2592);
  assert.equal(view.remainingCents, 2700);
  assert.match(render(order), /Remboursement partiel confirmé/);
});

for (const state of ["queued", "pending", "failed", "uncertain"]) {
  test(`remboursement ${state} : jamais annoncé comme confirmé`, () => {
    const order = partial(state);
    const view = present(order);
    assert.equal(view.refundedCents, 0);
    assert.equal(view.productRefundedCents, 0);
    assert.deepEqual(view.pendingRefunds, [{ state, amountCents: 1296 }]);
    const html = render(order);
    assert(html.includes(utils.REFUND_LABELS[state]));
    assert.doesNotMatch(
      html,
      /Produits remboursés|Remboursement partiel confirmé|Remboursement intégral confirmé/,
    );
  });
}

test("plusieurs refus sur la même ligne : quantités confirmées et en attente séparées", () => {
  const order = partial();
  order.items = [{ ...base.items[0], refusedQuantity: 2 }, base.items[1]];
  order.remainingAmountCents = 2700;
  order.adjustments = [
    ...order.adjustments,
    { ...order.adjustments[0], id: "two", state: "pending" },
  ];
  const view = present(order);
  assert.deepEqual(
    view.rows[0].refunds.map((r) => [r.state, r.quantity, r.amountCents]),
    [
      ["succeeded", 1, 1296],
      ["pending", 1, 1296],
    ],
  );
  assert.equal(view.refundedCents, 1296);
  assert.deepEqual(view.pendingRefunds, [
    { state: "pending", amountCents: 1296 },
  ]);
});

test("refus partiel puis annulation complète : livraison remboursée une seule fois", () => {
  const order = partial();
  order.status = "canceled";
  order.items = base.items.map((item) => ({
    ...item,
    refusedQuantity: item.quantity,
  }));
  order.remainingAmountCents = 0;
  order.refundedAmountCents = 5292;
  order.adjustments.push({
    id: "end",
    state: "succeeded",
    type: "termination",
    amountCents: 3996,
    lines: [
      { lineId: "souvenir", quantity: 1, unitAmountCents: 1296 },
      { lineId: "beer", quantity: 1, unitAmountCents: 700 },
    ],
  });
  const view = present(order);
  assert.equal(view.productRefundedCents, 3292);
  assert.equal(view.deliveryRefundedCents, 2000);
  assert.equal(view.unallocatedRefundedCents, 0);
  assert.deepEqual(view.rows[0].refunds, [
    { state: "succeeded", quantity: 2, amountCents: 2592 },
  ]);
});

test("même produit avec différentes options : liaison par identifiant de ligne et prix incluant les suppléments", () => {
  const order = partial();
  order.items = [
    { ...base.items[0], name: "Menu", refusedQuantity: 0 },
    {
      ...base.items[1],
      name: "Menu",
      refusedQuantity: 1,
      optionsTotal: 3,
      options: [{ name: "Dessert", price: 3 }],
      lineTotal: 10,
      note: "Sans oignons",
    },
  ];
  order.adjustments[0].lines = [
    { lineId: "beer", quantity: 1, unitAmountCents: 1000 },
  ];
  order.adjustments[0].amountCents = 1000;
  order.refundedAmountCents = 1000;
  const view = present(order);
  assert.deepEqual(view.rows[0].refunds, []);
  assert.equal(view.rows[1].refunds[0].amountCents, 1000);
  const html = render(order);
  assert.match(html, /Dessert|Sans oignons/);
  assert(html.includes(money(10)));
});

test("anciens identifiants : reprend le fallback de l'API sans confondre les noms", () => {
  const order = partial();
  order.items = order.items.map((item) => ({ ...item, lineId: undefined }));
  order.adjustments[0].lines[0].lineId = "order:line:0";
  assert.equal(present(order).rows[0].refunds[0].amountCents, 1296);
});

test("remboursement sans correspondance de ligne : conserve le total sans inventer une attribution", () => {
  const order = partial();
  order.adjustments[0].lines[0].lineId = "unknown";
  const view = present(order);
  assert.equal(view.productRefundedCents, 0);
  assert.equal(view.unallocatedRefundedCents, 1296);
  assert(view.rows.every((row) => !row.refunds.length));
  assert.match(render(order), /Remboursement sans détail par produit/);
});

test("remboursements historiques en cours ou échoués : total conservé nul sans confirmation fictive", () => {
  for (const stripeRefundStatus of ["pending", "failed"]) {
    const order = {
      ...base,
      financialVersion: 0,
      status: "canceled",
      stripeRefundStatus,
    };
    const view = present(order);
    assert.equal(view.remainingCents, 0);
    assert.equal(view.refundedCents, 0);
    assert.equal(view.rows[0].refunds[0].state, stripeRefundStatus);
    assert.doesNotMatch(render(order), /Remboursement intégral confirmé/);
  }
});

test("paiement au retrait : réduction du montant dû, aucun remboursement en ligne", () => {
  for (const source of [
    base,
    partial(),
    { ...base, financialVersion: 0, status: "canceled" },
  ]) {
    const order = {
      ...source,
      paymentMethod: "on_site",
      paymentStatus: "not_required",
    };
    const view = present(order);
    assert.equal(view.refundedCents, 0);
    assert.deepEqual(view.pendingRefunds, []);
    assert(view.rows.every((row) => !row.refunds.length));
    assert.doesNotMatch(render(order), /Rembours|À rembourser/);
  }
});
