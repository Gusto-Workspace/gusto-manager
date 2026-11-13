const crypto = require("crypto");
const net = require("net");
const https = require("https");
const twilio = require("twilio");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { encryptToken, decryptToken } = require("./callsense-secrets.service");
const { clean } = require("./callsense-onboarding.service");
const { broadcastToRestaurant } = require("./sse-bus.service");
const fallback = require("./callsense-fallback.service");
const sipDomain = require("./callsense-sip-domain.service");
const { requiredChecklistFields } = require("./callsense-checklist.service");

function failure(message, status = 400) { return Object.assign(new Error(message), { status, expose: true }); }
function password() { return `Aa1${crypto.randomBytes(30).toString("hex")}`; }
function secretContext(sid) { return `${sid}:sip`; }
async function load(restaurantId, makeTwilio = twilio) {
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken +encryptedSipPassword +encryptedNextSipPassword").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken) throw failure("Sous-compte non configuré", 409);
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && (!existing.managedByOnboarding || existing.accountSid !== draft.accountSid)) throw failure("Installation existante protégée", 409);
  return { draft, existing, client: makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid)) };
}
async function updateLocked(id, expected, changes) {
  const updated = await Draft.findOneAndUpdate({ _id: id, ...expected }, changes, { new: true });
  if (!updated) throw new Error("Configuration changed");
  return updated;
}
async function requireAttempt(id, operation, attempt) {
  const field = operation === "sip" ? "sipCredentialOperation" : "webhookOperation";
  if (!(await Draft.exists({ _id: id, [field]: "pending", [`operationAttempts.${operation}.id`]: attempt }))) throw new Error("Operation replaced");
}
function audit(action, actorId) { return { action, actorId, at: new Date() }; }
async function configureSip(restaurantId, actorId, { confirm, credentialListSid, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const { draft, client } = await load(restaurantId, makeTwilio);
  if (!draft.sipDomainSid || !draft.sipDomain) throw failure("Domaine SIP requis", 409);
  let reusable;
  if (credentialListSid) {
    if (!/^CL[0-9a-fA-F]{32}$/.test(credentialListSid)) throw failure("Credential List invalide");
    reusable = await client.sip.credentialLists(credentialListSid).fetch();
    if (reusable.sid !== credentialListSid || (reusable.accountSid && reusable.accountSid !== draft.accountSid)) throw failure("Credential List étrangère", 409);
  }
  const secret = password();
  const encryptedSipPassword = encryptToken(secret, String(restaurantId), secretContext(draft.accountSid));
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, sipDomainSid: draft.sipDomainSid, sipCredentialListSid: { $exists: false }, sipCredentialOperation: { $in: ["not_started", null] } }, {
    $set: { sipCredentialOperation: "pending", sipUsername: `g${restaurantId}`, encryptedSipPassword, sipSecretAvailable: false, "operationAttempts.sip": { id: attempt, startedAt: new Date() }, ...(reusable ? { sipCredentialListSid: reusable.sid } : {}) },
    $push: { audit: audit("sip_credentials_requested", actorId) },
  }, { new: true });
  if (!locked) throw failure("Configuration SIP déjà commencée : vérifiez l'état avant de reprendre", 409);
  try {
    await requireAttempt(locked._id, "sip", attempt);
    const list = reusable || await client.sip.credentialLists.create({ friendlyName: `Gusto CallSense ${restaurantId}` });
    if (!/^CL[0-9a-fA-F]{32}$/.test(list.sid || "")) throw new Error("Invalid list");
    await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialListSid: list.sid } });
    await requireAttempt(locked._id, "sip", attempt);
    const credential = await client.sip.credentialLists(list.sid).credentials.create({ username: `g${restaurantId}`, password: secret });
    if (!/^CR[0-9a-fA-F]{32}$/.test(credential.sid || "")) throw new Error("Invalid credential");
    await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialSid: credential.sid } });
    const existingMappings = await client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings.list({ limit: 100 });
    if (!existingMappings.some((item) => item.sid === list.sid)) { await requireAttempt(locked._id, "sip", attempt); await client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings.create({ credentialListSid: list.sid }); }
    const domain = await client.sip.domains(draft.sipDomainSid).fetch();
    const mappings = await client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings.list({ limit: 100 });
    if (domain.sipRegistration !== true || domain.domainName !== draft.sipDomain || !mappings.some((item) => item.sid === list.sid)) throw new Error("SIP verification failed");
    const updated = await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, {
      $set: { sipCredentialOperation: "completed", sipSecretAvailable: true }, $unset: { "operationAttempts.sip": 1 }, $push: { audit: audit("sip_credentials_created", actorId) },
    });
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: locked._id, sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialOperation: "uncertain" }, $push: { audit: audit("sip_credentials_uncertain", actorId) } }).catch(() => {});
    throw failure("Configuration SIP incertaine : vérifiez les ressources avant de reprendre", 409);
  }
}
async function reconcileSip(restaurantId, actorId, { confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const { draft, client } = await load(restaurantId, makeTwilio);
  if (draft.sipCredentialOperation !== "uncertain" || draft.encryptedNextSipPassword || !draft.encryptedSipPassword) throw failure("Aucune création SIP incertaine à rapprocher", 409);
  let listSid = draft.sipCredentialListSid;
  if (!listSid) {
    const lists = await client.sip.credentialLists.list({ limit: 1000 });
    const matching = lists.filter((item) => item.friendlyName === `Gusto CallSense ${restaurantId}`);
    if (matching.length !== 1) throw failure("Credential List introuvable ou ambiguë : vérification Twilio requise", 409);
    listSid = matching[0].sid;
  }
  const list = await client.sip.credentialLists(listSid).fetch();
  if (list.sid !== listSid || (list.accountSid && list.accountSid !== draft.accountSid)) throw failure("Credential List non conforme", 409);
  const domain = await client.sip.domains(draft.sipDomainSid).fetch();
  if (domain.domainName !== draft.sipDomain || domain.sipRegistration !== true) throw failure("Domaine ou registration SIP non conforme", 409);
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, sipCredentialOperation: "uncertain", encryptedSipPassword: draft.encryptedSipPassword }, {
    $set: { sipCredentialOperation: "pending", sipResumeAuthorized: false, "operationAttempts.sip": { id: attempt, startedAt: new Date() } }, $push: { audit: audit("sip_reconcile_requested", actorId) },
  }, { new: true });
  if (!locked) throw failure("Opération SIP déjà en cours", 409);
  try {
    const secret = decryptToken(draft.encryptedSipPassword, String(restaurantId), secretContext(draft.accountSid));
    const credentials = await client.sip.credentialLists(listSid).credentials.list({ limit: 1000 });
    const matching = credentials.filter((item) => item.username === draft.sipUsername);
    if (matching.length > 1) throw new Error("Ambiguous credential");
    if (!matching.length && !draft.sipResumeAuthorized) throw new Error("Missing credential requires explicit recovery authorization");
    const mappingApi = client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings;
    const mappings = await mappingApi.list({ limit: 100 });
    if (!mappings.some((item) => item.sid === listSid) && !draft.sipResumeAuthorized) throw new Error("Missing mapping requires explicit recovery authorization");
    await requireAttempt(locked._id, "sip", attempt);
    const credential = matching[0] || await client.sip.credentialLists(listSid).credentials.create({ username: draft.sipUsername, password: secret });
    if (!/^CR[0-9a-fA-F]{32}$/.test(credential.sid || "")) throw new Error("Invalid credential");
    await requireAttempt(locked._id, "sip", attempt);
    await client.sip.credentialLists(listSid).credentials(credential.sid).update({ password: secret });
    if (!mappings.some((item) => item.sid === listSid)) { await requireAttempt(locked._id, "sip", attempt); await mappingApi.create({ credentialListSid: listSid }); }
    const verifiedMappings = await mappingApi.list({ limit: 100 });
    if (!verifiedMappings.some((item) => item.sid === listSid)) throw new Error("Mapping not verified");
    const updated = await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, {
      $set: { sipCredentialListSid: listSid, sipCredentialSid: credential.sid, sipCredentialOperation: "completed", sipSecretAvailable: true },
      $unset: { "operationAttempts.sip": 1 },
      $push: { audit: audit("sip_reconciled", actorId) },
    });
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: locked._id, sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialOperation: "uncertain" } }).catch(() => {});
    throw failure("Réconciliation SIP incertaine", 409);
  }
}
async function revealSip(restaurantId, actorId) {
  const draft = await Draft.findOneAndUpdate({ restaurantId, sipCredentialOperation: "completed", encryptedSipPassword: { $exists: true, $nin: [null, ""] } }, {
    $push: { audit: audit("sip_secret_revealed", actorId) },
  }, { new: true }).select("+encryptedSipPassword");
  if (!draft?.encryptedSipPassword) throw failure("Mot de passe SIP indisponible ou opération SIP en cours : vérifiez la configuration", 409);
  return { username: draft.sipUsername, domain: draft.sipDomain, password: decryptToken(draft.encryptedSipPassword, String(restaurantId), secretContext(draft.accountSid)) };
}
async function rotateSip(restaurantId, actorId, { confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const { draft, client } = await load(restaurantId, makeTwilio);
  if (!draft.sipCredentialListSid || !draft.sipCredentialSid) throw failure("Identifiants SIP absents", 409);
  const next = password();
  const encryptedNextSipPassword = encryptToken(next, String(restaurantId), secretContext(draft.accountSid));
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, sipCredentialOperation: "completed" }, {
    $set: { sipCredentialOperation: "pending", encryptedNextSipPassword, sipSecretAvailable: false, "operationAttempts.sip": { id: attempt, startedAt: new Date() } }, $push: { audit: audit("sip_rotation_requested", actorId) },
  }, { new: true });
  if (!locked) throw failure("Une opération SIP est déjà en cours ou incertaine", 409);
  try {
    await requireAttempt(locked._id, "sip", attempt);
    await client.sip.credentialLists(draft.sipCredentialListSid).credentials(draft.sipCredentialSid).update({ password: next });
    const updated = await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, {
      $set: { encryptedSipPassword: encryptedNextSipPassword, sipCredentialOperation: "completed", sipSecretAvailable: true },
      $unset: { encryptedNextSipPassword: 1, "operationAttempts.sip": 1 }, $push: { audit: audit("sip_rotated", actorId) },
    });
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: locked._id, sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialOperation: "uncertain" }, $push: { audit: audit("sip_rotation_uncertain", actorId) } }).catch(() => {});
    throw failure("Rotation incertaine : le terminal peut nécessiter une nouvelle configuration", 409);
  }
}
async function recoverRotation(restaurantId, actorId, { confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const { draft, client } = await load(restaurantId, makeTwilio);
  if (!draft.encryptedNextSipPassword || !draft.sipCredentialSid || !draft.sipCredentialListSid) throw failure("Aucune rotation à reprendre", 409);
  const next = decryptToken(draft.encryptedNextSipPassword, String(restaurantId), secretContext(draft.accountSid));
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, sipCredentialOperation: "uncertain", encryptedNextSipPassword: draft.encryptedNextSipPassword }, {
    $set: { sipCredentialOperation: "pending", "operationAttempts.sip": { id: attempt, startedAt: new Date() } }, $push: { audit: audit("sip_rotation_recovery_requested", actorId) },
  }, { new: true });
  if (!locked) throw failure("Opération SIP déjà en cours", 409);
  try {
    await requireAttempt(locked._id, "sip", attempt);
    await client.sip.credentialLists(draft.sipCredentialListSid).credentials(draft.sipCredentialSid).update({ password: next });
    const updated = await updateLocked(locked._id, { sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, {
      $set: { encryptedSipPassword: draft.encryptedNextSipPassword, sipCredentialOperation: "completed", sipSecretAvailable: true },
      $unset: { encryptedNextSipPassword: 1, "operationAttempts.sip": 1 }, $push: { audit: audit("sip_rotation_recovered", actorId) },
    });
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: locked._id, sipCredentialOperation: "pending", "operationAttempts.sip.id": attempt }, { $set: { sipCredentialOperation: "uncertain" } }).catch(() => {});
    throw failure("Rotation toujours incertaine", 409);
  }
}
function isDevelopmentTunnel(hostname) {
  return process.env.NODE_ENV === "development" && /^[a-z0-9-]+-[0-9]+\.[a-z0-9-]+\.devtunnels\.ms$/i.test(hostname);
}
function webhookUrls(fallbackUrl, draft) {
  let origin, target;
  try { origin = new URL(process.env.CALLSENSE_PUBLIC_ORIGIN); target = new URL(fallbackUrl); } catch (_) { throw failure("Origine et URL de secours HTTPS requises"); }
  const developmentTunnel = isDevelopmentTunnel(origin.hostname);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || !origin.hostname.includes(".") || net.isIP(origin.hostname) || (!developmentTunnel && /(?:devtunnels\.ms|ngrok(?:\.io|\.app)?|trycloudflare\.com|localhost|\.local)$/i.test(origin.hostname))) throw failure("Origine publique stable requise");
  if (!fallback.allowedUrl(draft, target.href) || target.origin === origin.origin) throw failure("URL de secours Twilio vérifiée et distincte requise");
  return { voiceUrl: `${origin.origin}/api/callsense/voice`, voiceFallbackUrl: target.href };
}
async function configureWebhooks(restaurantId, actorId, { confirm, fallbackUrl, prepareTest = false, makeTwilio = twilio, probeFallback = fallback.probe, probeOrigin = probePublicOrigin } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const { draft, client, existing } = await load(restaurantId, makeTwilio);
  if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw failure("Régularisation réglementaire requise avant configuration des webhooks", 409);
  const urls = webhookUrls(fallbackUrl, draft);
  const probeTime = new Date(draft.fallbackProbeAt || 0).getTime();
  if (prepareTest && (existing || draft.numberOperation !== "completed" || !(draft.audit || []).some(item => item.action === "number_purchased") || draft.fallbackFunction?.operation !== "completed" || draft.fallbackFunction.url !== urls.voiceFallbackUrl)) throw failure("Préparation réservée au nouveau numéro acheté pour ce dossier", 409);
  if (!draft.phoneNumberSid || !draft.twilioNumber || draft.sipCredentialOperation !== "completed" || (!prepareTest && (draft.checklist?.fallbackTest !== true || draft.verifiedFallbackUrl !== urls.voiceFallbackUrl)) || draft.fallbackProbeUrl !== urls.voiceFallbackUrl || draft.fallbackProbeSipUri !== fallback.sipUri(draft) || !Number.isFinite(probeTime) || probeTime < Date.now() - 15 * 60 * 1000 || probeTime > Date.now()) throw failure("Numéro, identifiants SIP et test du secours avec vérification récente requis", 409);
  if (prepareTest) {
    const bundle = await require("./callsense-onboarding.service").inspectCompliance(restaurantId, { makeTwilio });
    if (bundle.bundle?.status !== "twilio-approved" || bundle.bundle?.compatible !== true) throw failure("Dossier réglementaire individuel approuvé requis", 409);
  }
  if (isDevelopmentTunnel(new URL(urls.voiceUrl).hostname)) await probeOrigin(urls.voiceUrl);
  await probeFallback(draft, urls.voiceFallbackUrl, { authToken: draft.fallbackFunction?.url === urls.voiceFallbackUrl ? decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid) : undefined });
  const number = await client.incomingPhoneNumbers(draft.phoneNumberSid).fetch();
  if (number.sid !== draft.phoneNumberSid || number.accountSid !== draft.accountSid || number.phoneNumber !== draft.twilioNumber || number.trunkSid || number.voiceApplicationSid) throw failure("Numéro ou routage Twilio incompatible", 409);
  if (prepareTest && number.bundleSid !== draft.regulatoryBundleSid) throw failure("Associez le dossier approuvé au numéro avant les essais", 409);
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, accountSid: draft.accountSid, activationOperation: { $ne: "pending" }, "testRouting.state": { $nin: ["pending", "active", "restoring", "uncertain"] }, phoneNumberSid: draft.phoneNumberSid, sipCredentialOperation: "completed", sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, ...(!prepareTest ? { verifiedFallbackUrl: urls.voiceFallbackUrl, "checklist.fallbackTest": true } : { numberOperation: "completed", audit: { $elemMatch: { action: "number_purchased" } } }), fallbackProbeUrl: urls.voiceFallbackUrl, fallbackProbeSipUri: fallback.sipUri(draft), fallbackProbeAt: draft.fallbackProbeAt, webhookOperation: { $in: ["not_started", "uncertain", "completed", null] } }, {
    $set: { webhookOperation: "pending", voiceFallbackUrl: urls.voiceFallbackUrl, "operationAttempts.webhook": { id: attempt, startedAt: new Date() } }, $push: { audit: audit("webhooks_requested", actorId) },
  }, { new: true });
  if (!locked) throw failure("Configuration webhook déjà en cours", 409);
  try {
    await requireAttempt(locked._id, "webhook", attempt);
    await client.incomingPhoneNumbers(draft.phoneNumberSid).update({ ...urls, voiceMethod: "POST", voiceFallbackMethod: "POST" });
    const verified = await client.incomingPhoneNumbers(draft.phoneNumberSid).fetch();
    if (verified.voiceUrl !== urls.voiceUrl || verified.voiceMethod !== "POST" || verified.voiceFallbackUrl !== urls.voiceFallbackUrl || verified.voiceFallbackMethod !== "POST" || verified.trunkSid || verified.voiceApplicationSid) throw new Error("Webhook verification failed");
    const updated = await updateLocked(locked._id, { webhookOperation: "pending", "operationAttempts.webhook.id": attempt }, { $set: { webhookOperation: "completed" }, $unset: { "operationAttempts.webhook": 1 }, $push: { audit: audit("webhooks_verified", actorId) } });
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: locked._id, webhookOperation: "pending", "operationAttempts.webhook.id": attempt }, { $set: { webhookOperation: "uncertain" }, $push: { audit: audit("webhooks_uncertain", actorId) } }).catch(() => {});
    throw failure("Webhooks incertains : vérifiez le numéro avant toute reprise", 409);
  }
}
// Temporary routing is limited to a number bought by this draft. Persist the
// original routing before touching Twilio, and never restore over a third-party change.
async function testFallbackRouting(restaurantId, actorId, { confirm, restore = false, makeTwilio = twilio, loadState = load, probeFallback = fallback.probe } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise", 400);
  const { draft, existing, client } = await loadState(restaurantId, makeTwilio);
  if (existing || await Config.exists({ restaurantId })) throw failure("Installation existante protégée", 409);
  if (!draft.phoneNumberSid || draft.numberOperation !== "completed" || !(draft.audit || []).some(item => item.action === "number_purchased") || draft.sipCredentialOperation !== "completed") throw failure("Numéro acheté par cet assistant et téléphone préparé requis", 409);
  const numberApi = client.incomingPhoneNumbers(draft.phoneNumberSid);
  const number = await numberApi.fetch();
  if (number.sid !== draft.phoneNumberSid || number.accountSid !== draft.accountSid || number.phoneNumber !== draft.twilioNumber || number.trunkSid || number.voiceApplicationSid) throw failure("Numéro ou routage incompatible", 409);
  const attempt = crypto.randomUUID();
  let target, previous;
  if (!restore) {
    target = draft.fallbackFunction?.url;
    if (draft.fallbackFunction?.operation !== "completed" || !target || draft.fallbackProbeUrl !== target || draft.fallbackProbeSipUri !== fallback.sipUri(draft) || !draft.fallbackProbeAt || !["GET", "POST"].includes(number.voiceMethod)) throw failure("Secours vérifié et routage restaurable requis", 409);
    await probeFallback(draft, target, { authToken: decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid) });
    previous = { voiceUrl: number.voiceUrl || "", voiceMethod: number.voiceMethod, voiceFallbackUrl: number.voiceFallbackUrl || "", voiceFallbackMethod: number.voiceFallbackMethod || "POST" };
  } else {
    target = draft.testRouting?.targetUrl; previous = draft.testRouting?.previous;
    if (!target || !previous || draft.testRouting.numberSid !== draft.phoneNumberSid || !["active", "uncertain"].includes(draft.testRouting.state)) throw failure("Aucun routage de test à restaurer", 409);
    const sameOriginal = (number.voiceUrl || "") === previous.voiceUrl && number.voiceMethod === previous.voiceMethod;
    const sameTest = number.voiceUrl === target && number.voiceMethod === "POST";
    if ((!sameOriginal && !sameTest) || (number.voiceFallbackUrl || "") !== previous.voiceFallbackUrl || (number.voiceFallbackMethod || "POST") !== previous.voiceFallbackMethod) throw failure("Routage modifié depuis le test : vérification manuelle requise", 409);
  }
  const filter = { restaurantId, accountSid: draft.accountSid, phoneNumberSid: draft.phoneNumberSid, activationOperation: { $ne: "pending" }, webhookOperation: { $nin: ["pending", "uncertain", "completed"] }, "testRouting.state": restore ? draft.testRouting.state : { $in: [null, "restored"] } };
  const locked = await Draft.findOneAndUpdate(filter, { $set: { "testRouting.state": restore ? "restoring" : "pending", "testRouting.attemptId": attempt, "testRouting.numberSid": draft.phoneNumberSid, "testRouting.targetUrl": target, "testRouting.previous": previous }, $push: { audit: audit(restore ? "fallback_test_restore_requested" : "fallback_test_routing_requested", actorId) } }, { new: true });
  if (!locked) throw failure("Routage en cours ou à vérifier", 409);
  const owner = { _id: locked._id, "testRouting.attemptId": attempt, "testRouting.state": restore ? "restoring" : "pending" };
  try {
    if (!await Draft.exists(owner) || await Config.exists({ restaurantId })) throw new Error("Operation replaced");
    const current = await numberApi.fetch();
    if (current.sid !== number.sid || current.accountSid !== number.accountSid || current.phoneNumber !== number.phoneNumber || current.trunkSid || current.voiceApplicationSid || (current.voiceUrl || "") !== (number.voiceUrl || "") || current.voiceMethod !== number.voiceMethod || (current.voiceFallbackUrl || "") !== (number.voiceFallbackUrl || "") || (current.voiceFallbackMethod || "POST") !== (number.voiceFallbackMethod || "POST")) throw new Error("Routing changed");
    if (!restore || number.voiceUrl !== previous.voiceUrl || number.voiceMethod !== previous.voiceMethod) await numberApi.update(restore ? { voiceUrl: previous.voiceUrl, voiceMethod: previous.voiceMethod } : { voiceUrl: target, voiceMethod: "POST" });
    const verified = await numberApi.fetch();
    if (verified.sid !== draft.phoneNumberSid || verified.accountSid !== draft.accountSid || verified.phoneNumber !== draft.twilioNumber || verified.trunkSid || verified.voiceApplicationSid || (verified.voiceUrl || "") !== (restore ? previous.voiceUrl : target) || verified.voiceMethod !== (restore ? previous.voiceMethod : "POST") || (verified.voiceFallbackUrl || "") !== previous.voiceFallbackUrl || (verified.voiceFallbackMethod || "POST") !== previous.voiceFallbackMethod) throw new Error("Routing verification failed");
    const updated = await Draft.findOneAndUpdate(owner, { $set: { "testRouting.state": restore ? "restored" : "active" }, $push: { audit: audit(restore ? "fallback_test_routing_restored" : "fallback_test_routing_active", actorId) } }, { new: true });
    if (!updated) throw new Error("Operation replaced");
    return { state: restore ? "restored" : "active" };
  } catch (_) {
    await Draft.updateOne(owner, { $set: { "testRouting.state": "uncertain" } }).catch(() => {});
    throw failure("Routage incertain : vérifiez le numéro et restaurez sa configuration avant toute reprise", 409);
  }
}
function probePublicOrigin(voiceUrl) {
  return new Promise((resolve, reject) => {
    const req = https.request(voiceUrl, { method: "HEAD", timeout: 5000, signal: AbortSignal.timeout(5000) }, (res) => { res.resume(); res.statusCode === 204 ? resolve() : reject(new Error("Route publique CallSense indisponible")); });
    req.on("error", reject); req.end();
  });
}
async function finalizeTechnical(restaurantId, actorId, { confirm, deployFunction = false, deployFallback = require("./callsense-serverless.service").deploy, onboarding = require("./callsense-onboarding.service"), makeTwilio = twilio, probeOrigin = probePublicOrigin, probeFallback = fallback.probe, loadState = load, configure = configureSip, configureHooks = configureWebhooks, verify = verifyPrerequisites, enterTestMode = setStatus } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  let { draft, client } = await loadState(restaurantId, makeTwilio);
  async function finish(message) {
    const current = await loadState(restaurantId, makeTwilio);
    if (!["ready_for_test", "active"].includes(current.draft.serviceStatus)) {
      await enterTestMode(restaurantId, actorId, { status: "ready_for_test", confirm: true, makeTwilio, probeFallback });
    }
    return { status: "completed", message };
  }
  if (!draft.phoneNumberSid || !draft.twilioNumber || draft.numberOperation !== "completed") throw failure("Numéro acheté et associé requis", 409);
  const resources = await onboarding.inspectResources(restaurantId, { makeTwilio, includeBundle: false });
  if (!resources.numbers.some(n => n.sid === draft.phoneNumberSid && n.phoneNumber === draft.twilioNumber)) throw failure("Numéro non retrouvé dans le sous-compte", 409);
  if (draft.domainOperation === "pending") return { status: "action_required", message: "Création SIP en cours : vérification nécessaire avant toute reprise." };
  if (draft.domainOperation === "uncertain") {
    if (resources.domainsTruncated) return { status: "action_required", message: "Liste des domaines incomplète : vérification nécessaire." };
    const matches = resources.domains.filter(d => d.domainName === sipDomain.attemptedDomainName(restaurantId, draft));
    if (matches.length !== 1 || matches[0].sipRegistration !== true) return { status: "action_required", message: matches.length ? "Domaine SIP ambigu ou incompatible : vérification nécessaire." : "Aucun domaine SIP retrouvé : vérifiez l’arrêt de la demande initiale avant toute nouvelle création." };
    await onboarding.associateDomain(restaurantId, actorId, { sid: matches[0].sid, confirm: true, makeTwilio });
    ({ draft, client } = await loadState(restaurantId, makeTwilio));
    if (draft.domainOperation !== "completed" || draft.sipDomainSid !== matches[0].sid) throw failure("Rapprochement SIP non confirmé", 409);
  }
  if (!draft.sipDomainSid) {
    if (resources.domainsTruncated) return { status: "action_required", message: "Liste des domaines incomplète : vérification nécessaire." };
    const names = [sipDomain.newDomainName(restaurantId, draft.accountSid), sipDomain.legacyDomainName(restaurantId)];
    const matches = resources.domains.filter(d => names.includes(d.domainName));
    if (matches.length > 1 || matches.some(d => !d.sipRegistration)) return { status: "action_required", message: "Domaine SIP ambigu ou incompatible : vérification nécessaire." };
    if (matches.length) await onboarding.associateDomain(restaurantId, actorId, { sid: matches[0].sid, confirm: true, makeTwilio });
    else await onboarding.createDomain(restaurantId, actorId, { confirm: true, makeTwilio });
    ({ draft, client } = await loadState(restaurantId, makeTwilio));
  } else if (!resources.domains.some(d => d.sid === draft.sipDomainSid && d.domainName === draft.sipDomain && d.sipRegistration)) return { status: "action_required", message: "Domaine SIP associé non vérifié : contrôle nécessaire." };
  if (["pending", "uncertain"].includes(draft.sipCredentialOperation)) return { status: "action_required", message: "Identifiants SIP à rapprocher après interruption." };
  if (draft.sipCredentialOperation !== "completed") {
    const lists = await client.sip.credentialLists.list({ limit: 101 });
    if (lists.length >= 101) return { status: "action_required", message: "Liste des identifiants incomplète : vérification nécessaire." };
    const matching = lists.filter(item => item.friendlyName === `Gusto CallSense ${restaurantId}` && (!item.accountSid || item.accountSid === draft.accountSid));
    if (matching.length > 1) return { status: "action_required", message: "Plusieurs listes SIP similaires : vérification nécessaire." };
    if (matching.length) {
      const entries = await client.sip.credentialLists(matching[0].sid).credentials.list({ limit: 101 });
      if (entries.length >= 101 || entries.some(entry => entry.username === `g${restaurantId}`)) return { status: "action_required", message: "Identifiant SIP existant à rapprocher avant toute modification." };
    }
    await configure(restaurantId, actorId, { confirm: true, makeTwilio, credentialListSid: matching[0]?.sid });
    ({ draft, client } = await loadState(restaurantId, makeTwilio));
  }
  if (draft.webhookOperation === "completed") {
    const urls = webhookUrls(draft.voiceFallbackUrl || draft.verifiedFallbackUrl, draft);
    await probeOrigin(urls.voiceUrl);
    await verify(draft, client, { probeFallback, requireFallbackTest: false });
    return finish("SIP, secours et webhooks vérifiés. Le mode test est disponible.");
  }
  if (["pending", "uncertain"].includes(draft.webhookOperation)) return { status: "action_required", message: "Webhooks à rapprocher après interruption." };
  if (!draft.verifiedFallbackUrl || !draft.checklist?.fallbackTest) {
    if (!deployFunction && draft.fallbackFunction?.operation !== "completed") return { status: "action_required", message: "SIP préparé. Autorisez la publication du secours Twilio ou configurez le TwiML Bin alternatif." };
    const deployed = await deployFallback(restaurantId, actorId, { confirm: true, makeTwilio });
    if (deployed.status !== "ready") return deployed;
    ({ draft, client } = await loadState(restaurantId, makeTwilio));
    if (draft.fallbackFunction?.operation !== "completed" || !draft.fallbackFunction.url) return { status: "action_required", message: "Secours publié : actualisez son état avant les essais." };
    const urls = webhookUrls(draft.fallbackFunction.url, draft);
    await probeOrigin(urls.voiceUrl);
    await configureHooks(restaurantId, actorId, { confirm: true, fallbackUrl: urls.voiceFallbackUrl, prepareTest: true, makeTwilio, probeFallback });
    return finish("Routage préparé. Connectez le téléphone et effectuez les essais réels du principal et du secours.");
  }
  const urls = webhookUrls(draft.verifiedFallbackUrl, draft);
  await probeOrigin(urls.voiceUrl);
  await configureHooks(restaurantId, actorId, { confirm: true, fallbackUrl: draft.verifiedFallbackUrl, makeTwilio, probeFallback });
  return finish("SIP et webhooks configurés et vérifiés. Le mode test est disponible.");
}
function complianceStrategy() {
  return "individual";
}
async function cloneSharedBundle(restaurantId, actorId, { onboarding = require("./callsense-onboarding.service"), makeTwilio = twilio } = {}) {
  throw failure("Le clonage du dossier réglementaire Gusto est désactivé : un dossier propre au restaurant est requis", 409);
}
async function runOnboarding(restaurantId, actorId, { confirm, maxAmount, currency, sharedCloneConsent = false, functionConsent = false, pilotPurchaseConfirmed = false, onboarding = require("./callsense-onboarding.service"), finalize = finalizeTechnical, cloneBundle = cloneSharedBundle } = {}) {
  if (confirm !== true || !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(maxAmount || "") || !/^[A-Z]{3}$/.test(currency || "")) throw failure("Confirmation et plafond mensuel avec devise requis", 400);
  // Temporary restriction for the explicitly designated CallSense pilot only.
  const pilot = String(restaurantId) === "69c69539571da19061ac7fda";
  const pilotLease = pilot ? crypto.randomUUID() : null;
  if (pilot) {
    const saved = await Draft.findOne({ restaurantId }).lean();
    if (saved?.accountSid !== "TWILIO_IDENTIFIER_REMOVED_1" || saved?.regulatoryBundleSid !== "TWILIO_IDENTIFIER_REMOVED_6" || saved?.regulatoryAddress?.sid !== "TWILIO_IDENTIFIER_REMOVED_5" || saved?.automation?.currency !== "USD" || Number(saved?.automation?.maxAmount) !== 1.5 || currency !== "USD" || Number(maxAmount) !== 1.5) throw failure("Dossier pilote ou plafond autorisé modifié : vérification nécessaire avant reprise.", 409);
  }
  const restaurant = await Restaurant.findById(restaurantId).select("name address phone email").lean();
  if (!restaurant?.name?.trim()) throw failure("Nom du restaurant requis", 400);
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && !existing.managedByOnboarding) throw failure("Installation historique protégée", 409);
  const strategy = complianceStrategy();
  if (!["shared_clone", "individual"].includes(strategy)) throw failure("Stratégie réglementaire non reconnue", 503);
  let draft = await Draft.findOneAndUpdate({ restaurantId, ...(pilot ? { accountSid: "TWILIO_IDENTIFIER_REMOVED_1", regulatoryBundleSid: "TWILIO_IDENTIFIER_REMOVED_6", "regulatoryAddress.sid": "TWILIO_IDENTIFIER_REMOVED_5", "automation.currency": "USD", "automation.maxAmount": { $in: ["1.5", "1.50"] }, $or: [{ "automation.runLeaseUntil": { $exists: false } }, { "automation.runLeaseUntil": null }, { "automation.runLeaseUntil": { $lte: new Date() } }] } : {}) }, { $setOnInsert: { restaurantId }, $set: { "automation.status": "running", "automation.phase": "informations", "automation.message": "Vérification des prérequis", "automation.maxAmount": maxAmount, "automation.currency": currency, "automation.resumeMode": "onboarding", "automation.actorId": actorId, "automation.nextAttemptAt": new Date(Date.now() + 10 * 60 * 1000), ...(pilot ? { "automation.runLeaseId": pilotLease, "automation.runLeaseUntil": new Date(Date.now() + 10 * 60 * 1000) } : {}), ...(sharedCloneConsent === true ? { "automation.sharedCloneAccepted": true } : {}), ...(functionConsent === true ? { "automation.functionAccepted": true } : {}) } }, { upsert: !existing && !pilot, new: true, setDefaultsOnInsert: true });
  if (!draft) throw failure("Dossier de préparation indisponible", 409);
  async function state(status, phase, message, expected = {}) {
    await Draft.updateOne({ restaurantId, ...expected }, { $set: { "automation.status": status, "automation.phase": phase, "automation.message": message, ...(status === "running" && phase !== "technical" ? { "automation.nextAttemptAt": new Date(Date.now() + 10 * 60 * 1000) } : {}) } });
    return { status, phase, message };
  }
  async function reload() { draft = await Draft.findOne({ restaurantId }).lean(); if (!draft) throw failure("Dossier indisponible", 409); }
  try {
    if (![restaurant.address?.line1, restaurant.address?.zipCode, restaurant.address?.city, restaurant.address?.country, restaurant.phone, restaurant.email].every(value => typeof value === "string" && value.trim())) return await state("waiting", "informations", "Complétez l’adresse, le téléphone et l’e-mail du restaurant avant de continuer.");
    if (!draft.accountSid) {
      if (["pending", "uncertain"].includes(draft.accountOperation)) return await state("waiting", "account", "Sous-compte incertain : rapprochez l’opération avant de reprendre.");
      await state("running", "account", "Vérification du sous-compte Twilio");
      const main = onboarding.mainClient();
      const friendlyName = `Gusto CallSense - ${restaurant.name.trim()}`;
      const matches = await main.client.api.accounts.list({ friendlyName, limit: 101 });
      if (matches.length >= 101 || matches.some(a => a.friendlyName === friendlyName && a.status !== "closed")) return await state("waiting", "account", "Un sous-compte similaire existe : vérifiez et associez-le avant de reprendre.");
      await onboarding.createAccount(restaurantId, actorId, { confirm: true });
      await reload();
    }
    if (!draft.regulatoryBundleSid && strategy === "shared_clone") {
      if (!draft.automation?.sharedCloneAccepted) return await state("waiting", "compliance", "Confirmez la stratégie de clonage avant de continuer.");
      if (["pending", "uncertain"].includes(draft.bundleCloneOperation)) return await state("waiting", "compliance", "Clonage incertain : vérifiez les dossiers du sous-compte avant toute reprise.");
      await state("running", "compliance", "Clonage du dossier réglementaire partagé");
      await cloneBundle(restaurantId, actorId, { onboarding });
      await reload();
    }
    if (!draft.regulatoryBundleSid) return await state("waiting", "compliance", "Renseignez un dossier de conformité approuvé pour l’utilisateur final.");
    await state("running", "compliance", "Vérification du dossier réglementaire");
    const compliance = await onboarding.inspectCompliance(restaurantId);
    if (compliance.bundle?.sid === draft.regulatoryBundleSid) {
      const recorded = await Draft.updateOne({ restaurantId, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, "regulatoryApproval.checkedAt": draft.regulatoryApproval?.checkedAt || { $exists: false } }, { $set: { regulatoryApproval: { bundleSid: draft.regulatoryBundleSid, accountSid: draft.accountSid, status: compliance.bundle.status, compatible: compliance.bundle.compatible === true, checkedAt: new Date() } } });
      if (recorded.matchedCount === 0) return { status: "running", phase: "compliance", message: "Le dossier vient d’être vérifié ; la préparation reprend selon son état enregistré." };
    }
    if (["pending-review", "in-review"].includes(compliance.bundle?.status) && compliance.bundle?.compatible === true) {
      return await state("waiting", "compliance", "Dossier transmis : vérifiez son approbation lorsque Twilio aura terminé son examen.", { "regulatoryApproval.status": compliance.bundle.status, regulatoryBundleSid: draft.regulatoryBundleSid });
    }
    if (compliance.bundle?.status !== "twilio-approved" || !compliance.bundle?.compatible) return await state("waiting", "compliance", "Dossier réglementaire non approuvé ou incompatible : vérifiez le dossier.");
    if (!draft.phoneNumberSid) {
      if (["pending", "uncertain"].includes(draft.numberOperation)) return await state("waiting", "number", "Achat incertain : rapprochez l’opération avant de reprendre.");
      if (pilot && pilotPurchaseConfirmed !== true) return await state("waiting", "number", "Reprise manuelle requise dans Gusto avant de lancer l’achat du numéro pilote.");
      await state("running", "number", "Recherche d’un numéro compatible avec le plafond");
      const quote = await onboarding.quoteNumbers(restaurantId, { numberPrefix: "+333" });
      const local = quote.prices.find(p => p.type === "local")?.amount;
      const national = quote.prices.find(p => p.type === "national")?.amount;
      if (quote.currency !== currency || local == null || national == null || String(local) !== String(national) || !/^\d+(?:\.\d{1,2})?$/.test(String(local)) || Math.round(Number(local) * 100) > Math.round(Number(maxAmount) * 100)) return await state("waiting", "number", "Tarif indisponible, ambigu ou supérieur au plafond : décision nécessaire.");
      if (pilot && quote.regulatoryAddress?.sid !== "TWILIO_IDENTIFIER_REMOVED_5") return await state("waiting", "number", "L’adresse du dossier pilote a changé : vérification nécessaire avant achat.");
      const candidates = quote.numbers.filter(n => n.numberType === "local" && /^\+333\d{8}$/.test(n.phoneNumber || "") && n.beta === false && n.capabilities?.voice === true && ["none", "any", "local"].includes(n.addressRequirements) && quote.regulatoryAddress?.sid).sort((a, b) => a.phoneNumber.localeCompare(b.phoneNumber));
      if (!candidates.length) return await state("waiting", "number", "Aucun numéro +333 compatible n’est disponible : réessayez plus tard, aucun achat n’a été lancé.");
      await onboarding.buyNumber(restaurantId, actorId, { phoneNumber: candidates[0].phoneNumber, numberType: "local", amount: String(local), currency, addressSid: quote.regulatoryAddress.sid, confirm: true });
      await reload();
    }
    await state("running", "technical", "Préparation SIP et vérification du secours");
    const result = await finalize(restaurantId, actorId, { confirm: true, deployFunction: draft.automation?.functionAccepted === true });
    if (result.status === "waiting") {
      await Draft.updateOne({ restaurantId }, { $set: { "automation.resumeMode": "technical", "automation.nextAttemptAt": new Date(Date.now() + 5000) } });
      return await state("running", "technical", "Construction Twilio en cours ; suivi automatique.");
    }
    return await state("waiting", result.status === "completed" ? "tests" : "technical", result.status === "completed" ? "Effectuez les essais téléphoniques et confirmez l’activation finale." : result.message);
  } catch (err) {
    return await state("error", "recovery", err.expose ? err.message : "Configuration interrompue : vérifiez les opérations avant de reprendre.");
  } finally {
    if (pilot) await Draft.updateOne({ restaurantId, "automation.runLeaseId": pilotLease }, { $unset: { "automation.runLeaseId": 1, "automation.runLeaseUntil": 1 } }).catch(() => {});
  }
}
async function queueTechnical(restaurantId, actorId, { confirm, functionConfirm } = {}) {
  if (confirm !== true) throw failure("Confirmation explicite requise");
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && !existing.managedByOnboarding) throw failure("Installation historique protégée", 409);
  const draft = await Draft.findOneAndUpdate({ restaurantId }, { $set: { "automation.status": "running", "automation.phase": "technical", "automation.message": "Préparation technique en cours", "automation.resumeMode": "technical", "automation.actorId": actorId, "automation.nextAttemptAt": new Date(Date.now() + 10 * 60 * 1000), ...(functionConfirm === true ? { "automation.functionAccepted": true } : {}) } }, { new: true });
  if (!draft) throw failure("Dossier de préparation indisponible", 409);
  return draft;
}
async function startTechnical(restaurantId, actorId, { confirm, functionConfirm, finalize = finalizeTechnical } = {}) {
  const draft = await queueTechnical(restaurantId, actorId, { confirm, functionConfirm });
  try {
    const result = await finalize(restaurantId, actorId, { confirm: true, deployFunction: draft.automation?.functionAccepted === true });
    const running = result.status === "waiting";
    await Draft.updateOne({ restaurantId }, { $set: { "automation.status": running ? "running" : "waiting", "automation.phase": result.status === "completed" ? "tests" : "technical", "automation.message": running ? "Construction Twilio en cours ; suivi automatique." : result.message, ...(running ? { "automation.nextAttemptAt": new Date(Date.now() + 5000) } : {}) } });
    return running ? { ...result, status: "running", message: "Construction Twilio en cours ; suivi automatique." } : result;
  } catch (err) {
    const numeric = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
    console.error("[callsense-technical]", JSON.stringify({ phase: "finalisation", status: numeric(err?.status), code: numeric(err?.code) }));
    await Draft.updateOne({ restaurantId }, { $set: { "automation.status": "error", "automation.message": err.expose ? err.message : "Configuration interrompue : vérifiez les opérations avant de reprendre." } });
    throw err;
  }
}
async function verifyPrerequisites(draft, client, { probeFallback = fallback.probe, requireFallbackTest = true } = {}) {
  if (!draft.phoneNumberSid || !draft.twilioNumber || !draft.sipDomainSid || !draft.sipDomain || !draft.sipCredentialListSid || !draft.sipCredentialSid || !draft.sipUsername || !draft.regulatoryBundleSid || draft.sipCredentialOperation !== "completed" || draft.webhookOperation !== "completed" || (requireFallbackTest && (!draft.checklist?.fallbackTest || draft.verifiedFallbackUrl !== draft.voiceFallbackUrl)) || draft.fallbackProbeUrl !== draft.voiceFallbackUrl || draft.fallbackProbeSipUri !== fallback.sipUri(draft) || !draft.fallbackProbeAt) throw failure("Configuration ou test du secours incomplet", 409);
  const urls = webhookUrls(draft.voiceFallbackUrl, draft);
  const [number, domain, mappings, credential, bundle] = await Promise.all([
    client.incomingPhoneNumbers(draft.phoneNumberSid).fetch(),
    client.sip.domains(draft.sipDomainSid).fetch(),
    client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings.list({ limit: 100 }),
    client.sip.credentialLists(draft.sipCredentialListSid).credentials(draft.sipCredentialSid).fetch(),
    client.numbers.v2.regulatoryCompliance.bundles(draft.regulatoryBundleSid).fetch(),
    probeFallback(draft, draft.voiceFallbackUrl, { authToken: draft.fallbackFunction?.url === draft.voiceFallbackUrl ? decryptToken(draft.encryptedAuthToken, String(draft.restaurantId), draft.accountSid) : undefined }),
  ]);
  if (number.accountSid !== draft.accountSid || number.sid !== draft.phoneNumberSid || number.phoneNumber !== draft.twilioNumber || number.bundleSid !== draft.regulatoryBundleSid || number.voiceUrl !== urls.voiceUrl || number.voiceMethod !== "POST" || number.voiceFallbackUrl !== urls.voiceFallbackUrl || number.voiceFallbackMethod !== "POST" || number.trunkSid || number.voiceApplicationSid) throw failure("Numéro, dossier associé ou webhooks non conformes", 409);
  if (domain.accountSid !== draft.accountSid || domain.sid !== draft.sipDomainSid || domain.domainName !== draft.sipDomain || domain.sipRegistration !== true || !mappings.some((item) => item.sid === draft.sipCredentialListSid)) throw failure("Domaine SIP ou registration non conforme", 409);
  if (credential.sid !== draft.sipCredentialSid || credential.username !== draft.sipUsername || (credential.accountSid && credential.accountSid !== draft.accountSid)) throw failure("Identifiant SIP non conforme", 409);
  if (bundle.sid !== draft.regulatoryBundleSid || bundle.status !== "twilio-approved" || (bundle.accountSid && bundle.accountSid !== draft.accountSid)) throw failure("Conformité Twilio non approuvée", 409);
}
async function setStatus(restaurantId, actorId, { status, confirm, makeTwilio = twilio, probeFallback = fallback.probe } = {}) {
  const allowed = ["preparing", "compliance_pending", "hardware_pending", "ready_for_test", "active", "incident", "suspended"];
  if (confirm !== true || !allowed.includes(status)) throw failure("État et confirmation requis");
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft) throw failure("Préparation introuvable", 404);
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && (!existing.managedByOnboarding || existing.accountSid !== draft.accountSid)) throw failure("Installation existante protégée", 409);
  if (status === "ready_for_test" && (existing?.commercial?.meteringEnabled || existing?.commercial?.meteringFrom)) throw failure("Une période commerciale existe déjà : essais à vérifier sans modifier cette installation", 409);
  let client;
  if (["ready_for_test", "active"].includes(status)) {
    if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw failure("Régularisation réglementaire requise : le dossier partagé ne peut pas être utilisé pour ce restaurant", 409);
    if (!draft.accountSid || !draft.encryptedAuthToken) throw failure("Sous-compte non configuré", 409);
    client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
  }
  const operationId = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, activationOperation: { $ne: "pending" }, sipCredentialOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" }, ...(status === "active" ? { "fallbackDrill.state": { $nin: ["running", "restoring"] } } : {}), "testRouting.state": { $nin: ["pending", "active", "restoring", "uncertain"] }, updatedAt: draft.updatedAt }, { $set: { activationOperation: "pending", activationOperationId: operationId, "operationAttempts.activation": { id: operationId, startedAt: new Date() } } }, { new: true });
  if (!locked) throw failure("Configuration modifiée ou opération en cours", 409);
  try {
  if (["ready_for_test", "active"].includes(status)) {
    if (status === "active") {
      if (draft.fallbackDrill?.state && (draft.fallbackDrill.state !== "completed" || ["http", "invalid", "timeout"].some(key => draft.fallbackDrill.results?.[key] !== true))) throw failure("Terminez les scénarios de secours et confirmez le retour normal avant activation", 409);
      if (draft.serviceStatus !== "ready_for_test" || requiredChecklistFields(draft).some(field => draft.checklist?.[field] !== true)) throw failure("Tests téléphoniques et checklist requis avant activation", 409);
    }
    await verifyPrerequisites(draft, client, { probeFallback, requireFallbackTest: status === "active" });
    if (!(await Draft.exists({ restaurantId, activationOperation: "pending", activationOperationId: operationId }))) throw failure("Opération d'activation remplacée", 409);
    const sipUri = `sip:${draft.sipUsername}@${draft.sipDomain}`;
    const values = { restaurantId, enabled: status === "active", accountSid: draft.accountSid, twilioNumber: draft.twilioNumber, phoneNumberSid: draft.phoneNumberSid,
      sipUri, sipDomain: draft.sipDomain, sipDomainSid: draft.sipDomainSid, terminalType: draft.terminalType,
      regulatoryBundleSid: draft.regulatoryBundleSid, encryptedAuthToken: draft.encryptedAuthToken, managedByOnboarding: true,
      provisioningStatus: status, ...(status === "active" ? { activatedAt: new Date() } : {}) };
    if (existing && (existing.accountSid !== draft.accountSid || existing.twilioNumber !== draft.twilioNumber)) throw failure("Configuration existante différente", 409);
    const filter = existing ? { _id: existing._id, managedByOnboarding: true, accountSid: draft.accountSid, twilioNumber: draft.twilioNumber } : { restaurantId, managedByOnboarding: true };
    const config = await Config.findOneAndUpdate(filter, { $set: values }, { new: true, upsert: !existing, runValidators: true });
    if (!config) throw failure("Configuration modifiée, réessayez", 409);
  } else if (existing) {
    if (!(await Draft.exists({ restaurantId, activationOperation: "pending", activationOperationId: operationId }))) throw failure("Opération d'activation remplacée", 409);
    const result = await Config.updateOne({ _id: existing._id, managedByOnboarding: true, accountSid: draft.accountSid }, { $set: { enabled: false, provisioningStatus: status } });
    if (!result.matchedCount) throw failure("Configuration modifiée, réessayez", 409);
  }
  const updated = await Draft.findOneAndUpdate({ restaurantId, accountSid: draft.accountSid, activationOperation: "pending", activationOperationId: operationId }, { $set: { serviceStatus: status, activationOperation: "idle" }, $unset: { activationOperationId: 1, "operationAttempts.activation": 1 }, $push: { audit: audit(`status_${status}`, actorId) } }, { new: true });
  if (!updated) throw failure("État non enregistré, vérifiez la configuration avant de reprendre", 409);
  broadcastToRestaurant(String(restaurantId), { type: "callsense_status_changed", restaurantId: String(restaurantId), enabled: status === "active" });
  return clean(updated);
  } finally {
    await Draft.updateOne({ restaurantId, activationOperation: "pending", activationOperationId: operationId }, { $set: { activationOperation: "idle" }, $unset: { activationOperationId: 1, "operationAttempts.activation": 1 } }).catch(() => {});
  }
}
module.exports = { configureSip, reconcileSip, revealSip, rotateSip, recoverRotation, configureWebhooks, testFallbackRouting, finalizeTechnical, queueTechnical, startTechnical, runOnboarding, cloneSharedBundle, complianceStrategy, webhookUrls, verifyPrerequisites, probePublicOrigin, setStatus, load, failure };
