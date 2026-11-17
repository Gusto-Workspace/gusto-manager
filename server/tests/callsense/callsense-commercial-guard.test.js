const stripeEnv = require("dotenv").parse(require("fs").readFileSync(require("path").join(__dirname, "../../.env")));
for (const key of ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"]) {
  if (!stripeEnv[key]) throw new Error(`Variable de test absente : ${key}`);
  process.env[key] = stripeEnv[key];
}
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_catalog";
const { offerIds } = require("../../services/callsense/callsense-usage.service");
const ids = offerIds();
const product = (id, kind, code) => ({ id, active: true, name: code, metadata: { catalog: "restaurant_subscription", kind, code } });
const entries = { plan: product("prod_plan", "plan", "base"), [ids.fixed]: product("prod_call", "addon", "callsense"), other: product("prod_other", "addon", "other") };
let quota = 1000;
const stripePath = require.resolve("stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => ({
  prices: { retrieve: async (id) => id === ids.metered ? { id, active: true, livemode: false, product: "prod_call", currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "metered", meter: ids.meter }, billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: quota, unit_amount: 0 }, { up_to: null, unit_amount: 5 }] } : ({ id, active: true, livemode: false, type: "recurring", unit_amount: id === ids.fixed ? 4500 : 1000, currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, product: entries[id] }) },
  billing: { meters: { retrieve: async () => ({ id: ids.meter, event_name: "gusto_callsense_minutes", status: "active", default_aggregation: { formula: "sum" } }) } },
}) };
const { resolveCatalogSelection } = require("../../services/billing/stripe-subscription-catalog.service");

test("l'offre CallSense est sélectionnable uniquement si ses deux tarifs et son compteur correspondent", async () => {
  const valid = await resolveCatalogSelection({ planPriceId: "plan", addonPriceIds: [ids.fixed] });
  assert.equal(valid.addons[0].code, "callsense");
  quota = 500;
  await assert.rejects(resolveCatalogSelection({ planPriceId: "plan", addonPriceIds: [ids.fixed] }), (error) => error.statusCode === 409);
  const allowed = await resolveCatalogSelection({ planPriceId: "plan", addonPriceIds: ["other"] });
  assert.equal(allowed.addons[0].code, "other");
});
