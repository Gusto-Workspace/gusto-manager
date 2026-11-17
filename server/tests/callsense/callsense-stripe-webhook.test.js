const stripeEnv = require("dotenv").parse(require("fs").readFileSync(require("path").join(__dirname, "../../.env")));
for (const key of ["STRIPE_CALLSENSE_FIXED_PRICE_ID", "STRIPE_CALLSENSE_METERED_PRICE_ID", "STRIPE_CALLSENSE_METER_ID"]) {
  if (!stripeEnv[key]) throw new Error(`Variable de test absente : ${key}`);
  process.env[key] = stripeEnv[key];
}
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_webhook_fixture";
process.env.STRIPE_WEBHOOK_SECRET_KEY = "whsec_fixture";
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
const router = require("../../routes/stripe-callsense-webhook.routes");
const Config = require("../../models/callsense/callsense-config.model");
const { offerIds } = require("../../services/callsense/callsense-usage.service");

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
  const billingPath = require.resolve("../../services/billing/stripe-billing.service");
  const meteringPath = require.resolve("../../services/callsense/callsense-metering.service");
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

test("un événement de création confirmé rapproche le verrou sans recréer l'abonnement", async () => {
  const restaurantId = "507f1f77bcf86cd799439011";
  const subscription = { id: "sub_test", status: "active", metadata: { restaurantId }, items: { data: [] } };
  const Operation = require("../../models/callsense/callsense-subscription-operation.model");
  const Audit = require("../../models/callsense/callsense-billing-audit.model");
  const billingPath = require.resolve("../../services/billing/stripe-billing.service");
  const original = { billing: require.cache[billingPath], find: Config.findOne, update: Config.updateOne,
    operation: Operation.findById, del: Operation.deleteOne, audit: Audit.create };
  let deleted = 0;
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription }) } };
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ _id: "config", commercial: {} }) }) });
  Config.updateOne = async () => {};
  Operation.findById = () => ({ lean: async () => ({ kind: "create", attemptId: "attempt" }) });
  Operation.deleteOne = async () => { deleted++; return { deletedCount: 1 }; };
  Audit.create = async () => {};
  try {
    await router.syncEvent({ type: "customer.subscription.created", created: 20, request: { idempotency_key: "callsense-subscription-attempt" }, data: { object: { id: "sub_test" } } },
      { subscriptions: { retrieve: async () => subscription, create: () => { throw new Error("création interdite"); } } });
    assert.equal(deleted, 1);
  } finally {
    Config.findOne = original.find; Config.updateOne = original.update; Operation.findById = original.operation; Operation.deleteOne = original.del; Audit.create = original.audit;
    if (original.billing) require.cache[billingPath] = original.billing; else delete require.cache[billingPath];
  }
});

test("une interruption après la mise à jour Mongo est reprise et les doublons restent idempotents", async () => {
  const restaurantId = "507f1f77bcf86cd799439011";
  const ids = offerIds();
  const subscription = { id: "sub_test", customer: "cus_test", status: "active", metadata: { restaurantId }, items: { data: [
    { price: { id: ids.fixed } }, { price: { id: ids.metered }, current_period_start: 100, current_period_end: 200 },
  ] } };
  const billingPath = require.resolve("../../services/billing/stripe-billing.service");
  const meteringPath = require.resolve("../../services/callsense/callsense-metering.service");
  const original = { billing: require.cache[billingPath], metering: require.cache[meteringPath], find: Config.findOne, update: Config.updateOne };
  let commercial = {}; let periodAttempts = 0; const periods = new Set();
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription }) } };
  require.cache[meteringPath] = { id: meteringPath, filename: meteringPath, loaded: true, exports: { saveBillingPeriod: async (_r, sub, period) => {
    if (++periodAttempts === 1) throw new Error("Mongo interrompu");
    periods.add(`${sub}:${period.start.getTime()}:${period.end.getTime()}`);
  } } };
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ _id: "config", commercial }) }) });
  Config.updateOne = async (filter, changes) => {
    if (!commercial.stripeEventCreated || commercial.stripeEventCreated <= filter.$or[1]["commercial.stripeEventCreated"].$lte) {
      for (const [key, value] of Object.entries(changes.$set)) commercial[key.replace("commercial.", "")] = value;
    }
  };
  const event = { type: "customer.subscription.updated", created: 20, data: { object: { id: subscription.id } } };
  const client = { subscriptions: { retrieve: async () => subscription } };
  try {
    await assert.rejects(router.syncEvent(event, client), /Mongo interrompu/);
    assert.equal(commercial.stripeSubscriptionId, "sub_test");
    await router.syncEvent(event, client);
    await router.syncEvent(event, client);
    assert.equal(periods.size, 1);
    assert.equal(commercial.subscribed, true);
    assert.equal(commercial.enabled, undefined);
  } finally {
    Config.findOne = original.find; Config.updateOne = original.update;
    if (original.billing) require.cache[billingPath] = original.billing; else delete require.cache[billingPath];
    if (original.metering) require.cache[meteringPath] = original.metering; else delete require.cache[meteringPath];
  }
});

test("la configuration absente ou une liste Stripe incomplète ne sont pas acquittées comme synchronisées", async () => {
  const restaurantId = "507f1f77bcf86cd799439011";
  const subscription = { id: "sub_test", metadata: { restaurantId }, items: { data: [{ price: { id: offerIds().fixed } }] } };
  const original = Config.findOne;
  Config.findOne = () => ({ select: () => ({ lean: async () => null }) });
  const client = { subscriptions: { retrieve: async () => subscription } };
  const event = { type: "customer.subscription.created", data: { object: { id: subscription.id } } };
  try {
    await assert.rejects(router.syncEvent(event, client), /Configuration CallSense/);
    subscription.items.has_more = true;
    await assert.rejects(router.syncEvent(event, client), /Lignes Stripe incomplètes/);
  } finally { Config.findOne = original; }
});
