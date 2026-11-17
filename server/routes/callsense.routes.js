const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/authentificate-token");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { requireAdminRole } = require("../middleware/authenticate-admin");
const { authorizeRestaurantAccess, userCanAccessRestaurant } = require("../middleware/authorize-restaurant-access");
const Config = require("../models/callsense/callsense-config.model");
const Call = require("../models/callsense/callsense-call.model");
const Restaurant = require("../models/restaurant.model");
const { validateWebhook, normalizePhone } = require("../services/callsense-core.service");
const { broadcastToRestaurant } = require("../services/sse-bus.service");
const service = require("../services/callsense.service");
const { encryptToken } = require("../services/callsense-secrets.service");
const router = express.Router();
router.use(require("./callsense-onboarding.routes"));

function unreadMissedFilter(restaurantId) {
  return { restaurantId, outcome: { $in: ["no-answer", "busy"] }, phase: { $not: { $gte: 3 } }, missedReadAt: null };
}

async function authorizeCallSense(req, res, next) {
  try {
    if (req.user.role === "employee" && (req.authorizedRestaurant.options?.customers !== true ||
      !(await userCanAccessRestaurant(req.user, req.authorizedRestaurant, { requiredOption: "customers" })))) return res.sendStatus(403);
    return next();
  } catch (_) { return res.sendStatus(500); }
}

async function signature(req, res, next) {
  const sid = req.body?.AccountSid;
  const token = await service.webhookAccountToken(sid, req.query?.restaurantId
    ? { restaurantId: req.query.restaurantId } : { to: normalizePhone(req.body?.To) });
  if (!validateWebhook({ authToken: token, accountSid: sid, expectedAccountSid: sid,
    signature: req.get("X-Twilio-Signature"), publicOrigin: process.env.CALLSENSE_PUBLIC_ORIGIN,
    originalUrl: req.originalUrl, body: req.body })) return res.sendStatus(403);
  return next();
}
const form = express.urlencoded({ extended: false, limit: "32kb" });
router.post("/callsense/voice", form, signature, async (req, res) => {
  const body = req.body;
  const to = normalizePhone(body.To);
  if (!to || !/^CA[a-zA-Z0-9]+$/.test(body.CallSid || "")) return res.sendStatus(400);
  const config = await service.findRoute(body.AccountSid, to);
  if (!config) return res.sendStatus(404);
  const drill = require("../services/callsense-fallback-drill.service");
  const candidate = await drill.mode(config);
  const scenario = candidate && await drill.triggered(config, candidate.scenario) && Date.now() < candidate.expiresAt ? candidate.scenario : null;
  if (scenario === "http") return res.sendStatus(500);
  if (scenario === "invalid") return res.type("text/xml").send("<Response><Invalid");
  if (scenario === "timeout") {
    const timer = setTimeout(() => { if (!res.destroyed && !res.headersSent) res.sendStatus(504); }, 16000);
    res.once("close", () => clearTimeout(timer));
    return;
  }
  const base = process.env.CALLSENSE_PUBLIC_ORIGIN;
  const query = `restaurantId=${encodeURIComponent(String(config.restaurantId))}&parent=${encodeURIComponent(body.CallSid)}`;
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ timeout: 25, action: `${base}/api/callsense/dial-action?${query}`, method: "POST" });
  dial.sip({ statusCallback: `${base}/api/callsense/sip-status?${query}`, statusCallbackMethod: "POST",
    statusCallbackEvent: "initiated ringing answered completed" }, config.sipUri);
  res.type("text/xml").send(response.toString());
  setImmediate(() => service.recordIncoming(config, body).catch((error) => console.error("[callsense] incoming", error.message)));
});
router.head("/callsense/voice", (_req, res) => res.sendStatus(204));
// Token rotation is deliberately separate from configuration and never returns
// the secret. The administrator supplies a Twilio token; no external mutation
// or purchase is performed by this endpoint.
router.put("/admin/restaurants/:restaurantId/callsense/auth-token", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.isValidObjectId(restaurantId) || typeof req.body.authToken !== "string" || !req.body.authToken.trim() || req.body.authToken.length > 256) return res.sendStatus(400);
    const config = await Config.findOne({ restaurantId }).select("accountSid restaurantId");
    if (!config) return res.sendStatus(404);
    const encryptedAuthToken = encryptToken(req.body.authToken, String(config.restaurantId), config.accountSid);
    const result = await Config.updateOne({ _id: config._id, accountSid: config.accountSid }, {
      $set: { encryptedAuthToken },
      $push: { securityEvents: { $each: [{ action: "auth_token_rotated", actorId: String(req.user?._id || req.user?.id || ""), at: new Date() }], $slice: -100 } },
    });
    if (!result.matchedCount) return res.status(409).json({ message: "La configuration a changé, réessayez" });
    return res.json({ ok: true });
  } catch (_) { return res.status(500).json({ message: "Impossible d'enregistrer le secret" }); }
});
for (const [path, kind] of [["sip-status", "sip"], ["dial-action", "action"]]) {
  router.post(`/callsense/${path}`, form, signature, (req, res) => {
    const { restaurantId, parent } = req.query;
    if ((kind === "sip" && req.body.ParentCallSid && req.body.ParentCallSid !== parent) ||
        (kind === "action" && req.body.CallSid !== parent)) return res.sendStatus(400);
    if (kind === "action") res.type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
    else res.sendStatus(200);
    setImmediate(() => service.recordCallback(kind, req.body, restaurantId, parent)
      .catch((error) => console.error("[callsense] callback", error.message)));
  });
}

router.put("/admin/restaurants/:restaurantId/callsense", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const input = { restaurantId, enabled: req.body.enabled === true, accountSid: req.body.accountSid,
      twilioNumber: normalizePhone(req.body.twilioNumber), sipUri: req.body.sipUri };
    if (!mongoose.isValidObjectId(restaurantId) || !service.validConfig({ ...input, enabled: true }, input.accountSid, input.twilioNumber) ||
        !(await Restaurant.exists({ _id: restaurantId }))) return res.status(400).json({ message: "Configuration invalide" });
    const current = await Config.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
    if (current?.managedByOnboarding) return res.status(409).json({ message: "Utilisez l'assistant CallSense pour gérer cette installation" });
    if (!current) return res.status(409).json({ message: "Une nouvelle installation doit passer par l'assistant CallSense" });
    const hasStoredToken = current?.accountSid === input.accountSid && Boolean(current.encryptedAuthToken);
    if (req.body.authToken !== undefined && (typeof req.body.authToken !== "string" || !req.body.authToken.trim() || req.body.authToken.length > 256)) return res.status(400).json({ message: "Secret invalide" });
    const suppliedToken = typeof req.body.authToken === "string" && req.body.authToken.trim() ? req.body.authToken : "";
    if (!hasStoredToken && !suppliedToken && !service.accountToken(input.accountSid)) return res.status(400).json({ message: "Compte Twilio non configuré" });
    const update = { $set: input, $push: { securityEvents: { $each: [{ action: "configuration_updated", actorId: String(req.user?._id || req.user?.id || ""), at: new Date() }], $slice: -100 } } };
    if (suppliedToken) update.$set.encryptedAuthToken = encryptToken(suppliedToken, restaurantId, input.accountSid);
    else if (current?.accountSid !== input.accountSid) update.$unset = { encryptedAuthToken: 1 };
    const filter = current ? { restaurantId, accountSid: current.accountSid } : { restaurantId };
    const config = await Config.findOneAndUpdate(filter, update, { upsert: !current, new: true, runValidators: true }).lean();
    if (!config) return res.status(409).json({ message: "La configuration a changé, réessayez" });
    delete config.encryptedAuthToken;
    return res.json(config);
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ message: "Configuration impossible" }); }
});
router.get("/admin/restaurants/:restaurantId/callsense/usage", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    if (!(await Config.exists({ restaurantId: req.params.restaurantId }))) return res.sendStatus(404);
    return res.json({ usage: await require("../services/callsense-usage.service").getCurrentUsage(req.params.restaurantId) });
  } catch (_) { return res.status(503).json({ message: "Consommation indisponible, réessayez plus tard." }); }
});
router.get("/admin/restaurants/:restaurantId/callsense/subscription-recovery", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.isValidObjectId(restaurantId)) return res.sendStatus(400);
    const operation = await require("../models/callsense/callsense-subscription-operation.model").findById(restaurantId).lean();
    if (!operation) return res.json({ pending: false });
    const { subscription } = await require("../services/stripe-billing.service").findRestaurantSubscription({ restaurantId });
    return res.json({ pending: true, state: operation.state, kind: operation.kind, startedAt: operation.startedAt,
      subscription: subscription ? { id: subscription.id, status: subscription.status } : null });
  } catch (_) { return res.status(503).json({ message: "Vérification Stripe indisponible." }); }
});
router.post("/admin/restaurants/:restaurantId/callsense/subscription-recovery", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.isValidObjectId(restaurantId)) return res.sendStatus(400);
    const Operation = require("../models/callsense/callsense-subscription-operation.model");
    const operation = await Operation.findById(restaurantId).lean();
    if (!operation || Date.now() - new Date(operation.startedAt).getTime() < 120000) return res.status(409).json({ message: "Aucune opération ancienne à débloquer." });
    const { subscription } = await require("../services/stripe-billing.service").findRestaurantSubscription({ restaurantId });
    const phrase = subscription ? "JE CONFIRME LA VERIFICATION STRIPE" : "JE CONFIRME ABSENCE STRIPE";
    if (req.body.acknowledgement !== phrase) return res.status(400).json({ message: "Confirmation adaptée au résultat Stripe requise." });
    await require("../models/callsense/callsense-billing-audit.model").create({ restaurantId, action: "subscription_recovery_unlocked",
      actorId: String(req.user?._id || req.user?.id || ""), attemptId: operation.attemptId, reference: subscription?.id || "", at: new Date() });
    const deleted = await Operation.deleteOne({ _id: restaurantId, attemptId: operation.attemptId });
    if (!deleted.deletedCount) return res.status(409).json({ message: "L'opération a changé, recommencez la vérification." });
    return res.json({ ok: true, subscriptionFound: Boolean(subscription) });
  } catch (_) { return res.status(503).json({ message: "Déblocage impossible ; vérifiez Stripe avant toute reprise." }); }
});
router.get("/admin/restaurants/:restaurantId/callsense/metering", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    const config = await Config.findOne({ restaurantId: req.params.restaurantId }).select("commercial.meteringEnabled commercial.meteringFrom reconciliation.cursor reconciliation.anomalies reconciliation.lastError").lean();
    if (!config) return res.sendStatus(404);
    const Consumption = require("../models/callsense/callsense-consumption.model");
    const [outstanding, reviewCalls, pendingCalls, manualAdjustments] = await Promise.all([
      Consumption.countDocuments({ restaurantId: req.params.restaurantId, state: { $in: ["verified", "sending", "review"] } }),
      Call.find({ restaurantId: req.params.restaurantId, billingState: "review" }).select("callSid billingReviewReason createdAt").sort({ createdAt: -1 }).limit(30).lean(),
      config.commercial?.meteringFrom ? Call.countDocuments({ restaurantId: req.params.restaurantId, incomingReceived: true,
        createdAt: { $gte: config.commercial.meteringFrom }, billingState: null }) : 0,
      Consumption.find({ restaurantId: req.params.restaurantId, state: "resolved", resolution: "manual" }).select("parentSid identifier minutes occurredAt periodStart periodEnd resolvedAt").sort({ resolvedAt: -1 }).limit(30).lean(),
    ]);
    const reviewEntries = await Consumption.find({ restaurantId: req.params.restaurantId, callId: { $in: reviewCalls.map((call) => call._id) } })
      .select("callId identifier state minutes lastError occurredAt firstAttemptAt periodStart periodEnd subscriptionId").lean();
    const enrichedCalls = reviewCalls.map((call) => ({ ...call, entry: reviewEntries.find((item) => String(item.callId) === String(call._id)) || null }));
    return res.json({ enabled: Boolean(config.commercial?.meteringEnabled), since: config.commercial?.meteringFrom || null,
      globalEnabled: process.env.CALLSENSE_METER_REPORTING_ENABLED === "true", outstanding, pendingCalls, reviewCalls: enrichedCalls, manualAdjustments,
      reconciliation: { cursor: config.reconciliation?.cursor || null, anomalies: config.reconciliation?.anomalies || [], error: config.reconciliation?.lastError || "" } });
  } catch (_) { return res.sendStatus(503); }
});
router.post("/admin/restaurants/:restaurantId/callsense/reconciliation/anomalies/:callSid/dismiss", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId, callSid } = req.params;
    if (!mongoose.isValidObjectId(restaurantId) || !/^CA[0-9a-fA-F]{32}$/.test(callSid || "")) return res.sendStatus(400);
    if (req.body?.acknowledgement !== "JE CONFIRME LA VERIFICATION") return res.status(400).json({ message: "Confirmation requise." });
    const result = await Config.updateOne({ restaurantId, "reconciliation.anomalies.callSid": callSid,
      $or: [{ "reconciliation.leaseUntil": { $exists: false } }, { "reconciliation.leaseUntil": null }, { "reconciliation.leaseUntil": { $lte: new Date() } }] },
    { $pull: { "reconciliation.anomalies": { callSid } }, $push: { securityEvents: { $each: [{ action: "reconciliation_anomaly_dismissed", actorId: String(req.user?._id || req.user?.id || ""), at: new Date() }], $slice: -100 } } });
    if (!result.modifiedCount) return res.status(409).json({ message: "Anomalie absente ou rapprochement en cours ; réessayez." });
    return res.json({ ok: true });
  } catch (_) { return res.status(503).json({ message: "Vérification indisponible." }); }
});
router.post("/admin/restaurants/:restaurantId/callsense/metering/:callId/resolve", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId, callId } = req.params;
    const { resolution, acknowledgement } = req.body || {};
    if (!mongoose.isValidObjectId(restaurantId) || !mongoose.isValidObjectId(callId)) return res.sendStatus(400);
    if (!['excluded', 'manual'].includes(resolution) || acknowledgement !== "JE CONFIRME LA VERIFICATION") return res.status(400).json({ message: "Choix et confirmation requis." });
    const Consumption = require("../models/callsense/callsense-consumption.model");
    const at = new Date();
    let entry = await Consumption.findOneAndUpdate({ restaurantId, callId, state: "review", $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: at } }] },
      { $set: { state: "resolved", resolution, resolvedAt: at, resolvedBy: String(req.user?._id || req.user?.id || "") }, $unset: { leaseUntil: 1 } }, { new: true }).lean();
    if (!entry) entry = await Consumption.findOne({ restaurantId, callId, state: "resolved", resolution }).lean();
    if (!entry) return res.status(409).json({ message: "Entrée indisponible ou modifiée ; vérifiez à nouveau." });
    await Call.updateOne({ _id: callId, restaurantId, billingState: "review" }, { $set: { billingState: "complete" }, $unset: { billingReviewReason: 1 } });
    return res.json({ ok: true, resolution });
  } catch (_) { return res.status(503).json({ message: "Résolution indisponible ; aucun événement Stripe n'a été émis." }); }
});
router.post("/admin/restaurants/:restaurantId/callsense/metering/:callId/confirm-reported", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId, callId } = req.params;
    if (!mongoose.isValidObjectId(restaurantId) || !mongoose.isValidObjectId(callId)) return res.sendStatus(400);
    if (req.body.acknowledgement !== "JE CONFIRME EVENEMENT STRIPE") return res.status(400).json({ message: "Confirmation explicite requise." });
    const Consumption = require("../models/callsense/callsense-consumption.model");
    const entry = await Consumption.findOne({ restaurantId, callId }).lean();
    if (entry?.state === "sent" && entry.lastError === "confirme_par_administrateur") {
      await Call.updateOne({ _id: callId, restaurantId, billingState: "review" }, { $set: { billingState: "complete" }, $unset: { billingReviewReason: 1 } });
      return res.json({ ok: true });
    }
    if (!entry || entry.state !== "review" || entry.lastError !== "delai_idempotence_depasse") return res.status(409).json({ message: "Aucun envoi expiré correspondant à confirmer." });
    const comparison = await require("../services/callsense-metering.service").reconcilePeriod(restaurantId, require("stripe")(process.env.STRIPE_API_SECRET_KEY));
    if (!comparison.available || comparison.pending !== 1 || new Date(entry.occurredAt) < new Date(comparison.from) ||
        new Date(entry.occurredAt) >= new Date(comparison.until) || comparison.stripeMinutes !== comparison.reportedMinutes + entry.minutes) {
      return res.status(409).json({ message: "Le rapprochement ne permet pas d'isoler cet événement ; vérifiez la facture et Stripe manuellement." });
    }
    const at = new Date();
    await Config.updateOne({ restaurantId }, { $push: { securityEvents: { $each: [{ action: "metering_report_confirmed", actorId: String(req.user?._id || req.user?.id || ""), at }], $slice: -100 } } });
    const updated = await Consumption.updateOne({ _id: entry._id, state: "review", lastError: "delai_idempotence_depasse" }, { $set: { state: "sent", sentAt: at, lastError: "confirme_par_administrateur" } });
    if (!updated.modifiedCount) return res.status(409).json({ message: "L'événement a changé entre-temps." });
    await Call.updateOne({ _id: callId, restaurantId, billingState: "review" }, { $set: { billingState: "complete" }, $unset: { billingReviewReason: 1 } });
    return res.json({ ok: true });
  } catch (_) { return res.status(503).json({ message: "Rapprochement indisponible ; aucun renvoi n'a été effectué." }); }
});
router.get("/admin/restaurants/:restaurantId/callsense/metering/reconciliation", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    const result = await require("../services/callsense-metering.service").reconcilePeriod(req.params.restaurantId, require("stripe")(process.env.STRIPE_API_SECRET_KEY));
    return res.json(result);
  } catch (_) { return res.status(503).json({ message: "Rapprochement Stripe indisponible." }); }
});
router.get("/admin/restaurants/:restaurantId/callsense/metering/twilio-reconciliation", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    const result = await require("../services/callsense-metering.service").inspectTwilioPeriod(req.params.restaurantId,
      { twilio, start: req.query.start, end: req.query.end });
    return res.json(result);
  } catch (_) { return res.status(503).json({ message: "Comparaison Twilio indisponible." }); }
});
router.post("/admin/restaurants/:restaurantId/callsense/metering/recover-twilio-call", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const parentSid = req.body?.callSid;
    if (!mongoose.isValidObjectId(restaurantId) || !/^CA[0-9a-fA-F]{32}$/.test(parentSid || "")) return res.sendStatus(400);
    if (req.body.acknowledgement !== "JE CONFIRME RECUPERATION APPEL") return res.status(400).json({ message: "Confirmation explicite requise." });
    const result = await require("../services/callsense-metering.service").recoverMissingCall(restaurantId, parentSid,
      { twilio });
    await Config.updateOne({ restaurantId }, { $push: { securityEvents: { $each: [{ action: "twilio_call_recovered", actorId: String(req.user?._id || req.user?.id || ""), at: new Date() }], $slice: -100 } } });
    return res.json(result);
  } catch (_) { return res.status(409).json({ message: "Récupération impossible : vérifiez l'appel, ses segments et la période avant toute régularisation." }); }
});
router.put("/admin/restaurants/:restaurantId/callsense/metering", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.isValidObjectId(restaurantId) || typeof req.body.enabled !== "boolean") return res.sendStatus(400);
    const enabled = req.body.enabled;
    if (req.body.acknowledgement !== (enabled ? "JE CONFIRME LA RECETTE" : "JE SUSPENDS LES ENVOIS")) return res.status(400).json({ message: "Confirmation explicite requise." });
    const config = await Config.findOne({ restaurantId }).lean();
    if (!config) return res.sendStatus(404);
    if (enabled) {
      if (config.managedByOnboarding && config.provisioningStatus !== "active") return res.status(409).json({ message: "Activez le service après les essais avant d’activer les envois commerciaux." });
      if (config.commercial?.meteringEnabled) return res.status(409).json({ message: "Les envois sont déjà activés." });
      if (process.env.CALLSENSE_METER_REPORTING_ENABLED !== "true") return res.status(409).json({ message: "Les envois sont désactivés sur le serveur." });
      const Consumption = require("../models/callsense/callsense-consumption.model");
      const indexes = await Consumption.collection.indexes();
      if (!["callId", "identifier"].every((key) => indexes.some((index) => index.unique && index.key[key] === 1 && Object.keys(index.key).length === 1))) return res.status(409).json({ message: "Index uniques du registre absents." });
      await require("../services/callsense-metering.service").billingContext(restaurantId, require("stripe")(process.env.STRIPE_API_SECRET_KEY));
    }
    const at = new Date();
    const updated = await Config.findOneAndUpdate({ _id: config._id, "commercial.meteringEnabled": { $ne: enabled }, ...(enabled && config.managedByOnboarding ? { provisioningStatus: "active", managedByOnboarding: true } : {}) }, {
      $set: { "commercial.meteringEnabled": enabled, ...(enabled && !config.commercial?.meteringFrom ? { "commercial.meteringFrom": at } : {}) },
      $push: { securityEvents: { $each: [{ action: enabled ? "metering_enabled" : "metering_disabled", actorId: String(req.user?._id || req.user?.id || ""), at }], $slice: -100 } },
    }, { new: true }).lean();
    if (!updated) return res.status(409).json({ message: "État modifié entre-temps." });
    return res.json({ enabled, since: updated.commercial?.meteringFrom || null });
  } catch (_) { return res.status(409).json({ message: "Vérification commerciale impossible ; aucun changement enregistré." }); }
});
router.post("/restaurants/:restaurantId/callsense/customer-identities", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const phones = req.body?.phones;
      if (!Array.isArray(phones) || phones.length > 100 || phones.some(phone => typeof phone !== "string" || phone.length > 40)) return res.sendStatus(400);
      res.set("Cache-Control", "no-store");
      return res.json({ identities: await service.resolveCustomerIdentities(req.params.restaurantId, phones) });
    } catch (_) { return res.sendStatus(503); }
  });

router.get("/restaurants/:restaurantId/callsense/calls", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const filter = { restaurantId: req.params.restaurantId };
      if (req.query.callId) {
        if (!mongoose.isValidObjectId(req.query.callId)) return res.sendStatus(400);
        filter._id = req.query.callId;
      }
      if (req.query.active === "true") {
        filter.outcome = { $exists: false };
        filter.createdAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      }
      if (req.query.cursor && !req.query.callId && req.query.active !== "true") {
        let cursor;
        try { cursor = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString("utf8")); } catch (_) { return res.sendStatus(400); }
        const date = new Date(cursor?.date);
        if (!mongoose.isValidObjectId(cursor?.id) || Number.isNaN(date.getTime())) return res.sendStatus(400);
        filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }];
      }
      const limit = req.query.callId ? 1 : req.query.active === "true" ? 50 : 10;
      const [calls, config, testConfig] = await Promise.all([
        Call.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
        Config.exists({ restaurantId: req.params.restaurantId, enabled: true }),
        Config.exists({ restaurantId: req.params.restaurantId, enabled: false, managedByOnboarding: true, provisioningStatus: "ready_for_test" }),
      ]);
      const items = calls.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = calls.length > limit && last ? Buffer.from(JSON.stringify({ date: last.createdAt, id: String(last._id) })).toString("base64url") : null;
      return res.json({ enabled: Boolean(config), testMode: Boolean(testConfig), calls: items.map(service.serialize), nextCursor });
    } catch (_) { return res.sendStatus(500); }
  });

router.get("/restaurants/:restaurantId/callsense/usage", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const config = await Config.findOne({ restaurantId: req.params.restaurantId }).select("twilioNumber enabled").lean();
      if (!config) return res.json({ configured: false, enabled: false });
      if (req.query?.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) return res.status(400).json({ message: "Période invalide." });
      const telephone = await require("../services/callsense-usage.service").getTelephoneStats(req.params.restaurantId, req.query?.month);
      if (req.query?.telephoneOnly === "1") return res.json({ configured: true, enabled: config.enabled === true, twilioNumber: config.twilioNumber || null, telephone });
      // Keep the technical status visible if Stripe is temporarily unavailable.
      const usage = await require("../services/callsense-usage.service").getCurrentUsage(req.params.restaurantId)
        .catch(() => ({ available: false, reason: "consommation_indisponible" }));
      return res.json({ configured: true, enabled: config.enabled === true, twilioNumber: config.twilioNumber || null, telephone, usage });
    } catch (_) { return res.status(503).json({ message: "Consommation indisponible, réessayez plus tard." }); }
  });

router.get("/restaurants/:restaurantId/callsense/unread-missed-count", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const count = await Call.countDocuments(unreadMissedFilter(req.params.restaurantId));
      return res.json({ count });
    } catch (_) { return res.sendStatus(500); }
  });

router.post("/restaurants/:restaurantId/callsense/read-missed", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const restaurantId = req.params.restaurantId;
      const readAt = new Date();
      const filter = { ...unreadMissedFilter(restaurantId), $or: [{ updatedAt: { $lte: readAt } }, { updatedAt: null }] };
      const result = await Call.updateMany(filter, { $set: { missedReadAt: readAt } }, { timestamps: false });
      broadcastToRestaurant(String(restaurantId), { type: "callsense_missed_read", restaurantId: String(restaurantId), readAt: readAt.toISOString() });
      return res.json({ ok: true, modifiedCount: result.modifiedCount || 0, readAt });
    } catch (_) { return res.sendStatus(500); }
  });

module.exports = router;
