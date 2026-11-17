const Config = require("../../models/callsense/callsense-config.model");
const { offerIds, periodFromSubscription } = require("./callsense-usage.service");

// The caller must serialize subscription mutations for this restaurant.
// A conditional write prevents an older read from overwriting another update.
async function syncCommercialSubscription({ restaurantId, subscription, savePeriod }) {
  if (!subscription?.id || String(subscription.metadata?.restaurantId || "") !== String(restaurantId) || subscription.items?.has_more) {
    throw new Error("Abonnement Stripe incomplet ou restaurant non concordant");
  }
  const ids = offerIds();
  if (!ids.fixed || !ids.metered || !ids.meter) throw new Error("Offre CallSense non configurée");
  const config = await Config.findOne({ restaurantId }).select("updatedAt").lean();
  // Commercial subscriptions can be created before the technical installation.
  if (!config) return { configured: false };
  const period = periodFromSubscription(subscription, ids);
  const hasCallSense = subscription.items?.data?.some(item => [ids.fixed, ids.metered].includes(item.price?.id));
  if (hasCallSense && !period && subscription.status !== "canceled") throw new Error("Lignes ou période CallSense incomplètes");
  const subscribed = Boolean(period && ["active", "trialing", "past_due"].includes(subscription.status));
  if (period) {
    const save = savePeriod || require("./callsense-metering.service").saveBillingPeriod;
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    await save(restaurantId, subscription.id, period, customer);
  }
  const update = await Config.updateOne({ _id: config._id, updatedAt: config.updatedAt }, { $set: {
    "commercial.subscribed": subscribed,
    "commercial.stripeSubscriptionId": subscription.id,
    "commercial.stripeStatus": subscription.status || "",
    "commercial.stripePriceId": period ? ids.fixed : "",
    "commercial.includedMinutes": period ? 1000 : 0,
    "commercial.periodStart": period?.start || null,
    "commercial.periodEnd": period?.end || null,
  } });
  if (!update.matchedCount) throw new Error("Configuration commerciale modifiée pendant la synchronisation");
  return { configured: true, subscribed };
}

async function reconcileFromAdmin(restaurantId, { stripeClient, findSubscription } = {}) {
  if (!(await Config.exists({ restaurantId }))) return { configured: false };
  const Operation = require("../../models/callsense/callsense-subscription-operation.model");
  const find = findSubscription || require("../billing/stripe-billing.service").findRestaurantSubscription;
  const existingOperation = await Operation.findById(String(restaurantId)).lean();
  if (existingOperation?.state === "uncertain" && ["create", "update"].includes(existingOperation.kind)) {
    let { subscription } = await find({ restaurantId });
    const stripe = stripeClient || (process.env.STRIPE_API_SECRET_KEY && require("stripe")(process.env.STRIPE_API_SECRET_KEY));
    if (!subscription && stripe && existingOperation.kind === "update") {
      let subscriptionId = existingOperation.subscriptionId;
      if (!subscriptionId) {
        const config = await Config.findOne({ restaurantId }).select("commercial.stripeSubscriptionId").lean();
        subscriptionId = config?.commercial?.stripeSubscriptionId;
      }
      if (subscriptionId) {
        const canceled = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
        if (canceled.id === subscriptionId && canceled.status === "canceled") subscription = canceled;
      }
    }
    if (subscription && stripe) {
      const recovered = await require("./callsense-subscription-recovery.service").reconcileExistingMutation({ restaurantId, subscription, stripe, synchronize: syncCommercialSubscription });
      if (recovered && subscription.status === "canceled") return { configured: true, subscribed: false, recovered: true };
    }
  }
  const attemptId = require("crypto").randomUUID();
  try {
    await Operation.create({ _id: String(restaurantId), attemptId, kind: "reconcile", startedAt: new Date() });
  } catch (error) {
    if (error.code === 11000) throw Object.assign(new Error("Une opération CallSense est en cours ou incertaine"), { statusCode: 409 });
    throw error;
  }
  try {
    const { subscription } = await find({ restaurantId });
    // Absence or ambiguous selection is not proof that a previous subscription
    // can safely be overwritten; keep its historical snapshot for review.
    if (!subscription) throw Object.assign(new Error("Abonnement Stripe introuvable : vérification nécessaire"), { statusCode: 409 });
    return await syncCommercialSubscription({ restaurantId, subscription });
  } finally {
    await Operation.deleteOne({ _id: String(restaurantId), attemptId, kind: "reconcile" });
  }
}

module.exports = { syncCommercialSubscription, reconcileFromAdmin };
