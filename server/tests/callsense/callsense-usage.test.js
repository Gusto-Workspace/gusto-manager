const test = require("node:test");
const assert = require("node:assert/strict");
const { offerIds, validateOffer, periodFromSubscription, summarizeCalls } = require("../../services/callsense/callsense-usage.service");
const ids = { fixed: "price_fixed", metered: "price_meter", meter: "mtr_test" };
const fixed = { id: ids.fixed, active: true, livemode: false, product: "prod_one", currency: "eur", unit_amount: 4500, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
const metered = { id: ids.metered, active: true, livemode: false, product: "prod_one", currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "metered", meter: ids.meter }, billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: 1000, unit_amount: 0, flat_amount: null }, { up_to: null, unit_amount: 5, flat_amount: null }] };
const meter = { id: ids.meter, event_name: "gusto_callsense_minutes", status: "active", default_aggregation: { formula: "sum" } };

test("les identifiants Stripe sont lus depuis le fichier d'environnement du serveur", () => {
  const env = require("dotenv").parse(require("fs").readFileSync(require("path").join(__dirname, "../../.env")));
  const configured = offerIds(env);
  assert.ok(configured.fixed && configured.metered && configured.meter);
  assert.ok(configured.fixed === env.STRIPE_CALLSENSE_FIXED_PRICE_ID.trim());
  assert.ok(configured.metered === env.STRIPE_CALLSENSE_METERED_PRICE_ID.trim());
  assert.ok(configured.meter === env.STRIPE_CALLSENSE_METER_ID.trim());
});

test("l'offre doit correspondre aux deux prix et aux paliers de 1000 minutes", () => {
  assert.equal(validateOffer(fixed, metered, meter, ids), true);
  assert.equal(validateOffer(fixed, { ...metered, tiers: [{ up_to: 500, unit_amount: 0 }, metered.tiers[1]] }, meter, ids), false);
  assert.equal(validateOffer(fixed, { ...metered, tiers: [{ up_to: 1000, unit_amount: null }, metered.tiers[1]] }, meter, ids), false);
  assert.equal(validateOffer({ ...fixed, unit_amount: 0 }, metered, meter, ids), false);
  assert.equal(validateOffer(fixed, metered, { ...meter, event_name: "other" }, ids), false);
  assert.equal(offerIds({ STRIPE_API_SECRET_KEY: "sk_live_placeholder" }).fixed, "");
});

test("Test et Live exigent les trois identifiants configurés, sans valeur de secours", () => {
  for (const key of ["sk_test_fixture", "sk_live_fixture"]) {
    assert.deepEqual(offerIds({ STRIPE_API_SECRET_KEY: key }), { fixed: "", metered: "", meter: "" });
  }
  assert.deepEqual(offerIds({ STRIPE_CALLSENSE_FIXED_PRICE_ID: " price_fixed ", STRIPE_CALLSENSE_METERED_PRICE_ID: "price_usage", STRIPE_CALLSENSE_METER_ID: "mtr_fixture" }),
    { fixed: "price_fixed", metered: "price_usage", meter: "mtr_fixture" });
});

test("la période provient de l'abonnement comportant exactement les deux tarifs", () => {
  const subscription = { items: { data: [{ price: { id: ids.fixed } }, { price: { id: ids.metered }, current_period_start: 100, current_period_end: 200 }] } };
  assert.equal(periodFromSubscription(subscription, ids).start.getTime(), 100000);
  assert.equal(periodFromSubscription({ items: { data: [subscription.items.data[0]] } }, ids), null);
  assert.equal(periodFromSubscription({ items: { data: [...subscription.items.data, subscription.items.data[1]] } }, ids), null);
  assert.equal(periodFromSubscription({ items: { data: [subscription.items.data[0], subscription.items.data[1], { price: { id: "other", recurring: { meter: ids.meter } } }] } }, ids), null);
  assert.equal(periodFromSubscription({ items: { data: [{ ...subscription.items.data[0], quantity: 2 }, subscription.items.data[1]] } }, ids), null);
});

test("seules les conversations confirmées sont arrondies une fois par appel", () => {
  const calls = [
    { incomingReceived: true, outcome: "completed", duration: 1 },
    { incomingReceived: true, outcome: "completed", duration: 60 },
    { incomingReceived: true, outcome: "completed", duration: 61 },
    { incomingReceived: true, outcome: "completed", duration: 0 },
    { incomingReceived: true, outcome: "no-answer", duration: 70, phase: 2 },
    { incomingReceived: true, outcome: "busy", phase: 2 },
    { incomingReceived: true, outcome: "failed", duration: 90 },
    { incomingReceived: false, outcome: "completed", duration: 100 },
  ];
  assert.deepEqual(summarizeCalls(calls), { received: 7, answered: 4, missed: 1, busy: 1, refused: 0, conversationSeconds: 122, minutes: 4 });
});

test("le suivi téléphonique filtre le mois et le restaurant sans dépendre de Stripe", async () => {
  const Call = require("../../models/callsense/callsense-call.model");
  const original = Call.find;
  let filter;
  Call.find = (query) => { filter = query; return { select: () => ({ lean: async () => [
    { incomingReceived: true, outcome: "completed", duration: 61 },
    { incomingReceived: true, outcome: "no-answer", phase: 2 },
  ] }) }; };
  try {
    const result = await require("../../services/callsense/callsense-usage.service").getTelephoneStats("restaurant-a", "2026-02");
    assert.equal(filter.restaurantId, "restaurant-a");
    assert.equal(filter.createdAt.$gte.toISOString(), "2026-01-31T23:00:00.000Z");
    assert.equal(filter.createdAt.$lt.toISOString(), "2026-02-28T23:00:00.000Z");
    assert.deepEqual([result.received, result.answered, result.missed, result.conversationSeconds], [2, 1, 1, 61]);
    await assert.rejects(() => require("../../services/callsense/callsense-usage.service").getTelephoneStats("restaurant-a", "2026-13"), /periode_invalide/);
  } finally { Call.find = original; }
});

test("les mois de changement d'heure utilisent les bornes françaises", async () => {
  const Call = require("../../models/callsense/callsense-call.model");
  const original = Call.find;
  let filter;
  Call.find = (query) => { filter = query; return { select: () => ({ lean: async () => [] }) }; };
  try {
    await require("../../services/callsense/callsense-usage.service").getTelephoneStats("a", "2026-03");
    assert.equal(filter.createdAt.$gte.toISOString(), "2026-02-28T23:00:00.000Z");
    assert.equal(filter.createdAt.$lt.toISOString(), "2026-03-31T22:00:00.000Z");
    await require("../../services/callsense/callsense-usage.service").getTelephoneStats("a", "2026-10");
    assert.equal(filter.createdAt.$gte.toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(filter.createdAt.$lt.toISOString(), "2026-10-31T23:00:00.000Z");
  } finally { Call.find = original; }
});

test("17 lignes téléphoniques simulées : seules six communications entrantes du mois sont comptées", () => {
  const { summarizeTwilioInventory } = require("../../services/callsense/callsense-metering.service");
  const period = { start: new Date("2026-10-31T23:00:00Z"), end: new Date("2026-11-30T23:00:00Z") };
  const base = { accountSid: "ACtest", to: "+33123456789", startTime: new Date("2026-11-12T12:00:00Z") };
  const parents = Array.from({ length: 6 }, (_, i) => ({ ...base, sid: `parent${i}`, direction: "inbound" }));
  const children = parents.map((parent) => ({ ...base, sid: `sip${parent.sid}`, parentCallSid: parent.sid, direction: "outbound-dial" }));
  const outgoing = Array.from({ length: 3 }, (_, i) => ({ ...base, sid: `out${i}`, direction: "outbound-api" }));
  const older = Array.from({ length: 2 }, (_, i) => ({ ...base, sid: `old${i}`, direction: "inbound", startTime: new Date("2026-10-01T12:00:00Z") }));
  const inventory = [...parents, ...children, ...outgoing, ...older];
  assert.equal(inventory.length, 17);
  const comparison = summarizeTwilioInventory(inventory, parents.slice(0, 5).map((call) => call.sid), { accountSid: "ACtest", twilioNumber: "+33123456789" }, period);
  assert.equal(comparison.observed, 6); assert.equal(comparison.missingCount, 1);
  const calls = [
    { incomingReceived: true, outcome: "completed", duration: 10 },
    { incomingReceived: true, outcome: "no-answer", phase: 2 },
    { incomingReceived: true, outcome: "busy" },
    { incomingReceived: true, outcome: "no-answer", sipResponseCode: "603" },
    { incomingReceived: true, outcome: "no-answer", phase: 3 },
    { incomingReceived: true, outcome: "failed" },
  ];
  assert.deepEqual(summarizeCalls(calls), { received: 6, answered: 2, missed: 1, busy: 1, refused: 1, conversationSeconds: 10, minutes: 1 });
});
