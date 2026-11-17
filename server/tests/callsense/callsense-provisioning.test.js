const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const { encryptToken } = require("../../services/callsense/callsense-secrets.service");
const service = require("../../services/callsense/callsense-provisioning.service");
const { requiredChecklistFields } = require("../../services/callsense/callsense-checklist.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ac = `AC${"a".repeat(32)}`, cl = `CL${"b".repeat(32)}`, cr = `CR${"c".repeat(32)}`, sd = `SD${"d".repeat(32)}`, pn = `PN${"e".repeat(32)}`;
process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);
process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.gusto.example";

test("applicabilité : Linphone direct, HT813 et scénarios inconnus conservent les garde-fous", () => {
  const direct = requiredChecklistFields({ terminalType: "softphone", forwardingScenario: "direct" });
  assert.ok(!direct.includes("outgoingTest") && !direct.includes("emergencyTest") && !direct.includes("operatorForwarding"));
  assert.ok(direct.includes("fallbackHttpFailures"));
  for (const draft of [{ terminalType: "HT813", forwardingScenario: "forward" }, { terminalType: "softphone", forwardingScenario: "forward" }, {}]) {
    const required = requiredChecklistFields(draft);
    for (const field of ["outgoingTest", "emergencyTest", "operatorForwarding", "fallbackHttpFailures"]) assert.ok(required.includes(field));
    assert.equal(required.every(field => Object.fromEntries(required.map(key => [key, true]))[field]), true);
  }
});

function harness(restaurantId = A) {
  const state = { _id: restaurantId, restaurantId, accountSid: ac, encryptedAuthToken: encryptToken("private", restaurantId, ac), sipDomainSid: sd, sipDomain: `gusto-${restaurantId}.sip.twilio.com`, sipCredentialOperation: "not_started", webhookOperation: "not_started", phoneNumberSid: pn, twilioNumber: "+33123456789" };
  const originals = { find: Draft.findOne, findUpdate: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Draft.exists, config: Config.findOne };
  Draft.findOne = () => ({ select: () => ({ lean: async () => ({ ...state }) }) });
  Config.findOne = () => ({ lean: async () => null });
  const match = (filter) => {
    if (filter.restaurantId && filter.restaurantId !== state.restaurantId) return false;
    if (filter._id && filter._id !== state._id) return false;
    if (filter.sipCredentialListSid?.$exists === false && state.sipCredentialListSid) return false;
    if (typeof filter.sipCredentialOperation === "string" && state.sipCredentialOperation !== filter.sipCredentialOperation) return false;
    if (filter.sipCredentialOperation?.$in && !filter.sipCredentialOperation.$in.includes(state.sipCredentialOperation)) return false;
    if (filter.webhookOperation === "pending" && state.webhookOperation !== "pending") return false;
    if (filter.sipSecretAvailable === true && !state.sipSecretAvailable) return false;
    for (const key of ["operationAttempts.sip.id", "operationAttempts.webhook.id", "activationOperationId"]) {
      if (Object.hasOwn(filter, key)) {
        const actual = key.split(".").reduce((value, part) => value?.[part], state);
        if (actual !== filter[key]) return false;
      }
    }
    return true;
  };
  const setPath = (key, value) => { const parts = key.split("."); let target = state; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts.at(-1)] = value; };
  const unsetPath = (key) => { const parts = key.split("."); const target = parts.slice(0, -1).reduce((value, part) => value?.[part], state); if (target) delete target[parts.at(-1)]; };
  const mutate = (filter, update) => {
    if (!match(filter)) return null;
    for (const [key, value] of Object.entries(update.$set || {})) setPath(key, value);
    for (const key of Object.keys(update.$unset || {})) unsetPath(key);
    return structuredClone(state);
  };
  Draft.findOneAndUpdate = (filter, update) => {
    const result = mutate(filter, update);
    const promise = Promise.resolve(result);
    promise.select = () => promise;
    return promise;
  };
  Draft.updateOne = async (filter, update) => mutate(filter, update);
  Draft.exists = async (filter) => match(filter);
  const restore = () => { Draft.findOne = originals.find; Draft.findOneAndUpdate = originals.findUpdate; Draft.updateOne = originals.update; Draft.exists = originals.exists; Config.findOne = originals.config; };
  return { state, restore };
}

test("le dossier partagé du pilote ne permet ni mise en test ni activation", async () => {
  const { state, restore } = harness();
  state.regulatoryBundleSid = `BU${"f".repeat(32)}`;
  let twilioCalls = 0;
  try {
    for (const status of ["ready_for_test", "active"]) await assert.rejects(service.setStatus(A, "admin", { status, confirm: true, makeTwilio: () => { twilioCalls++; } }), /Régularisation réglementaire/);
    assert.equal(twilioCalls, 0);
  } finally { restore(); }
});

test("création SIP, association à la registration et rotation sans fuite", async () => {
  const { state, restore } = harness();
  let mapping, createPassword, rotatedPassword;
  const credentials = () => ({ update: async ({ password }) => { rotatedPassword = password; } });
  credentials.create = async ({ username, password }) => { assert.equal(username, `g${A}`); createPassword = password; return { sid: cr }; };
  const lists = () => ({ credentials });
  lists.create = async () => ({ sid: cl });
  const mappings = { create: async ({ credentialListSid }) => { mapping = credentialListSid; }, list: async () => [{ sid: mapping }] };
  const domains = () => ({ auth: { registrations: { credentialListMappings: mappings } }, fetch: async () => ({ domainName: state.sipDomain, sipRegistration: true }) });
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: lists, domains } });
  try {
    const result = await service.configureSip(A, "admin", { confirm: true, makeTwilio });
    assert.equal(result.sipCredentialOperation, "completed"); assert.equal(mapping, cl);
    assert.ok(createPassword.length >= 12); assert.ok(!JSON.stringify(result).includes(createPassword));
    const exposed = await service.revealSip(A, "admin"); assert.equal(exposed.password, createPassword);
    state.sipSecretAvailable = false; // Ancienne consultation « une seule fois » déjà consommée.
    assert.equal((await service.revealSip(A, "admin")).password, createPassword);
    await service.rotateSip(A, "admin", { confirm: true, makeTwilio });
    assert.notEqual(rotatedPassword, createPassword);
    assert.equal((await service.revealSip(A, "admin")).password, rotatedPassword);
    await assert.rejects(service.configureSip(B, "admin", { confirm: true, makeTwilio }));
  } finally { restore(); }
});

test("webhook et secours sont configurés et relus sur le bon numéro", async () => {
  const { state, restore } = harness();
  state.sipCredentialOperation = "completed";
  state.checklist = { fallbackTest: true };
  let updated = {};
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, incomingPhoneNumbers: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, phoneNumber: state.twilioNumber, ...updated }), update: async (value) => { updated = value; } }) });
  const fallbackUrl = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  state.verifiedFallbackUrl = fallbackUrl;
  Object.assign(state, { sipUsername: `g${A}`, fallbackProbeUrl: fallbackUrl, fallbackProbeSipUri: `sip:g${A}@${state.sipDomain}`, fallbackProbeAt: new Date() });
  try {
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl, makeTwilio }));
    state.checklist.fallbackTest = false;
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio }), /test du secours/);
    assert.deepEqual(updated, {});
    state.checklist.fallbackTest = true;
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl: `https://handler.twilio.com/twiml/EH${"b".repeat(32)}`, confirm: true, makeTwilio }), /test du secours/);
    state.fallbackProbeAt = new Date(Date.now() - 16 * 60 * 1000);
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio }), /vérification récente/);
    state.fallbackProbeAt = new Date();
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio, probeFallback: async () => { throw new Error("secours inaccessible"); } }), /secours inaccessible/);
    assert.deepEqual(updated, {});
    const result = await service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(result.webhookOperation, "completed");
    assert.equal(updated.voiceUrl, "https://api.gusto.example/api/callsense/voice");
    assert.equal(updated.voiceFallbackUrl, fallbackUrl); assert.equal(updated.voiceMethod, "POST");
    assert.throws(() => service.webhookUrls("https://api.gusto.example/fallback"));
  } finally { restore(); }
});

test("tunnel VS Code autorisé seulement en développement et sous HTTPS", () => {
  const before = { origin: process.env.CALLSENSE_PUBLIC_ORIGIN, env: process.env.NODE_ENV };
  const url = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  try {
    process.env.CALLSENSE_PUBLIC_ORIGIN = "https://example-8012.uks1.devtunnels.ms";
    process.env.NODE_ENV = "development";
    assert.equal(service.webhookUrls(url).voiceUrl, `${process.env.CALLSENSE_PUBLIC_ORIGIN}/api/callsense/voice`);
    for (const env of ["production", "test", ""]) { process.env.NODE_ENV = env; assert.throws(() => service.webhookUrls(url), /Origine publique stable/); }
    process.env.NODE_ENV = "development";
    for (const origin of ["http://example-8012.uks1.devtunnels.ms", "https://evil.devtunnels.ms", "https://example.ngrok.app", "https://127.0.0.1"]) {
      process.env.CALLSENSE_PUBLIC_ORIGIN = origin;
      assert.throws(() => service.webhookUrls(url), /Origine publique stable/);
    }
  } finally {
    if (before.origin === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = before.origin;
    if (before.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.env;
  }
});

test("un tunnel inaccessible bloque la modification des webhooks", async () => {
  const { state, restore } = harness();
  const oldOrigin = process.env.CALLSENSE_PUBLIC_ORIGIN, oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://example-8012.uks1.devtunnels.ms";
  const fallbackUrl = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  Object.assign(state, { sipCredentialOperation: "completed", sipUsername: `g${A}`, checklist: { fallbackTest: true }, verifiedFallbackUrl: fallbackUrl, fallbackProbeUrl: fallbackUrl, fallbackProbeSipUri: `sip:g${A}@${state.sipDomain}`, fallbackProbeAt: new Date() });
  let writes = 0;
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, incomingPhoneNumbers: () => ({ update: async () => { writes++; } }) });
  try {
    await assert.rejects(service.configureWebhooks(A, "admin", { confirm: true, fallbackUrl, makeTwilio, probeOrigin: async () => { throw new Error("Tunnel inaccessible"); } }), /Tunnel inaccessible/);
    assert.equal(writes, 0); assert.equal(state.webhookOperation, "not_started");
  } finally {
    restore(); process.env.CALLSENSE_PUBLIC_ORIGIN = oldOrigin;
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
  }
});

test("routage principal et secours prêts pour les essais sans validation téléphonique inventée", async () => {
  const { state, restore } = harness();
  const bu = `BU${"f".repeat(32)}`, rn = `RN${"1".repeat(32)}`;
  const url = "https://gusto-test.twil.io/callsense-fallback";
  const uri = `sip:g${A}@${state.sipDomain}`;
  Object.assign(state, { sipCredentialOperation: "completed", sipUsername: `g${A}`, numberOperation: "completed", regulatoryBundleSid: bu, regulatorySubmission: { bundleSid: bu }, audit: [{ action: "number_purchased" }], fallbackFunction: { operation: "completed", url, sipUri: uri }, fallbackProbeUrl: url, fallbackProbeSipUri: uri, fallbackProbeAt: new Date(), checklist: { fallbackTest: false } });
  let updated = {};
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, incomingPhoneNumbers: sid => ({ fetch: async () => ({ sid, accountSid: ac, phoneNumber: state.twilioNumber, bundleSid: bu, ...updated }), update: async value => { updated = value; } }), numbers: { v2: { regulatoryCompliance: { bundles: sid => ({ fetch: async () => ({ sid, accountSid: ac, regulationSid: rn, status: "twilio-approved" }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } });
  try {
    const result = await service.configureWebhooks(A, "admin", { confirm: true, prepareTest: true, fallbackUrl: url, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(result.webhookOperation, "completed"); assert.equal(updated.voiceFallbackUrl, url);
    assert.equal(state.checklist.fallbackTest, false); assert.equal(state.verifiedFallbackUrl, undefined);
  } finally { restore(); }
});

test("simulation intégrée : finalisation réelle puis mode test et activation après recette", async () => {
  const { state, restore } = harness();
  const oldConfigUpdate = Config.findOneAndUpdate, oldConfigFind = Config.findOne;
  const bu = `BU${"f".repeat(32)}`, rn = `RN${"1".repeat(32)}`;
  const url = "https://gusto-test.twil.io/callsense-fallback", username = `g${A}`;
  const uri = `sip:${username}@${state.sipDomain}`;
  Object.assign(state, { numberOperation: "completed", sipCredentialOperation: "completed", sipCredentialListSid: cl, sipCredentialSid: cr, sipUsername: username, regulatoryBundleSid: bu, regulatorySubmission: { bundleSid: bu }, audit: [{ action: "number_purchased" }], checklist: {}, forwardingScenario: "direct", terminalType: "softphone", serviceStatus: "preparing" });
  let live = null, number = { sid: pn, accountSid: ac, phoneNumber: state.twilioNumber, bundleSid: bu }, updates = 0, deployments = 0;
  Config.findOne = () => ({ lean: async () => live && structuredClone(live) });
  Config.findOneAndUpdate = async (_filter, update) => { live = { _id: "live", ...live, ...update.$set }; return structuredClone(live); };
  const incomingPhoneNumbers = sid => ({ fetch: async () => ({ ...number, sid }), update: async changes => { updates++; Object.assign(number, changes); } });
  incomingPhoneNumbers.list = async () => [{ ...number }];
  const domains = sid => ({ fetch: async () => ({ sid, accountSid: ac, domainName: state.sipDomain, sipRegistration: true }), auth: { registrations: { credentialListMappings: { list: async () => [{ sid: cl }] } } } });
  domains.list = async () => [{ sid: sd, domainName: state.sipDomain, sipRegistration: true }];
  const client = { api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, incomingPhoneNumbers, sip: { domains, credentialLists: () => ({ credentials: sid => ({ fetch: async () => ({ sid, accountSid: ac, username }) }) }) }, numbers: { v2: { regulatoryCompliance: { bundles: sid => ({ fetch: async () => ({ sid, accountSid: ac, regulationSid: rn, status: "twilio-approved" }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } };
  const makeTwilio = () => client;
  const options = { confirm: true, deployFunction: true, makeTwilio, probeOrigin: async () => {}, probeFallback: async () => ({}), deployFallback: async () => { deployments++; Object.assign(state, { fallbackFunction: { operation: "completed", url, sipUri: uri }, fallbackProbeUrl: url, fallbackProbeSipUri: uri, fallbackProbeAt: new Date() }); return { status: "ready" }; } };
  try {
    const prepared = await service.finalizeTechnical(A, "admin", options);
    assert.equal(prepared.status, "completed"); assert.equal(state.webhookOperation, "completed");
    assert.notEqual(state.checklist.fallbackTest, true); assert.equal(updates, 1);
    assert.equal(state.serviceStatus, "ready_for_test"); assert.equal(live.enabled, false); assert.equal(live.provisioningStatus, "ready_for_test");
    const resumed = await service.finalizeTechnical(A, "admin", options);
    assert.equal(resumed.status, "completed"); assert.equal(deployments, 1); assert.equal(updates, 1);
    assert.equal(live.provisioningStatus, "ready_for_test"); assert.equal(live.enabled, false); assert.notEqual(state.checklist.fallbackTest, true);
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    const fields = ["terminalConnected", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
    state.checklist = Object.fromEntries(fields.map(field => [field, true])); state.verifiedFallbackUrl = url;
    state.checklist.outgoingTest = false; state.checklist.emergencyTest = false; state.checklist.fallbackHttpFailures = false;
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    state.checklist.fallbackHttpFailures = true; state.terminalType = "HT813";
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    state.checklist.outgoingTest = true;
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    state.checklist.outgoingTest = false; state.terminalType = "softphone";
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: false, makeTwilio }), /confirmation/i);
    state.fallbackDrill = { state: "running", results: {} };
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /scénarios|cours/);
    state.fallbackDrill = { state: "restoring", results: {} };
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /scénarios|cours/);
    state.fallbackDrill = { state: "completed", results: { http: true, invalid: true, timeout: false } };
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /scénarios/);
    state.fallbackDrill.results.timeout = true;
    await service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(live.provisioningStatus, "active"); assert.equal(live.enabled, true); assert.equal(state.checklist.outgoingTest, false); assert.equal(state.checklist.emergencyTest, false);
    Object.assign(state, { serviceStatus: "ready_for_test", terminalType: "HT813", forwardingScenario: "forward" });
    Object.assign(live, { provisioningStatus: "ready_for_test", enabled: false });
    Object.assign(state.checklist, { outgoingTest: true, emergencyTest: true, operatorForwarding: true });
    await service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(live.provisioningStatus, "active"); assert.equal(live.terminalType, "HT813");
  } finally { Config.findOneAndUpdate = oldConfigUpdate; Config.findOne = oldConfigFind; restore(); }
});

test("activation bloquée avant recette, route de test vérifiée et installation historique protégée", async () => {
  const { state, restore } = harness();
  const originalConfigUpdate = Config.findOneAndUpdate;
  const bu = `BU${"f".repeat(32)}`;
  const fallback = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  Object.assign(state, { sipCredentialOperation: "completed", webhookOperation: "completed", sipCredentialListSid: cl, sipCredentialSid: cr, sipUsername: `g${A}`, regulatoryBundleSid: bu, regulatorySubmission: { bundleSid: bu }, voiceFallbackUrl: fallback, verifiedFallbackUrl: fallback, fallbackProbeUrl: fallback, fallbackProbeSipUri: `sip:g${A}@${state.sipDomain}`, fallbackProbeAt: new Date(), serviceStatus: "preparing", terminalType: "softphone", checklist: { fallbackTest: true } });
  let saved;
  Config.findOneAndUpdate = async (_filter, update) => { saved = update.$set; return saved; };
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) },
    incomingPhoneNumbers: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, phoneNumber: state.twilioNumber, bundleSid: bu, voiceUrl: "https://api.gusto.example/api/callsense/voice", voiceMethod: "POST", voiceFallbackUrl: fallback, voiceFallbackMethod: "POST" }) }),
    sip: { domains: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, domainName: state.sipDomain, sipRegistration: true }), auth: { registrations: { credentialListMappings: { list: async () => [{ sid: cl }] } } } }), credentialLists: () => ({ credentials: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, username: state.sipUsername }) }) }) },
    numbers: { v2: { regulatoryCompliance: { bundles: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, status: "twilio-approved" }) }) } } },
  });
  try {
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio }), /checklist/);
    assert.equal(saved, undefined);
    state.checklist.fallbackTest = false; delete state.verifiedFallbackUrl;
    const ready = await service.setStatus(A, "admin", { status: "ready_for_test", confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(ready.serviceStatus, "ready_for_test"); assert.equal(saved.enabled, false); assert.equal(saved.managedByOnboarding, true);
    assert.equal(state.checklist.fallbackTest, false);
    state.verifiedFallbackUrl = fallback;
    const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "missedTest"];
    state.checklist = Object.fromEntries(fields.map((field) => [field, true]));
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    for (const field of ["fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures"]) state.checklist[field] = true;
    state.checklist.operatorForwarding = false; state.forwardingScenario = "forward";
    await assert.rejects(service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) }), /checklist/);
    state.forwardingScenario = "direct";
    await service.setStatus(A, "admin", { status: "active", confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(saved.provisioningStatus, "active");
    Config.findOne = () => ({ lean: async () => ({ managedByOnboarding: false, accountSid: ac }) });
    await assert.rejects(service.setStatus(A, "admin", { status: "suspended", confirm: true, makeTwilio }), /existante protégée/);
  } finally { Config.findOneAndUpdate = originalConfigUpdate; restore(); }
});

test("rotation incertaine reprend le même secret sans le divulguer", async () => {
  const { state, restore } = harness();
  Object.assign(state, { sipCredentialOperation: "completed", sipCredentialListSid: cl, sipCredentialSid: cr });
  const attempted = [];
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: () => ({ credentials: () => ({ update: async ({ password }) => { attempted.push(password); if (attempted.length === 1) throw new Error("timeout"); } }) }) } });
  try {
    await assert.rejects(service.rotateSip(A, "admin", { confirm: true, makeTwilio }), /incertaine/);
    assert.equal(state.sipCredentialOperation, "uncertain");
    const result = await service.recoverRotation(A, "admin", { confirm: true, makeTwilio });
    assert.equal(result.sipCredentialOperation, "completed"); assert.equal(attempted[0], attempted[1]);
    assert.ok(!JSON.stringify(result).includes(attempted[0]));
  } finally { restore(); }
});

test("reprise d'une création SIP incertaine ne recrée aucune ressource", async () => {
  const { state, restore } = harness();
  Object.assign(state, { sipCredentialOperation: "uncertain", sipCredentialListSid: cl, sipUsername: `g${A}`, encryptedSipPassword: encryptToken("saved-secret", A, `${ac}:sip`) });
  let updatePassword;
  const credentials = () => ({ update: async ({ password }) => { updatePassword = password; } });
  credentials.list = async () => [{ sid: cr, username: state.sipUsername }];
  const lists = () => ({ credentials, fetch: async () => ({ sid: cl, accountSid: ac }) });
  const domains = () => ({ fetch: async () => ({ domainName: state.sipDomain, sipRegistration: true }), auth: { registrations: { credentialListMappings: { list: async () => [{ sid: cl }] } } } });
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: lists, domains } });
  try {
    const result = await service.reconcileSip(A, "admin", { confirm: true, makeTwilio });
    assert.equal(result.sipCredentialOperation, "completed"); assert.equal(result.sipCredentialSid, cr);
    assert.equal(updatePassword, "saved-secret"); assert.ok(!JSON.stringify(result).includes("saved-secret"));
  } finally { restore(); }
});

test("webhook incertain relu et repris sur le même numéro", async () => {
  const { state, restore } = harness();
  state.sipCredentialOperation = "completed";
  state.checklist = { fallbackTest: true };
  let saved = {}, attempt = 0;
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, incomingPhoneNumbers: (sid) => ({ fetch: async () => ({ sid, accountSid: ac, phoneNumber: state.twilioNumber, ...saved }), update: async (value) => { saved = value; if (++attempt === 1) throw new Error("timeout"); } }) });
  const fallbackUrl = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  state.verifiedFallbackUrl = fallbackUrl;
  Object.assign(state, { sipUsername: `g${A}`, fallbackProbeUrl: fallbackUrl, fallbackProbeSipUri: `sip:g${A}@${state.sipDomain}`, fallbackProbeAt: new Date() });
  try {
    await assert.rejects(service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio, probeFallback: async () => ({}) }), /incertains/);
    assert.equal(state.webhookOperation, "uncertain");
    const result = await service.configureWebhooks(A, "admin", { fallbackUrl, confirm: true, makeTwilio, probeFallback: async () => ({}) });
    assert.equal(result.webhookOperation, "completed"); assert.equal(attempt, 2);
  } finally { restore(); }
});

test("réutilisation d'une liste SIP déjà associée sans recréation", async () => {
  const { state, restore } = harness();
  let newLists = 0, newMappings = 0;
  const credentials = () => ({});
  credentials.create = async () => ({ sid: cr });
  const lists = () => ({ fetch: async () => ({ sid: cl, accountSid: ac }), credentials });
  lists.create = async () => { newLists++; return { sid: cl }; };
  const mappings = { list: async () => [{ sid: cl }], create: async () => { newMappings++; } };
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: lists, domains: () => ({ auth: { registrations: { credentialListMappings: mappings } }, fetch: async () => ({ domainName: state.sipDomain, sipRegistration: true }) }) } });
  try {
    const result = await service.configureSip(A, "admin", { confirm: true, credentialListSid: cl, makeTwilio });
    assert.equal(result.sipCredentialListSid, cl); assert.equal(newLists, 0); assert.equal(newMappings, 0);
  } finally { restore(); }
});

test("une ancienne opération SIP ne poursuit pas après remplacement de son identifiant", async () => {
  const { state, restore } = harness();
  let release; let credentialsCreated = 0;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const waiting = new Promise((resolve) => { release = resolve; });
  const lists = () => ({ credentials: { create: async () => { credentialsCreated++; return { sid: cr }; } } });
  lists.create = async () => { notifyStarted(); await waiting; return { sid: cl }; };
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: lists } });
  try {
    const operation = service.configureSip(A, "admin", { confirm: true, makeTwilio });
    await started;
    state.operationAttempts.sip.id = "replacement-attempt";
    release();
    await assert.rejects(operation, /incertaine/);
    assert.equal(credentialsCreated, 0);
    assert.equal(state.sipCredentialOperation, "pending");
    assert.equal(state.operationAttempts.sip.id, "replacement-attempt");
  } finally { restore(); }
});

test("une ressource SIP manquante ne se recrée qu'après autorisation de reprise", async () => {
  const { state, restore } = harness();
  Object.assign(state, { sipCredentialOperation: "uncertain", sipCredentialListSid: cl, sipUsername: `g${A}`, encryptedSipPassword: encryptToken("saved-secret", A, `${ac}:sip`) });
  let creates = 0, mapped = false;
  const credentials = () => ({ update: async () => {} });
  credentials.list = async () => [];
  credentials.create = async () => { creates++; return { sid: cr }; };
  const lists = () => ({ fetch: async () => ({ sid: cl, accountSid: ac }), credentials });
  const mappings = { list: async () => mapped ? [{ sid: cl }] : [], create: async () => { mapped = true; } };
  const domains = () => ({ fetch: async () => ({ domainName: state.sipDomain, sipRegistration: true }), auth: { registrations: { credentialListMappings: mappings } } });
  const makeTwilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, sip: { credentialLists: lists, domains } });
  try {
    await assert.rejects(service.reconcileSip(A, "admin", { confirm: true, makeTwilio }), /incertaine/);
    assert.equal(creates, 0); assert.equal(state.sipCredentialOperation, "uncertain");
    state.sipResumeAuthorized = true;
    const result = await service.reconcileSip(A, "admin", { confirm: true, makeTwilio });
    assert.equal(result.sipCredentialOperation, "completed"); assert.equal(creates, 1); assert.equal(mapped, true);
    assert.equal(state.sipResumeAuthorized, false);
  } finally { restore(); }
});
