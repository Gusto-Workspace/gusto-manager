const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
const push = require.resolve("../../services/shared/webpush.service");
require.cache[push] = { id: push, filename: push, loaded: true, exports: { sendPushToModule: async () => {} } };
const billingPath = require.resolve("../../services/billing/stripe-billing.service");
let existingSubscription = null;
require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription: existingSubscription }) } };
const Operation = require("../../models/callsense/callsense-subscription-operation.model");
const Audit = require("../../models/callsense/callsense-billing-audit.model");
const { guardedCallSenseMutation, assertCallSenseRemovalSafe } = require("../../routes/admin/subscriptions.routes");

test("le retrait refuse un service CallSense actif même si le compteur est suspendu", async (t) => {
  const Config = require("../../models/callsense/callsense-config.model");
  const keys = ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"];
  const original = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, index) => { if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index]; }));
  keys.forEach((key, index) => { process.env[key] = `fixture_${index}`; });
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => ({ enabled: true, commercial: { meteringEnabled: false } }) }) }));
  const subscription = { metadata: { restaurantId: "507f1f77bcf86cd799439011" }, items: { data: [{ price: { id: "fixture_0" } }] } };
  await assert.rejects(assertCallSenseRemovalSafe(subscription), /Suspendez d'abord le service CallSense/);
});

test("deux créations concurrentes ne peuvent pas émettre deux requêtes Stripe", async () => {
  const originals = { create: Operation.create, deleteOne: Operation.deleteOne, updateOne: Operation.updateOne };
  const originalAudit = Audit.create; Audit.create = async () => {};
  let lock = null;
  let requests = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  Operation.create = async (value) => { if (lock) throw Object.assign(new Error("duplicate"), { code: 11000 }); lock = value; };
  Operation.deleteOne = async () => { lock = null; };
  Operation.updateOne = async () => {};
  try {
    const first = guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create", mutate: async (key) => { requests += 1; assert.match(key, /^callsense-subscription-/); await gate; return { id: "sub_test" }; } });
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create", mutate: async () => { requests += 1; } }), (error) => error.statusCode === 409);
    release();
    assert.equal((await first).id, "sub_test");
    assert.equal(requests, 1);
    assert.equal(lock, null);
  } finally { Object.assign(Operation, originals); Audit.create = originalAudit; }
});

test("une réponse Stripe incertaine conserve le verrou pour vérification administrative", async () => {
  const originals = { create: Operation.create, deleteOne: Operation.deleteOne, updateOne: Operation.updateOne };
  const originalAudit = Audit.create; Audit.create = async () => {};
  let state;
  Operation.create = async () => {};
  Operation.deleteOne = async () => { throw new Error("ne doit pas libérer"); };
  Operation.updateOne = async (_filter, update) => { state = update.$set.state; };
  try {
    await assert.rejects(guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create", mutate: async () => { throw new Error("timeout"); } }), (error) => error.statusCode === 409);
    assert.equal(state, "uncertain");
  } finally { Object.assign(Operation, originals); Audit.create = originalAudit; }
});

test("une synchronisation Mongo interrompue conserve le verrou après un seul appel Stripe", async (t) => {
  let state; let calls = 0; let deletes = 0;
  t.mock.method(Operation, "create", async () => {});
  t.mock.method(Operation, "deleteOne", async () => { deletes++; });
  t.mock.method(Operation, "updateOne", async (_filter, update) => { state = update.$set.state; });
  t.mock.method(Audit, "create", async () => {});
  await assert.rejects(guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create",
    mutate: async () => { calls++; return { id: "sub_test" }; },
    synchronize: async () => { throw new Error("Mongo indisponible"); },
  }), /incertain/);
  assert.equal(calls, 1);
  assert.equal(deletes, 0);
  assert.equal(state, "uncertain");
});

test("un abonnement existant interdit toute nouvelle création Stripe", async () => {
  const originals = { create: Operation.create, deleteOne: Operation.deleteOne };
  let calls = 0;
  Operation.create = async () => {};
  Operation.deleteOne = async () => {};
  existingSubscription = { id: "sub_existing" };
  try {
    await assert.rejects(guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create", mutate: async () => { calls++; } }), /abonnement existe déjà/);
    assert.equal(calls, 0);
  } finally { existingSubscription = null; Object.assign(Operation, originals); }
});

test("une erreur Mongo après création Stripe se reprend avec l'événement de la même tentative", async () => {
  const originals = { create: Operation.create, findById: Operation.findById, deleteOne: Operation.deleteOne, updateOne: Operation.updateOne, audit: Audit.create };
  const { reconcileExistingCreation } = require("../../services/callsense/callsense-subscription-recovery.service");
  let lock; let created = 0; let key;
  Operation.create = async (value) => { lock = { ...value, state: "pending" }; };
  Operation.findById = () => ({ lean: async () => lock && { ...lock } });
  Operation.deleteOne = async (filter) => { if (lock?.attemptId !== filter.attemptId) return { deletedCount: 0 }; lock = null; return { deletedCount: 1 }; };
  Operation.updateOne = async (_filter, update) => { lock.state = update.$set.state; };
  Audit.create = async (value) => { if (value.action === "subscription_create_completed") throw new Error("Mongo indisponible"); };
  try {
    await assert.rejects(guardedCallSenseMutation({ restaurantId: "restaurant", kind: "create", mutate: async (idempotencyKey) => { key = idempotencyKey; created++; return { id: "sub_one" }; } }), /incertain/);
    assert.equal(lock.state, "uncertain");
    const subscription = { id: "sub_one", metadata: { restaurantId: "restaurant" } };
    const stripe = { events: { list: async () => ({ data: [{ type: "customer.subscription.created", data: { object: { id: "sub_one" } }, request: { idempotency_key: key } }], has_more: false }) } };
    assert.equal(await reconcileExistingCreation({ restaurantId: "restaurant", subscription, stripe }), true);
    assert.equal(lock, null);
    assert.equal(created, 1);
  } finally { Operation.create = originals.create; Operation.findById = originals.findById; Operation.deleteOne = originals.deleteOne; Operation.updateOne = originals.updateOne; Audit.create = originals.audit; }
});
