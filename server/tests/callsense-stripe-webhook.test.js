const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_webhook_fixture";
process.env.STRIPE_WEBHOOK_SECRET_KEY = "whsec_fixture";
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
const router = require("../routes/stripe-callsense-webhook.routes");
const Config = require("../models/callsense/callsense-config.model");
const { offerIds } = require("../services/callsense-usage.service");

test("le webhook Stripe vérifie la signature et sépare les modes Test et Production", async () => {
  const handler = router.stack.find((item) => item.route?.path === "/stripe/wh").route.stack[0].handle;
  const send = async (livemode, valid) => {
    const payload = JSON.stringify({ id: "evt_test", type: "unrelated.event", livemode, data: { object: {} } });
    const signature = valid ? stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET_KEY }) : "invalid";
    const response = { sendStatus(code) { this.status = code; return this; } };
    await handler({ body: Buffer.from(payload), get: () => signature }, response);
    return response.status;
  };
  assert.equal(await send(false, true), 200);
  assert.equal(await send(false, false), 400);
  assert.equal(await send(true, true), 400);
  assert.equal(router.subscriptionIdForEvent({ type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_test" } } } } }), "sub_test");
});

test("la synchronisation commerciale relit Stripe et ne modifie pas l'état technique", async () => {
  const restaurantId = "507f1f77bcf86cd799439011";
  const ids = offerIds();
  const subscription = { id: "sub_test", status: "past_due", metadata: { restaurantId }, items: { data: [
    { price: { id: ids.fixed } }, { price: { id: ids.metered }, current_period_start: 100, current_period_end: 200 },
  ] } };
  const billingPath = require.resolve("../services/stripe-billing.service");
  const meteringPath = require.resolve("../services/callsense-metering.service");
  const originalBilling = require.cache[billingPath];
  const originalMetering = require.cache[meteringPath];
  const originalFind = Config.findOne;
  const originalUpdate = Config.updateOne;
  let update;
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription }) } };
  require.cache[meteringPath] = { id: meteringPath, filename: meteringPath, loaded: true, exports: { saveBillingPeriod: async () => {} } };
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ _id: "config", commercial: {} }) }) });
  Config.updateOne = async (_filter, changes) => { update = changes.$set; };
  const stripeClient = { subscriptions: { retrieve: async () => subscription } };
  try {
    await router.syncEvent({ type: "customer.subscription.updated", created: 20, data: { object: { id: subscription.id } } }, stripeClient);
    assert.equal(update["commercial.subscribed"], true);
    assert.equal(update["commercial.stripeStatus"], "past_due");
    assert.equal(update.enabled, undefined);
    assert.equal(update["commercial.stripeEventCreated"], 20);
  } finally {
    Config.findOne = originalFind; Config.updateOne = originalUpdate;
    if (originalBilling) require.cache[billingPath] = originalBilling; else delete require.cache[billingPath];
    if (originalMetering) require.cache[meteringPath] = originalMetering; else delete require.cache[meteringPath];
  }
});
