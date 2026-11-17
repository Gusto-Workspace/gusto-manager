const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../../models/callsense/callsense-config.model");
const { syncCommercialSubscription, reconcileFromAdmin } = require("../../services/callsense/callsense-commercial-sync.service");

test("synchronise ajout et retrait sans écraser une modification concurrente", async (t) => {
  const keys = ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"];
  const saved = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  keys.forEach((key, i) => { process.env[key] = `test_${i}`; });
  const restaurantId = "507f1f77bcf86cd799439011";
  const subscription = { id: "sub_test", customer: "cus_test", status: "active", metadata: { restaurantId }, items: { data: [
    { price: { id: "test_0" } }, { price: { id: "test_1", recurring: { meter: "test_2" } }, current_period_start: 100, current_period_end: 200 },
  ] } };
  let changes; let matchedCount = 1; let periods = 0;
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "config", updatedAt: new Date(10) }) }) }));
  t.mock.method(Config, "updateOne", async (filter, update) => { assert.equal(filter.updatedAt.getTime(), 10); changes = update.$set; return { matchedCount }; });
  const savePeriod = async () => { periods++; };
  await syncCommercialSubscription({ restaurantId, subscription, savePeriod });
  assert.equal(changes["commercial.subscribed"], true);
  assert.equal(changes["commercial.stripePriceId"], "test_0");
  assert.equal(periods, 1);
  subscription.items.data = [];
  await syncCommercialSubscription({ restaurantId, subscription, savePeriod });
  assert.equal(changes["commercial.subscribed"], false);
  assert.equal(changes["commercial.periodEnd"], null);
  matchedCount = 0;
  await assert.rejects(syncCommercialSubscription({ restaurantId, subscription, savePeriod }), /modifiée/);
  await assert.rejects(syncCommercialSubscription({ restaurantId: "other", subscription, savePeriod }), /non concordant/);
});

test("la consultation admin réconcilie avec Stripe sous verrou sans créer d'abonnement", async (t) => {
  const Operation = require("../../models/callsense/callsense-subscription-operation.model");
  const billingPath = require.resolve("../../services/billing/stripe-billing.service");
  const previous = require.cache[billingPath];
  const keys = ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"];
  const saved = keys.map(key => process.env[key]);
  t.after(() => { if (previous) require.cache[billingPath] = previous; else delete require.cache[billingPath]; keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); });
  keys.forEach((key, i) => { process.env[key] = `test_${i}`; });
  const restaurantId = "507f1f77bcf86cd799439011";
  let lock = false; let subscribed;
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription: { id: "sub_test", metadata: { restaurantId }, status: "active", items: { data: [] } } }) } };
  t.mock.method(Config, "exists", async () => true);
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "config", updatedAt: new Date(10) }) }) }));
  t.mock.method(Config, "updateOne", async (_filter, update) => { assert.equal(lock, true); subscribed = update.$set["commercial.subscribed"]; return { matchedCount: 1 }; });
  t.mock.method(Operation, "findById", () => ({ lean: async () => null }));
  t.mock.method(Operation, "create", async () => { lock = true; });
  t.mock.method(Operation, "deleteOne", async () => { lock = false; });
  await reconcileFromAdmin(restaurantId);
  assert.equal(subscribed, false);
  assert.equal(lock, false);
});

test("une résiliation confirmée est relue par identifiant et reprise sans nouvelle écriture Stripe", async (t) => {
  const Operation = require("../../models/callsense/callsense-subscription-operation.model");
  const Audit = require("../../models/callsense/callsense-billing-audit.model");
  const keys = ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"];
  const saved = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  keys.forEach((key, i) => { process.env[key] = `test_${i}`; });
  const restaurantId = "507f1f77bcf86cd799439011";
  let lock = { kind: "update", state: "uncertain", subscriptionId: "sub_test", attemptId: "attempt", startedAt: new Date() };
  let updates = 0; let attempts = 0; let failMongo = true; let eventKey = "callsense-subscription-attempt"; let changes;
  const subscription = { id: "sub_test", status: "canceled", metadata: { restaurantId }, items: { data: [] } };
  const stripeClient = { subscriptions: { retrieve: async (id) => { assert.equal(id, "sub_test"); return subscription; },
    cancel: async () => { throw Error("annulation interdite"); }, update: async () => { throw Error("modification interdite"); } },
  events: { list: async ({ type }) => { assert.equal(type, "customer.subscription.deleted"); return { has_more: false, data: [{ type, data: { object: { id: "sub_test" } }, request: { idempotency_key: eventKey } }] }; } } };
  t.mock.method(Config, "exists", async () => true);
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "config", updatedAt: new Date(10) }) }) }));
  t.mock.method(Config, "updateOne", async (_filter, update) => { attempts++; if (failMongo) throw Error("Mongo indisponible"); updates++; changes = update.$set; return { matchedCount: 1 }; });
  t.mock.method(Operation, "findById", () => ({ lean: async () => lock }));
  t.mock.method(Operation, "create", async () => { throw Object.assign(Error("verrou existant"), { code: 11000 }); });
  t.mock.method(Operation, "deleteOne", async (filter) => { assert.equal(filter.attemptId, "attempt"); lock = null; return { deletedCount: 1 }; });
  t.mock.method(Audit, "create", async () => {});
  const options = { stripeClient, findSubscription: async () => ({ subscription: null }) };
  await assert.rejects(reconcileFromAdmin(restaurantId, options), /Mongo indisponible/);
  assert.ok(lock);
  failMongo = false; eventKey = "autre-cle";
  await assert.rejects(reconcileFromAdmin(restaurantId, options), /opération CallSense/);
  assert.ok(lock); assert.equal(attempts, 1);
  eventKey = "callsense-subscription-attempt";
  assert.equal((await reconcileFromAdmin(restaurantId, options)).recovered, true);
  assert.equal(lock, null); assert.equal(updates, 1);
  assert.equal(changes["commercial.subscribed"], false);
  assert.equal(changes["commercial.stripeStatus"], "canceled");
  assert.equal(changes["commercial.stripeSubscriptionId"], "sub_test");
});
