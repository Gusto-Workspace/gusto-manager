const twilio = require("twilio");
const crypto = require("crypto");
const { encryptToken, decryptToken } = require("./callsense-secrets.service");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { normalizePhone } = require("./callsense-core.service");

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
function clean(draft) {
  if (!draft) return null;
  if (typeof draft.toObject === "function") draft = draft.toObject();
  const { restaurantId, accountSid, accountOperation, domainOperation, sipDomain, sipDomainSid, sipCredentialListSid, sipCredentialSid, sipUsername, sipSecretAvailable, sipCredentialOperation, webhookOperation, activationOperation, operationAttempts, voiceFallbackUrl, verifiedFallbackUrl, fallbackProbeUrl, fallbackProbeSipUri, fallbackProbeAt, serviceStatus, phoneNumberSid, twilioNumber, numberOperation, pendingNumber, terminalType, regulatoryBundleSid, operator, checklist, audit, updatedAt, automation, bundleCloneOperation, fallbackFunction } = draft;
  return { fallbackFunction: fallbackFunction || null, bundleCloneOperation, automation: automation || null, wizardStep: Number.isInteger(draft.wizardStep) ? draft.wizardStep : 0, restaurantId, accountSid: accountSid || "", accountOperation, domainOperation, sipDomain: sipDomain || "", sipDomainSid: sipDomainSid || "", sipCredentialListSid: sipCredentialListSid || "", sipCredentialSid: sipCredentialSid || "", sipUsername: sipUsername || "", sipSecretAvailable: Boolean(sipSecretAvailable), sipCredentialOperation, webhookOperation, activationOperation, operationStartedAt: Object.fromEntries(Object.entries(operationAttempts || {}).filter(([, value]) => value?.startedAt).map(([key, value]) => [key, value.startedAt])), voiceFallbackUrl: voiceFallbackUrl || "", verifiedFallbackUrl: verifiedFallbackUrl || "", fallbackProbeUrl: fallbackProbeUrl || "", fallbackProbeSipUri: fallbackProbeSipUri || "", fallbackProbeAt: fallbackProbeAt || null, serviceStatus: serviceStatus || "preparing", phoneNumberSid: phoneNumberSid || "", twilioNumber: twilioNumber || "", numberOperation, pendingNumber: pendingNumber || "", terminalType, regulatoryBundleSid, operator, checklist: checklist || {}, audit: audit || [], updatedAt };
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
async function listAddresses(restaurantId, { makeTwilio = twilio } = {}) {
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const addresses = await client.addresses.list({ limit: 101 });
  if (addresses.length >= 101) throw error("Liste des adresses incomplète : vérifiez dans Twilio", 503);
  return addresses.filter(a => a.accountSid === draft.accountSid).map(({ sid, customerName, street, city, region, postalCode, isoCountry, validated }) => ({ sid, customerName, street, city, region, postalCode, isoCountry, validated }));
}
async function quoteNumbers(restaurantId, { makeTwilio = twilio, phoneNumber } = {}) {
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const [available, pricing, bundle] = await Promise.all([
    client.availablePhoneNumbers("FR").local.list({ voiceEnabled: true, limit: 20, ...(phoneNumber ? { contains: phoneNumber } : {}) }),
    client.pricing.v1.phoneNumbers.countries("FR").fetch(),
    bundleCompliance(client, draft.regulatoryBundleSid, draft.accountSid),
  ]);
  return { numbers: available.map(({ phoneNumber, friendlyName, locality, region, capabilities, addressRequirements, beta }) => ({ phoneNumber, friendlyName, locality, region, capabilities, addressRequirements, beta, numberType: frenchNumberType(phoneNumber) })),
    prices: (pricing.phoneNumberPrices || []).map(({ number_type, numberType, current_price, currentPrice }) => ({ type: number_type || numberType, amount: current_price ?? currentPrice })),
    currency: pricing.priceUnit || null, bundle };
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
  const quote = await quoteNumbers(restaurantId, { makeTwilio, phoneNumber });
  const selected = quote.numbers.find((item) => item.phoneNumber === phoneNumber && item.capabilities?.voice === true);
  const price = quote.prices.find((item) => item.type === numberType);
  if (!selected || !price || String(price.amount) !== amount || quote.currency !== currency) throw error("Numéro ou prix modifié : actualisez la recherche", 409);
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
  if (!draft.regulatoryBundleSid || quote.bundle?.sid !== draft.regulatoryBundleSid || quote.bundle?.status !== "twilio-approved" || quote.bundle?.compatible !== true || quote.bundle?.numberType !== frenchNumberType(phoneNumber)) throw error("Bundle Twilio approuvé et compatible avec un numéro local français requis avant achat", 409);
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
    if (phase === "achat_twilio" && err?.status === 400 && [21631, 21649].includes(err?.code)) {
      const existing = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 2 }).catch(() => null);
      if (existing && existing.length === 0) {
        const reset = await Draft.updateOne({ _id: locked._id, numberOperation: "pending", "operationAttempts.number.id": attempt }, { $set: { numberOperation: "not_started" }, $unset: { pendingNumber: 1, "operationAttempts.number": 1 }, $push: { audit: { action: err.code === 21631 ? "number_purchase_rejected_address" : "number_purchase_rejected_bundle", actorId, at: new Date() } } }).catch(() => null);
        if (reset?.modifiedCount === 1) throw error(err.code === 21631 ? "Achat refusé par Twilio : l’adresse fournie est absente ou ne satisfait pas les exigences du numéro. Vérifiez l’adresse avant de réessayer." : "Achat refusé par Twilio : le dossier de conformité ne satisfait pas les exigences du numéro.", 409);
      }
    }
    // Retain the uncertainty guard while keeping safe, actionable diagnostics.
    console.error("CallSense achat incertain", JSON.stringify({ phase, status: Number.isInteger(err?.status) ? err.status : null, code: Number.isInteger(err?.code) || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(err?.code) ? err.code : null }));
    await Draft.updateOne({ _id: locked._id, numberOperation: "pending", "operationAttempts.number.id": attempt }, { $set: { numberOperation: "uncertain" } }).catch(() => {});
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
async function inspectResources(restaurantId, { makeTwilio = twilio } = {}) {
  const draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken) throw error("Sous-compte non configuré", 409);
  const client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
  const [numbers, domains, bundle] = await Promise.all([
    client.incomingPhoneNumbers.list({ limit: 100 }),
    client.sip.domains.list({ limit: 101 }),
    draft.regulatoryBundleSid ? client.numbers.v2.regulatoryCompliance.bundles(draft.regulatoryBundleSid).fetch() : null,
  ]);
  return {
    numbers: numbers.map(({ sid, phoneNumber, voiceUrl, voiceMethod, voiceFallbackUrl, voiceFallbackMethod }) => ({ sid, phoneNumber, voiceUrl, voiceMethod, voiceFallbackUrl, voiceFallbackMethod })),
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
  try {
    const client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
    const domainName = `gusto-${restaurantId}.sip.twilio.com`;
    await requireAttempt(draft._id, "domain", attempt);
    const created = await client.sip.domains.create({ domainName, sipRegistration: true, friendlyName: `Gusto ${restaurantId}` });
    if (!/^SD[0-9a-fA-F]{32}$/.test(created.sid || "")) throw new Error("Invalid Twilio domain response");
    const verified = await client.sip.domains(created.sid).fetch();
    if (verified.domainName !== domainName || verified.sipRegistration !== true) throw new Error("Domain verification failed");
    const updated = await Draft.findOneAndUpdate({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, {
      $set: { sipDomain: domainName, sipDomainSid: created.sid, domainOperation: "completed" },
      $unset: { "operationAttempts.domain": 1 },
      $push: { audit: { action: "domain_created", actorId, at: new Date() } },
    }, { new: true });
    if (!updated) throw new Error("Draft changed during operation");
    return clean(updated);
  } catch (_) {
    await Draft.updateOne({ _id: draft._id, domainOperation: "pending", "operationAttempts.domain.id": attempt }, { $set: { domainOperation: "uncertain" } }).catch(() => {});
    throw error("Résultat SIP incertain : vérifiez les domaines Twilio avant toute reprise", 409);
  }
}
async function associateDomain(restaurantId, actorId, { sid, confirm, makeTwilio = twilio } = {}) {
  if (confirm !== true || !/^SD[0-9a-fA-F]{32}$/.test(sid || "")) throw error("Domaine et confirmation requis");
  if (await Config.exists({ $or: [{ restaurantId }, { sipDomainSid: sid }] })) throw error("Domaine ou installation déjà utilisé", 409);
  const { draft, client } = await draftClient(restaurantId, makeTwilio);
  const domain = await client.sip.domains(sid).fetch();
  if (domain.sid !== sid || (domain.accountSid && domain.accountSid !== draft.accountSid) || domain.sipRegistration !== true || !/^[a-z0-9-]+\.sip\.twilio\.com$/i.test(domain.domainName || "")) throw error("Domaine ou SIP Registration non valide", 400);
  if (["pending", "uncertain"].includes(draft.domainOperation) && domain.domainName !== `gusto-${restaurantId}.sip.twilio.com`) throw error("Le domaine ne correspond pas à la création en attente", 409);
  const updated = await Draft.findOneAndUpdate({ restaurantId, accountSid: draft.accountSid, sipDomainSid: { $exists: false }, $or: [{ domainOperation: { $in: ["not_started", "pending", "uncertain"] } }, { domainOperation: { $exists: false } }] }, {
    $set: { sipDomain: domain.domainName, sipDomainSid: sid, domainOperation: "completed" },
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
module.exports = { clean, draftClient, createAccount, associateAccount, listNumbers, quoteNumbers, associateNumber, buyNumber, inspectResources, inspectCompliance, listAddresses, createDomain, associateDomain, mainClient };
