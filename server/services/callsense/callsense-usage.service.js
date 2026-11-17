// Read-only estimates; no meter events are emitted by this service.
const INCLUDED_MINUTES = 1000;
function offerIds(env = process.env) {
  return { fixed: (env.STRIPE_CALLSENSE_FIXED_PRICE_ID || "").trim(), metered: (env.STRIPE_CALLSENSE_METERED_PRICE_ID || "").trim(), meter: (env.STRIPE_CALLSENSE_METER_ID || "").trim() };
}
function validateOffer(fixed, metered, meter, ids) {
  const product = (price) => typeof price?.product === "string" ? price.product : price?.product?.id;
  const tiers = metered?.tiers;
  return Boolean(ids.fixed && ids.metered && ids.meter && fixed?.id === ids.fixed && metered?.id === ids.metered && meter?.id === ids.meter &&
    fixed.active && metered.active && fixed.livemode === metered.livemode && product(fixed) && product(fixed) === product(metered) &&
    fixed.currency === "eur" && metered.currency === "eur" && fixed.unit_amount === 4500 &&
    fixed.recurring?.interval === "month" && (fixed.recurring.interval_count || 1) === 1 && fixed.recurring.usage_type === "licensed" &&
    metered.recurring?.interval === "month" && (metered.recurring.interval_count || 1) === 1 && metered.recurring.usage_type === "metered" &&
    metered.recurring.meter === ids.meter && metered.billing_scheme === "tiered" && metered.tiers_mode === "graduated" &&
    Array.isArray(tiers) && tiers.length === 2 && tiers[0].up_to === INCLUDED_MINUTES && tiers[0].unit_amount === 0 && !Number(tiers[0].flat_amount) &&
    tiers[1].up_to == null && tiers[1].unit_amount === 5 && !Number(tiers[1].flat_amount) &&
    meter.event_name === "gusto_callsense_minutes" && meter.status === "active" && meter.default_aggregation?.formula === "sum");
}
function periodFromSubscription(subscription, ids) {
  const items = subscription?.items?.data || [];
  const fixed = items.filter((item) => item.price?.id === ids.fixed);
  const meter = items.filter((item) => item.price?.id === ids.metered);
  const sameMeter = items.filter((item) => {
    const value = item.price?.recurring?.meter;
    return (typeof value === "string" ? value : value?.id) === ids.meter;
  });
  if (subscription?.items?.has_more || fixed.length !== 1 || meter.length !== 1 || Number(fixed[0].quantity ?? 1) !== 1 ||
      sameMeter.some((item) => item.price?.id !== ids.metered)) return null;
  const start = Number(meter[0].current_period_start || subscription.current_period_start);
  const end = Number(meter[0].current_period_end || subscription.current_period_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= start) return null;
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}
function summarizeCalls(calls) {
  return calls.reduce((result, call) => {
    if (!call.incomingReceived) return result;
    result.received += 1;
    if (call.outcome === "completed" || call.phase >= 3 || call.answeredAt) {
      result.answered += 1;
      if (Number.isFinite(call.duration) && call.duration > 0) {
        result.conversationSeconds += call.duration;
        result.minutes += Math.ceil(call.duration / 60);
      }
    } else if (call.sipResponseCode === "603") result.refused += 1;
    else if (call.outcome === "busy") result.busy += 1;
    else if (call.outcome === "no-answer") result.missed += 1;
    return result;
  }, { received: 0, answered: 0, missed: 0, busy: 0, refused: 0, conversationSeconds: 0, minutes: 0 });
}
async function getTelephoneStats(restaurantId, month, now = new Date()) {
  const { DateTime } = require("luxon");
  const selected = month || DateTime.fromJSDate(now, { zone: "Europe/Paris" }).toFormat("yyyy-MM");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) throw new Error("periode_invalide");
  const first = DateTime.fromISO(`${selected}-01`, { zone: "Europe/Paris" });
  if (!first.isValid) throw new Error("periode_invalide");
  const start = first.toJSDate();
  const end = first.plus({ months: 1 }).toJSDate();
  const Call = require("../../models/callsense/callsense-call.model");
  const calls = await Call.find({ restaurantId, createdAt: { $gte: start, $lt: end } }).select("incomingReceived outcome duration phase answeredAt sipResponseCode").lean();
  return { month: selected, periodStart: start, periodEnd: end, ...summarizeCalls(calls) };
}
async function getCurrentUsage(restaurantId) {
  const key = process.env.STRIPE_API_SECRET_KEY;
  const ids = offerIds();
  const Consumption = require("../../models/callsense/callsense-consumption.model");
  const BillingPeriod = require("../../models/callsense/callsense-billing-period.model");
  const mongoose = require("mongoose");
  const Config = require("../../models/callsense/callsense-config.model");
  const [history, snapshots, config] = await Promise.all([Consumption.aggregate([
    { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId), periodStart: { $type: "date" }, periodEnd: { $type: "date" } } },
    { $group: { _id: { start: "$periodStart", end: "$periodEnd", subscriptionId: "$subscriptionId" }, verifiedMinutes: { $sum: { $cond: [{ $and: [{ $eq: ["$state", "resolved"] }, { $eq: ["$resolution", "excluded"] }] }, 0, "$minutes"] } },
      reportedMinutes: { $sum: { $cond: [{ $eq: ["$state", "sent"] }, "$minutes", 0] } }, calls: { $sum: 1 },
      pending: { $sum: { $cond: [{ $in: ["$state", ["verified", "sending", "review"]] }, 1, 0] } } } },
    { $sort: { "_id.start": -1 } }, { $limit: 12 },
  ]), BillingPeriod.find({ restaurantId }).sort({ periodStart: -1 }).limit(12).lean(), Config.findOne({ restaurantId }).select("commercial.meteringEnabled").lean()]);
  const periodsByKey = new Map();
  const keyOf = (subscriptionId, start, end) => `${subscriptionId}:${new Date(start).getTime()}:${new Date(end).getTime()}`;
  snapshots.forEach((item) => periodsByKey.set(keyOf(item.subscriptionId, item.periodStart, item.periodEnd), { subscriptionId: item.subscriptionId,
    periodStart: item.periodStart, periodEnd: item.periodEnd, verifiedMinutes: 0, reportedMinutes: 0, calls: 0, pending: 0 }));
  history.forEach((item) => periodsByKey.set(keyOf(item._id.subscriptionId, item._id.start, item._id.end), { subscriptionId: item._id.subscriptionId,
    periodStart: item._id.start, periodEnd: item._id.end, verifiedMinutes: item.verifiedMinutes, reportedMinutes: item.reportedMinutes, calls: item.calls, pending: item.pending }));
  const periods = [...periodsByKey.values()].sort((a, b) => new Date(b.periodStart) - new Date(a.periodStart)).slice(0, 12);
  const publicHistory = periods.map(({ subscriptionId: _subscriptionId, ...item }) => item);
  if (!key || !ids.fixed || !ids.metered || !ids.meter) return { available: false, reason: "offre_non_configuree", history: publicHistory };
  const stripe = require("stripe")(key);
  const { findRestaurantSubscription } = require("../billing/stripe-billing.service");
  const [fixed, metered, meter, context] = await Promise.all([
    stripe.prices.retrieve(ids.fixed), stripe.prices.retrieve(ids.metered, { expand: ["tiers"] }), stripe.billing.meters.retrieve(ids.meter), findRestaurantSubscription({ restaurantId }),
  ]).catch(() => []);
  if (!fixed) return { available: false, reason: "stripe_indisponible", history: publicHistory };
  if (!validateOffer(fixed, metered, meter, ids)) return { available: false, reason: "offre_incompatible", history: publicHistory };
  const subscription = context?.subscription;
  if (!subscription || !(subscription.items?.data || []).some((item) => [ids.fixed, ids.metered].includes(item.price?.id))) {
    return { available: false, reason: "offre_non_associee", history: publicHistory };
  }
  if (!["active", "trialing", "past_due"].includes(subscription.status)) return { available: false, reason: "abonnement_inactif", history: publicHistory };
  const period = periodFromSubscription(subscription, ids);
  if (!period) return { available: false, reason: "abonnement_incomplet", history: publicHistory };
  const Call = require("../../models/callsense/callsense-call.model");
  const calls = await Call.find({ restaurantId, createdAt: { $gte: period.start, $lt: period.end } }).select("incomingReceived outcome duration phase answeredAt sipResponseCode billingState").lean();
  const totals = summarizeCalls(calls);
  const current = periods.find((item) => item.subscriptionId === subscription.id && new Date(item.periodStart).getTime() === period.start.getTime() && new Date(item.periodEnd).getTime() === period.end.getTime());
  return { available: true, estimate: true, stripeStatus: subscription.status, periodStart: period.start, periodEnd: period.end,
    includedMinutes: INCLUDED_MINUTES, usedMinutes: current?.verifiedMinutes || 0, remainingMinutes: Math.max(0, INCLUDED_MINUTES - (current?.verifiedMinutes || 0)),
    overageMinutes: Math.max(0, (current?.verifiedMinutes || 0) - INCLUDED_MINUTES), percent: Math.round((current?.verifiedMinutes || 0) / INCLUDED_MINUTES * 100),
    verifiedMinutes: current?.verifiedMinutes || 0, reportedMinutes: current?.reportedMinutes || 0,
    unverifiedCalls: calls.filter((call) => call.incomingReceived && !call.billingState).length,
    usageIncomplete: process.env.CALLSENSE_METER_REPORTING_ENABLED !== "true" || !config?.commercial?.meteringEnabled || Boolean(current?.pending), history: publicHistory, ...totals };
}
module.exports = { offerIds, validateOffer, periodFromSubscription, summarizeCalls, getTelephoneStats, getCurrentUsage, INCLUDED_MINUTES };
