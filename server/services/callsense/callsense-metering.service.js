const crypto = require("crypto");
const Config = require("../../models/callsense/callsense-config.model");
const Call = require("../../models/callsense/callsense-call.model");
const Consumption = require("../../models/callsense/callsense-consumption.model");
const { decryptToken } = require("./callsense-secrets.service");
const { offerIds, validateOffer, periodFromSubscription } = require("./callsense-usage.service");

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;

function observation(call, child, config) {
  if (!call.incomingReceived || !call.childCallSid || child.sid !== call.childCallSid ||
      child.parentCallSid !== call.callSid || child.accountSid !== config.accountSid) throw new Error("appel_enfant_non_concordant");
  if (["queued", "initiated", "ringing", "in-progress"].includes(child.status)) return { pending: true };
  if (!call.outcome) return { pending: true };
  if (child.status !== "completed" && call.outcome !== "completed") return { skipped: true };
  if (child.status !== "completed" || call.outcome !== "completed") throw new Error("resultats_twilio_non_concordants");
  const seconds = Number(child.duration);
  const end = new Date(child.endTime);
  if (!Number.isInteger(seconds) || seconds < 1 || !Number.isFinite(end.getTime())) throw new Error("duree_twilio_indisponible");
  if (call.duration != null && (!Number.isInteger(call.duration) || call.duration < 1 ||
      Math.abs(call.duration - seconds) > 1 || Math.ceil(call.duration / 60) !== Math.ceil(seconds / 60))) throw new Error("durees_twilio_non_concordantes");
  const startedAt = new Date(end.getTime() - seconds * 1000);
  if (end > new Date() || startedAt >= end) throw new Error("dates_twilio_invalides");
  // A completed communication belongs to the Stripe period in which it ends.
  return { seconds, minutes: Math.ceil(seconds / 60), startedAt, occurredAt: end };
}

async function billingContext(restaurantId, stripe) {
  const ids = offerIds();
  if (!ids.fixed || !ids.metered || !ids.meter) throw new Error("offre_non_configuree");
  const billing = require("../billing/stripe-billing.service");
  const [fixed, metered, meter, ctx] = await Promise.all([
    stripe.prices.retrieve(ids.fixed), stripe.prices.retrieve(ids.metered, { expand: ["tiers"] }),
    stripe.billing.meters.retrieve(ids.meter), billing.findRestaurantSubscription({ restaurantId }),
  ]);
  if (!validateOffer(fixed, metered, meter, ids) ||
      (meter.customer_mapping?.event_payload_key || "stripe_customer_id") !== "stripe_customer_id" ||
      (meter.value_settings?.event_payload_key || "value") !== "value") throw new Error("offre_incompatible");
  const subscription = ctx.subscription;
  const period = periodFromSubscription(subscription, ids);
  if (!period || !["active", "trialing", "past_due"].includes(subscription.status) || !ctx.stripeCustomerId) throw new Error("abonnement_incompatible");
  if (!(await billing.isStripeCustomerDedicatedToRestaurant({ stripeCustomerId: ctx.stripeCustomerId, restaurantId }))) throw new Error("client_stripe_non_dedie");
  let startingAfter;
  do {
    const page = await stripe.subscriptions.list({ customer: ctx.stripeCustomerId, status: "all", limit: 100,
      expand: ["data.items.data.price"], ...(startingAfter ? { starting_after: startingAfter } : {}) });
    for (const candidate of page.data) {
      if (["canceled", "incomplete_expired"].includes(candidate.status)) continue;
      if (candidate.items?.has_more) throw new Error("lignes_abonnement_incompletes");
      if (candidate.id !== subscription.id && candidate.items?.data?.some((item) => item.price?.id === ids.metered ||
        (typeof item.price?.recurring?.meter === "string" ? item.price.recurring.meter : item.price?.recurring?.meter?.id) === ids.meter)) throw new Error("compteur_partage");
    }
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("abonnements_incomplets");
  } while (startingAfter);
  return { ...ctx, period };
}

async function stageCall(call, config, context, twilio) {
  const token = config.encryptedAuthToken
    ? decryptToken(config.encryptedAuthToken, String(config.restaurantId), config.accountSid)
    : "";
  if (!token) throw new Error("authentification_twilio_indisponible");
  const child = await twilio(config.accountSid, token).calls(call.childCallSid).fetch();
  const result = observation(call, child, config);
  if (result.pending) return "pending";
  if (result.skipped) return "skipped";
  if (result.startedAt < new Date(config.commercial.meteringFrom)) throw new Error("periode_a_reconcilier");
  if (context.period && result.occurredAt >= context.period.end) return "pending"; // Stripe has not advanced its subscription period yet.
  let period = context.period || null;
  let subscriptionId = context.subscription?.id || "";
  let stripeCustomerId = context.stripeCustomerId || "";
  let state = "verified";
  let reviewReason = "";
  if (!context.period || result.occurredAt < context.period.start) {
    const Period = require("../../models/callsense/callsense-billing-period.model");
    const previous = await Period.find({ restaurantId: call.restaurantId,
      periodStart: { $lte: result.occurredAt }, periodEnd: { $gt: result.occurredAt } }).limit(2).lean();
    if (previous.length === 1) {
      subscriptionId = previous[0].subscriptionId || "";
      stripeCustomerId = previous[0].stripeCustomerId || (subscriptionId === context.subscription?.id ? context.stripeCustomerId : "") || "";
      period = { start: previous[0].periodStart, end: previous[0].periodEnd };
      reviewReason = stripeCustomerId ? "periode_cloturee" : "client_stripe_inconnu";
    } else {
      period = null; subscriptionId = ""; stripeCustomerId = "";
      reviewReason = previous.length ? "periodes_ambiguës" : "periode_origine_inconnue";
    }
    state = "review";
  }
  const identifier = `callsense_${crypto.createHash("sha256").update(String(call._id)).digest("hex")}`;
  const values = { restaurantId: call.restaurantId, callId: call._id, parentSid: call.callSid, childSid: call.childCallSid,
    stripeCustomerId, subscriptionId, periodStart: period?.start || null,
    periodEnd: period?.end || null, occurredAt: result.occurredAt, seconds: result.seconds, minutes: result.minutes, identifier,
    ...(state === "review" ? { state, lastError: reviewReason } : {}) };
  await Consumption.updateOne({ callId: call._id }, { $setOnInsert: values }, { upsert: true });
  const stored = await Consumption.findOne({ callId: call._id, restaurantId: call.restaurantId }).lean();
  const timestamp = (value) => value == null ? null : new Date(value).getTime();
  if (!stored || stored.parentSid !== values.parentSid || stored.childSid !== values.childSid || stored.stripeCustomerId !== values.stripeCustomerId ||
      stored.subscriptionId !== values.subscriptionId || stored.seconds !== values.seconds || stored.minutes !== values.minutes ||
      timestamp(stored.occurredAt) !== timestamp(values.occurredAt) || timestamp(stored.periodStart) !== timestamp(values.periodStart) ||
      timestamp(stored.periodEnd) !== timestamp(values.periodEnd)) throw new Error("preuve_facturation_modifiee");
  if (["sent", "resolved"].includes(stored.state)) return stored.state;
  if (state === "review" && stored.state === "verified") {
    const changed = await Consumption.updateOne({ _id: stored._id, state: "verified", firstAttemptAt: { $exists: false } }, { $set: { state: "review", lastError: reviewReason } });
    if (!changed.modifiedCount) throw new Error("preuve_facturation_modifiee");
  } else if (state === "review" && stored.state === "sending") {
    const now = new Date();
    if (!stored.firstAttemptAt || now - new Date(stored.firstAttemptAt) < RETRY_WINDOW_MS) return "pending";
    const changed = await Consumption.updateOne({ _id: stored._id, state: "sending", $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
      { $set: { state: "review", lastError: "delai_idempotence_depasse" }, $unset: { leaseUntil: 1 } });
    if (!changed.modifiedCount) return "pending";
  }
  return state;
}

async function sendEntry(entry, stripe, now = new Date()) {
  const ids = offerIds();
  if (!ids.fixed || !ids.metered || !ids.meter) throw new Error("offre_non_configuree");
  if (["sent", "review", "resolved"].includes(entry.state)) return entry.state;
  if (entry.periodEnd && now >= new Date(entry.periodEnd)) {
    const changed = await Consumption.updateOne({ _id: entry._id, state: { $in: ["verified", "sending"] },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
    { $set: { state: "review", lastError: entry.firstAttemptAt ? "envoi_incertain_periode_cloturee" : "periode_cloturee" }, $unset: { leaseUntil: 1 } });
    return changed.modifiedCount ? "review" : "locked";
  }
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await Consumption.findOneAndUpdate({ _id: entry._id, state: { $in: ["verified", "sending"] },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
  [{ $set: { state: "sending", firstAttemptAt: { $ifNull: ["$firstAttemptAt", now] }, leaseUntil } }], { new: true }).lean();
  if (!claimed) return "locked";
  const error = now - new Date(claimed.firstAttemptAt) >= RETRY_WINDOW_MS ? "delai_idempotence_depasse"
    : now - new Date(claimed.occurredAt) > 34 * 24 * 60 * 60 * 1000 ? "evenement_trop_ancien" : "";
  if (error) {
    await Consumption.updateOne({ _id: claimed._id, state: "sending", leaseUntil }, { $set: { state: "review", lastError: error }, $unset: { leaseUntil: 1 } });
    return "review";
  }
  try {
    const event = await stripe.billing.meterEvents.create({ event_name: "gusto_callsense_minutes", identifier: claimed.identifier,
      timestamp: Math.floor(new Date(claimed.occurredAt).getTime() / 1000),
      payload: { stripe_customer_id: claimed.stripeCustomerId, value: String(claimed.minutes) } }, { idempotencyKey: claimed.identifier });
    if (event.identifier !== claimed.identifier) throw new Error("identifiant_stripe_inattendu");
    await Consumption.updateOne({ _id: claimed._id, state: "sending", leaseUntil }, { $set: { state: "sent", sentAt: new Date(), lastError: "" }, $unset: { leaseUntil: 1 } });
    return "sent";
  } catch (_) {
    await Consumption.updateOne({ _id: claimed._id, state: "sending", leaseUntil }, { $set: { lastError: "envoi_incertain" }, $unset: { leaseUntil: 1 } });
    return "sending";
  }
}

async function processRestaurant(config, { stripe, twilio, now = new Date() }) {
  if (config.managedByOnboarding && config.provisioningStatus === "ready_for_test") return;
  if (!config.commercial?.meteringFrom || (process.env.CALLSENSE_METER_REPORTING_ENABLED !== "true" && !config.commercial?.meteringEnabled)) return;
  let context;
  try { context = await billingContext(config.restaurantId, stripe); }
  catch (error) {
    if (error.message !== "abonnement_incompatible") throw error;
    // No active commercial period: preserve the Twilio observation for review,
    // using a historical snapshot only if it uniquely identifies the period.
    context = { period: null, subscription: null, stripeCustomerId: "" };
  }
  if (context.period) await saveBillingPeriod(config.restaurantId, context.subscription.id, context.period, context.stripeCustomerId);
  if (!config.commercial.meteringEnabled) context = { period: null, subscription: null, stripeCustomerId: "" };
  const calls = await Call.find({ restaurantId: config.restaurantId, accountSid: config.accountSid, incomingReceived: true,
    childCallSid: { $exists: true, $ne: "" }, createdAt: { $gte: config.commercial.meteringFrom }, billingState: null,
    $or: [{ billingNextCheckAt: { $exists: false } }, { billingNextCheckAt: { $lte: now } }] }).sort({ createdAt: 1 }).limit(100).lean();
  let usageChanged = false;
  for (const call of calls) {
    try {
      const result = await stageCall(call, config, context, twilio);
      if (result === "pending") {
        await Call.updateOne({ _id: call._id }, { $set: { billingNextCheckAt: new Date(now.getTime() + 60000) } });
        continue;
      }
      if (result === "skipped") { await Call.updateOne({ _id: call._id }, { $set: { billingState: "complete" } }); continue; }
      if (result === "review") { await Call.updateOne({ _id: call._id }, { $set: { billingState: "review" } }); continue; }
      if (["sent", "resolved"].includes(result)) { await Call.updateOne({ _id: call._id }, { $set: { billingState: "complete" } }); continue; }
      const entry = await Consumption.findOne({ callId: call._id }).lean();
      if (!(await Config.exists({ _id: config._id, "commercial.meteringEnabled": true, "commercial.meteringFrom": config.commercial.meteringFrom }))) return;
      if (process.env.CALLSENSE_METER_REPORTING_ENABLED !== "true") {
        await Call.updateOne({ _id: call._id }, { $set: { billingNextCheckAt: new Date(now.getTime() + 5 * 60000) } });
        usageChanged = true;
        continue;
      }
      const state = await sendEntry(entry, stripe, new Date());
      if (["sent", "resolved", "review"].includes(state)) await Call.updateOne({ _id: call._id }, { $set: { billingState: state === "review" ? "review" : "complete" } });
      else await Call.updateOne({ _id: call._id }, { $set: { billingNextCheckAt: new Date(now.getTime() + 60000) } });
      usageChanged = true;
    } catch (error) {
      if (["appel_enfant_non_concordant", "periode_a_reconcilier", "dates_twilio_invalides", "durees_twilio_non_concordantes", "resultats_twilio_non_concordants", "preuve_facturation_modifiee"].includes(error.message)) await Call.updateOne({ _id: call._id }, { $set: { billingState: "review", billingReviewReason: error.message } });
      else await Call.updateOne({ _id: call._id }, { $set: { billingNextCheckAt: new Date(now.getTime() + 60000) } });
    }
  }
  if (usageChanged) require("../shared/sse-bus.service").broadcastToRestaurant(String(config.restaurantId), { type: "callsense_status_changed", restaurantId: String(config.restaurantId) });
  if (context.period) await sendUsageAlerts(config.restaurantId, { ...context.period, subscriptionId: context.subscription.id });
}

async function saveBillingPeriod(restaurantId, subscriptionId, period, stripeCustomerId) {
  const Period = require("../../models/callsense/callsense-billing-period.model");
  const id = `${restaurantId}:${subscriptionId}:${period.start.getTime()}:${period.end.getTime()}`;
  await Period.updateOne({ _id: id }, { $setOnInsert: { restaurantId, subscriptionId, stripeCustomerId, periodStart: period.start, periodEnd: period.end } }, { upsert: true });
  if (stripeCustomerId) await Period.updateOne({ _id: id, $or: [{ stripeCustomerId: { $exists: false } }, { stripeCustomerId: "" }, { stripeCustomerId: null }] }, { $set: { stripeCustomerId } });
}

function quotaThresholds(minutes) { return [80, 100].filter((threshold) => minutes >= threshold * 10); }

async function sendUsageAlerts(restaurantId, period) {
  const mongoose = require("mongoose");
  const totals = await Consumption.aggregate([
    { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId), subscriptionId: period.subscriptionId, periodStart: period.start, periodEnd: period.end, $nor: [{ state: "resolved", resolution: "excluded" }] } },
    { $group: { _id: null, minutes: { $sum: "$minutes" } } },
  ]);
  const minutes = totals[0]?.minutes || 0;
  for (const threshold of quotaThresholds(minutes)) {
    const id = `callsense_quota:${restaurantId}:${period.subscriptionId}:${period.start.getTime()}:${period.end.getTime()}:${threshold}`;
    const Alert = require("../../models/callsense/callsense-quota-alert.model");
    let alert;
    try { alert = await Alert.findOneAndUpdate({ _id: id }, { $setOnInsert: { restaurantId, periodStart: period.start, threshold } }, { upsert: true, new: true }).lean(); }
    catch (error) { if (error.code !== 11000) throw error; alert = await Alert.findById(id).lean(); }
    if (!alert) throw new Error("alerte_introuvable");
    if (alert.sentAt) continue;
    await require("../shared/notifications.service").createAndBroadcastNotification({ restaurantId, module: "reservations", type: "callsense_quota",
      data: { threshold, usedMinutes: minutes }, dedupeKey: id });
    await Alert.updateOne({ _id: id, sentAt: { $exists: false } }, { $set: { sentAt: new Date() } });
  }
}

async function reconcilePeriod(restaurantId, stripe, now = new Date()) {
  const context = await billingContext(restaurantId, stripe);
  // Stripe summaries are minute-aligned; compare only the completely covered
  // interior instead of attributing neighbouring periods' partial minutes.
  const start = Math.ceil(context.period.start.getTime() / 60000) * 60;
  const end = Math.floor(Math.min(now.getTime(), context.period.end.getTime()) / 60000) * 60;
  if (end <= start) return { available: false, reason: "periode_trop_courte" };
  let total = 0;
  let startingAfter;
  do {
    const page = await stripe.billing.meters.listEventSummaries(offerIds().meter, { customer: context.stripeCustomerId, start_time: start, end_time: end,
      limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    total += page.data.reduce((sum, item) => sum + Number(item.aggregated_value || 0), 0);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("resume_stripe_incomplet");
  } while (startingAfter);
  const mongoose = require("mongoose");
  const records = await Consumption.aggregate([
    { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId), stripeCustomerId: context.stripeCustomerId,
      occurredAt: { $gte: new Date(start * 1000), $lt: new Date(end * 1000) } } },
    { $group: { _id: null, reported: { $sum: { $cond: [{ $eq: ["$state", "sent"] }, "$minutes", 0] } },
      pending: { $sum: { $cond: [{ $in: ["$state", ["verified", "sending", "review"]] }, 1, 0] } } } },
  ]);
  const reported = records[0]?.reported || 0;
  return { available: true, from: new Date(start * 1000), until: new Date(end * 1000),
    stripeMinutes: total, reportedMinutes: reported, pending: records[0]?.pending || 0,
    matches: total === reported, partial: start * 1000 !== context.period.start.getTime() || end * 1000 !== context.period.end.getTime() };
}

function summarizeTwilioInventory(parents, recordedSids, config, period) {
  const { normalizePhone } = require("./callsense-core.service");
  const recorded = new Set(recordedSids);
  const eligible = parents.filter((call) => {
    const started = new Date(call.startTime || call.dateCreated);
    return call.accountSid === config.accountSid && call.direction === "inbound" && normalizePhone(call.to) === config.twilioNumber &&
      Number.isFinite(started.getTime()) && started >= period.start && started < period.end;
  });
  const missing = eligible.filter((call) => !recorded.has(call.sid)).map((call) => ({ sid: call.sid, status: call.status, startedAt: call.startTime || call.dateCreated }));
  return { observed: eligible.length, missingCount: missing.length, missing: missing.slice(0, 50), missingTruncated: missing.length > 50 };
}

async function inspectTwilioPeriod(restaurantId, { twilio, start, end }) {
  const now = require("luxon").DateTime.now().setZone("Europe/Paris").startOf("month");
  const period = start && end ? { start: new Date(start), end: new Date(end) } : { start: now.toJSDate(), end: now.plus({ months: 1 }).toJSDate() };
  if ((start && !end) || (!start && end) || !Number.isFinite(period.start.getTime()) || !Number.isFinite(period.end.getTime()) || period.end <= period.start || period.end - period.start > 93 * 86400000) throw new Error("periode_invalide");
  const config = await Config.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!config?.accountSid || !config.twilioNumber) throw new Error("configuration_twilio_absente");
  const token = config.encryptedAuthToken ? decryptToken(config.encryptedAuthToken, String(restaurantId), config.accountSid)
    : "";
  if (!token) throw new Error("authentification_twilio_indisponible");
  // Twilio's SDK follows pages automatically; cap the inventory and disclose truncation.
  const parents = await twilio(config.accountSid, token).calls.list({ to: config.twilioNumber, startTimeAfter: period.start, startTimeBefore: period.end, pageSize: 1000, limit: 10001 });
  const candidates = parents.slice(0, 10000);
  const recorded = await Call.find({ restaurantId, accountSid: config.accountSid, incomingReceived: true,
    callSid: { $in: candidates.map((item) => item.sid) } }).select("callSid").lean();
  return { ...summarizeTwilioInventory(candidates, recorded.map((item) => item.callSid), config, period),
    complete: parents.length < 10001, periodStart: period.start, periodEnd: period.end };
}

function validateRecovery(parent, children, config) {
  const { normalizePhone } = require("./callsense-core.service");
  if (!config.sipUri || parent.accountSid !== config.accountSid || parent.parentCallSid || parent.direction !== "inbound" || normalizePhone(parent.to) !== config.twilioNumber ||
      parent.status !== "completed" || !/^CA[0-9a-fA-F]{32}$/.test(parent.sid || "")) throw new Error("appel_parent_non_concordant");
  if (children.length !== 1) throw new Error("segments_twilio_ambigus");
  const child = children[0];
  if (child.accountSid !== config.accountSid || child.parentCallSid !== parent.sid || child.direction !== "outbound-dial" || !["completed", "no-answer", "busy", "failed", "canceled"].includes(child.status) ||
      !/^CA[0-9a-fA-F]{32}$/.test(child.sid || "") || String(child.to || "").toLowerCase() !== String(config.sipUri || "").toLowerCase()) throw new Error("segment_sip_non_concordant");
  const duration = child.status === "completed" ? Number(child.duration) : 0;
  const endedAt = new Date(child.endTime);
  const startedAt = new Date(endedAt.getTime() - duration * 1000);
  const parentStartedAt = new Date(parent.startTime || parent.dateCreated);
  if (!Number.isInteger(duration) || duration < (child.status === "completed" ? 1 : 0) || !Number.isFinite(endedAt.getTime()) || endedAt > new Date() ||
      !Number.isFinite(parentStartedAt.getTime()) || parentStartedAt > endedAt || startedAt < parentStartedAt) throw new Error("duree_ou_periode_invalide");
  return { duration, startedAt, endedAt, outcome: child.status };
}

function needsRecoveredCommercialVerification(config, proof) {
  const commercial = config.commercial;
  return Boolean(proof.outcome === "completed" && commercial?.meteringEnabled && commercial.meteringFrom &&
    proof.startedAt >= new Date(commercial.meteringFrom));
}

async function recoverMissingCall(restaurantId, parentSid, { twilio, automatic = false, beforeWrite = async () => {} }) {
  const config = await Config.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!config?.accountSid || !config.twilioNumber) throw new Error("configuration_twilio_absente");
  const token = config.encryptedAuthToken ? decryptToken(config.encryptedAuthToken, String(restaurantId), config.accountSid)
    : "";
  if (!token) throw new Error("authentification_twilio_indisponible");
  const client = twilio(config.accountSid, token);
  const [parent, children] = await Promise.all([client.calls(parentSid).fetch(), client.calls.list({ parentCallSid: parentSid, limit: 2 })]);
  if (parent.sid !== parentSid) throw new Error("appel_parent_non_concordant");
  const proof = validateRecovery(parent, children, config);
  const child = children[0];
  const existing = await Call.findOne({ callSid: parentSid }).lean();
  if (existing && (String(existing.restaurantId) !== String(restaurantId) || existing.accountSid !== config.accountSid ||
      (existing.childCallSid && existing.childCallSid !== child.sid) || (existing.outcome && existing.outcome !== proof.outcome))) throw new Error("historique_non_concordant");
  if (existing?.duration != null && (!Number.isInteger(existing.duration) || Math.abs(existing.duration - proof.duration) > 1 ||
      Math.ceil(existing.duration / 60) !== Math.ceil(proof.duration / 60))) throw new Error("durees_twilio_non_concordantes");
  if (existing?.incomingReceived && existing.outcome && existing.childCallSid && (existing.outcome !== "completed" || existing.duration > 0)) return { callId: String(existing._id), callSid: parentSid, alreadyPresent: true };
  if (existing?.billingState || (existing && await Consumption.exists({ callId: existing._id }))) throw new Error("facturation_deja_engagee");
  // Only the existing metering worker can verify the subscription and period.
  // A post-activation candidate remains pending even when its period is old or
  // unknown, so stageCall can preserve it for review instead of discarding it.
  const needsCommercialVerification = automatic && needsRecoveredCommercialVerification(config, proof);
  const base = { callSid: parentSid, restaurantId, accountSid: config.accountSid };
  const values = { incomingReceived: true, recoveredFromTwilio: true, billingState: needsCommercialVerification ? null : "complete" };
  if (!existing?.childCallSid) values.childCallSid = child.sid;
  if (!existing?.outcome) values.outcome = proof.outcome;
  if (existing?.duration == null) values.duration = proof.duration;
  if (!existing) values.createdAt = new Date(parent.startTime || parent.dateCreated);
  const update = { $set: values,
    $setOnInsert: { ...base, from: require("./callsense-core.service").normalizePhone(parent.from), to: config.twilioNumber,
      updatedAt: new Date() } };
  const filter = { ...base, $and: [{ $or: [{ childCallSid: { $exists: false } }, { childCallSid: child.sid }] },
    { $or: [{ outcome: { $exists: false } }, { outcome: proof.outcome }] },
    { billingState: null },
    { duration: existing?.duration == null ? { $exists: false } : existing.duration }] };
  if (existing?.updatedAt) filter.updatedAt = existing.updatedAt;
  await beforeWrite();
  const restored = await Call.findOneAndUpdate(filter, update, { upsert: !existing, new: true, timestamps: false, setDefaultsOnInsert: false }).lean();
  if (!restored) throw new Error("historique_modifie");
  require("./callsense.service").publish(restored);
  return { callId: String(restored._id), callSid: parentSid, duration: proof.duration };
}

// Bounded catch-up with an overlap. Uncertain calls are recorded for admin
// inspection; failed or incomplete listings never advance the cursor.
async function reconcileCalls(restaurantId, { twilio, now = new Date() }) {
  const leaseId = crypto.randomUUID(), leaseMs = 15 * 60 * 1000;
  const config = await Config.findOneAndUpdate({ restaurantId, enabled: true,
    $or: [{ "reconciliation.leaseUntil": { $exists: false } }, { "reconciliation.leaseUntil": null }, { "reconciliation.leaseUntil": { $lte: new Date() } }] },
  { $set: { "reconciliation.leaseId": leaseId, "reconciliation.leaseUntil": new Date(Date.now() + leaseMs) } }, { new: true }).select("+encryptedAuthToken").lean();
  if (!config) return { locked: true };
  const renew = async () => {
    const result = await Config.updateOne({ _id: config._id, enabled: true, "reconciliation.leaseId": leaseId, "reconciliation.leaseUntil": { $gt: new Date() } },
      { $set: { "reconciliation.leaseUntil": new Date(Date.now() + leaseMs) } });
    if (!result.matchedCount) throw new Error("verrou_expire");
  };
  try {
    const activation = new Date(config.activatedAt || config.createdAt);
    if (!Number.isFinite(activation.getTime())) throw new Error("date_activation_indisponible");
    const cursor = config.reconciliation?.cursor ? new Date(config.reconciliation.cursor) : activation;
    if (!Number.isFinite(cursor.getTime()) || cursor < activation) throw new Error("point_reprise_invalide");
    const latest = new Date(now.getTime() - 5 * 60 * 1000);
    if (cursor >= latest) return { caughtUp: true };
    const from = new Date(Math.max(activation.getTime(), cursor.getTime() - 10 * 60 * 1000));
    let until = new Date(Math.min(cursor.getTime() + 6 * 60 * 60 * 1000, latest.getTime()));
    const token = config.encryptedAuthToken ? decryptToken(config.encryptedAuthToken, String(restaurantId), config.accountSid) : "";
    if (!token) throw new Error("authentification_twilio_indisponible");
    const client = twilio(config.accountSid, token);
    await require("./callsense-account-status.service").requireActiveAccount(client, config.accountSid);
    let parents;
    for (;;) {
      await renew();
      parents = await client.calls.list({ to: config.twilioNumber, startTimeAfter: from, startTimeBefore: until, pageSize: 1000, limit: 1001 });
      if (parents.length < 1001) break;
      if (until.getTime() - from.getTime() <= 60000) throw new Error("liste_twilio_trop_dense");
      until = new Date(from.getTime() + Math.floor((until.getTime() - from.getTime()) / 2));
      if (until <= cursor) throw new Error("liste_twilio_trop_dense");
    }
    const candidates = parents.filter((p) => p.direction === "inbound" && p.accountSid === config.accountSid && p.to === config.twilioNumber && new Date(p.startTime || p.dateCreated) >= from && new Date(p.startTime || p.dateCreated) < until);
    const records = await Call.find({ callSid: { $in: candidates.map((p) => p.sid) } }).select("callSid restaurantId accountSid incomingReceived outcome duration childCallSid").lean();
    const recorded = new Map(records.map((call) => [call.callSid, call]));
    const anomalies = new Map((config.reconciliation?.anomalies || []).map((entry) => [entry.callSid, entry]));
    const known = new Set(["appel_parent_non_concordant", "segments_twilio_ambigus", "segment_sip_non_concordant", "duree_ou_periode_invalide", "historique_non_concordant", "durees_twilio_non_concordantes", "facturation_deja_engagee"]);
    let recovered = 0;
    for (const parent of candidates) {
      const current = recorded.get(parent.sid);
      if (current && (String(current.restaurantId) !== String(restaurantId) || current.accountSid !== config.accountSid)) throw new Error("appel_autre_restaurant");
      if (current?.incomingReceived && current.outcome && current.childCallSid && (current.outcome !== "completed" || current.duration > 0)) { anomalies.delete(parent.sid); continue; }
      if (["queued", "ringing", "in-progress", "initiated"].includes(parent.status)) throw new Error("appel_en_cours");
      try {
        await recoverMissingCall(restaurantId, parent.sid, { twilio, automatic: true, beforeWrite: renew });
        anomalies.delete(parent.sid); recovered++;
      } catch (error) {
        if (!known.has(error.message)) throw error;
        anomalies.set(parent.sid, { callSid: parent.sid, startedAt: new Date(parent.startTime || parent.dateCreated), reason: error.message });
        if (anomalies.size > 100) throw new Error("trop_anomalies");
      }
    }
    await renew();
    const updated = await Config.updateOne({ _id: config._id, enabled: true, "reconciliation.leaseId": leaseId },
      { $set: { "reconciliation.cursor": until, "reconciliation.anomalies": [...anomalies.values()], "reconciliation.lastError": "" } });
    if (!updated.matchedCount) throw new Error("verrou_expire");
    return { recovered, anomalies: anomalies.size, cursor: until };
  } catch (error) {
    await Config.updateOne({ _id: config._id, "reconciliation.leaseId": leaseId }, { $set: { "reconciliation.lastError": String(error.message || "erreur").slice(0, 100) } });
    throw error;
  } finally {
    await Config.updateOne({ _id: config._id, "reconciliation.leaseId": leaseId }, { $unset: { "reconciliation.leaseId": 1, "reconciliation.leaseUntil": 1 } });
  }
}

async function runReconciliation({ twilio = require("twilio") } = {}) {
  const configs = await Config.find({ enabled: true }).select("restaurantId").lean();
  for (const config of configs) {
    try { await reconcileCalls(config.restaurantId, { twilio }); }
    catch (error) { console.error("[callsense-reconciliation]", String(config.restaurantId), error.message); }
  }
}

async function runWorker() {
  if (!process.env.STRIPE_API_SECRET_KEY) return;
  const indexes = await Consumption.collection.indexes();
  if (!["callId", "identifier"].every((key) => indexes.some((index) => index.unique && index.key[key] === 1 && Object.keys(index.key).length === 1))) throw new Error("Index uniques du registre CallSense absents");
  const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
  const twilio = require("twilio");
  const configs = await Config.find({ "commercial.meteringFrom": { $exists: true, $ne: null }, ...(process.env.CALLSENSE_METER_REPORTING_ENABLED === "true" ? {} : { "commercial.meteringEnabled": true }) }).select("+encryptedAuthToken").lean();
  for (const config of configs) {
    try { await processRestaurant(config, { stripe, twilio }); }
    catch (error) { console.error("[callsense-metering]", String(config.restaurantId), error.message); }
  }
}
module.exports = { observation, billingContext, stageCall, sendEntry, processRestaurant, reconcilePeriod, inspectTwilioPeriod, summarizeTwilioInventory, validateRecovery, needsRecoveredCommercialVerification, recoverMissingCall, reconcileCalls, runReconciliation, runWorker, quotaThresholds, sendUsageAlerts, saveBillingPeriod, RETRY_WINDOW_MS };
