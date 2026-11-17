const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
const push = require.resolve("../../services/shared/webpush.service");
require.cache[push] = { id: push, filename: push, loaded: true, exports: { sendPushToModule: async () => {} } };
const { assertCallSenseRemovalSafe } = require("../../routes/admin/subscriptions.routes");

test("configuration absente : retrait d'abonnement bloqué avant toute facturation", async () => {
  const names = ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"];
  const previous = names.map(name => process.env[name]);
  names.forEach(name => delete process.env[name]);
  try {
    await assert.rejects(assertCallSenseRemovalSafe({ metadata: {}, items: { data: [{ price: { id: "price_inconnu" } }] } }), error => error.statusCode === 409);
  } finally {
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
