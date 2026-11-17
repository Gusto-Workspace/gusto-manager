const test = require("node:test");
const assert = require("node:assert/strict");
const Consumption = require("../models/callsense/callsense-consumption.model");
const { observation, sendEntry, stageCall, quotaThresholds, summarizeTwilioInventory, validateRecovery } = require("../services/callsense-metering.service");

const call = { _id: "1", callSid: "CAparent", childCallSid: "CAchild", incomingReceived: true, outcome: "completed", duration: 61 };
const config = { accountSid: "ACtest" };
const child = { sid: "CAchild", parentCallSid: "CAparent", accountSid: "ACtest", status: "completed", duration: "61", endTime: "2026-01-01T10:02:00Z" };

test("mode test : aucune lecture ni écriture Stripe même si le compteur est configuré", async () => {
  const { processRestaurant } = require("../services/callsense-metering.service");
  const forbidden = new Proxy({}, { get() { throw new Error("Stripe ou Twilio ne doit pas être appelé"); } });
  for (const enabled of [false, true]) {
    await processRestaurant({ managedByOnboarding: true, enabled, provisioningStatus: "ready_for_test", commercial: { meteringEnabled: true, meteringFrom: new Date() } }, { stripe: forbidden, twilio: forbidden });
  }
});

test("seul l'enfant Twilio lié au parent donne une durée arrondie par conversation", () => {
  const value = observation(call, child, config);
  assert.equal(value.minutes, 2);
  assert.equal(value.seconds, 61);
  assert.equal(value.startedAt.toISOString(), "2026-01-01T10:00:59.000Z");
  assert.equal(value.occurredAt.toISOString(), "2026-01-01T10:02:00.000Z");
  assert.deepEqual(observation({ ...call, outcome: "busy" }, { ...child, status: "busy" }, config), { skipped: true });
  assert.deepEqual(observation(call, { ...child, status: "in-progress" }, config), { pending: true });
  assert.throws(() => observation(call, { ...child, parentCallSid: "other" }, config), /non_concordant/);
  assert.throws(() => observation(call, { ...child, duration: null }, config), /duree_twilio/);
  assert.throws(() => observation({ ...call, duration: 70 }, child, config), /durees_twilio_non_concordantes/);
  assert.equal(observation({ ...call, duration: undefined }, child, config).seconds, 61);
});

test("les seuils sont calculés sur les minutes vérifiées sans bloquer les appels", () => {
  assert.deepEqual(quotaThresholds(799), []);
  assert.deepEqual(quotaThresholds(800), [80]);
  assert.deepEqual(quotaThresholds(1000), [80, 100]);
  assert.deepEqual(quotaThresholds(1200), [80, 100]);
});

test("la comparaison Twilio détecte les appels absents sans mélanger comptes ou périodes", () => {
  const period = { start: new Date("2026-01-01"), end: new Date("2026-02-01") };
  const source = { accountSid: "ACtest", direction: "inbound", to: "+33123456789", startTime: new Date("2026-01-12"), status: "completed" };
  const result = summarizeTwilioInventory([{ ...source, sid: "present" }, { ...source, sid: "missing" },
    { ...source, sid: "foreign", accountSid: "ACother" }, { ...source, sid: "outside", startTime: new Date("2026-03-01") }], ["present"],
  { accountSid: "ACtest", twilioNumber: "+33123456789" }, period);
  assert.equal(result.observed, 2); assert.equal(result.missingCount, 1); assert.equal(result.missing[0].sid, "missing");
  const many = summarizeTwilioInventory(Array.from({ length: 51 }, (_, index) => ({ ...source, sid: `CA${index}` })), [],
    { accountSid: "ACtest", twilioNumber: "+33123456789" }, period);
  assert.equal(many.missingCount, 51); assert.equal(many.missing.length, 50); assert.equal(many.missingTruncated, true);
});

test("la récupération exige un parent entrant et un unique enfant SIP conformes", () => {
  const parent = { sid: `CA${"a".repeat(32)}`, accountSid: "ACtest", direction: "inbound", to: "+33123456789", status: "completed", startTime: new Date("2026-01-01T10:00:00Z") };
  const child = { sid: `CA${"b".repeat(32)}`, accountSid: "ACtest", parentCallSid: parent.sid, direction: "outbound-dial", to: "sip:restaurant@example.test", status: "completed", duration: "61", endTime: new Date("2026-01-01T10:02:00Z") };
  const config = { accountSid: "ACtest", twilioNumber: "+33123456789", sipUri: "sip:restaurant@example.test", commercial: { meteringFrom: new Date("2026-01-01T09:00:00Z") } };
  const context = { period: { end: new Date("2026-02-01") } };
  assert.equal(validateRecovery(parent, [child], config, context).duration, 61);
  assert.throws(() => validateRecovery(parent, [child, child], config, context), /ambigus/);
  assert.throws(() => validateRecovery(parent, [{ ...child, to: "sip:other@example.test" }], config, context), /non_concordant/);
  assert.throws(() => validateRecovery({ ...parent, accountSid: "ACother" }, [child], config, context), /non_concordant/);
  assert.equal(validateRecovery(parent, [child], { ...config, commercial: {} }, context).duration, 61);
  assert.equal(validateRecovery(parent, [{ ...child, status: "busy", duration: "0" }], config).outcome, "busy");
});

test("la récupération locale ne modifie aucun appel Twilio et refuse un segment étranger", async () => {
  const Config = require("../models/callsense/callsense-config.model");
  const Call = require("../models/callsense/callsense-call.model");
  const { recoverMissingCall } = require("../services/callsense-metering.service");
  const { encryptToken } = require("../services/callsense-secrets.service");
  const { offerIds } = require("../services/callsense-usage.service");
  const env = { ...process.env };
  process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture"; process.env.CALLSENSE_METER_REPORTING_ENABLED = "false"; process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  const ids = offerIds(); const restaurantId = "507f1f77bcf86cd799439011";
  const parent = { sid: `CA${"a".repeat(32)}`, accountSid: "ACtest", direction: "inbound", to: "+33123456789", status: "completed", startTime: new Date("2026-01-01T10:00:00Z") };
  let child = { sid: `CA${"b".repeat(32)}`, accountSid: "ACtest", parentCallSid: parent.sid, direction: "outbound-dial", to: "sip:restaurant@example.test", status: "completed", duration: "61", endTime: new Date("2026-01-01T10:02:00Z") };
  const config = { restaurantId, accountSid: "ACtest", twilioNumber: "+33123456789", sipUri: child.to, commercial: {}, encryptedAuthToken: encryptToken("fake", restaurantId, "ACtest") };
  const fixed = { id: ids.fixed, active: true, livemode: false, product: "prod_call", currency: "eur", unit_amount: 4500, recurring: { interval: "month", usage_type: "licensed" } };
  const measured = { id: ids.metered, active: true, livemode: false, product: "prod_call", currency: "eur", recurring: { interval: "month", usage_type: "metered", meter: ids.meter }, billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: 1000, unit_amount: 0 }, { up_to: null, unit_amount: 5 }] };
  const meter = { id: ids.meter, event_name: "gusto_callsense_minutes", status: "active", default_aggregation: { formula: "sum" } };
  const subscription = { id: "sub_test", status: "active", items: { data: [{ price: { id: ids.fixed } }, { price: { id: ids.metered }, current_period_start: 1767225600, current_period_end: 1769904000 }] } };
  const stripe = { prices: { retrieve: async (id) => id === ids.fixed ? fixed : measured }, billing: { meters: { retrieve: async () => meter } }, subscriptions: { list: async () => ({ data: [subscription] }) } };
  const billingPath = require.resolve("../services/stripe-billing.service"); const savedBilling = require.cache[billingPath];
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription, stripeCustomerId: "cus_test" }), isStripeCustomerDedicatedToRestaurant: async () => true } };
  const originalConfig = Config.findOne; const originalFind = Call.findOne; const originalUpdate = Call.findOneAndUpdate;
  const servicePath = require.resolve("../services/callsense.service"); const savedService = require.cache[servicePath];
  let published = 0;
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { publish: () => { published += 1; } } };
  let writes = 0;
  Config.findOne = () => ({ select: () => ({ lean: async () => config }) });
  Call.findOne = () => ({ lean: async () => null });
  Call.findOneAndUpdate = (_filter, update) => ({ lean: async () => { writes += 1; assert.equal(update.$set.recoveredFromTwilio, true); assert.equal(update.$set.billingState, "complete"); return { _id: "local" }; } });
  const calls = () => ({ fetch: async () => parent }); calls.list = async () => [child];
  try {
    const result = await recoverMissingCall(restaurantId, parent.sid, { stripe, twilio: () => ({ calls }) });
    assert.equal(result.callId, "local"); assert.equal(writes, 1); assert.equal(published, 1);
    child = { ...child, to: "sip:other@example.test" };
    await assert.rejects(recoverMissingCall(restaurantId, parent.sid, { stripe, twilio: () => ({ calls }) }), /segment_sip_non_concordant/);
    assert.equal(writes, 1);
  } finally {
    Config.findOne = originalConfig; Call.findOne = originalFind; Call.findOneAndUpdate = originalUpdate;
    if (savedService) require.cache[servicePath] = savedService; else delete require.cache[servicePath];
    if (savedBilling) require.cache[billingPath] = savedBilling; else delete require.cache[billingPath];
    for (const name of ["STRIPE_API_SECRET_KEY", "CALLSENSE_METER_REPORTING_ENABLED", "CALLSENSE_ENCRYPTION_KEY"]) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; }
  }
});

test("l'envoi reprend avec le même identifiant et transmet toutes les minutes", async () => {
  const now = new Date("2026-01-02T00:00:00Z");
  const entry = { _id: "entry", state: "verified", occurredAt: new Date("2026-01-01T12:00:00Z"), identifier: "unique", stripeCustomerId: "cus_test", minutes: 1001 };
  const originalFind = Consumption.findOneAndUpdate;
  const originalUpdate = Consumption.updateOne;
  const sent = [];
  let stored = { ...entry };
  Consumption.findOneAndUpdate = () => ({ lean: async () => { stored = { ...stored, state: "sending", firstAttemptAt: stored.firstAttemptAt || now }; return stored; } });
  Consumption.updateOne = async (_filter, update) => { stored = { ...stored, ...update.$set }; };
  const stripe = { billing: { meterEvents: { create: async (payload, options) => { sent.push({ payload, options }); if (sent.length === 1) throw new Error("timeout"); return { identifier: "unique" }; } } } };
  try {
    assert.equal(await sendEntry(entry, stripe, now), "sending");
    assert.equal(await sendEntry(stored, stripe, new Date(now.getTime() + 1000)), "sent");
    assert.equal(sent[0].payload.value, undefined);
    assert.equal(sent[0].payload.payload.value, "1001");
    assert.equal(sent[0].options.idempotencyKey, "unique");
    assert.deepEqual(sent[0], sent[1]);
    assert.equal(await sendEntry(stored, stripe, now), "sent");
    assert.equal(sent.length, 2);
  } finally { Consumption.findOneAndUpdate = originalFind; Consumption.updateOne = originalUpdate; }
});

test("une requête incertaine trop ancienne exige une vérification et n'est pas renvoyée", async () => {
  const now = new Date("2026-01-03T00:00:00Z");
  const entry = { _id: "entry", state: "sending", firstAttemptAt: new Date("2026-01-01T00:00:00Z"), occurredAt: new Date("2026-01-01T00:00:00Z") };
  const originalFind = Consumption.findOneAndUpdate;
  const originalUpdate = Consumption.updateOne;
  let state;
  Consumption.findOneAndUpdate = () => ({ lean: async () => entry });
  Consumption.updateOne = async (_filter, update) => { state = update.$set.state; };
  try {
    assert.equal(await sendEntry(entry, { billing: { meterEvents: { create: () => { throw new Error("unexpected"); } } } }, now), "review");
    assert.equal(state, "review");
  } finally { Consumption.findOneAndUpdate = originalFind; Consumption.updateOne = originalUpdate; }
});

test("au renouvellement, aucune entrée ancienne n'est envoyée automatiquement", async () => {
  const oldUpdate = Consumption.updateOne;
  let lastError;
  Consumption.updateOne = async (_filter, update) => { lastError = update.$set.lastError; return { modifiedCount: 1 }; };
  const stripe = { billing: { meterEvents: { create: () => { throw new Error("envoi interdit"); } } } };
  const entry = { _id: "entry", state: "verified", periodEnd: new Date("2026-02-01T00:00:00Z") };
  try {
    assert.equal(await sendEntry(entry, stripe, new Date("2026-02-01T00:00:00Z")), "review");
    assert.equal(lastError, "periode_cloturee");
    assert.equal(await sendEntry({ ...entry, state: "sending", firstAttemptAt: new Date("2026-01-31T23:59:00Z") }, stripe, new Date("2026-02-01T00:00:01Z")), "review");
    assert.equal(lastError, "envoi_incertain_periode_cloturee");
    assert.equal(await sendEntry({ ...entry, state: "resolved" }, stripe), "resolved");
  } finally { Consumption.updateOne = oldUpdate; }
});

test("reporting global désactivé : vérification locale sans émission Stripe", async () => {
  const Config = require("../models/callsense/callsense-config.model"), Call = require("../models/callsense/callsense-call.model");
  const Period = require("../models/callsense/callsense-billing-period.model");
  const { encryptToken } = require("../services/callsense-secrets.service");
  const { offerIds } = require("../services/callsense-usage.service");
  const { processRestaurant } = require("../services/callsense-metering.service");
  const oldEnv = { key: process.env.CALLSENSE_ENCRYPTION_KEY, reporting: process.env.CALLSENSE_METER_REPORTING_ENABLED, stripe: process.env.STRIPE_API_SECRET_KEY };
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32); process.env.CALLSENSE_METER_REPORTING_ENABLED = "false"; process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
  const ids = offerIds(), restaurantId = "507f1f77bcf86cd799439011", now = new Date(), from = new Date(now.getTime() - 3600000);
  const cfg = { _id: "cfg", restaurantId, accountSid: "ACtest", encryptedAuthToken: encryptToken("fake", restaurantId, "ACtest"), commercial: { meteringEnabled: true, meteringFrom: from } };
  const fixed = { id: ids.fixed, active: true, livemode: false, product: "prod", currency: "eur", unit_amount: 4500, recurring: { interval: "month", usage_type: "licensed" } };
  const measured = { id: ids.metered, active: true, livemode: false, product: "prod", currency: "eur", recurring: { interval: "month", usage_type: "metered", meter: ids.meter }, billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: 1000, unit_amount: 0 }, { up_to: null, unit_amount: 5 }] };
  const meter = { id: ids.meter, event_name: "gusto_callsense_minutes", status: "active", default_aggregation: { formula: "sum" } };
  const subscription = { id: "sub_test", status: "active", items: { data: [{ price: { id: ids.fixed } }, { price: { id: ids.metered }, current_period_start: Math.floor(from / 1000), current_period_end: Math.floor(now / 1000) + 3600 }] } };
  const billingPath = require.resolve("../services/stripe-billing.service"), oldBilling = require.cache[billingPath];
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription, stripeCustomerId: "cus_test" }), isStripeCustomerDedicatedToRestaurant: async () => true } };
  const old = { callFind: Call.find, callUpdate: Call.updateOne, configExists: Config.exists, periodUpdate: Period.updateOne, consumptionUpdate: Consumption.updateOne, consumptionFind: Consumption.findOne, aggregate: Consumption.aggregate };
  let stored, sent = 0;
  Call.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ ...call, restaurantId }] }) }) });
  Call.updateOne = async () => ({ matchedCount: 1 }); Config.exists = async () => true; Period.updateOne = async () => ({});
  Consumption.updateOne = async (_filter, update) => { if (update.$setOnInsert) stored = { ...update.$setOnInsert, state: "verified" }; };
  Consumption.findOne = () => ({ lean: async () => stored });
  Consumption.aggregate = async () => [];
  const stripe = { prices: { retrieve: async (id) => id === ids.fixed ? fixed : measured }, billing: { meters: { retrieve: async () => meter }, meterEvents: { create: async () => { sent++; } } }, subscriptions: { list: async () => ({ data: [subscription] }) } };
  const fakeChild = { ...child, endTime: new Date(now.getTime() - 1000), duration: "61" };
  try {
    await processRestaurant(cfg, { stripe, twilio: () => ({ calls: () => ({ fetch: async () => fakeChild }) }), now });
    assert.equal(stored.minutes, 2); assert.equal(stored.state, "verified"); assert.equal(sent, 0);
  } finally {
    Call.find = old.callFind; Call.updateOne = old.callUpdate; Config.exists = old.configExists; Period.updateOne = old.periodUpdate; Consumption.updateOne = old.consumptionUpdate; Consumption.findOne = old.consumptionFind; Consumption.aggregate = old.aggregate;
    if (oldBilling) require.cache[billingPath] = oldBilling; else delete require.cache[billingPath];
    for (const [name, value] of Object.entries({ CALLSENSE_ENCRYPTION_KEY: oldEnv.key, CALLSENSE_METER_REPORTING_ENABLED: oldEnv.reporting, STRIPE_API_SECRET_KEY: oldEnv.stripe })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("un appel confirmé arrivé après sa période est conservé pour revue sans envoi Stripe", async () => {
  const Period = require("../models/callsense/callsense-billing-period.model");
  const { encryptToken } = require("../services/callsense-secrets.service");
  const oldKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  const oldFind = Period.find; const oldUpdate = Consumption.updateOne; const oldConsumptionFind = Consumption.findOne;
  let saved;
  Period.find = () => ({ limit: () => ({ lean: async () => [{ subscriptionId: "sub_fake", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01") }] }) });
  Consumption.updateOne = async (_query, changes) => { saved = changes.$setOnInsert; };
  Consumption.findOne = () => ({ lean: async () => saved });
  const restaurantId = "507f1f77bcf86cd799439011";
  const config = { restaurantId, accountSid: "ACtest", encryptedAuthToken: encryptToken("fake", restaurantId, "ACtest"), commercial: { meteringFrom: new Date("2025-12-01") } };
  const context = { stripeCustomerId: "cus_fake", subscription: { id: "sub_fake" }, period: { start: new Date("2026-02-01"), end: new Date("2026-03-01") } };
  try {
    const result = await stageCall({ ...call, restaurantId }, config, context, () => ({ calls: () => ({ fetch: async () => child }) }));
    assert.equal(result, "review"); assert.equal(saved.lastError, "periode_cloturee");
    assert.equal(saved.minutes, 2); assert.equal(saved.periodStart.toISOString(), "2026-01-01T00:00:00.000Z");
    Consumption.findOne = () => ({ lean: async () => ({ ...saved, seconds: 120 }) });
    await assert.rejects(stageCall({ ...call, restaurantId }, config, context, () => ({ calls: () => ({ fetch: async () => child }) })), /preuve_facturation_modifiee/);
    Period.find = () => ({ limit: () => ({ lean: async () => [] }) });
    Consumption.findOne = () => ({ lean: async () => saved });
    assert.equal(await stageCall({ ...call, restaurantId }, config, { period: null }, () => ({ calls: () => ({ fetch: async () => child }) })), "review");
    assert.equal(saved.lastError, "periode_origine_inconnue");
    assert.equal(saved.periodStart, null); assert.equal(saved.periodEnd, null);
    Period.find = () => ({ limit: () => ({ lean: async () => [{ subscriptionId: "sub_old", stripeCustomerId: "cus_old", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01") }] }) });
    assert.equal(await stageCall({ ...call, restaurantId }, config, { period: null }, () => ({ calls: () => ({ fetch: async () => child }) })), "review");
    assert.equal(saved.subscriptionId, "sub_old"); assert.equal(saved.stripeCustomerId, "cus_old");
  } finally {
    Period.find = oldFind; Consumption.updateOne = oldUpdate; Consumption.findOne = oldConsumptionFind;
    if (oldKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = oldKey;
  }
});
