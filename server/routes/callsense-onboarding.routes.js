const express = require("express");
const mongoose = require("mongoose");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { requireAdminRole } = require("../middleware/authenticate-admin");
const Restaurant = require("../models/restaurant.model");
const Config = require("../models/callsense/callsense-config.model");
const Draft = require("../models/callsense/callsense-onboarding.model");
const service = require("../services/callsense-onboarding.service");
const provisioning = require("../services/callsense-provisioning.service");
const fallback = require("../services/callsense-fallback.service");
const recovery = require("../services/callsense-recovery.service");
const router = express.Router();

router.use("/admin/restaurants/:restaurantId/callsense-onboarding", authenticateAdmin, requireAdminRole, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    if (!(await Restaurant.exists({ _id: req.params.restaurantId }))) return res.sendStatus(404);
    next();
  } catch (_) { res.sendStatus(503); }
});
const base = "/admin/restaurants/:restaurantId/callsense-onboarding";
const sipSecretAttempts = new Map();
function limitSipSecret(req, res, next) {
  const now = Date.now(), key = String(req.user.id || req.user._id || "");
  for (const [id, item] of sipSecretAttempts) if (item.until <= now) sipSecretAttempts.delete(id);
  if (!key || (!sipSecretAttempts.has(key) && sipSecretAttempts.size >= 1000)) return res.status(429).json({ message: "Consultation temporairement indisponible." });
  const item = sipSecretAttempts.get(key) || { count: 0, until: now + 5 * 60 * 1000 };
  item.count++; sipSecretAttempts.set(key, item);
  if (item.count > 10) return res.status(429).json({ message: "Trop de consultations. Réessayez plus tard." });
  return next();
}
function failure(res, err) { return res.status(err.expose ? err.status : (err.code === 11000 ? 409 : 500)).json({ message: err.expose ? err.message : "Opération impossible ; vérifiez la configuration et les ressources Twilio." }); }
router.get(base, async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const [restaurant, draft, live] = await Promise.all([
      Restaurant.findById(restaurantId).select("name address phone email").lean(),
      Draft.findOne({ restaurantId }).lean(),
      Config.findOne({ restaurantId }).select("enabled managedByOnboarding accountSid twilioNumber sipDomain sipUri terminalType provisioningStatus").lean(),
    ]);
    const sipHost = /^sip:[^@]+@([a-zA-Z0-9.-]+)(?::\d+)?$/.exec(live?.sipUri || "")?.[1] || null;
    const configuration = live ? { enabled: live.enabled === true, managedByOnboarding: live.managedByOnboarding === true,
      accountSid: live.accountSid || null, twilioNumber: live.twilioNumber || null, sipDomain: live.sipDomain || sipHost,
      terminalType: live.terminalType || null, provisioningStatus: live.provisioningStatus || null } : null;
    res.set("Cache-Control", "no-store");
    res.json({ restaurant, draft: service.clean(draft), configuration, complianceStrategy: provisioning.complianceStrategy(), liveExists: Boolean(live), liveEnabled: Boolean(live?.enabled), liveManaged: Boolean(live?.managedByOnboarding) });
  } catch (err) { failure(res, err); }
});
router.get(`${base}/live-compliance`, async (req, res) => {
  try {
    const config = await Config.findOne({ restaurantId: req.params.restaurantId }).select("+encryptedAuthToken").lean();
    if (!config?.accountSid || !config.twilioNumber) return res.sendStatus(404);
    const token = config.encryptedAuthToken
      ? require("../services/callsense-secrets.service").decryptToken(config.encryptedAuthToken, String(config.restaurantId), config.accountSid)
      : require("../services/callsense.service").accountToken(config.accountSid);
    if (!token) throw new Error("missing credentials");
    const client = require("twilio")(config.accountSid, token);
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: config.twilioNumber, limit: 2 });
    if (numbers.length !== 1 || numbers[0].accountSid !== config.accountSid || numbers[0].phoneNumber !== config.twilioNumber) throw new Error("ambiguous number");
    if (!numbers[0].bundleSid) return res.json({ verified: false, status: null });
    const bundle = await client.numbers.v2.regulatoryCompliance.bundles(numbers[0].bundleSid).fetch();
    res.set("Cache-Control", "no-store");
    return res.json({ verified: true, status: bundle.status || null });
  } catch (_) { return res.status(503).json({ message: "Vérification Twilio indisponible ; aucun statut ne peut être confirmé." }); }
});
router.put(base, async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    if (await Config.exists({ restaurantId })) return res.status(409).json({ message: "Installation existante : assistant en lecture seule" });
    const { terminalType, regulatoryBundleSid, operator } = req.body;
    if (!["softphone", "HT813"].includes(terminalType) || typeof regulatoryBundleSid !== "string" || (regulatoryBundleSid && !/^BU[0-9a-fA-F]{32}$/.test(regulatoryBundleSid)) || typeof operator !== "string" || operator.length > 100) return res.sendStatus(400);
    const draft = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, numberOperation: { $ne: "pending" }, accountOperation: { $ne: "pending" }, domainOperation: { $ne: "pending" }, bundleCloneOperation: { $ne: "pending" } }, { $set: { terminalType, regulatoryBundleSid, operator } }, { upsert: true, new: true, runValidators: true });
    res.json(service.clean(draft));
  } catch (err) { failure(res, err); }
});
router.put(`${base}/progress`, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { step } = req.body;
    if (!Number.isInteger(step) || step < 0 || step > 6) return res.sendStatus(400);
    const live = await Config.findOne({ restaurantId }).select("managedByOnboarding").lean();
    if (live && !live.managedByOnboarding) return res.status(409).json({ message: "Installation historique en lecture seule" });
    const draft = await Draft.findOneAndUpdate({ restaurantId }, { $set: { wizardStep: step } }, { upsert: !live, new: true, runValidators: true });
    if (!draft) return res.sendStatus(404);
    res.json({ step: draft.wizardStep });
  } catch (err) { failure(res, err); }
});
router.post(`${base}/account`, async (req, res) => {
  try { res.json(await service.createAccount(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/associate-account`, async (req, res) => {
  try { res.json(await service.associateAccount(req.params.restaurantId, String(req.user.id), { sid: req.body.accountSid, confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/available-numbers`, async (req, res) => {
  try { res.json({ numbers: await service.listNumbers(req.params.restaurantId) }); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/number-quote`, async (req, res) => {
  try { res.json(await service.quoteNumbers(req.params.restaurantId)); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/number-associate`, async (req, res) => {
  try { res.json(await service.associateNumber(req.params.restaurantId, String(req.user.id), { sid: req.body.sid, confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/number-purchase`, async (req, res) => {
  let queued = false;
  try {
    const actor = String(req.user.id);
    if (req.body.confirm === true && req.body.technicalConfirm === true) {
      await provisioning.queueTechnical(req.params.restaurantId, actor, { confirm: true, functionConfirm: req.body.functionConfirm === true });
      queued = true;
    }
    const draft = await service.buyNumber(req.params.restaurantId, actor, { phoneNumber: req.body.phoneNumber, numberType: req.body.numberType, amount: req.body.amount, currency: req.body.currency, confirm: req.body.confirm, addressSid: req.body.addressSid });
    let technical = null;
    if (req.body.technicalConfirm === true) {
      try { technical = await provisioning.startTechnical(req.params.restaurantId, actor, { confirm: true, functionConfirm: req.body.functionConfirm === true }); }
      catch (_) { technical = { status: "action_required", message: "Numéro acheté. Configuration technique à vérifier avant reprise." }; }
    }
    res.json({ ...draft, technical });
  }
  catch (err) {
    if (queued) await Draft.updateOne({ restaurantId: req.params.restaurantId, "automation.resumeMode": "technical", "automation.status": "running" }, { $set: { "automation.status": "error", "automation.message": "Achat non terminé : vérifiez son résultat avant toute reprise." } }).catch(() => {});
    failure(res, err);
  }
});
router.post(`${base}/technical-finalize`, async (req, res) => {
  try { res.json(await provisioning.startTechnical(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, functionConfirm: req.body.functionConfirm === true })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/automation`, async (req, res) => {
  try { res.json(await provisioning.runOnboarding(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, maxAmount: req.body.maxAmount, currency: req.body.currency, sharedCloneConsent: req.body.sharedCloneConsent, functionConsent: req.body.functionConsent })); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/addresses`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json({ addresses: await service.listAddresses(req.params.restaurantId) }); }
  catch (err) { failure(res, err); }
});
router.put(`${base}/checklist`, async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const config = await Config.findOne({ restaurantId }).lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation existante protégée" });
    const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
    if (!req.body.checklist || fields.some((name) => typeof req.body.checklist[name] !== "boolean") || Object.keys(req.body.checklist).some((name) => !fields.includes(name))) return res.sendStatus(400);
    if (config?.provisioningStatus === "active" && fields.some((name) => !req.body.checklist[name])) return res.status(409).json({ message: "Suspendez le service ou repassez en test avant de retirer une validation" });
    const filter = { restaurantId, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } };
    if (req.body.checklist.fallbackTest) filter.verifiedFallbackUrl = { $exists: true, $ne: "" };
    const updated = await Draft.findOneAndUpdate(filter, { $set: { checklist: req.body.checklist }, $push: { audit: { action: "checklist_updated", actorId: String(req.user.id), at: new Date() } } }, { new: true, runValidators: true });
    if (!updated) return res.sendStatus(404);
    res.json(service.clean(updated));
  } catch (err) { failure(res, err); }
});
router.get(`${base}/fallback-template`, async (req, res) => {
  try {
    const draft = await Draft.findOne({ restaurantId: req.params.restaurantId }).lean();
    if (!draft) return res.sendStatus(404);
    const config = await Config.findOne({ restaurantId: req.params.restaurantId }).lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation existante protégée" });
    res.set("Cache-Control", "no-store");
    res.json(fallback.template(draft));
  } catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-probe`, async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const draft = await Draft.findOne({ restaurantId }).lean();
    if (!draft) return res.sendStatus(404);
    const config = await Config.findOne({ restaurantId }).lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation existante protégée" });
    let authToken;
    if (draft.fallbackFunction?.url === req.body.fallbackUrl) {
      const context = await service.draftClient(restaurantId);
      authToken = require("../services/callsense-secrets.service").decryptToken(context.draft.encryptedAuthToken, String(restaurantId), draft.accountSid);
    }
    const result = await fallback.probe(draft, req.body.fallbackUrl, { authToken });
    if (config?.enabled && draft.voiceFallbackUrl && draft.voiceFallbackUrl !== result.url) return res.status(409).json({ message: "Suspendez le service avant de changer le secours" });
    const isSameVerified = draft.verifiedFallbackUrl === result.url && draft.fallbackProbeSipUri === result.sipUri && draft.checklist?.fallbackTest === true;
    if (config?.enabled && !isSameVerified) return res.status(409).json({ message: "Suspendez le service avant de renouveler la validation du secours" });
    const update = { $set: { fallbackProbeUrl: result.url, fallbackProbeSipUri: result.sipUri, fallbackProbeAt: new Date(), ...(!isSameVerified ? { "checklist.fallbackTest": false } : {}) }, $push: { audit: { action: "fallback_http_verified", actorId: String(req.user.id), at: new Date() } } };
    if (!isSameVerified) update.$unset = { verifiedFallbackUrl: 1 };
    const updated = await Draft.findOneAndUpdate({ restaurantId, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } }, update, { new: true });
    if (!updated) return res.status(409).json({ message: "La configuration a changé ; recommencez la vérification" });
    res.json({ ok: true, fallbackUrl: result.url, sipUri: result.sipUri, checkedAt: updated.fallbackProbeAt });
  } catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-verification`, async (req, res) => {
  try {
    if (req.body.confirm !== true) return res.sendStatus(400);
    const draft = await Draft.findOne({ restaurantId: req.params.restaurantId }).lean();
    const { voiceFallbackUrl } = provisioning.webhookUrls(req.body.fallbackUrl, draft);
    const config = await Config.findOne({ restaurantId: req.params.restaurantId }).lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation existante protégée" });
    if (config?.enabled) {
      const current = await Draft.findOne({ restaurantId: req.params.restaurantId }).lean();
      if (current?.voiceFallbackUrl && current.voiceFallbackUrl !== voiceFallbackUrl) return res.status(409).json({ message: "Suspendez le service avant de changer le secours" });
    }
    const uri = fallback.sipUri(draft);
    const updated = await Draft.findOneAndUpdate({ restaurantId: req.params.restaurantId, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, fallbackProbeUrl: voiceFallbackUrl, fallbackProbeSipUri: uri, fallbackProbeAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } }, {
      $set: { verifiedFallbackUrl: voiceFallbackUrl, "checklist.fallbackTest": true },
      $push: { audit: { action: "fallback_test_declared", actorId: String(req.user.id), at: new Date() } },
    }, { new: true });
    if (!updated) return res.status(409).json({ message: "Vérifiez à nouveau la réponse du TwiML Bin avant de confirmer le test téléphonique" });
    res.json(service.clean(updated));
  } catch (err) { failure(res, err); }
});
router.get(`${base}/resources`, async (req, res) => {
  try { res.json(await service.inspectResources(req.params.restaurantId)); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/compliance`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await service.inspectCompliance(req.params.restaurantId)); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/domain`, async (req, res) => {
  try { res.json(await service.createDomain(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/domain-associate`, async (req, res) => {
  try { res.json(await service.associateDomain(req.params.restaurantId, String(req.user.id), { sid: req.body.sid, confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/sip-credentials`, async (req, res) => {
  try { res.json(await provisioning.configureSip(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, credentialListSid: req.body.credentialListSid })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/sip-reconcile`, async (req, res) => {
  try { res.json(await provisioning.reconcileSip(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/sip-secret`, (req, res, next) => { res.set("Cache-Control", "private, no-store, max-age=0"); res.set("Pragma", "no-cache"); res.set("X-Content-Type-Options", "nosniff"); next(); }, limitSipSecret, async (req, res) => {
  try {
    if (req.body.confirm !== true) return res.sendStatus(400);
    res.json(await provisioning.revealSip(req.params.restaurantId, String(req.user.id)));
  } catch (err) { failure(res, err); }
});
router.post(`${base}/sip-rotate`, async (req, res) => {
  try { res.json(await provisioning.rotateSip(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/sip-rotation-recover`, async (req, res) => {
  try { res.json(await provisioning.recoverRotation(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/webhooks`, async (req, res) => {
  try { res.json(await provisioning.configureWebhooks(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, fallbackUrl: req.body.fallbackUrl })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/status`, async (req, res) => {
  try { res.json(await provisioning.setStatus(req.params.restaurantId, String(req.user.id), { status: req.body.status, confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/recovery-inspect`, async (req, res) => {
  try { res.json(await recovery.inspect(req.params.restaurantId, String(req.user.id), req.body.operation)); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/recovery-unlock`, async (req, res) => {
  try { res.json(await recovery.unlock(req.params.restaurantId, String(req.user.id), { operation: req.body.operation, inspectionId: req.body.inspectionId, acknowledgement: req.body.acknowledgement, resetAbsent: req.body.resetAbsent === true })); }
  catch (err) { failure(res, err); }
});
module.exports = router;
