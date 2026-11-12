const crypto = require("crypto");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const onboarding = require("./callsense-onboarding.service");
const provisioning = require("./callsense-provisioning.service");

const fields = { account: "accountOperation", number: "numberOperation", domain: "domainOperation", sip: "sipCredentialOperation", webhook: "webhookOperation", activation: "activationOperation" };
const ACK = "JE CONFIRME LA VERIFICATION";
const RESET_ACK = "JE CONFIRME ABSENCE ET ARRET";
function fail(message, status = 400) { return Object.assign(new Error(message), { status, expose: true }); }
async function inspect(restaurantId, actorId, operation, { getMain = onboarding.mainClient, getClient = onboarding.draftClient, now = () => new Date() } = {}) {
  const field = fields[operation];
  if (!field) throw fail("Opération inconnue");
  const draft = await Draft.findOne({ restaurantId }).lean();
  if (!draft || !["pending", "uncertain"].includes(draft[field])) throw fail("Aucune opération interrompue ou incertaine", 409);
  const config = await Config.findOne({ restaurantId }).lean();
  if (config && !config.managedByOnboarding) throw fail("Installation historique protégée", 409);
  let evidence = "unknown", resources = [];
  let verificationUnavailable = false;
  try {
  if (operation === "account") {
    const { sid, client } = getMain();
    const requestedName = draft.accountRequestedName || `Gusto CallSense ${restaurantId}`;
    const accounts = await client.api.accounts.list({ friendlyName: requestedName, limit: 1001 });
    const matches = accounts.filter((account) => account.friendlyName === requestedName && account.ownerAccountSid === sid && account.status !== "closed");
    resources = matches.map(({ sid: accountSid, friendlyName, status }) => ({ sid: accountSid, name: friendlyName, status }));
    evidence = matches.length === 1 && !draft.accountRequestedName ? "found" : matches.length ? "ambiguous" : accounts.length < 1001 ? "absent" : "unknown";
  } else if (operation === "activation") {
    resources = config ? [{ status: config.provisioningStatus, enabled: Boolean(config.enabled), managed: Boolean(config.managedByOnboarding) }] : [];
    evidence = config ? "found" : "absent";
  } else {
    const context = await getClient(restaurantId);
    if (context.draft?.accountSid !== draft.accountSid) throw fail("Le sous-compte a changé pendant la vérification", 409);
    const { client } = context;
    if (operation === "domain") {
      const domains = await client.sip.domains.list({ limit: 1001 });
      const matches = domains.filter((domain) => domain.domainName === `gusto-${restaurantId}.sip.twilio.com`);
      resources = matches.map(({ sid, domainName, sipRegistration }) => ({ sid, name: domainName, sipRegistration }));
      evidence = matches.length === 1 ? "found" : matches.length > 1 ? "ambiguous" : domains.length < 1001 ? "absent" : "unknown";
    } else if (operation === "number") {
      if (!draft.pendingNumber) throw fail("Numéro de l'achat incertain indisponible", 409);
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: draft.pendingNumber, limit: 100 });
      const matches = numbers.filter((number) => number.phoneNumber === draft.pendingNumber && number.accountSid === draft.accountSid);
      resources = matches.map(({ sid, phoneNumber }) => ({ sid, phoneNumber }));
      evidence = matches.length === 1 ? "found" : matches.length > 1 ? "ambiguous" : numbers.length < 100 ? "absent" : "unknown";
    } else if (operation === "sip") {
      const lists = draft.sipCredentialListSid ? [await client.sip.credentialLists(draft.sipCredentialListSid).fetch()] : await client.sip.credentialLists.list({ limit: 1001 });
      const matches = lists.filter((item) => draft.sipCredentialListSid ? item.sid === draft.sipCredentialListSid : item.friendlyName === `Gusto CallSense ${restaurantId}`);
      resources = matches.map(({ sid, friendlyName }) => ({ sid, name: friendlyName }));
      evidence = matches.length === 1 ? "found" : matches.length > 1 ? "ambiguous" : lists.length < 1001 ? "absent" : "unknown";
      if (matches.length === 1) {
        const credentials = await client.sip.credentialLists(matches[0].sid).credentials.list({ limit: 1001 });
        resources[0].credentials = credentials.filter((entry) => entry.username === draft.sipUsername).map(({ sid, username }) => ({ sid, username }));
        const mappings = await client.sip.domains(draft.sipDomainSid).auth.registrations.credentialListMappings.list({ limit: 100 });
        resources[0].mapped = mappings.some((item) => item.sid === matches[0].sid);
        evidence = resources[0].credentials.length > 1 ? "ambiguous" : resources[0].credentials.length === 1 && resources[0].mapped ? "found" : "partial";
      }
    } else if (operation === "webhook") {
      if (!draft.phoneNumberSid) throw fail("Numéro absent", 409);
      const number = await client.incomingPhoneNumbers(draft.phoneNumberSid).fetch();
      if (number.accountSid !== draft.accountSid || number.phoneNumber !== draft.twilioNumber) throw fail("Numéro non conforme", 409);
      const urls = provisioning.webhookUrls(draft.voiceFallbackUrl, draft);
      resources = [{ sid: number.sid, voiceUrl: number.voiceUrl, voiceMethod: number.voiceMethod, fallbackUrl: number.voiceFallbackUrl, fallbackMethod: number.voiceFallbackMethod }];
      evidence = number.voiceUrl === urls.voiceUrl && number.voiceMethod === "POST" && number.voiceFallbackUrl === urls.voiceFallbackUrl && number.voiceFallbackMethod === "POST" && !number.trunkSid && !number.voiceApplicationSid ? "found" : "different";
    }
  }
  } catch (_) {
    // No remote absence can be inferred from a timeout, missing credentials or
    // incomplete identifiers. The administrator may only unlock to an
    // uncertain state; reset/retry remains forbidden until a fresh inspection.
    evidence = "unknown";
    resources = [];
    verificationUnavailable = true;
  }
  const attempt = draft.operationAttempts?.[operation];
  const previous = draft.recoveryInspection;
  const sameLegacy = previous?.operation === operation && previous?.state === draft[field] && !attempt?.id && !previous?.attemptId;
  const startedAt = attempt?.startedAt || (sameLegacy ? previous.attemptStartedAt : draft.updatedAt);
  const id = crypto.randomUUID();
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(resources)).digest("hex");
  const snapshot = { id, operation, state: draft[field], attemptId: attempt?.id || "", attemptStartedAt: startedAt, evidence, fingerprint, checkedAt: now() };
  const details = `résultat=${evidence}; références=${resources.map((item) => item.sid).filter(Boolean).join(",").slice(0, 350)}`;
  const updated = await Draft.findOneAndUpdate({ restaurantId, [field]: draft[field], updatedAt: draft.updatedAt }, { $set: { recoveryInspection: snapshot }, $push: { audit: { action: `recovery_inspected_${operation}`, actorId, at: now(), details } } }, { new: true });
  if (!updated) throw fail("La préparation a changé pendant la vérification", 409);
  return { id, operation, state: snapshot.state, evidence, resources, checkedAt: snapshot.checkedAt, startedAt: snapshot.attemptStartedAt,
    notice: verificationUnavailable ? "Vérification Twilio indisponible : aucun résultat ni aucune absence ne peut être confirmé." : "Une absence dans la liste Twilio ne prouve pas qu'une requête encore en cours ne créera pas la ressource." };
}
async function unlock(restaurantId, actorId, { inspectionId, operation, acknowledgement, resetAbsent = false, now = () => new Date(), getMain = onboarding.mainClient, getClient = onboarding.draftClient }) {
  const field = fields[operation];
  if (!field || !inspectionId || acknowledgement !== (resetAbsent ? RESET_ACK : ACK)) throw fail("Confirmation de sécurité invalide");
  let draft = await Draft.findOne({ restaurantId }).lean();
  const config = await Config.findOne({ restaurantId }).lean();
  if (config && !config.managedByOnboarding) throw fail("Installation historique protégée", 409);
  if (config?.enabled && resetAbsent) throw fail("Suspendez le service avant de réinitialiser une étape", 409);
  let inspected = draft?.recoveryInspection;
  let currentAttempt = draft?.operationAttempts?.[operation]?.id || "";
  const checkedAge = now() - new Date(inspected?.checkedAt);
  const attemptAge = now() - new Date(inspected?.attemptStartedAt);
  if (!draft || inspected?.id !== inspectionId || inspected.operation !== operation || inspected.state !== draft[field] || (inspected.attemptId || "") !== currentAttempt || !Number.isFinite(checkedAge) || checkedAge < 0 || checkedAge > 5 * 60 * 1000) throw fail("Vérification expirée ou configuration modifiée", 409);
  if ((draft[field] === "pending" || resetAbsent) && (!inspected.attemptStartedAt || !Number.isFinite(attemptAge) || attemptAge < 120000)) throw fail("Opération potentiellement en cours : attendez puis vérifiez à nouveau", 409);
  const partialSip = operation === "sip" && inspected.evidence === "partial";
  if (resetAbsent && (!(inspected.evidence === "absent" || partialSip) || !["account", "number", "domain", "sip"].includes(operation))) throw fail("L'absence de ressource n'est pas établie", 409);
  if (resetAbsent && operation === "sip" && !partialSip && (draft.sipCredentialListSid || draft.sipCredentialSid)) throw fail("Une ressource SIP existe déjà : utilisez le rapprochement", 409);
  if (resetAbsent) {
    // A previous empty listing is not enough: re-check after the administrator
    // confirms, then fence the exact attempt observed by this fresh inspection.
    const originalAttempt = currentAttempt;
    const originalEvidence = inspected.evidence;
    const originalFingerprint = inspected.fingerprint;
    const fresh = await inspect(restaurantId, actorId, operation, { getMain, getClient, now });
    if (fresh.evidence !== originalEvidence || fresh.state !== inspected.state) throw fail("La situation Twilio a changé : vérifiez à nouveau", 409);
    draft = await Draft.findOne({ restaurantId }).lean();
    inspected = draft?.recoveryInspection;
    currentAttempt = draft?.operationAttempts?.[operation]?.id || "";
    if (!inspected || inspected.id !== fresh.id || inspected.fingerprint !== originalFingerprint || (inspected.attemptId || "") !== currentAttempt || currentAttempt !== originalAttempt) throw fail("La préparation a changé : vérifiez à nouveau", 409);
    const currentConfig = await Config.findOne({ restaurantId }).lean();
    if (currentConfig?.enabled || (currentConfig && !currentConfig.managedByOnboarding)) throw fail("Installation active ou historique protégée", 409);
    inspectionId = fresh.id;
  }
  const next = operation === "activation" ? "idle" : resetAbsent && !partialSip ? "not_started" : "uncertain";
  const query = { restaurantId, [field]: inspected.state, "recoveryInspection.id": inspectionId };
  if (partialSip && resetAbsent) query.encryptedNextSipPassword = null;
  if (currentAttempt) query[`operationAttempts.${operation}.id`] = currentAttempt;
  else query[`operationAttempts.${operation}.id`] = { $in: [null, ""] };
  const unset = { recoveryInspection: 1, [`operationAttempts.${operation}`]: 1 };
  const values = { [field]: next };
  if (partialSip && resetAbsent) values.sipResumeAuthorized = true;
  if (operation === "activation") {
    unset.activationOperationId = 1;
    if (config) {
      const enabledStates = ["ready_for_test", "active"];
      const validStates = [...enabledStates, "preparing", "compliance_pending", "hardware_pending", "incident", "suspended"];
      if (!validStates.includes(config.provisioningStatus) || Boolean(config.enabled) !== enabledStates.includes(config.provisioningStatus)) throw fail("Configuration et statut incohérents : vérification nécessaire", 409);
      values.serviceStatus = config.provisioningStatus;
    } else if (["ready_for_test", "active"].includes(draft.serviceStatus)) values.serviceStatus = "preparing";
  }
  if (resetAbsent && operation === "number") unset.pendingNumber = 1;
  if (resetAbsent && operation === "sip" && !partialSip) { unset.encryptedSipPassword = 1; unset.sipUsername = 1; }
  const updated = await Draft.findOneAndUpdate(query, { $set: values, $unset: unset, $push: { audit: { action: `recovery_${resetAbsent ? "reset" : "unlock"}_${operation}`, actorId, at: now(), details: `état=${inspected.state}; résultat=${inspected.evidence}` } } }, { new: true });
  if (!updated) throw fail("L'opération a changé, vérifiez à nouveau", 409);
  return onboarding.clean(updated);
}
module.exports = { inspect, unlock, ACK, RESET_ACK };
