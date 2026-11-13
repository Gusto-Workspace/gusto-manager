const twilio = require("twilio");
const crypto = require("crypto");
const { encryptToken, decryptToken } = require("./callsense-secrets.service");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { normalizePhone } = require("./callsense-core.service");
const sipDomain = require("./callsense-sip-domain.service");

function error(message, status = 400) { return Object.assign(new Error(message), { status, expose: true }); }
function mainClient() {
  const sid = process.env.CALLSENSE_TWILIO_MAIN_ACCOUNT_SID;
  const token = process.env.CALLSENSE_TWILIO_MAIN_AUTH_TOKEN;
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid || "") || !token) throw error("Identifiants du compte principal indisponibles", 503);
  return { sid, client: twilio(sid, token) };
}
function requireKey(restaurantId) {
  // Fail before creating any external resource if encryption is unavailable.
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.CALLSENSE_ENCRYPTION_KEY || "")) {
    throw error("Clé de chiffrement CallSense absente ou invalide. Configurez-la avant toute opération Twilio.", 503);
  }
  encryptToken("check", String(restaurantId), "validation");
}
async function requireAttempt(id, operation, attempt) {
  const fields = { account: "accountOperation", number: "numberOperation", domain: "domainOperation" };
  if (!(await Draft.exists({ _id: id, [fields[operation]]: "pending", [`operationAttempts.${operation}.id`]: attempt }))) throw new Error("Operation replaced");
}
function cleanBase(draft) {
  if (!draft) return null;
  if (typeof draft.toObject === "function") draft = draft.toObject();
  const { restaurantId, accountSid, accountOperation, domainOperation, sipDomain, sipDomainSid, sipCredentialListSid, sipCredentialSid, sipUsername, sipSecretAvailable, sipCredentialOperation, webhookOperation, activationOperation, operationAttempts, voiceFallbackUrl, verifiedFallbackUrl, fallbackProbeUrl, fallbackProbeSipUri, fallbackProbeAt, serviceStatus, phoneNumberSid, twilioNumber, numberOperation, pendingNumber, terminalType, forwardingScenario, regulatoryBundleSid, operator, checklist, audit, updatedAt, automation, bundleCloneOperation, fallbackFunction } = draft;
  return { forwardingScenario: forwardingScenario || "", fallbackFunction: fallbackFunction || null, testRouting: draft.testRouting?.state ? { state: draft.testRouting.state } : null, bundleCloneOperation, regulatorySubmission: draft.regulatorySubmission ? { state: draft.regulatorySubmission.state, phase: draft.regulatorySubmission.phase, bundleSid: draft.regulatorySubmission.bundleSid, evaluationStatus: draft.regulatorySubmission.evaluationStatus } : null, automation: automation || null, wizardStep: Number.isInteger(draft.wizardStep) ? draft.wizardStep : 0, restaurantId, accountSid: accountSid || "", accountOperation, domainOperation, sipDomain: sipDomain || "", sipDomainSid: sipDomainSid || "", sipCredentialListSid: sipCredentialListSid || "", sipCredentialSid: sipCredentialSid || "", sipUsername: sipUsername || "", sipSecretAvailable: Boolean(sipSecretAvailable), sipCredentialOperation, webhookOperation, activationOperation, operationStartedAt: Object.fromEntries(Object.entries(operationAttempts || {}).filter(([, value]) => value?.startedAt).map(([key, value]) => [key, value.startedAt])), voiceFallbackUrl: voiceFallbackUrl || "", verifiedFallbackUrl: verifiedFallbackUrl || "", fallbackProbeUrl: fallbackProbeUrl || "", fallbackProbeSipUri: fallbackProbeSipUri || "", fallbackProbeAt: fallbackProbeAt || null, serviceStatus: serviceStatus || "preparing", phoneNumberSid: phoneNumberSid || "", twilioNumber: twilioNumber || "", numberOperation, pendingNumber: pendingNumber || "", terminalType, regulatoryBundleSid, operator, checklist: checklist || {}, audit: audit || [], updatedAt };
}
function clean(draft) {
  const result = cleanBase(draft);
  if (!result) return null;
  const address = draft?.regulatoryAddress;
  const association = draft?.bundleAssociation;
  const approval = draft?.regulatoryApproval;
  return { ...result, fallbackDrill: draft?.fallbackDrill?.state ? { state: draft.fallbackDrill.state, scenario: draft.fallbackDrill.scenario, expiresAt: draft.fallbackDrill.expiresAt, restoredAt: draft.fallbackDrill.restoredAt, results: draft.fallbackDrill.results } : null, domainFailure: draft?.domainFailure?.phase ? { phase: draft.domainFailure.phase, status: draft.domainFailure.status, code: draft.domainFailure.code, at: draft.domainFailure.at } : null, regulatoryApproval: approval?.bundleSid && approval.bundleSid === draft?.regulatoryBundleSid && approval.accountSid === draft?.accountSid ? { bundleSid: approval.bundleSid, status: approval.status, compatible: approval.compatible, checkedAt: approval.checkedAt } : null, regulatoryAddress: address?.state ? { state: address.state, sid: address.sid } : null, bundleAssociation: association?.state ? { state: association.state } : null, regulatoryResubmission: draft?.regulatoryResubmission?.state ? { state: draft.regulatoryResubmission.state } : null };
}
async function draftClient(restaurantId, makeTwilio = twilio) {
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken) throw error("Sous-compte non configuré", 409);
  return { draft, client: makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid)) };
}
async function bundleCompliance(client, sid, accountSid) {
  if (!sid) return null;
  const api = client.numbers.v2.regulatoryCompliance;
  const bundle = await api.bundles(sid).fetch();
  if (bundle.sid !== sid || bundle.accountSid !== accountSid || !bundle.regulationSid) throw error("Vérification du dossier de conformité impossible", 503);
  const regulation = await api.regulations(bundle.regulationSid).fetch();
  return { sid: bundle.sid, status: bundle.status, numberType: regulation.numberType, compatible: regulation.isoCountry === "FR" && regulation.numberType === "local" && ["business", "individual"].includes(regulation.endUserType) };
}
function frenchNumberType(phone) {
  if (/^\+33[1-5]\d{8}$/.test(phone || "")) return "local";
  if (/^\+339\d{8}$/.test(phone || "")) return "national";
  return "unknown";
}
async function inspectCompliance(restaurantId, { makeTwilio = twilio } = {}) {
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  return { bundle: await bundleCompliance(client, draft.regulatoryBundleSid, draft.accountSid) };
}
async function evaluateIndividualBundle(restaurantId, { confirm, makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (confirm !== true) throw error("Confirmation de l’évaluation requise", 400);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw error("Dossier partagé interdit : un dossier individuel est requis", 409);
  if (!/^BU[0-9a-f]{32}$/i.test(draft.regulatoryBundleSid || "")) throw error("Dossier réglementaire individuel requis", 409);
  const api = client.numbers.v2.regulatoryCompliance;
  const bundle = await api.bundles(draft.regulatoryBundleSid).fetch();
  if (bundle.sid !== draft.regulatoryBundleSid || bundle.accountSid !== draft.accountSid || !/^RN[0-9a-f]{32}$/i.test(bundle.regulationSid || "")) throw error("Dossier ou sous-compte non conforme", 409);
  const regulation = await api.regulations(bundle.regulationSid).fetch();
  if (regulation.isoCountry !== "FR" || regulation.numberType !== "local" || !["business", "individual"].includes(regulation.endUserType)) throw error("Réglementation incompatible avec ce restaurant", 409);
  const result = await api.bundles(bundle.sid).evaluations.create();
  if (result.accountSid !== draft.accountSid || result.bundleSid !== bundle.sid || result.regulationSid !== bundle.regulationSid || !["compliant", "noncompliant"].includes(result.status) || !Array.isArray(result.results)) throw error("Résultat de l’évaluation non vérifié", 503);
  return { status: result.status, results: result.results };
}
async function regulatoryRequirements(restaurantId, { endUserType, makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (!["business", "individual"].includes(endUserType)) throw error("Type d’utilisateur final invalide", 400);
  const { client } = await getDraftClient(restaurantId, makeTwilio);
  const api = client.numbers.v2.regulatoryCompliance;
  const [regulations, endUserTypes, documentTypes] = await Promise.all([
    api.regulations.list({ isoCountry: "FR", numberType: "local", endUserType, includeConstraints: true, limit: 101, pageSize: 50 }),
    api.endUserTypes.list({ limit: 1001, pageSize: 50 }),
    api.supportingDocumentTypes.list({ limit: 1001, pageSize: 50 }),
  ]);
  const matches = regulations.filter(item => item.isoCountry === "FR" && item.numberType === "local" && item.endUserType === endUserType);
  if (regulations.length >= 101 || endUserTypes.length >= 1001 || documentTypes.length >= 1001 || matches.length !== 1 || !/^RN[0-9a-f]{32}$/i.test(matches[0].sid || "") || !matches[0].requirements || typeof matches[0].requirements !== "object") throw error("Exigences réglementaires indisponibles ou ambiguës", 503);
  const types = rows => rows.map(({ sid, friendlyName, machineName, fields }) => ({ sid, friendlyName, machineName, fields }));
  return { regulationSid: matches[0].sid, isoCountry: "FR", numberType: "local", endUserType, requirements: matches[0].requirements, endUserTypes: types(endUserTypes), supportingDocumentTypes: types(documentTypes) };
}
function validateRegulatoryFile(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 5 * 1024 * 1024) throw error("Le justificatif doit peser au maximum 5 Mo", 400);
  const signatures = {
    "application/pdf": Buffer.from("%PDF-"),
    "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  };
  const signature = signatures[mimeType];
  if (!signature || !buffer.subarray(0, signature.length).equals(signature)) throw error("Justificatif invalide : utilisez un fichier PDF, PNG ou JPEG", 400);
  return true;
}
async function uploadRegulatoryDocument({ accountSid, authToken, type, attributes, buffer, mimeType }, { request = fetch } = {}) {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid || "") || typeof authToken !== "string" || !authToken || !/^[a-z0-9_]{1,100}$/i.test(type || "") || !attributes || typeof attributes !== "object" || Array.isArray(attributes)) throw error("Paramètres du justificatif invalides", 400);
  validateRegulatoryFile(buffer, mimeType);
  const body = new FormData();
  body.append("FriendlyName", "Justificatif CallSense");
  body.append("Type", type);
  body.append("Attributes", JSON.stringify(attributes));
  body.append("File", new Blob([buffer], { type: mimeType }), mimeType === "application/pdf" ? "document.pdf" : mimeType === "image/png" ? "document.png" : "document.jpg");
  const response = await request("https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` }, body, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw error("Téléversement Twilio non confirmé : vérifiez les justificatifs avant toute reprise", 409);
  const result = await response.json();
  if (!/^RD[0-9a-f]{32}$/i.test(result.sid || "") || result.account_sid !== accountSid || result.type !== type) throw error("Réponse Twilio non confirmée : vérifiez les justificatifs avant toute reprise", 409);
  return result.sid;
}
function prepareRegulatoryDocuments(requirements, endUserType, endUserAttributes, documents) {
  const definition = requirements.requirements;
  const endUser = Array.isArray(definition?.end_user) && definition.end_user.find(item => item.type === endUserType);
  const groups = definition?.supporting_document;
  if (!endUser || !Array.isArray(endUser.fields) || !Array.isArray(groups) || !groups.length || !requirements.endUserTypes.some(item => item.machineName === endUserType)) throw error("Exigences réglementaires incomplètes", 503);
  const present = value => typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 && value.every(present) : value !== undefined && value !== null && value !== "";
  const isOptional = (spec, name) => {
    const detail = (spec.detailed_fields || []).find(item => (item.machine_name || item.machineName) === name);
    if (typeof detail?.constraint === "string" && /!=\s*null/.test(detail.constraint)) return false;
    return /\boptional\b|\bfacultatif\b/i.test(`${detail?.friendly_name || ""} ${detail?.description || ""}`);
  };
  const assertFields = (spec, values) => {
    if (!Array.isArray(spec.fields) || spec.fields.some(field => typeof field !== "string")) throw error("Champs réglementaires non reconnus", 503);
    for (const name of spec.fields) {
      if (!isOptional(spec, name) && !present(values[name])) throw error(`Champ réglementaire requis : ${name}`, 400);
      const detail = (spec.detailed_fields || []).find(item => (item.machine_name || item.machineName) === name);
      const constraint = detail?.constraint;
      if (present(values[name]) && typeof constraint === "string" && constraint.includes("=~")) {
        const pattern = constraint.match(/=~\s*'([^']+)'/)?.[1];
        if (pattern !== "^\\S+@\\S+\\.\\S+$") throw error(`Contrainte réglementaire non prise en charge : ${name}`, 503);
        if (typeof values[name] !== "string" || !/^\S+@\S+\.\S+$/.test(values[name])) throw error(`Format réglementaire invalide : ${name}`, 400);
      }
    }
  };
  assertFields(endUser, endUserAttributes);
  const types = new Map();
  for (const doc of documents) {
    const prior = types.get(doc.type);
    if (!prior) { types.set(doc.type, { ...doc, attributes: { ...doc.attributes } }); continue; }
    if (prior.buffer && doc.buffer && (!prior.buffer.equals(doc.buffer) || prior.mimeType !== doc.mimeType)) throw error(`Le type ${doc.type} doit utiliser un seul fichier identique`, 400);
    for (const [key, value] of Object.entries(doc.attributes)) {
      if (Object.hasOwn(prior.attributes, key) && JSON.stringify(prior.attributes[key]) !== JSON.stringify(value)) throw error(`Valeurs contradictoires pour ${doc.type} : ${key}`, 400);
      prior.attributes[key] = value;
    }
    if (!prior.buffer && doc.buffer) { prior.buffer = doc.buffer; prior.mimeType = doc.mimeType; }
  }
  const result = [...types.values()];
  const catalog = new Set(requirements.supportingDocumentTypes.map(item => item.machineName));
  if (!groups.every(group => Array.isArray(group) && group.length > 0 && group.length <= 10 && group.every(item => Array.isArray(item.accepted_documents)))) throw error("Exigences réglementaires non reconnues", 503);
  let invalid;
  function checkOption(option) {
    const doc = types.get(option.type);
    assertFields(option, doc.attributes);
    for (const detail of option.detailed_fields || []) {
      const name = detail.machine_name || detail.machineName;
      const expression = typeof detail.constraint === "string" ? detail.constraint : "";
      const equal = expression.match(/\[['"]([a-z0-9_]+)['"]\]\s*==\s*(?:business|individual)\[['"]([a-z0-9_]+)['"]\]/i);
      if (equal && JSON.stringify(doc.attributes[equal[1]]) !== JSON.stringify(endUserAttributes[equal[2]])) throw error(`Le champ ${name} doit correspondre à l’utilisateur final`, 400);
    }
    if (option.fields.some(name => name !== "address_sids") && !doc.buffer) throw error(`Fichier requis pour ${doc.type}`, 400);
  }
  const valid = groups.some(group => {
    const visited = new Set();
    function match(index, mask) {
      if (index === group.length) return mask === (1 << result.length) - 1;
      const key = `${index}:${mask}`;
      if (visited.has(key)) return false;
      visited.add(key);
      for (const option of group[index].accepted_documents) {
        const position = result.findIndex(doc => doc.type === option.type);
        if (position < 0 || !catalog.has(option.type)) continue;
        try { checkOption(option); } catch (err) { invalid = err; continue; }
        if (match(index + 1, mask | 1 << position)) return true;
      }
      return false;
    }
    return match(0, 0);
  });
  if (!valid) throw invalid || error("Les justificatifs ne satisfont pas les exigences Twilio", 400);
  return result;
}
// Each external mutation is preceded by a durable phase marker. A process crash
// or an ambiguous Twilio response leaves the operation locked for reconciliation.
async function submitIndividualBundle(restaurantId, actorId, { confirm, endUserType, endUserAttributes, email, documents, makeTwilio = twilio, getDraftClient = draftClient, request = fetch } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise", 400);
  const object = value => value && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
  if (!["business", "individual"].includes(endUserType) || !object(endUserAttributes) || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Array.isArray(documents) || documents.length < 1 || documents.length > 10) throw error("Données réglementaires invalides", 400);
  for (const doc of documents) {
    if (!object(doc) || !/^[a-z0-9_]{1,100}$/i.test(doc.type || "") || !object(doc.attributes)) throw error("Justificatif invalide", 400);
    if (doc.buffer !== undefined || doc.mimeType !== undefined) validateRegulatoryFile(doc.buffer, doc.mimeType);
  }
  requireKey(restaurantId);
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  if (draft.bundleCloneOperation === "completed" || (draft.regulatoryBundleSid && draft.regulatoryBundleSid !== draft.regulatorySubmission?.bundleSid)) throw error("Un dossier réglementaire est déjà associé", 409);
  const requirements = await regulatoryRequirements(restaurantId, { endUserType, makeTwilio, getDraftClient });
  documents = prepareRegulatoryDocuments(requirements, endUserType, endUserAttributes, documents);
  for (const doc of documents) {
    if (doc.attributes.address_sids !== undefined) {
      const ids = doc.attributes.address_sids;
      if (!Array.isArray(ids) || !ids.length || ids.some(sid => !/^AD[0-9a-f]{32}$/i.test(sid || ""))) throw error("Adresse réglementaire invalide", 400);
      for (const sid of ids) {
        const address = await client.addresses(sid).fetch();
        if (address.sid !== sid || address.accountSid !== draft.accountSid || address.validated !== true || address.isoCountry !== "FR") throw error("Adresse du titulaire non validée ou incompatible", 400);
      }
    }
  }
  const fingerprint = crypto.createHmac("sha256", Buffer.from(process.env.CALLSENSE_ENCRYPTION_KEY, "hex")).update(JSON.stringify({ endUserType, endUserAttributes, email, regulationSid: requirements.regulationSid, documents: documents.map(d => ({ type: d.type, attributes: d.attributes, mimeType: d.mimeType, hash: d.buffer ? crypto.createHash("sha256").update(d.buffer).digest("hex") : null })) })).digest("hex");
  const previous = draft.regulatorySubmission || {};
  if (previous.fingerprint && previous.fingerprint !== fingerprint) throw error("Les données diffèrent du dossier commencé : vérification manuelle requise", 409);
  if (previous.state === "submitted") return { status: "pending-review", bundleSid: previous.bundleSid };
  const attemptId = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, $and: [{ $or: [{ "regulatorySubmission.state": { $exists: false } }, { "regulatorySubmission.state": "waiting", "regulatorySubmission.fingerprint": fingerprint }] }, { $or: [{ regulatoryBundleSid: draft.regulatoryBundleSid || "" }, ...(draft.regulatoryBundleSid ? [] : [{ regulatoryBundleSid: { $exists: false } }])] }] }, {
    $set: { "regulatorySubmission.state": "running", "regulatorySubmission.attemptId": attemptId, "regulatorySubmission.startedAt": new Date(), "regulatorySubmission.phase": "starting", "regulatorySubmission.fingerprint": fingerprint, "regulatorySubmission.regulationSid": requirements.regulationSid },
    $push: { audit: { action: "regulatory_submission_started", actorId, at: new Date() } },
  }, { new: true });
  if (!locked) throw error("Dossier en cours ou résultat incertain : vérification manuelle requise", 409);
  const state = { ...previous, regulationSid: requirements.regulationSid, documentSids: [...(previous.documentSids || [])], assignedSids: [...(previous.assignedSids || [])] };
  const filter = { _id: draft._id, accountSid: draft.accountSid, "regulatorySubmission.state": "running", "regulatorySubmission.attemptId": attemptId };
  async function checkpoint(fields) {
    const update = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`regulatorySubmission.${key}`, value]));
    const result = await Draft.updateOne(filter, { $set: update });
    if (result.matchedCount !== 1) throw new Error("Regulatory operation replaced");
    Object.assign(state, fields);
  }
  const api = client.numbers.v2.regulatoryCompliance;
  try {
    if (!state.endUserSid) {
      await checkpoint({ phase: "end_user" });
      const user = await api.endUsers.create({ friendlyName: `CallSense ${restaurantId}`, type: endUserType, attributes: endUserAttributes });
      if (!/^IT[0-9a-f]{32}$/i.test(user.sid || "") || user.accountSid !== draft.accountSid || user.type !== endUserType) throw new Error("Unverified end user");
      await checkpoint({ endUserSid: user.sid });
    }
    for (let i = state.documentSids.length; i < documents.length; i++) {
      await checkpoint({ phase: `document_${i}` });
      let sid;
      if (documents[i].buffer) {
        const authToken = decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid);
        sid = await uploadRegulatoryDocument({ accountSid: draft.accountSid, authToken, ...documents[i] }, { request });
      } else {
        const created = await api.supportingDocuments.create({ friendlyName: `CallSense ${restaurantId}`, type: documents[i].type, attributes: documents[i].attributes });
        if (!/^RD[0-9a-f]{32}$/i.test(created.sid || "") || created.accountSid !== draft.accountSid || created.type !== documents[i].type) throw new Error("Unverified supporting document");
        sid = created.sid;
      }
      await checkpoint({ documentSids: [...state.documentSids, sid] });
    }
    if (!state.bundleSid) {
      await checkpoint({ phase: "bundle" });
      const bundle = await api.bundles.create({ friendlyName: `CallSense ${restaurantId}`, email, regulationSid: state.regulationSid });
      if (!/^BU[0-9a-f]{32}$/i.test(bundle.sid || "") || bundle.accountSid !== draft.accountSid || bundle.regulationSid !== state.regulationSid || bundle.status !== "draft") throw new Error("Unverified bundle");
      const saved = await Draft.updateOne(filter, { $set: { "regulatorySubmission.bundleSid": bundle.sid, regulatoryBundleSid: bundle.sid } });
      if (saved.matchedCount !== 1) throw new Error("Regulatory operation replaced");
      state.bundleSid = bundle.sid;
    }
    const bundle = await api.bundles(state.bundleSid).fetch();
    if (bundle.sid !== state.bundleSid || bundle.accountSid !== draft.accountSid || bundle.regulationSid !== state.regulationSid || bundle.status !== "draft") throw new Error("Bundle changed");
    for (const sid of [state.endUserSid, ...state.documentSids]) {
      if (state.assignedSids.includes(sid)) continue;
      await checkpoint({ phase: `assignment_${sid}` });
      const assignment = await api.bundles(state.bundleSid).itemAssignments.create({ objectSid: sid });
      if (assignment.accountSid !== draft.accountSid || assignment.bundleSid !== state.bundleSid || assignment.objectSid !== sid || !/^BV[0-9a-f]{32}$/i.test(assignment.sid || "")) throw new Error("Unverified assignment");
      await checkpoint({ assignedSids: [...state.assignedSids, sid] });
    }
    await checkpoint({ phase: "evaluation" });
    const evaluation = await evaluateIndividualBundle(restaurantId, { confirm: true, makeTwilio, getDraftClient });
    if (evaluation.status !== "compliant") {
      await checkpoint({ state: "waiting", phase: "noncompliant", evaluationStatus: evaluation.status });
      return { status: evaluation.status, results: evaluation.results, bundleSid: state.bundleSid };
    }
    await checkpoint({ phase: "submission", evaluationStatus: evaluation.status });
    const submitted = await api.bundles(state.bundleSid).update({ status: "pending-review" });
    if (submitted.sid !== state.bundleSid || submitted.accountSid !== draft.accountSid || submitted.regulationSid !== state.regulationSid || submitted.status !== "pending-review") throw new Error("Unverified submission");
    await checkpoint({ state: "submitted", phase: "submitted" });
    return { status: submitted.status, bundleSid: state.bundleSid };
  } catch (_) {
    await Draft.updateOne(filter, { $set: { "regulatorySubmission.state": "uncertain" }, $push: { audit: { action: "regulatory_submission_uncertain", actorId, at: new Date() } } }).catch(() => {});
    throw error("Résultat réglementaire incertain : vérifiez Twilio avant toute reprise", 409);
  }
}
async function listAddresses(restaurantId, { makeTwilio = twilio } = {}) {
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const addresses = await client.addresses.list({ limit: 101 });
  if (addresses.length >= 101) throw error("Liste des adresses incomplète : vérifiez dans Twilio", 503);
  return addresses.filter(a => a.accountSid === draft.accountSid).map(({ sid, customerName, street, city, region, postalCode, isoCountry, validated }) => ({ sid, customerName, street, city, region, postalCode, isoCountry, validated }));
}
async function rejectedBundleDetails(restaurantId, { makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  const saved = draft.regulatorySubmission;
  if (draft.bundleCloneOperation === "completed" || !saved?.bundleSid || saved.bundleSid !== draft.regulatoryBundleSid || saved.bundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw error("Dossier individuel créé par cet assistant requis", 409);
  const api = client.numbers.v2.regulatoryCompliance;
  const bundle = await api.bundles(saved.bundleSid).fetch();
  if (bundle.sid !== saved.bundleSid || bundle.accountSid !== draft.accountSid || bundle.status !== "twilio-rejected" || bundle.regulationSid !== saved.regulationSid) throw error("Dossier refusé non vérifié", 409);
  const assignments = await api.bundles(bundle.sid).itemAssignments.list({ limit: 101 });
  if (assignments.length >= 101 || assignments.some(row => row.bundleSid !== bundle.sid || row.accountSid !== draft.accountSid)) throw error("Affectations indisponibles ou incomplètes", 503);
  const ids = new Set(assignments.map(item => item.objectSid));
  if (!ids.has(saved.endUserSid) || (saved.documentSids || []).some(sid => !ids.has(sid))) throw error("Dossier modifié : vérification nécessaire", 409);
  const documents = await Promise.all((saved.documentSids || []).map(async sid => {
    const item = await api.supportingDocuments(sid).fetch();
    if (item.sid !== sid || item.accountSid !== draft.accountSid) throw error("Justificatif non vérifié", 409);
    return { sid, type: item.type, status: item.status, failureReason: typeof item.failureReason === "string" ? item.failureReason : "", errors: Array.isArray(item.errors) ? item.errors : [] };
  }));
  return { status: bundle.status, documents };
}
// Re-evaluate an existing rejected bundle after its information has been corrected.
// Never create replacement items or repeat an uncertain submission automatically.
async function resubmitRejectedBundle(restaurantId, actorId, { confirm, makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise", 400);
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw error("Dossier individuel requis", 409);
  const compliance = await bundleCompliance(client, draft.regulatoryBundleSid, draft.accountSid);
  if (draft.regulatoryResubmission?.state === "uncertain" && draft.regulatoryResubmission.bundleSid === draft.regulatoryBundleSid && compliance?.compatible && ["pending-review", "in-review", "twilio-approved"].includes(compliance.status)) {
    const reconciled = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, "regulatoryResubmission.state": "uncertain", "regulatoryResubmission.attemptId": draft.regulatoryResubmission.attemptId, "regulatoryResubmission.bundleSid": draft.regulatoryBundleSid }, { $set: { "regulatoryResubmission.state": "completed", "regulatorySubmission.state": "submitted", "regulatorySubmission.phase": "submitted" }, $push: { audit: { action: "regulatory_resubmission_reconciled", actorId, at: new Date() } } }, { new: true });
    if (!reconciled) throw error("Dossier modifié : vérifiez à nouveau", 409);
    return { status: compliance.status, bundleSid: draft.regulatoryBundleSid };
  }
  if (!compliance?.compatible || compliance.status !== "twilio-rejected") throw error("Dossier individuel refusé requis", 409);
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, "regulatoryResubmission.state": { $nin: ["pending", "uncertain"] }, "regulatorySubmission.state": { $ne: "running" } }, { $set: { "regulatoryResubmission.state": "pending", "regulatoryResubmission.attemptId": attempt, "regulatoryResubmission.bundleSid": draft.regulatoryBundleSid }, $push: { audit: { action: "regulatory_resubmission_requested", actorId, at: new Date() } } }, { new: true });
  if (!locked) throw error("Resoumission en cours ou incertaine : vérification requise", 409);
  const filter = { _id: draft._id, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, "regulatoryResubmission.state": "pending", "regulatoryResubmission.attemptId": attempt };
  try {
    const result = await evaluateIndividualBundle(restaurantId, { confirm: true, makeTwilio, getDraftClient });
    if (result.status !== "compliant") {
      const saved = await Draft.findOneAndUpdate(filter, { $set: { "regulatoryResubmission.state": "completed" } }, { new: true });
      if (!saved) throw new Error("Operation replaced");
      return { status: "noncompliant", results: result.results };
    }
    if (!await Draft.exists(filter)) throw new Error("Operation replaced");
    const submitted = await client.numbers.v2.regulatoryCompliance.bundles(draft.regulatoryBundleSid).update({ status: "pending-review" });
    if (submitted.sid !== draft.regulatoryBundleSid || submitted.accountSid !== draft.accountSid || submitted.status !== "pending-review") throw new Error("Unverified submission");
    const saved = await Draft.findOneAndUpdate(filter, { $set: { "regulatoryResubmission.state": "completed", "regulatorySubmission.state": "submitted", "regulatorySubmission.phase": "submitted" }, $push: { audit: { action: "regulatory_resubmitted", actorId, at: new Date() } } }, { new: true });
    if (!saved) throw new Error("Operation replaced");
    return { status: "pending-review", bundleSid: draft.regulatoryBundleSid };
  } catch (_) {
    await Draft.updateOne(filter, { $set: { "regulatoryResubmission.state": "uncertain" } }).catch(() => {});
    throw error("Resoumission incertaine : vérifiez le dossier avant toute reprise", 409);
  }
}
async function createRegulatoryAddress(restaurantId, actorId, { confirm, reconcile = false, customerName, street, city, postalCode, region, isoCountry, makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise", 400);
  if (![customerName, street, city, postalCode].every(value => typeof value === "string" && value.trim() && value.length <= 200) || typeof region !== "string" || region.length > 200 || !/^[A-Z]{2}$/.test(isoCountry || "")) throw error("Adresse incomplète ou invalide", 400);
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  requireKey(restaurantId);
  const values = { customerName: customerName.trim(), street: street.trim(), city: city.trim(), postalCode: postalCode.trim(), region: region.trim(), isoCountry };
  const fingerprint = crypto.createHmac("sha256", Buffer.from(process.env.CALLSENSE_ENCRYPTION_KEY, "hex")).update(JSON.stringify(values)).digest("hex");
  if (reconcile === true) {
    if (draft.regulatoryAddress?.state !== "uncertain" || draft.regulatoryAddress.fingerprint !== fingerprint) throw error("Les données ne correspondent pas à l’adresse à vérifier", 409);
    const rows = await client.addresses.list({ limit: 101 });
    if (rows.length >= 101) throw error("Liste d’adresses incomplète : vérification manuelle requise", 409);
    const matches = rows.filter(row => row.accountSid === draft.accountSid && /^AD[0-9a-f]{32}$/i.test(row.sid || "") && Object.entries(values).every(([key, value]) => String(row[key] || "").trim() === value));
    if (matches.length !== 1 || typeof matches[0].validated !== "boolean") throw error("Adresse absente ou ambiguë : vérification manuelle requise", 409);
    const saved = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, "regulatoryAddress.state": "uncertain", "regulatoryAddress.attemptId": draft.regulatoryAddress.attemptId, "regulatoryAddress.fingerprint": fingerprint }, { $set: { "regulatoryAddress.state": "completed", "regulatoryAddress.sid": matches[0].sid }, $push: { audit: { action: "regulatory_address_reconciled", actorId, at: new Date() } } }, { new: true });
    if (!saved) throw error("Adresse modifiée : vérifiez à nouveau", 409);
    return { sid: matches[0].sid, validated: matches[0].validated };
  }
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, "regulatoryAddress.state": { $nin: ["pending", "uncertain", "completed"] } }, { $set: { "regulatoryAddress.state": "pending", "regulatoryAddress.attemptId": attempt, "regulatoryAddress.fingerprint": fingerprint }, $push: { audit: { action: "regulatory_address_requested", actorId, at: new Date() } } }, { new: true });
  if (!locked) throw error("Création d’adresse en cours ou incertaine", 409);
  const filter = { _id: draft._id, accountSid: draft.accountSid, "regulatoryAddress.state": "pending", "regulatoryAddress.attemptId": attempt };
  try {
    if (!await Draft.exists(filter) || await Config.exists({ restaurantId })) throw new Error("Operation replaced");
    const address = await client.addresses.create(values);
    if (!/^AD[0-9a-f]{32}$/i.test(address.sid || "") || address.accountSid !== draft.accountSid) throw new Error("Unverified address");
    const checked = await client.addresses(address.sid).fetch();
    if (checked.sid !== address.sid || checked.accountSid !== draft.accountSid || checked.isoCountry !== isoCountry || typeof checked.validated !== "boolean") throw new Error("Unverified address");
    const saved = await Draft.findOneAndUpdate(filter, { $set: { "regulatoryAddress.state": "completed", "regulatoryAddress.sid": checked.sid }, $push: { audit: { action: "regulatory_address_created", actorId, at: new Date() } } }, { new: true });
    if (!saved) throw new Error("Operation replaced");
    return { sid: checked.sid, validated: checked.validated };
  } catch (_) {
    await Draft.updateOne(filter, { $set: { "regulatoryAddress.state": "uncertain" } }).catch(() => {});
    throw error("Création d’adresse incertaine : vérifiez le sous-compte avant toute reprise", 409);
  }
}
async function associateApprovedBundle(restaurantId, actorId, { confirm, migrateHistorical = false, makeTwilio = twilio, getDraftClient = draftClient } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise", 400);
  const { draft, client } = await getDraftClient(restaurantId, makeTwilio);
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && (existing.accountSid !== draft.accountSid || (existing.phoneNumberSid && existing.phoneNumberSid !== draft.phoneNumberSid) || existing.twilioNumber !== draft.twilioNumber)) throw error("Installation existante protégée", 409);
  if (existing && !existing.managedByOnboarding) {
    if (!migrateHistorical) throw error("Installation existante protégée", 409);
    const restaurant = await Restaurant.findById(restaurantId).select("name").lean();
    if (!restaurant?.name || restaurant.name.trim().toLowerCase().replace(/’/g, "'") === "l'atelier des saveurs") throw error("Installation historique protégée", 409);
  }
  if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw error("Dossier individuel requis", 409);
  if (!/^PN[0-9a-f]{32}$/i.test(draft.phoneNumberSid || "") || frenchNumberType(draft.twilioNumber) !== "local") throw error("Numéro local associé requis", 409);
  const bundle = await bundleCompliance(client, draft.regulatoryBundleSid, draft.accountSid);
  if (!bundle || bundle.status !== "twilio-approved" || !bundle.compatible || bundle.numberType !== frenchNumberType(draft.twilioNumber)) throw error("Dossier individuel compatible et approuvé requis", 409);
  const api = client.incomingPhoneNumbers(draft.phoneNumberSid);
  const number = await api.fetch();
  if (number.sid !== draft.phoneNumberSid || number.accountSid !== draft.accountSid || number.phoneNumber !== draft.twilioNumber) throw error("Numéro du sous-compte non vérifié", 409);
  const saveExistingBundle = async () => {
    if (!existing) return;
    const result = await Config.updateOne({ _id: existing._id, managedByOnboarding: existing.managedByOnboarding === true ? true : { $ne: true }, accountSid: draft.accountSid, ...(existing.phoneNumberSid ? { phoneNumberSid: draft.phoneNumberSid } : { phoneNumberSid: { $exists: false } }), twilioNumber: draft.twilioNumber, regulatoryBundleSid: existing.regulatoryBundleSid }, { $set: { regulatoryBundleSid: bundle.sid } });
    if (result.matchedCount !== 1) throw error("Configuration modifiée : vérifiez l’association avant reprise", 409);
  };
  if (number.bundleSid === bundle.sid) {
    await saveExistingBundle();
    if (draft.bundleAssociation?.state === "uncertain") {
      const saved = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, phoneNumberSid: draft.phoneNumberSid, regulatoryBundleSid: bundle.sid, "bundleAssociation.state": "uncertain", "bundleAssociation.bundleSid": bundle.sid, "bundleAssociation.numberSid": draft.phoneNumberSid }, { $set: { "bundleAssociation.state": "completed" }, $push: { audit: { action: "bundle_association_reconciled", actorId, at: new Date() } } }, { new: true });
      if (!saved) throw error("Association modifiée : vérifiez à nouveau", 409);
    }
    return { status: "associated", bundleSid: bundle.sid };
  }
  if (["pending", "uncertain"].includes(draft.bundleAssociation?.state)) throw error("Association incertaine : vérifiez le numéro avant toute reprise", 409);
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, phoneNumberSid: draft.phoneNumberSid, regulatoryBundleSid: bundle.sid, "bundleAssociation.state": { $nin: ["pending", "uncertain"] }, activationOperation: { $ne: "pending" }, webhookOperation: { $ne: "pending" } }, { $set: { "bundleAssociation.state": "pending", "bundleAssociation.attemptId": attempt, "bundleAssociation.bundleSid": bundle.sid, "bundleAssociation.numberSid": draft.phoneNumberSid }, $push: { audit: { action: "bundle_association_requested", actorId, at: new Date() } } }, { new: true });
  if (!locked) throw error("Association déjà en cours", 409);
  const filter = { _id: draft._id, "bundleAssociation.state": "pending", "bundleAssociation.attemptId": attempt, accountSid: draft.accountSid, phoneNumberSid: draft.phoneNumberSid, regulatoryBundleSid: bundle.sid };
  try {
    if (!await Draft.exists(filter)) throw new Error("Operation replaced");
    const current = await api.fetch();
    if (current.sid !== number.sid || current.accountSid !== number.accountSid || current.phoneNumber !== number.phoneNumber || current.bundleSid !== number.bundleSid) throw new Error("Number changed");
    await api.update({ bundleSid: bundle.sid });
    const verified = await api.fetch();
    if (verified.sid !== number.sid || verified.accountSid !== number.accountSid || verified.phoneNumber !== number.phoneNumber || verified.bundleSid !== bundle.sid) throw new Error("Association not verified");
    await saveExistingBundle();
    const saved = await Draft.findOneAndUpdate(filter, { $set: { "bundleAssociation.state": "completed" }, $push: { audit: { action: "bundle_associated", actorId, at: new Date() } } }, { new: true });
    if (!saved) throw new Error("Operation replaced");
    return { status: "associated", bundleSid: bundle.sid };
  } catch (_) {
    await Draft.updateOne(filter, { $set: { "bundleAssociation.state": "uncertain" } }).catch(() => {});
    throw error("Association incertaine : vérifiez le numéro avant toute reprise", 409);
  }
}
async function bundleLocalAddress(client, draft) {
  const api = client.numbers.v2.regulatoryCompliance;
  const assignments = await api.bundles(draft.regulatoryBundleSid).itemAssignments.list({ limit: 101 });
  if (assignments.length >= 101 || assignments.some(item => item.bundleSid && item.bundleSid !== draft.regulatoryBundleSid || item.accountSid && item.accountSid !== draft.accountSid)) throw error("Justificatifs du dossier indisponibles ou incomplets", 409);
  const ids = new Set();
  for (const item of assignments.filter(item => /^RD[0-9a-f]{32}$/i.test(item.objectSid || ""))) {
    const doc = await api.supportingDocuments(item.objectSid).fetch();
    if (doc.sid !== item.objectSid || doc.accountSid !== draft.accountSid || doc.status !== "approved") continue;
    let attributes = doc.attributes;
    if (typeof attributes === "string") { try { attributes = JSON.parse(attributes); } catch (_) { continue; } }
    const values = attributes?.address_sids;
    for (const sid of Array.isArray(values) ? values : typeof values === "string" ? [values] : []) if (/^AD[0-9a-f]{32}$/i.test(sid)) ids.add(sid);
  }
  if (ids.size !== 1) throw error("L’adresse figurant dans le dossier approuvé ne peut pas être déterminée sans ambiguïté.", 409);
  const sid = [...ids][0], address = await client.addresses(sid).fetch();
  if (!address || address.sid !== sid || address.accountSid !== draft.accountSid || address.validated !== true || address.isoCountry !== "FR") throw error("L’adresse française du dossier approuvé doit être vérifiée avant la recherche du numéro.", 409);
  return { sid, city: typeof address.city === "string" ? address.city.trim() : "" };
}
async function quoteNumbers(restaurantId, { makeTwilio = twilio, phoneNumber, numberPrefix } = {}) {
  if (numberPrefix && (!/^\+33[1-5]$/.test(numberPrefix) || phoneNumber && !phoneNumber.startsWith(numberPrefix))) throw error("Préfixe de recherche invalide", 400);
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const [pricing, bundle] = await Promise.all([
    client.pricing.v1.phoneNumbers.countries("FR").fetch(),
    bundleCompliance(client, draft.regulatoryBundleSid, draft.accountSid),
  ]);
  const address = bundle?.status === "twilio-approved" && bundle.compatible ? await bundleLocalAddress(client, draft) : null;
  const available = address ? await client.availablePhoneNumbers("FR").local.list({ voiceEnabled: true, limit: 100, ...(phoneNumber || numberPrefix ? { contains: phoneNumber || numberPrefix } : {}) }) : [];
  return { numbers: available.filter(number => (!numberPrefix || number.phoneNumber?.startsWith(numberPrefix)) && frenchNumberType(number.phoneNumber) === "local" && number.beta === false && number.capabilities?.voice === true && ["none", "any", "local"].includes(number.addressRequirements)).map(({ phoneNumber, friendlyName, locality, region, capabilities, addressRequirements, beta }) => ({ phoneNumber, friendlyName, locality, region, capabilities, addressRequirements, beta, numberType: frenchNumberType(phoneNumber) })),
    prices: (pricing.phoneNumberPrices || []).map(({ number_type, numberType, current_price, currentPrice }) => ({ type: number_type || numberType, amount: current_price ?? currentPrice })),
    currency: pricing.priceUnit || null, bundle, regulatoryAddress: address };
}
async function verifyNumber(client, sid, accountSid) {
  const number = await client.incomingPhoneNumbers(sid).fetch();
  const phone = normalizePhone(number.phoneNumber);
  if (number.sid !== sid || (number.accountSid && number.accountSid !== accountSid) || !phone || !phone.startsWith("+33") || number.capabilities?.voice !== true) throw error("Numéro non conforme ou absent du sous-compte", 400);
  return { phoneNumberSid: sid, twilioNumber: phone };
}
async function associateNumber(restaurantId, actorId, { sid, confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true || !/^PN[0-9a-fA-F]{32}$/.test(sid || "")) throw error("Numéro et confirmation requis");
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const number = await verifyNumber(client, sid, draft.accountSid);
  if (await Config.exists({ $or: [{ phoneNumberSid: sid }, { twilioNumber: number.twilioNumber }] })) throw error("Numéro déjà attribué", 409);
  if (draft.pendingNumber && draft.pendingNumber !== number.twilioNumber) throw error("Le numéro ne correspond pas à l'achat en attente", 409);
  const filter = { restaurantId, phoneNumberSid: { $exists: false }, numberOperation: { $in: ["not_started", "uncertain", "pending"] } };
  if (draft.pendingNumber) filter.pendingNumber = draft.pendingNumber;
  else { delete filter.numberOperation; filter.$or = [{ numberOperation: "not_started" }, { numberOperation: { $exists: false } }]; }
  const updated = await Draft.findOneAndUpdate(filter, {
    $set: { ...number, numberOperation: "completed" }, $unset: { pendingNumber: 1 },
    $push: { audit: { action: "number_associated", actorId, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!updated) throw error("Numéro déjà associé ou opération en cours", 409);
  return clean(updated);
}
async function buyNumber(restaurantId, actorId, { phoneNumber, numberType, amount, currency, confirm, addressSid, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw error("Confirmation explicite de l'achat requise");
  if (typeof phoneNumber !== "string" || !/^\+33\d{9}$/.test(phoneNumber)) throw error("Numéro français invalide", 400);
  if (!["local", "national"].includes(numberType) || typeof amount !== "string" || !amount || typeof currency !== "string" || !currency) throw error("Prix et type du numéro requis");
  if (frenchNumberType(phoneNumber) !== "local" || numberType !== "local") throw error("Seuls les numéros locaux français 01 à 05 sont compatibles avec ce parcours", 409);
  if (await Config.exists({ restaurantId })) throw error("Installation existante protégée", 409);
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  if (draft.bundleCloneOperation === "completed" || draft.regulatoryBundleSid === "TWILIO_IDENTIFIER_REMOVED_8") throw error("Dossier réglementaire partagé : un dossier propre au restaurant est requis avant l’achat", 409);
  const quote = await quoteNumbers(restaurantId, { makeTwilio, phoneNumber });
  if (!draft.regulatoryBundleSid || quote.bundle?.sid !== draft.regulatoryBundleSid || quote.bundle?.status !== "twilio-approved" || quote.bundle?.compatible !== true || quote.bundle?.numberType !== frenchNumberType(phoneNumber)) throw error("Dossier réglementaire approuvé et compatible requis avant achat", 409);
  const selected = quote.numbers.find((item) => item.phoneNumber === phoneNumber && item.capabilities?.voice === true);
  const price = quote.prices.find((item) => item.type === numberType);
  if (!selected || !price || String(price.amount) !== amount || quote.currency !== currency) throw error("Numéro ou prix modifié : actualisez la recherche", 409);
  if (draft.automation?.maxAmount) {
    const limit = draft.automation.maxAmount;
    if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(limit) || draft.automation.currency !== currency || !/^\d+(?:\.\d{1,2})?$/.test(amount) || Math.round(Number(amount) * 100) > Math.round(Number(limit) * 100)) throw error("Prix ou devise incompatible avec le plafond mensuel enregistré : achat bloqué.", 409);
  }
  if (selected.beta !== false) throw error("Ce numéro n’est pas disponible pour une mise en service automatique.", 409);
  if (addressSid && addressSid !== quote.regulatoryAddress.sid) throw error("L’adresse sélectionnée ne correspond pas au justificatif du dossier approuvé.", 409);
  if (selected.addressRequirements !== "none") addressSid = quote.regulatoryAddress.sid;
  if (!["none", "any", "local", "foreign"].includes(selected.addressRequirements)) throw error("Exigence d’adresse inconnue : achat bloqué", 409);
  if (selected.addressRequirements !== "none") {
    const addresses = await client.addresses.list({ limit: 101 });
    if (addresses.length >= 101) throw error("Liste des adresses incomplète : achat bloqué", 409);
    const eligible = addresses.filter(a => /^AD[0-9a-f]{32}$/i.test(a.sid || "") && a.accountSid === draft.accountSid && a.validated === true && a.isoCountry && (selected.addressRequirements !== "local" || a.isoCountry === "FR") && (selected.addressRequirements !== "foreign" || a.isoCountry !== "FR"));
    if (!eligible.length) throw error("Aucune adresse Twilio validée et compatible avec le pays requis : achat bloqué", 409);
    if (eligible.length === 1) {
      if (addressSid && addressSid !== eligible[0].sid) throw error("L’adresse sélectionnée a changé : actualisez la recherche", 409);
      addressSid = eligible[0].sid;
    } else if (!eligible.some(a => a.sid === addressSid)) throw error("Plusieurs adresses compatibles : sélectionnez celle de l’utilisateur final", 409);
    const address = await client.addresses(addressSid).fetch();
    if (address.sid !== addressSid || address.accountSid !== draft.accountSid || address.validated !== true || !address.isoCountry || selected.addressRequirements === "local" && address.isoCountry !== "FR" || selected.addressRequirements === "foreign" && address.isoCountry === "FR") throw error("Adresse Twilio non valide ou incompatible avec le numéro", 409);
  }
  // Twilio's Local search can return national numbers without a type field.
  // Never claim a particular tariff unless both possible prices coincide.
  const localPrice = quote.prices.find((item) => item.type === "local")?.amount;
  const nationalPrice = quote.prices.find((item) => item.type === "national")?.amount;
  if (localPrice == null || nationalPrice == null || String(localPrice) !== String(nationalPrice)) throw error("Tarif exact non identifiable pour ce numéro : achat manuel requis", 409);
  if (await Config.exists({ twilioNumber: phoneNumber })) throw error("Numéro déjà attribué", 409);
  const attempt = crypto.randomUUID();
  const locked = await Draft.findOneAndUpdate({ restaurantId, accountSid: draft.accountSid, regulatoryBundleSid: draft.regulatoryBundleSid, $or: [{ numberOperation: "not_started" }, { numberOperation: { $exists: false } }], phoneNumberSid: { $exists: false } }, {
    $set: { numberOperation: "pending", pendingNumber: phoneNumber, "operationAttempts.number": { id: attempt, startedAt: new Date() } },
    $push: { audit: { action: "number_purchase_requested", actorId, at: new Date() } },
  }, { new: true });
  if (!locked) throw error("Achat déjà lancé ou numéro déjà associé", 409);
  let phase = "verrou";
  try {
    await requireAttempt(locked._id, "number", attempt);
    phase = "achat_twilio";
    const created = await client.incomingPhoneNumbers.create({ phoneNumber, bundleSid: draft.regulatoryBundleSid, ...(selected.addressRequirements !== "none" ? { addressSid } : {}) });
    phase = "lecture_twilio";
    const number = await verifyNumber(client, created.sid, draft.accountSid);
    if (number.twilioNumber !== phoneNumber) throw new Error("Unexpected number");
    phase = "enregistrement_mongodb";
    const updated = await Draft.findOneAndUpdate({ _id: locked._id, numberOperation: "pending", pendingNumber: phoneNumber, "operationAttempts.number.id": attempt }, {
      $set: { ...number, numberOperation: "completed" }, $unset: { pendingNumber: 1, "operationAttempts.number": 1 },
      $push: { audit: { action: "number_purchased", actorId, at: new Date() } },
    }, { new: true, runValidators: true });
    if (!updated) throw new Error("Draft changed");
    return clean(updated);
  } catch (err) {
    const rejection = phase === "achat_twilio" && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && Number.isInteger(err?.code) ? { phoneNumber, code: err.code, status: err.status, reason: err.code === 21649 ? "Twilio exige un Bundle réglementaire compatible avec ce numéro." : err.code === 21631 ? "Twilio exige une adresse compatible avec ce numéro." : "Twilio a refusé la requête d’achat ; consulter la documentation du code retourné.", at: new Date() } : null;
    if (phase === "achat_twilio" && err?.status === 400 && [21631, 21649].includes(err?.code)) {
      const existing = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 2 }).catch(() => null);
      if (existing && existing.length === 0) {
        const reset = await Draft.updateOne({ _id: locked._id, numberOperation: "pending", "operationAttempts.number.id": attempt }, { $set: { numberOperation: "not_started", lastNumberRejection: rejection }, $unset: { pendingNumber: 1, "operationAttempts.number": 1 }, $push: { audit: { action: err.code === 21631 ? "number_purchase_rejected_address" : "number_purchase_rejected_bundle", actorId, at: new Date() } } }).catch(() => null);
        if (reset?.modifiedCount === 1) throw error(err.code === 21631 ? "Achat refusé par Twilio : l’adresse fournie est absente ou ne satisfait pas les exigences du numéro. Vérifiez l’adresse avant de réessayer." : "Achat refusé par Twilio : le dossier de conformité transmis ne satisfait pas les exigences de ce numéro. Vérifiez le dossier et contactez Twilio si le refus persiste.", 409);
      }
    }
    // Retain the uncertainty guard while keeping safe, actionable diagnostics.
    console.error("CallSense achat incertain", JSON.stringify({ phase, status: Number.isInteger(err?.status) ? err.status : null, code: Number.isInteger(err?.code) || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(err?.code) ? err.code : null }));
    await Draft.updateOne({ _id: locked._id, numberOperation: "pending", "operationAttempts.number.id": attempt }, { $set: { numberOperation: "uncertain", ...(rejection ? { lastNumberRejection: rejection } : {}) } }).catch(() => {});
    throw error("Achat incertain : vérifiez Twilio et associez le numéro avant toute reprise", 409);
  }
}
async function createAccount(restaurantId, actorId, { confirm, makeClient = mainClient } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise");
  requireKey(restaurantId);
  const { client } = makeClient();
  if (await Config.exists({ restaurantId })) throw error("Une installation existante ne peut pas être modifiée par cet assistant", 409);
  const restaurant = await Restaurant.findById(restaurantId).select("name").lean();
  if (!restaurant?.name?.trim()) throw error("Nom du restaurant requis avant la création du sous-compte", 400);
  const friendlyName = `Gusto CallSense - ${restaurant.name.trim()}`;
  const attempt = crypto.randomUUID();
  const draft = await Draft.findOneAndUpdate(
    { restaurantId, accountOperation: "not_started", accountSid: { $exists: false } },
    { $set: { accountOperation: "pending", accountRequestedName: friendlyName, "operationAttempts.account": { id: attempt, startedAt: new Date() } }, $push: { audit: { action: "account_create_requested", actorId, at: new Date() } } },
    { new: true },
  );
  if (!draft) throw error("Opération déjà lancée ou compte déjà associé : vérifiez l'état avant de continuer", 409);
  try {
    // A stable name makes a lost response discoverable, but is not treated as
    // an idempotency key: retry is blocked until an administrator reconciles.
    await requireAttempt(draft._id, "account", attempt);
    const account = await client.api.accounts.create({ friendlyName });
    if (!/^AC[0-9a-fA-F]{32}$/.test(account.sid || "") || !account.authToken) throw new Error("Incomplete Twilio response");
    const encryptedAuthToken = encryptToken(account.authToken, String(restaurantId), account.sid);
    const updated = await Draft.findOneAndUpdate({ _id: draft._id, accountOperation: "pending", "operationAttempts.account.id": attempt }, {
      $set: { accountSid: account.sid, encryptedAuthToken, accountOperation: "completed" },
      $unset: { "operationAttempts.account": 1 },
      $push: { audit: { action: "account_created", actorId, at: new Date() } },
    }, { new: true });
    if (!updated) throw new Error("Draft changed during operation");
    return clean(updated);
  } catch (_) {
    // Do not retry: Twilio may have created the subaccount before the failure.
    await Draft.updateOne({ _id: draft._id, accountOperation: "pending", "operationAttempts.account.id": attempt }, { $set: { accountOperation: "uncertain" } }).catch(() => {});
    throw error("Résultat incertain : vérifiez les sous-comptes Twilio avant toute reprise", 409);
  }
}
async function listNumbers(restaurantId, { makeTwilio = twilio } = {}) {
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken) throw error("Sous-compte non configuré", 409);
  const token = decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid);
  const numbers = await makeTwilio(draft.accountSid, token).availablePhoneNumbers("FR").local.list({ voiceEnabled: true, limit: 20 });
  return numbers.map(({ phoneNumber, friendlyName, locality, region, capabilities }) => ({ phoneNumber, friendlyName, locality, region, capabilities }));
}
async function inspectResources(restaurantId, { makeTwilio = twilio, includeBundle = true } = {}) {
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken) throw error("Sous-compte non configuré", 409);
  const client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
  const [numbers, domains, bundle] = await Promise.all([
    client.incomingPhoneNumbers.list({ limit: 101 }),
    client.sip.domains.list({ limit: 101 }),
    includeBundle && draft.regulatoryBundleSid ? client.numbers.v2.regulatoryCompliance.bundles(draft.regulatoryBundleSid).fetch() : null,
  ]);
  if (draft.phoneNumberSid && !numbers.some(number => number.sid === draft.phoneNumberSid)) {
    const assigned = await client.incomingPhoneNumbers(draft.phoneNumberSid).fetch();
    if (assigned.sid !== draft.phoneNumberSid || assigned.accountSid !== draft.accountSid || assigned.phoneNumber !== draft.twilioNumber) throw error("Numéro attribué non vérifié dans le sous-compte", 409);
    numbers.push(assigned);
  }
  return {
    numbers: numbers.map(({ sid, phoneNumber, bundleSid, voiceUrl, voiceMethod, voiceFallbackUrl, voiceFallbackMethod }) => ({ sid, phoneNumber, bundleSid, voiceUrl, voiceMethod, voiceFallbackUrl, voiceFallbackMethod })),
    domains: domains.map(({ sid, domainName, sipRegistration }) => ({ sid, domainName, sipRegistration })), domainsTruncated: domains.length >= 101,
    bundle: bundle ? { sid: bundle.sid, status: bundle.status } : null,
  };
}
async function createDomain(restaurantId, actorId, { confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true) throw error("Confirmation explicite requise");
  requireKey(restaurantId);
  if (await Config.exists({ restaurantId })) throw error("Une installation existante ne peut pas être modifiée par cet assistant", 409);
  const attempt = crypto.randomUUID();
  const draft = await Draft.findOneAndUpdate({ restaurantId, accountOperation: "completed", domainOperation: "not_started", sipDomainSid: { $exists: false } }, {
    $set: { domainOperation: "pending", "operationAttempts.domain": { id: attempt, startedAt: new Date() } },
    $push: { audit: { action: "domain_create_requested", actorId, at: new Date() } },
  }, { new: true }).select("+encryptedAuthToken");
  if (!draft) throw error("Sous-compte absent ou opération déjà lancée", 409);
  let phase = "verrou";
  try {
    const client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
    const domainName = sipDomain.newDomainName(restaurantId, draft.accountSid);
    await requireAttempt(draft._id, "domain", attempt);
    const checkpoint = await Draft.updateOne({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, { $set: { "operationAttempts.domain.domainName": domainName } });
    if (checkpoint.matchedCount !== 1) throw new Error("Domain attempt replaced");
    phase = "creation";
    const created = await client.sip.domains.create({ domainName, sipRegistration: true, friendlyName: `Gusto ${restaurantId}` });
    if (!/^SD[0-9a-fA-F]{32}$/.test(created.sid || "")) throw new Error("Invalid Twilio domain response");
    phase = "verification";
    const verified = await client.sip.domains(created.sid).fetch();
    if (verified.sid !== created.sid || verified.accountSid !== draft.accountSid || verified.domainName !== domainName || verified.sipRegistration !== true) throw new Error("Domain verification failed");
    phase = "persistance";
    const updated = await Draft.findOneAndUpdate({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, {
      $set: { sipDomain: domainName, sipDomainSid: created.sid, domainOperation: "completed" },
      $unset: { "operationAttempts.domain": 1, domainFailure: 1 },
      $push: { audit: { action: "domain_created", actorId, at: new Date() } },
    }, { new: true });
    if (!updated) throw new Error("Draft changed during operation");
    return clean(updated);
  } catch (err) {
    const code = Number.isInteger(err?.code) ? String(err.code) : ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(err?.code) ? err.code : "";
    if (phase === "creation" && err?.status === 400 && Number(err?.code) === 21232) {
      const rejected = await Draft.updateOne({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, { $set: { domainOperation: "not_started", domainFailure: { phase, status: 400, code: "21232", at: new Date() } }, $unset: { "operationAttempts.domain": 1 }, $push: { audit: { action: "domain_create_rejected", actorId, at: new Date() } } }).catch(() => null);
      if (rejected?.matchedCount === 1) throw error("Twilio a refusé le nom SIP. Une vérification est nécessaire avant de reprendre.", 409);
    }
    await Draft.updateOne({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, { $set: { domainOperation: "uncertain", domainFailure: { phase, ...(Number.isInteger(err?.status) ? { status: err.status } : {}), code, at: new Date() } } }).catch(() => {});
    throw error("Résultat SIP incertain : vérifiez les domaines Twilio avant toute reprise", 409);
  }
}
async function associateDomain(restaurantId, actorId, { sid, confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true || !/^SD[0-9a-fA-F]{32}$/.test(sid || "")) throw error("Domaine et confirmation requis");
  if (await Config.exists({ $or: [{ restaurantId }, { sipDomainSid: sid }] })) throw error("Domaine ou installation déjà utilisé", 409);
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const domain = await client.sip.domains(sid).fetch();
  if (domain.sid !== sid || domain.accountSid !== draft.accountSid || domain.sipRegistration !== true || !/^[a-z0-9-]+\.sip\.twilio\.com$/i.test(domain.domainName || "")) throw error("Domaine ou SIP Registration non valide", 400);
  if (["pending", "uncertain"].includes(draft.domainOperation) && domain.domainName !== sipDomain.attemptedDomainName(restaurantId, draft)) throw error("Le domaine ne correspond pas à la création en attente", 409);
  const updated = await Draft.findOneAndUpdate({ restaurantId, accountSid: draft.accountSid, sipDomainSid: { $exists: false }, ...(draft.domainOperation === "uncertain" && draft.operationAttempts?.domain?.id ? { "operationAttempts.domain.id": draft.operationAttempts.domain.id } : {}), $or: [{ domainOperation: { $in: ["not_started", "pending", "uncertain"] } }, { domainOperation: { $exists: false } }] }, {
    $set: { sipDomain: domain.domainName, sipDomainSid: sid, domainOperation: "completed" },
    $unset: { "operationAttempts.domain": 1, domainFailure: 1 },
    $push: { audit: { action: "domain_associated", actorId, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!updated) throw error("Domaine déjà associé ou configuration modifiée", 409);
  return clean(updated);
}
async function associateAccount(restaurantId, actorId, { sid, confirm, makeClient = mainClient, makeTwilio = twilio } = {}) {
  if (confirm !== true || !/^AC[0-9a-fA-F]{32}$/.test(sid || "")) throw error("Compte et confirmation requis");
  requireKey(restaurantId);
  if (await Config.exists({ $or: [{ restaurantId }, { accountSid: sid }] })) throw error("Compte ou installation déjà utilisé", 409);
  const main = makeClient();
  const account = await main.client.api.accounts(sid).fetch();
  if (sid === main.sid || account.ownerAccountSid !== main.sid || account.status !== "active") throw error("Ce compte n'est pas un sous-compte actif du compte principal", 400);
  const token = account.authToken;
  if (!token) throw error("Twilio n'a pas fourni le jeton : association automatique indisponible", 409);
  const verified = await makeTwilio(sid, token).api.accounts(sid).fetch();
  if (verified.sid !== sid) throw error("Identifiants du sous-compte invalides", 400);
  const encryptedAuthToken = encryptToken(token, String(restaurantId), sid);
  const draft = await Draft.findOneAndUpdate({ restaurantId, accountSid: { $exists: false }, accountOperation: { $in: ["not_started", "uncertain"] } }, {
    $set: { accountSid: sid, encryptedAuthToken, accountOperation: "completed" },
    $push: { audit: { action: "account_associated", actorId, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!draft) throw error("Un compte est déjà associé", 409);
  return clean(draft);
}
module.exports = { clean, draftClient, createAccount, associateAccount, listNumbers, quoteNumbers, associateNumber, buyNumber, inspectResources, inspectCompliance, evaluateIndividualBundle, regulatoryRequirements, validateRegulatoryFile, uploadRegulatoryDocument, submitIndividualBundle, rejectedBundleDetails, resubmitRejectedBundle, listAddresses, createRegulatoryAddress, associateApprovedBundle, createDomain, associateDomain, mainClient };
