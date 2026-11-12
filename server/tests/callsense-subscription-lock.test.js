const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
const push = require.resolve("../services/webpush.service");
require.cache[push] = { id: push, filename: push, loaded: true, exports: { sendPushToModule: async () => {} } };
const billingPath = require.resolve("../services/stripe-billing.service");
require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription: null }) } };
const Operation = require("../models/callsense/callsense-subscription-operation.model");
const Audit = require("../models/callsense/callsense-billing-audit.model");
const { guardedCallSenseMutation } = require("../routes/admin/subscriptions.routes");

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
