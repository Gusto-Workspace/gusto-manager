const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeDocumentCommercialForForm,
} = require("../src/components/dashboard/admin/_shared/utils/legacy-document-commercial.utils");

function catalogProduct({ id, kind, code, name, amount }) {
  return {
    id,
    name,
    catalogKind: kind,
    catalogCode: code,
    metadata: { kind, code },
    default_price: {
      id: `price_${code}`,
      unit_amount: amount * 100,
      currency: "eur",
      recurring: { interval: "month", interval_count: 1 },
    },
  };
}

const catalog = [
  catalogProduct({
    id: "prod_standard",
    kind: "plan",
    code: "standard",
    name: "Abonnement standard",
    amount: 95,
  }),
  catalogProduct({
    id: "prod_premium",
    kind: "plan",
    code: "premium",
    name: "Abonnement premium",
    amount: 130,
  }),
  catalogProduct({
    id: "prod_reservations",
    kind: "addon",
    code: "reservations",
    name: "Module Réservations",
    amount: 45,
  }),
  catalogProduct({
    id: "prod_employees",
    kind: "addon",
    code: "employees",
    name: "Module Gestion du personnel",
    amount: 45,
  }),
  catalogProduct({
    id: "prod_gift_cards",
    kind: "addon",
    code: "gift_cards",
    name: "Module Cartes cadeaux",
    amount: 45,
  }),
];

test("normalise le document historique réel à 95 euros avec ses modules offerts", () => {
  const legacyDocument = {
    type: "CONTRACT",
    subscription: { name: "", priceMonthly: 95 },
    modules: [
      { name: "Reservation", offered: true, priceMonthly: 0 },
      { name: "Gestion du personnel", offered: true, priceMonthly: 0 },
    ],
    lines: [],
  };

  const result = normalizeDocumentCommercialForForm(legacyDocument, catalog);

  assert.equal(result.usedLegacyFallback, true);
  assert.equal(result.subscription.code, "standard");
  assert.equal(result.subscription.priceId, "price_standard");
  assert.deepEqual(
    result.modules.map((module) => [
      module.code,
      module.offered,
      module.priceMonthly,
    ]),
    [
      ["reservations", true, 0],
      ["employees", true, 0],
    ],
  );
});

test("conserve le tarif d'un ancien module Cartes cadeaux payant", () => {
  const result = normalizeDocumentCommercialForForm(
    {
      subscription: { name: "Standard", priceMonthly: 95 },
      modules: [{ name: "Cartes cadeaux", offered: false, priceMonthly: 39 }],
      lines: [],
    },
    catalog,
  );

  assert.equal(result.modules[0].code, "gift_cards");
  assert.equal(result.modules[0].offered, false);
  assert.equal(result.modules[0].priceMonthly, 39);
});

test("ne sélectionne aucune offre lorsque le seul prix historique est ambigu", () => {
  const ambiguousCatalog = [
    ...catalog,
    catalogProduct({
      id: "prod_partner",
      kind: "plan",
      code: "partner",
      name: "Abonnement partenaire",
      amount: 95,
    }),
  ];
  const result = normalizeDocumentCommercialForForm(
    {
      subscription: { name: "", priceMonthly: 95 },
      modules: [],
      lines: [],
    },
    ambiguousCatalog,
  );

  assert.equal(result.subscription.priceId, undefined);
  assert.equal(result.subscription.priceMonthly, 95);
});

for (const [legacyLabel, expectedCode] of [
  ["Reservation", "reservations"],
  ["Réservation", "reservations"],
  ["Réservations", "reservations"],
  ["Module Réservations", "reservations"],
  ["Gestion du personnel", "employees"],
  ["Personnel", "employees"],
  ["Module Gestion du personnel", "employees"],
]) {
  test(`reconnaît le libellé legacy « ${legacyLabel} »`, () => {
    const result = normalizeDocumentCommercialForForm(
      {
        subscription: { name: "", priceMonthly: 0 },
        modules: [{ name: legacyLabel, offered: true, priceMonthly: 0 }],
        lines: [],
      },
      catalog,
    );

    assert.equal(result.modules.length, 1);
    assert.equal(result.modules[0].code, expectedCode);
  });
}

test("conserve une prestation legacy inconnue sans cocher de module catalogue", () => {
  const result = normalizeDocumentCommercialForForm(
    {
      subscription: { name: "", priceMonthly: 0 },
      modules: [{ name: "Audit ponctuel", offered: false }],
      lines: [],
    },
    catalog,
  );

  assert.deepEqual(result.modules, []);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].label, "Audit ponctuel");
  assert.equal(result.lines[0].offered, false);
});

test("ne modifie jamais l'objet Document fourni", () => {
  const legacyDocument = {
    subscription: { name: "", priceMonthly: 95 },
    modules: [
      { name: "Reservation", offered: true, priceMonthly: 0 },
      { name: "Prestation spéciale", offered: false, priceMonthly: 22 },
    ],
    lines: [{ label: "Formation", qty: 2, unitPrice: 50 }],
  };
  const before = structuredClone(legacyDocument);

  normalizeDocumentCommercialForForm(legacyDocument, catalog);

  assert.deepEqual(legacyDocument, before);
});

test("laisse prioritaire et intact le nouveau format structuré", () => {
  const modernDocument = {
    commercialSnapshot: { source: "MANUAL", items: [] },
    subscription: {
      name: "Offre négociée",
      priceMonthly: 87,
      quantity: 1,
      code: "negotiated",
      priceId: "price_negotiated",
      productId: "prod_negotiated",
      currency: "EUR",
      interval: "month",
      intervalCount: 1,
    },
    modules: [
      {
        name: "Reservation",
        offered: false,
        priceMonthly: 31,
        quantity: 1,
        code: "reservations_custom",
        priceId: "price_reservations_custom",
        productId: "prod_reservations_custom",
        sourceKind: "ADDON",
      },
    ],
    lines: [{ label: "Installation", qty: 1, unitPrice: 80 }],
    timeClockTerminalRental: { enabled: false },
  };

  const result = normalizeDocumentCommercialForForm(modernDocument, catalog);

  assert.equal(result.usedLegacyFallback, false);
  assert.deepEqual(result.subscription, modernDocument.subscription);
  assert.deepEqual(result.modules, modernDocument.modules);
  assert.deepEqual(result.lines, modernDocument.lines);
});
