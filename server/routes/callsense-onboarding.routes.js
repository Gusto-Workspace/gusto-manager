const express = require("express");
const multer = require("multer");
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
const { currentStep } = require("../services/callsense-onboarding-progress.service");
const router = express.Router();

router.use("/admin/restaurants/:restaurantId/callsense-onboarding", authenticateAdmin, requireAdminRole, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.sendStatus(400);
    if (!(await Restaurant.exists({ _id: req.params.restaurantId }))) return res.sendStatus(404);
    next();
  } catch (_) { res.sendStatus(503); }
});
const base = "/admin/restaurants/:restaurantId/callsense-onboarding";
// Read-only diagnostics and recovery have their own safeguards; ordinary
// mutations must belong to the current stage, regardless of the browser UI.
const mutationStages = {
  "/account": [1], "/associate-account": [1],
  "/regulatory-submission": [2], "/regulatory-resubmission": [2], "/addresses": [2],
  "/number-associate": [3], "/number-purchase": [3],
  "/domain": [4], "/domain-associate": [4], "/sip-credentials": [4], "/technical-finalize": [4], "/webhooks": [4],
  "/forwarding-scenario": [5, 6], "/checklist": [5, 6], "/sip-secret": [4, 5, 6],
};
router.use(base, async function requireCurrentStage(req, res, next) {
  if (!["POST", "PUT"].includes(req.method) || !mutationStages[req.path]) return next();
  try {
    const { restaurantId } = req.params;
    const [restaurant, draft, live] = await Promise.all([Restaurant.findById(restaurantId).select("name address phone email").lean(), Draft.findOne({ restaurantId }).lean(), Config.findOne({ restaurantId }).select("managedByOnboarding").lean()]);
    if (live && !live.managedByOnboarding) return next();
    if (!mutationStages[req.path].includes(currentStep(restaurant, draft))) return res.status(409).json({ message: "Cette action sera disponible à l’étape correspondante." });
    next();
  } catch (_) { res.sendStatus(503); }
});
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
    res.json({ restaurant, draft: service.clean(draft), configuration, progress: live && !live.managedByOnboarding ? null : { currentStep: currentStep(restaurant, draft) }, complianceStrategy: provisioning.complianceStrategy(), liveExists: Boolean(live), liveEnabled: Boolean(live?.enabled), liveManaged: Boolean(live?.managedByOnboarding) });
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
    const { terminalType, regulatoryBundleSid, operator } = req.body;
    if (!["softphone", "HT813"].includes(terminalType) || typeof regulatoryBundleSid !== "string" || (regulatoryBundleSid && !/^BU[0-9a-fA-F]{32}$/.test(regulatoryBundleSid)) || typeof operator !== "string" || operator.length > 100) return res.sendStatus(400);
    if (await Config.exists({ restaurantId })) {
      const live = await Config.findOne({ restaurantId }).select("managedByOnboarding enabled provisioningStatus accountSid").lean();
      const current = await Draft.findOne({ restaurantId }).lean();
      if (!live?.managedByOnboarding || live.enabled !== false || live.provisioningStatus !== "ready_for_test" || current?.serviceStatus !== "ready_for_test" || current.accountSid !== live.accountSid || current.regulatoryBundleSid !== regulatoryBundleSid) return res.status(409).json({ message: "Installation existante : assistant en lecture seule" });
      const changed = current.terminalType !== terminalType;
      const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
      const update = { $set: { terminalType, operator, ...(changed ? Object.fromEntries(fields.map(field => [`checklist.${field}`, false])) : {}) }, ...(changed ? { $unset: { verifiedFallbackUrl: 1 } } : {}) };
      const updated = await Draft.findOneAndUpdate({ restaurantId, accountSid: live.accountSid, regulatoryBundleSid, serviceStatus: "ready_for_test", terminalType: current.terminalType, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } }, update, { new: true, runValidators: true });
      if (!updated) return res.status(409).json({ message: "Configuration modifiée : réessayez" });
      return res.json(service.clean(updated));
    }
    const draft = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, numberOperation: { $ne: "pending" }, accountOperation: { $ne: "pending" }, domainOperation: { $ne: "pending" }, bundleCloneOperation: { $ne: "pending" }, $or: [{ "regulatorySubmission.state": { $exists: false } }, { "regulatorySubmission.bundleSid": regulatoryBundleSid }] }, { $set: { terminalType, regulatoryBundleSid, operator } }, { upsert: true, new: true, runValidators: true });
    res.json(service.clean(draft));
  } catch (err) { failure(res, err); }
});
router.put(`${base}/forwarding-scenario`, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { scenario } = req.body;
    if (!["direct", "forward"].includes(scenario)) return res.sendStatus(400);
    const live = await Config.findOne({ restaurantId }).select("managedByOnboarding enabled provisioningStatus").lean();
    if (live && (!live.managedByOnboarding || (live.enabled && live.provisioningStatus !== "ready_for_test"))) return res.status(409).json({ message: "Installation existante protégée" });
    const [restaurant, current] = await Promise.all([Restaurant.findById(restaurantId).select("name address phone email").lean(), Draft.findOne({ restaurantId }).lean()]);
    if (currentStep(restaurant, current) < 5) return res.status(409).json({ message: "La préparation téléphonique doit être terminée avant de choisir le routage." });
    const changed = current?.forwardingScenario && current.forwardingScenario !== scenario;
    const fields = ["operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
    const draft = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" }, forwardingScenario: current?.forwardingScenario || { $in: [null, ""] } }, { $set: { forwardingScenario: scenario, ...(changed ? Object.fromEntries(fields.map(field => [`checklist.${field}`, false])) : {}) }, ...(changed ? { $unset: { verifiedFallbackUrl: 1 } } : {}) }, { new: true, runValidators: true });
    if (!draft) return res.status(409).json({ message: "Dossier indisponible ou opération en cours" });
    return res.json({ scenario: draft.forwardingScenario });
  } catch (err) { return failure(res, err); }
});
router.put(`${base}/progress`, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { step } = req.body;
    if (!Number.isInteger(step) || step < 0 || step > 6) return res.sendStatus(400);
    const live = await Config.findOne({ restaurantId }).select("managedByOnboarding").lean();
    if (live && !live.managedByOnboarding) return res.status(409).json({ message: "Installation historique en lecture seule" });
    const [restaurant, current] = await Promise.all([Restaurant.findById(restaurantId).select("name address phone email").lean(), Draft.findOne({ restaurantId }).lean()]);
    if (step > currentStep(restaurant, current)) return res.status(409).json({ message: "Cette étape sera disponible lorsque les précédentes seront terminées." });
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
  try { res.json(await provisioning.runOnboarding(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, maxAmount: req.body.maxAmount, currency: req.body.currency, sharedCloneConsent: req.body.sharedCloneConsent, functionConsent: req.body.functionConsent, pilotPurchaseConfirmed: req.body.confirm === true })); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/addresses`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json({ addresses: await service.listAddresses(req.params.restaurantId) }); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/addresses`, async (req, res) => {
  try { const { confirm, reconcile, customerName, street, city, postalCode, region, isoCountry } = req.body; res.set("Cache-Control", "no-store"); res.json(await service.createRegulatoryAddress(req.params.restaurantId, String(req.user.id), { confirm, reconcile: reconcile === true, customerName, street, city, postalCode, region, isoCountry })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/bundle-association`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await service.associateApprovedBundle(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, migrateHistorical: req.body.migrateHistorical === true })); }
  catch (err) { failure(res, err); }
});
router.put(`${base}/checklist`, async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const config = await Config.findOne({ restaurantId }).lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation existante protégée" });
    const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
    if (!req.body.checklist || fields.some((name) => typeof req.body.checklist[name] !== "boolean") || Object.keys(req.body.checklist).some((name) => !fields.includes(name))) return res.sendStatus(400);
    const [restaurant, progressDraft] = await Promise.all([Restaurant.findById(restaurantId).select("name address phone email").lean(), Draft.findOne({ restaurantId }).lean()]);
    const stage = currentStep(restaurant, progressDraft);
    if (stage < 5 || stage < 6 && fields.slice(2).some(name => req.body.checklist[name] !== Boolean(progressDraft?.checklist?.[name]))) return res.status(409).json({ message: "Terminez la préparation du téléphone avant de déclarer les essais." });
    if (req.body.checklist.fallbackHttpFailures && !progressDraft?.checklist?.fallbackHttpFailures && ["http", "invalid", "timeout"].some(key => progressDraft?.fallbackDrill?.results?.[key] !== true)) return res.status(409).json({ message: "Confirmez les trois scénarios de secours et le retour à la normale avant cette validation." });
    if (config?.provisioningStatus === "active") {
      const current = await Draft.findOne({ restaurantId }).select("forwardingScenario terminalType").lean();
      if (require("../services/callsense-checklist.service").requiredChecklistFields(current).some(name => !req.body.checklist[name])) return res.status(409).json({ message: "Suspendez le service ou repassez en test avant de retirer une validation" });
    }
    const filter = { restaurantId, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } };
    if (req.body.checklist.fallbackTest) {
      if (!progressDraft?.checklist?.fallbackTest || !progressDraft.verifiedFallbackUrl || progressDraft.verifiedFallbackUrl !== progressDraft.voiceFallbackUrl) return res.status(409).json({ message: "Confirmez d’abord l’appel de secours avec le bouton dédié ; les autres vérifications restent enregistrables séparément." });
      filter.verifiedFallbackUrl = progressDraft.voiceFallbackUrl;
      filter["checklist.fallbackTest"] = true;
    }
    const updated = await Draft.findOneAndUpdate(filter, { $set: { checklist: req.body.checklist }, $push: { audit: { action: "checklist_updated", actorId: String(req.user.id), at: new Date() } } }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ message: "La préparation ou la confirmation du secours a changé : vérifiez son état puis réessayez." });
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
    const samePreparedTest = config?.managedByOnboarding && config.provisioningStatus === "ready_for_test" && draft.voiceFallbackUrl === result.url;
    if (config?.enabled && !isSameVerified && !samePreparedTest) return res.status(409).json({ message: "Suspendez le service avant de renouveler la validation du secours" });
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
    const updated = await Draft.findOneAndUpdate({ restaurantId: req.params.restaurantId, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, fallbackProbeUrl: voiceFallbackUrl, fallbackProbeSipUri: uri, fallbackProbeAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" }, "testRouting.state": { $nin: ["pending", "active", "restoring", "uncertain"] } }, {
      $set: { verifiedFallbackUrl: voiceFallbackUrl, "checklist.fallbackTest": true },
      $push: { audit: { action: "fallback_test_declared", actorId: String(req.user.id), at: new Date() } },
    }, { new: true });
    if (!updated) return res.status(409).json({ message: "Vérifiez à nouveau la réponse du TwiML Bin avant de confirmer le test téléphonique" });
    res.json(service.clean(updated));
  } catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-drill/start`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await require("../services/callsense-fallback-drill.service").start(req.params.restaurantId, String(req.user.id), { scenario: req.body.scenario, confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-drill/stop`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await require("../services/callsense-fallback-drill.service").stop(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-drill/confirm`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await require("../services/callsense-fallback-drill.service").confirm(req.params.restaurantId, String(req.user.id), { fallbackWorked: req.body.fallbackWorked, normalCallWorked: req.body.normalCallWorked })); }
  catch (err) { failure(res, err); }
});
router.post(`${base}/fallback-test-routing`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await provisioning.testFallbackRouting(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm, restore: req.body.restore === true })); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/resources`, async (req, res) => {
  try { res.json(await service.inspectResources(req.params.restaurantId)); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/compliance`, async (req, res) => {
  try {
    const result = await service.inspectCompliance(req.params.restaurantId);
    res.set("Cache-Control", "no-store"); res.json(result);
  }
  catch (err) { failure(res, err); }
});
router.post(`${base}/compliance-check`, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const [draft, live] = await Promise.all([Draft.findOne({ restaurantId }).lean(), Config.findOne({ restaurantId }).select("managedByOnboarding").lean()]);
    if (live && !live.managedByOnboarding) return res.status(409).json({ message: "Installation historique protégée" });
    if (!draft?.accountSid || !draft.regulatoryBundleSid) return res.status(409).json({ message: "Aucun dossier réglementaire à vérifier." });
    const result = await service.inspectCompliance(restaurantId);
    if (result.bundle?.sid !== draft.regulatoryBundleSid) return res.status(409).json({ message: "Le dossier a changé ; rechargez avant de vérifier." });
    const approval = { bundleSid: draft.regulatoryBundleSid, accountSid: draft.accountSid, status: result.bundle.status, compatible: result.bundle.compatible === true, checkedAt: new Date() };
    const automation = draft.automation || {};
    const authorized = automation.resumeMode === "onboarding" && typeof automation.actorId === "string" && automation.actorId.length > 0 && /^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(automation.maxAmount || "") && /^[A-Z]{3}$/.test(automation.currency || "");
    const approved = approval.status === "twilio-approved" && approval.compatible;
    const alreadyQueued = automation.manualApprovalBundleSid === draft.regulatoryBundleSid && automation.manualApprovalAccountSid === draft.accountSid;
    const shouldQueue = approved && authorized && automation.phase === "compliance" && (automation.status === "waiting" || automation.status === "running" && !alreadyQueued);
    const filter = { restaurantId, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, "regulatoryApproval.checkedAt": draft.regulatoryApproval?.checkedAt || { $exists: false } };
    const set = { regulatoryApproval: approval };
    if (shouldQueue) {
      Object.assign(filter, { "automation.phase": "compliance", "automation.status": automation.status, "automation.actorId": automation.actorId, "automation.maxAmount": automation.maxAmount, "automation.currency": automation.currency, "automation.resumeMode": "onboarding" });
      const now = new Date();
      const existingLease = automation.status === "running" && new Date(automation.nextAttemptAt) > now ? new Date(automation.nextAttemptAt) : now;
      Object.assign(set, { "automation.status": "running", "automation.message": "Dossier approuvé. Préparation du numéro en cours.", "automation.manualApprovalBundleSid": draft.regulatoryBundleSid, "automation.manualApprovalAccountSid": draft.accountSid, "automation.nextAttemptAt": existingLease });
    } else if (automation.phase === "compliance" && automation.status === "running" && (!approved && draft.regulatoryApproval?.status !== "twilio-approved" || approved && !authorized)) {
      Object.assign(filter, { "automation.phase": "compliance", "automation.status": "running" });
      Object.assign(set, { "automation.status": "waiting", "automation.message": approved ? "Dossier approuvé : autorisation et plafond nécessaires pour continuer." : "Dossier transmis : vérifiez son approbation lorsque Twilio aura terminé son examen." });
    }
    const updated = await Draft.findOneAndUpdate(filter, { $set: set }, { new: true });
    if (!updated) {
      const current = await Draft.findOne({ restaurantId }).lean();
      if (current?.accountSid !== draft.accountSid || current?.regulatoryBundleSid !== draft.regulatoryBundleSid || current?.regulatoryApproval?.status !== approval.status || current.regulatoryApproval?.compatible !== approval.compatible) return res.status(409).json({ message: "Le dossier a changé pendant la vérification ; réessayez." });
      res.set("Cache-Control", "no-store");
      return res.json({ bundle: result.bundle, automaticResume: "unchanged" });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ bundle: result.bundle, automaticResume: shouldQueue ? "queued" : authorized ? "unchanged" : "authorization_required" });
  } catch (err) { return failure(res, err); }
});
router.get(`${base}/regulatory-requirements`, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await service.regulatoryRequirements(req.params.restaurantId, { endUserType: req.query.endUserType }));
  } catch (err) { failure(res, err); }
});
router.post(`${base}/regulatory-evaluation`, async (req, res) => {
  try {
    const config = await Config.findOne({ restaurantId: req.params.restaurantId }).select("managedByOnboarding").lean();
    if (config && !config.managedByOnboarding) return res.status(409).json({ message: "Installation historique protégée" });
    res.set("Cache-Control", "no-store");
    return res.json(await service.evaluateIndividualBundle(req.params.restaurantId, { confirm: req.body.confirm }));
  } catch (err) { return failure(res, err); }
});
router.post(`${base}/regulatory-resubmission`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await service.resubmitRejectedBundle(req.params.restaurantId, String(req.user.id), { confirm: req.body.confirm })); }
  catch (err) { failure(res, err); }
});
router.get(`${base}/regulatory-rejection`, async (req, res) => {
  try { res.set("Cache-Control", "no-store"); res.json(await service.rejectedBundleDetails(req.params.restaurantId)); }
  catch (err) { failure(res, err); }
});
const regulatoryUpload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 65536, parts: 11 } }).array("documents", 10);
router.post(`${base}/regulatory-submission`, (req, res, next) => regulatoryUpload(req, res, err => err ? res.status(400).json({ message: "Envoi réglementaire invalide ou trop volumineux" }) : next()), async (req, res) => {
  try {
    let payload;
    try { payload = JSON.parse(req.body.payload); } catch (_) { return res.status(400).json({ message: "Données réglementaires invalides" }); }
    if (!payload || !Array.isArray(payload.documents)) return res.status(400).json({ message: "Justificatifs manquants" });
    const indexed = payload.documents.some(doc => Object.hasOwn(doc || {}, "fileIndex"));
    if (!indexed && payload.documents.length !== req.files.length) return res.status(400).json({ message: "Justificatifs manquants" });
    const indexes = indexed ? payload.documents.map(doc => doc?.fileIndex).filter(index => index !== null) : payload.documents.map((_, index) => index);
    if (indexes.length !== req.files.length || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= req.files.length) || new Set(indexes).size !== indexes.length) return res.status(400).json({ message: "Fichiers justificatifs invalides" });
    const documents = payload.documents.map((doc, index) => { const file = req.files[indexed ? doc.fileIndex : index]; return { type: doc?.type, attributes: doc?.attributes, ...(file ? { buffer: file.buffer, mimeType: file.mimetype } : {}) }; });
    res.set("Cache-Control", "no-store");
    const result = await service.submitIndividualBundle(req.params.restaurantId, String(req.user.id), { confirm: payload.confirm, endUserType: payload.endUserType, endUserAttributes: payload.endUserAttributes, email: payload.email, documents });
    if (result.status === "pending-review") await Draft.updateOne({ restaurantId: req.params.restaurantId, "automation.status": "waiting", "automation.phase": "compliance" }, { $set: { "automation.message": "Dossier transmis : vérifiez son approbation lorsque Twilio aura terminé son examen." }, $unset: { "automation.nextAttemptAt": 1 } }).catch(() => { result.automationWarning = "Vérifiez l’état du dossier avant de continuer."; });
    return res.json(result);
  } catch (err) { return failure(res, err); }
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
