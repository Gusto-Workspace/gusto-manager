const express = require("express");
const mongoose = require("mongoose");
const Config = require("../models/callsense/callsense-config.model");
const { offerIds, periodFromSubscription } = require("../services/callsense/callsense-usage.service");
const router = express.Router();

function subscriptionIdForEvent(event) {
  const object = event.data?.object || {};
  if (event.type?.startsWith("customer.subscription.")) return object.id || "";
  if (event.type?.startsWith("invoice.")) {
    const subscription = object.subscription || object.parent?.subscription_details?.subscription;
    return typeof subscription === "string" ? subscription : subscription?.id || "";
  }
  return "";
}

async function syncEvent(event, stripe) {
  const subscriptionId = subscriptionIdForEvent(event);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const restaurantId = subscription.metadata?.restaurantId;
  if (!mongoose.isValidObjectId(restaurantId)) return;
  if (subscription.items?.has_more) throw new Error("Lignes Stripe incomplètes");
  const ids = offerIds();
  const config = await Config.findOne({ restaurantId }).select("commercial.stripeSubscriptionId commercial.stripeEventCreated").lean();
  if (!config) {
    // Only subscription events are retried here: failing invoice.created can
    // delay invoice finalisation for unrelated billing operations.
    const hasCallSense = subscription.items?.data?.some((item) => [ids.fixed, ids.metered].filter(Boolean).includes(item.price?.id));
    if (hasCallSense && event.type?.startsWith("customer.subscription.")) throw new Error("Configuration CallSense non disponible");
    return;
  }
  if (!ids.fixed || !ids.metered || !ids.meter) throw new Error("Offre CallSense non configurée");
  const billing = require("../services/billing/stripe-billing.service");
  const selected = await billing.findRestaurantSubscription({ restaurantId });
  // A late cancellation of an old subscription must not replace a newer one.
  if (selected.subscription && selected.subscription.id !== subscriptionId) return;
  if (!selected.subscription && config.commercial?.stripeSubscriptionId !== subscriptionId) return;
  if (selected.subscription?.id === subscriptionId) {
    await require("../services/callsense/callsense-subscription-recovery.service").reconcileCreation({ restaurantId, subscription, event });
  }
  const period = periodFromSubscription(subscription, ids);
  const subscribed = Boolean(period && ["active", "trialing", "past_due"].includes(subscription.status));
  const created = Number(event.created) || 0;
  await Config.updateOne({ _id: config._id, $or: [{ "commercial.stripeEventCreated": { $exists: false } }, { "commercial.stripeEventCreated": { $lte: created } }] },
    { $set: { "commercial.subscribed": subscribed, "commercial.stripeSubscriptionId": subscriptionId,
      "commercial.stripeStatus": subscription.status || "", "commercial.stripePriceId": period ? ids.fixed : "",
      "commercial.includedMinutes": period ? 1000 : 0, "commercial.periodStart": period?.start || null,
      "commercial.periodEnd": period?.end || null, "commercial.stripeEventCreated": created } });
  if (period) await require("../services/callsense/callsense-metering.service").saveBillingPeriod(restaurantId, subscriptionId, period,
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id);
}

router.post("/stripe/wh", async (req, res) => {
  const key = process.env.STRIPE_API_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET_KEY;
  if (!key || !secret) return res.sendStatus(503);
  const stripe = require("stripe")(key);
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.get("Stripe-Signature"), secret); }
  catch (_) { return res.sendStatus(400); }
  if (Boolean(event.livemode) !== /^(sk|rk)_live_/.test(key)) return res.sendStatus(400);
  try { await syncEvent(event, stripe); return res.sendStatus(200); }
  catch (_) { return res.sendStatus(503); }
});
module.exports = router;
module.exports.subscriptionIdForEvent = subscriptionIdForEvent;
module.exports.syncEvent = syncEvent;
