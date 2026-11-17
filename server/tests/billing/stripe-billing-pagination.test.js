const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_pagination";
const stripePath = require.resolve("stripe");
const seen = [];
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => ({ subscriptions: { list: async (params) => {
  seen.push(params.starting_after || "first");
  return params.starting_after ? { data: [{ id: "sub_target", status: "active", metadata: { restaurantId: "restaurant", subscriptionCatalog: "restaurant_subscription" } }], has_more: false }
    : { data: [{ id: "sub_first", status: "active", metadata: { restaurantId: "another" } }], has_more: true };
} } }) };
const Restaurant = require("../../models/restaurant.model");
const { findRestaurantSubscription } = require("../../services/billing/stripe-billing.service");
test("la recherche vérifie toutes les pages Stripe avant de conclure à l'absence d'abonnement", async () => {
  const original = Restaurant.findById;
  Restaurant.findById = () => ({ populate: async () => ({ stripeCustomerId: "cus_test", owner_id: { stripeCustomerId: "cus_test" } }) });
  try {
    const result = await findRestaurantSubscription({ restaurantId: "restaurant" });
    assert.equal(result.subscription.id, "sub_target");
    assert.deepEqual(seen, ["first", "sub_first"]);
  } finally { Restaurant.findById = original; }
});
