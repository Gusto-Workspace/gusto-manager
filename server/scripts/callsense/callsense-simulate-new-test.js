// Test database only. Twilio, uploads, probes and Stripe are simulated.
require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const pushPath = require.resolve("../../services/shared/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const onboarding = require("../../services/callsense/callsense-onboarding.service");
const provisioning = require("../../services/callsense/callsense-provisioning.service");
const serverless = require("../../services/callsense/callsense-serverless.service");
const fallback = require("../../services/callsense/callsense-fallback.service");
const routes = require("../../routes/callsense-onboarding.routes");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1") throw Error("Simulation de test non autorisée");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw Error("Base de test requise");
  process.env.CALLSENSE_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.simulation.example";
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw Error("Base inattendue");
  const id = new mongoose.Types.ObjectId(), rid = String(id), db = mongoose.connection.db;
  const sid = prefix => prefix + crypto.randomBytes(16).toString("hex");
  const ac = sid("AC"), pn = sid("PN"), rn = sid("RN"), it = sid("IT"), rd = sid("RD"), ad = sid("AD"), bu = sid("BU"), sd = sid("SD"), cl = sid("CL"), cr = sid("CR"), zs = sid("ZS"), zh = sid("ZH"), zn = sid("ZN"), zb = sid("ZB"), ze = sid("ZE"), zd = sid("ZD");
  const phone = `+333${String(crypto.randomInt(10000000, 99999999))}`;
  const state = { status: "draft", number: null, domain: null, assignments: [], mappings: [], list: false, credential: null, service: false, buildReads: 0, counts: {} };
  const count = key => { state.counts[key] = (state.counts[key] || 0) + 1; };
  const accounts = { list: async () => [], create: async () => { count("account"); return { sid: ac, authToken: "simulation-token" }; } };
  const regulatory = {
    regulations: Object.assign(() => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }), { list: async () => [{ sid: rn, isoCountry: "FR", numberType: "local", endUserType: "business", requirements: { end_user: [{ type: "business", fields: ["name"] }], supporting_document: [[{ accepted_documents: [{ type: "proof", fields: [] }] }]] } }] }),
    endUserTypes: { list: async () => [{ machineName: "business" }] }, supportingDocumentTypes: { list: async () => [{ machineName: "proof" }] },
    endUsers: { create: async () => { count("endUser"); return { sid: it, accountSid: ac, type: "business" }; } },
    supportingDocuments: () => ({ fetch: async () => ({ sid: rd, accountSid: ac, status: "approved", attributes: { address_sids: [ad] } }) }),
    bundles: Object.assign(() => ({ fetch: async () => ({ sid: bu, accountSid: ac, regulationSid: rn, status: state.status }), itemAssignments: { list: async () => state.assignments, create: async ({ objectSid }) => { count("assignment"); const item = { sid: sid("BV"), accountSid: ac, bundleSid: bu, objectSid }; state.assignments.push(item); return item; } }, evaluations: { create: async () => ({ accountSid: ac, bundleSid: bu, regulationSid: rn, status: "compliant", results: [] }) }, update: async ({ status }) => { count("submit"); state.status = status; return { sid: bu, accountSid: ac, regulationSid: rn, status }; } }), { create: async () => { count("bundle"); return { sid: bu, accountSid: ac, regulationSid: rn, status: "draft" }; } }),
  };
  const incoming = () => ({ fetch: async () => ({ ...state.number }), update: async value => { count("webhook"); Object.assign(state.number, value); } });
  incoming.list = async () => state.number ? [{ ...state.number }] : [];
  incoming.create = async ({ phoneNumber, bundleSid, addressSid }) => { assert.equal(phoneNumber, phone); assert.equal(bundleSid, bu); assert.equal(addressSid, ad); count("number"); state.number = { sid: pn, accountSid: ac, phoneNumber, bundleSid, capabilities: { voice: true } }; return { sid: pn }; };
  const mappings = { list: async () => state.mappings, create: async ({ credentialListSid }) => { state.mappings = [{ sid: credentialListSid }]; } };
  const domains = () => ({ fetch: async () => ({ ...state.domain }), auth: { registrations: { credentialListMappings: mappings } } });
  domains.list = async () => state.domain ? [{ ...state.domain }] : [];
  domains.create = async ({ domainName }) => { count("domain"); state.domain = { sid: sd, accountSid: ac, domainName, sipRegistration: true }; return state.domain; };
  const credentials = () => ({ fetch: async () => ({ ...state.credential }) });
  credentials.create = async ({ username }) => { count("credential"); state.credential = { sid: cr, accountSid: ac, username }; return state.credential; };
  credentials.list = async () => state.credential ? [state.credential] : [];
  const lists = () => ({ credentials, fetch: async () => ({ sid: cl, accountSid: ac }) });
  lists.list = async () => state.list ? [{ sid: cl, accountSid: ac, friendlyName: `Gusto CallSense ${rid}` }] : [];
  lists.create = async () => { count("credentialList"); state.list = true; return { sid: cl }; };
  const builds = () => ({ fetch: async () => ({ status: ++state.buildReads <= 10 ? "building" : "completed", accountSid: ac, serviceSid: zs, functionVersions: [zn] }) });
  builds.create = async () => { count("build"); return { sid: zb, accountSid: ac, serviceSid: zs }; };
  const environments = () => ({ fetch: async () => ({ accountSid: ac, serviceSid: zs, buildSid: zb, domainName: "callsense-simulation.twil.io" }), deployments: { create: async () => { count("deployment"); return { sid: zd, accountSid: ac, serviceSid: zs, environmentSid: ze, buildSid: zb }; } } });
  environments.create = async () => ({ sid: ze, accountSid: ac, serviceSid: zs });
  const services = () => ({ functions: { create: async () => ({ sid: zh, accountSid: ac, serviceSid: zs }) }, builds, environments });
  services.list = async () => [];
  services.create = async () => { count("functionService"); return { sid: zs, accountSid: ac }; };
  const address = { sid: ad, accountSid: ac, validated: true, isoCountry: "FR", city: "Paris" };
  const addresses = () => ({ fetch: async () => address }); addresses.list = async () => [address];
  const client = { accountSid: ac, incomingPhoneNumbers: incoming, availablePhoneNumbers: () => ({ local: { list: async options => { assert.equal(options.voiceEnabled, true); assert.ok(["+333", phone].includes(options.contains)); return [{ phoneNumber: phone, capabilities: { voice: true }, addressRequirements: "local", beta: false }]; } } }), pricing: { v1: { phoneNumbers: { countries: () => ({ fetch: async () => ({ priceUnit: "USD", phoneNumberPrices: [{ number_type: "local", current_price: "1.00" }, { number_type: "national", current_price: "1.00" }] }) }) } } }, addresses, numbers: { v2: { regulatoryCompliance: regulatory } }, sip: { domains, credentialLists: lists }, serverless: { v1: { services } } };
  const makeTwilio = () => client, makeClient = () => ({ sid: sid("AC"), client: { api: { accounts } } });
  const probe = async () => ({}), upload = async () => { count("version"); return zn; };
  const forwarded = { ...onboarding, mainClient: makeClient,
    createAccount: (r, a, o) => onboarding.createAccount(r, a, { ...o, makeClient }),
    inspectCompliance: r => onboarding.inspectCompliance(r, { makeTwilio }),
    quoteNumbers: (r, o) => onboarding.quoteNumbers(r, { ...o, makeTwilio }), listAddresses: r => onboarding.listAddresses(r, { makeTwilio }),
    buyNumber: (r, a, o) => onboarding.buyNumber(r, a, { ...o, makeTwilio }),
    inspectResources: r => onboarding.inspectResources(r, { makeTwilio }),
    createDomain: (r, a, o) => onboarding.createDomain(r, a, { ...o, makeTwilio }),
  };
  const finalize = (r, a, o) => provisioning.finalizeTechnical(r, a, { ...o, onboarding: forwarded, makeTwilio, probeOrigin: async () => {}, probeFallback: probe, deployFallback: (r2, a2, o2) => serverless.deploy(r2, a2, { ...o2, makeTwilio, upload, probe, wait: async () => {} }), configureHooks: (r2, a2, o2) => provisioning.configureWebhooks(r2, a2, { ...o2, makeTwilio, probeFallback: probe }) });
  const opts = { confirm: true, maxAmount: "1.50", currency: "USD", functionConsent: true, onboarding: forwarded, finalize };
  const invoke = async (suffix, body) => {
    const layer = routes.stack.find(item => item.route?.path === `/admin/restaurants/:restaurantId/callsense-onboarding/${suffix}`);
    const handler = layer.route.stack.at(-1).handle;
    const res = { code: 200, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, set() { return this; } };
    await handler({ params: { restaurantId: rid }, user: { id: "admin-test" }, body }, res);
    if (res.code !== 200) throw Error(`Route ${suffix} : HTTP ${res.code}`);
    return res.value;
  };
  try {
    await db.collection("restaurants").insertOne({ _id: id, name: `Simulation CallSense ${rid}`, address: { line1: "1 rue Test", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" });
    const first = await provisioning.runOnboarding(rid, "admin-test", opts); assert.equal(first.phase, "compliance"); assert.equal(state.counts.account, 1);
    console.log("Étapes 1–2 : données et sous-compte simulé créés par le service Gusto.");
    const document = Buffer.from("%PDF-simulation");
    const request = async () => ({ ok: true, json: async () => ({ sid: rd, account_sid: ac, type: "proof" }) });
    const submitted = await onboarding.submitIndividualBundle(rid, "admin-test", { confirm: true, endUserType: "business", endUserAttributes: { name: "Simulation" }, email: "test@example.test", documents: [{ type: "proof", attributes: {}, buffer: document, mimeType: "application/pdf" }], makeTwilio, request });
    assert.equal(submitted.status, "pending-review"); assert.equal((await provisioning.runOnboarding(rid, "admin-test", opts)).phase, "compliance");
    state.status = "twilio-approved";
    console.log("Étape 3 : dossier individuel soumis ; attente puis approbation simulées.");
    const interrupted = await provisioning.runOnboarding(rid, "admin-test", opts); assert.equal(interrupted.phase, "technical"); assert.equal(interrupted.status, "running");
    const beforeResume = await Draft.findOne({ restaurantId: id }).lean(); assert.equal(beforeResume.fallbackFunction.operation, "waiting"); assert.equal(beforeResume.fallbackFunction.buildSid, zb);
    const ready = await provisioning.runOnboarding(rid, "admin-test", opts); assert.equal(ready.phase, "tests");
    let draft = await Draft.findOne({ restaurantId: id }).lean(); assert.equal(draft.webhookOperation, "completed"); assert.equal(draft.serviceStatus, "ready_for_test"); assert.notEqual(draft.checklist.fallbackTest, true);
    const testConfig = await Config.findOne({ restaurantId: id }).lean(); assert.equal(testConfig.enabled, false); assert.equal(testConfig.provisioningStatus, "ready_for_test");
    console.log("Étapes 4–5 : numéro, SIP, Function et webhooks créés par les services Gusto avant tout essai.");
    await provisioning.runOnboarding(rid, "admin-test", opts); for (const key of ["account", "endUser", "bundle", "submit", "number", "domain", "credentialList", "credential", "functionService", "build", "version", "webhook"]) assert.equal(state.counts[key], 1, `${key} doit être créé une seule fois`); assert.equal(state.counts.assignment, 2);
    console.log("Interruption pendant le build puis reprise : aucune recréation de numéro, Function, version, build ou webhook.");
    if (process.env.CALLSENSE_TEST_STOP_AFTER_SIP === "1") return;
    await provisioning.setStatus(rid, "admin-test", { status: "ready_for_test", confirm: true, makeTwilio, probeFallback: probe });
    await assert.rejects(provisioning.setStatus(rid, "admin-test", { status: "active", confirm: true, makeTwilio, probeFallback: probe }), /checklist/);
    draft = await Draft.findOne({ restaurantId: id }).lean(); const checklist = {};
    for (const key of ["terminalConnected", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"]) checklist[key] = true;
    checklist.operatorForwarding = false;
    await invoke("forwarding-scenario", { scenario: "direct" });
    await invoke("fallback-verification", { fallbackUrl: draft.voiceFallbackUrl, confirm: true });
    const connected = Object.fromEntries(Object.keys(checklist).map(key => [key, key === "terminalConnected" || key === "fallbackTest"]));
    await invoke("checklist", { checklist: connected });
    await invoke("checklist", { checklist });
    console.log("Étape 6 : mode test ouvert ; résultats téléphoniques déclarés fictivement.");
    await provisioning.setStatus(rid, "admin-test", { status: "active", confirm: true, makeTwilio, probeFallback: probe });
    assert.equal((await Config.findOne({ restaurantId: id }).lean()).provisioningStatus, "active");
    console.log("Étape 7 : activation simulée après recette ; aucune écriture Twilio ou Stripe réelle.");
  } finally {
    await Config.deleteMany({ restaurantId: id }); await Draft.deleteMany({ restaurantId: id }); await db.collection("restaurants").deleteOne({ _id: id, name: `Simulation CallSense ${rid}` });
    assert.equal(await Config.countDocuments({ restaurantId: id }), 0); assert.equal(await Draft.countDocuments({ restaurantId: id }), 0);
    console.log("Données temporaires de simulation supprimées.");
  }
}
main().catch(error => { console.error("Simulation échouée :", error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
