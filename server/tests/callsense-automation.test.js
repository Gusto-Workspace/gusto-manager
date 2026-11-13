const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { runOnboarding, finalizeTechnical, startTechnical } = require("../services/callsense-provisioning.service");
const { currentStep } = require("../services/callsense-onboarding-progress.service");
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
function fixture() {
  const old = { find: Draft.findOne, update: Draft.updateOne, upsert: Draft.findOneAndUpdate, config: Config.findOne, restaurant: Restaurant.findById };
  const draft = { restaurantId: id, accountOperation: "not_started", numberOperation: "not_started", automation: {} };
  const calls = [];
  function apply(update) { for (const [key, value] of Object.entries(update.$set || {})) { const parts = key.split("."); if (parts.length === 2) draft[parts[0]][parts[1]] = value; else draft[key] = value; } }
  Draft.findOneAndUpdate = async (_filter, update) => { apply(update); return { ...draft }; };
  Draft.updateOne = async (_filter, update) => { apply(update); return { modifiedCount: 1 }; };
  Draft.findOne = () => ({ lean: async () => ({ ...draft }) });
  Config.findOne = () => ({ lean: async () => null });
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Restaurant fictif", address: { line1: "1 rue Test", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" }) }) });
  const onboarding = {
    mainClient: () => ({ client: { api: { accounts: { list: async () => [] } } } }),
    createAccount: async () => { calls.push("account"); draft.accountSid = "ACtest"; draft.accountOperation = "completed"; },
    inspectCompliance: async () => ({ bundle: { status: "twilio-approved", compatible: true } }),
    quoteNumbers: async (_id, options) => { assert.equal(options.numberPrefix, "+333"); return { currency: "USD", regulatoryAddress: { sid: "ADtest", city: "Paris" }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33323456789", locality: "Dole", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "none" }, { phoneNumber: "+33912345678", locality: "Paris", numberType: "national", capabilities: { voice: true }, addressRequirements: "none" }] }; },
    listAddresses: async () => [],
    buyNumber: async (_id, _actor, params) => { calls.push(`number:${params.phoneNumber}`); draft.phoneNumberSid = "PNtest"; draft.numberOperation = "completed"; },
  };
  const options = { confirm: true, maxAmount: "2.00", currency: "USD", onboarding, finalize: async () => { calls.push("technical"); return { status: "action_required", message: "Secours à tester" }; } };
  return { draft, calls, options, restore: () => { Draft.findOne = old.find; Draft.updateOne = old.update; Draft.findOneAndUpdate = old.upsert; Config.findOne = old.config; Restaurant.findById = old.restaurant; } };
}
test("mise en service persistée : attente de conformité puis reprise sans doublon", async () => {
  const f = fixture();
  try {
    await assert.rejects(runOnboarding(id, "admin", { ...f.options, confirm: false }), /Confirmation/);
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "compliance");
    assert.deepEqual(f.calls, ["account"]); assert.equal(f.draft.automation.status, "waiting");
    f.draft.regulatoryBundleSid = "BUtest";
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "technical");
    assert.deepEqual(f.calls, ["account", "number:+33323456789", "technical"]);
    await runOnboarding(id, "admin", f.options);
    assert.equal(f.calls.filter(x => x === "account").length, 1); assert.equal(f.calls.filter(x => x.startsWith("number:")).length, 1);
  } finally { f.restore(); }
});
test("plafond et opération incertaine arrêtent tout achat", async () => {
  const f = fixture();
  try {
    f.draft.accountSid = "ACtest"; f.draft.accountOperation = "completed"; f.draft.regulatoryBundleSid = "BUtest";
    assert.equal((await runOnboarding(id, "admin", { ...f.options, maxAmount: "1.00" })).phase, "number");
    assert.deepEqual(f.calls, []);
    f.draft.numberOperation = "uncertain";
    assert.match((await runOnboarding(id, "admin", f.options)).message, /incertain/); assert.deepEqual(f.calls, []);
  } finally { f.restore(); }
});
test("attente manuelle de revue sans achat prématuré", async () => {
  const f = fixture();
  try {
    f.draft.accountSid = "ACtest"; f.draft.regulatoryBundleSid = "BUtest";
    f.options.onboarding.inspectCompliance = async () => ({ bundle: { status: "pending-review", compatible: true } });
    const result = await runOnboarding(id, "admin", f.options);
    assert.equal(result.phase, "compliance"); assert.equal(result.status, "waiting");
    assert.deepEqual(f.calls, []);
    f.options.onboarding.inspectCompliance = async () => ({ bundle: { status: "twilio-approved", compatible: true } });
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "technical");
    await runOnboarding(id, "admin", f.options);
    assert.equal(f.calls.filter(call => call.startsWith("number:")).length, 1);
    assert.equal(f.calls.filter(call => call === "account").length, 0);
  } finally { f.restore(); }
});
test("une vérification ancienne ne remplace pas une approbation enregistrée entre-temps", async () => {
  const f = fixture(), update = Draft.updateOne;
  try {
    Object.assign(f.draft, { accountSid: "ACtest", accountOperation: "completed", regulatoryBundleSid: "BUtest" });
    f.options.onboarding.inspectCompliance = async () => ({ bundle: { sid: "BUtest", status: "pending-review", compatible: true } });
    Draft.updateOne = async (filter, changes) => changes.$set?.regulatoryApproval ? { matchedCount: 0 } : update(filter, changes);
    const result = await runOnboarding(id, "admin", f.options);
    assert.equal(result.status, "running"); assert.deepEqual(f.calls, []);
  } finally { f.restore(); }
});
test("approbation puis interruption et reprise jusqu'au téléphone sans activation commerciale", async () => {
  const f = fixture(), domains = [], oldOrigin = process.env.CALLSENSE_PUBLIC_ORIGIN;
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.test";
  try {
    Object.assign(f.draft, { accountSid: `AC${"a".repeat(32)}`, accountOperation: "completed", regulatoryBundleSid: "BUtest", webhookOperation: "not_started", domainOperation: "not_started", sipCredentialOperation: "not_started", checklist: {} });
    let approval = "pending-review", deployments = 0;
    f.options.functionConsent = true;
    f.options.onboarding.inspectCompliance = async () => ({ bundle: { sid: "BUtest", status: approval, compatible: true } });
    f.options.onboarding.buyNumber = async () => { f.calls.push("number"); Object.assign(f.draft, { phoneNumberSid: "PNtest", twilioNumber: "+33123456789", numberOperation: "completed" }); };
    const lists = () => ({ credentials: { list: async () => [] } }); lists.list = async () => [];
    const resources = { inspectResources: async () => ({ numbers: [{ sid: "PNtest", phoneNumber: "+33123456789" }], domains: [...domains] }), createDomain: async () => { f.calls.push("domain"); Object.assign(f.draft, { sipDomainSid: "SDtest", sipDomain: `gusto-${id}.sip.twilio.com`, domainOperation: "completed" }); domains.push({ sid: "SDtest", domainName: f.draft.sipDomain, sipRegistration: true }); } };
    f.options.finalize = (rid, actor, options) => finalizeTechnical(rid, actor, { ...options, loadState: async () => ({ draft: f.draft, client: { sip: { credentialLists: lists } } }), onboarding: resources,
      configure: async () => { f.calls.push("sip"); Object.assign(f.draft, { sipCredentialOperation: "completed", sipUsername: "user" }); },
      deployFallback: async () => { deployments++; if (deployments === 1) return { status: "waiting" }; f.draft.fallbackFunction = { operation: "completed", url: "https://example.twil.io/callsense-fallback", sipUri: `sip:user@${f.draft.sipDomain}` }; return { status: "ready" }; },
      probeOrigin: async () => {}, configureHooks: async (_id, _actor, params) => { assert.equal(params.prepareTest, true); f.calls.push("webhook"); Object.assign(f.draft, { webhookOperation: "completed", fallbackProbeAt: new Date(), fallbackProbeUrl: f.draft.fallbackFunction.url, fallbackProbeSipUri: `sip:user@${f.draft.sipDomain}` }); }, verify: async () => {}, enterTestMode: async () => { f.draft.serviceStatus = "ready_for_test"; } }).catch(err => { err.expose = true; throw err; });
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "compliance"); assert.deepEqual(f.calls, []);
    approval = "twilio-approved";
    assert.equal((await runOnboarding(id, "admin", f.options)).status, "running");
    const resumed = await runOnboarding(id, "admin", f.options); assert.equal(resumed.phase, "tests", resumed.message);
    await runOnboarding(id, "admin", f.options);
    assert.deepEqual(f.calls, ["number", "domain", "sip", "webhook"]); assert.equal(deployments, 2);
    assert.equal(f.draft.serviceStatus, "ready_for_test"); assert.notEqual(f.draft.checklist.fallbackTest, true);
    assert.equal(currentStep({ name: "Fictif", address: { line1: "1 rue Test", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" }, f.draft), 5);
  } finally { if (oldOrigin === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = oldOrigin; f.restore(); }
});
test("un numéro bêta ou national ne déclenche aucun achat automatique", async () => {
  const f = fixture();
  try {
    f.draft.accountSid = "ACtest"; f.draft.accountOperation = "completed"; f.draft.regulatoryBundleSid = "BUtest";
    f.options.onboarding.quoteNumbers = async () => ({ currency: "USD", prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33123456789", numberType: "local", beta: true, capabilities: { voice: true }, addressRequirements: "none" }, { phoneNumber: "+33912345678", numberType: "national", beta: false, capabilities: { voice: true }, addressRequirements: "none" }] });
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "number"); assert.deepEqual(f.calls, []);
  } finally { f.restore(); }
});
test("tous les restaurants : aucun repli vers un autre préfixe", async () => {
  const f = fixture();
  try {
    Object.assign(f.draft, { accountSid: "ACtest", accountOperation: "completed", regulatoryBundleSid: "BUtest" });
    f.options.onboarding.quoteNumbers = async (_id, options) => { assert.equal(options.numberPrefix, "+333"); return { currency: "USD", regulatoryAddress: { sid: "ADtest" }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: ["+33123456789", "+33223456789", "+33423456789", "+33523456789", "+33923456789"].map(phoneNumber => ({ phoneNumber, numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" })) }; };
    const result = await runOnboarding(id, "admin", f.options); assert.equal(result.status, "waiting"); assert.match(result.message, /Aucun numéro \+333/); assert.deepEqual(f.calls, []);
  } finally { f.restore(); }
});
test("un numéro local 03 reste éligible avec un justificatif parisien", async () => {
  const f = fixture();
  try {
    Object.assign(f.draft, { accountSid: "ACtest", accountOperation: "completed", regulatoryBundleSid: "BUtest" });
    f.options.onboarding.quoteNumbers = async () => ({ currency: "USD", regulatoryAddress: { sid: "ADtest", city: "Paris" }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33339960186", locality: "Dole", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" }] });
    f.options.onboarding.buyNumber = async (_id, _actor, options) => { f.calls.push(options.phoneNumber); assert.equal(options.addressSid, "ADtest"); f.draft.phoneNumberSid = "PNtest"; };
    await runOnboarding(id, "admin", f.options); assert.equal(f.calls[0], "+33339960186");
  } finally { f.restore(); }
});
test("pilote : sélection +333 unique, plafond et identité inchangés", async () => {
  const f = fixture(), pilot = "69c69539571da19061ac7fda", accountSid = "TWILIO_IDENTIFIER_REMOVED_1", bundleSid = "TWILIO_IDENTIFIER_REMOVED_6", addressSid = "TWILIO_IDENTIFIER_REMOVED_5";
  try {
    Object.assign(f.draft, { accountSid, accountOperation: "completed", regulatoryBundleSid: bundleSid, regulatoryAddress: { sid: addressSid }, automation: { maxAmount: "1.5", currency: "USD", functionAccepted: true } });
    let buys = 0, prefix;
    f.options.onboarding.quoteNumbers = async (_id, options) => { prefix = options.numberPrefix; return { currency: "USD", regulatoryAddress: { sid: addressSid }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33111111111", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" }, { phoneNumber: "+33311111111", numberType: "local", beta: true, capabilities: { voice: true }, addressRequirements: "local" }, { phoneNumber: "+33322222222", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" }] }; };
    f.options.onboarding.buyNumber = async (_id, _actor, options) => { buys++; assert.equal(options.phoneNumber, "+33322222222"); assert.equal(options.addressSid, addressSid); assert.equal(options.amount, "1.35"); f.draft.phoneNumberSid = "PNtest"; };
    const automaticResume = await runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50" });
    assert.equal(automaticResume.status, "waiting"); assert.equal(automaticResume.phase, "number"); assert.equal(buys, 0);
    assert.equal((await runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50", pilotPurchaseConfirmed: true })).phase, "technical");
    assert.equal(prefix, "+333"); assert.equal(buys, 1);
    await runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50" }); assert.equal(buys, 1);
    await assert.rejects(runOnboarding(pilot, "admin", { ...f.options, maxAmount: "2.00" }), /plafond autorisé/); assert.equal(buys, 1);
  } finally { f.restore(); }
});
test("pilote : deux lancements simultanés ne relancent pas l’achat refusé", async () => {
  const f = fixture(), pilot = "69c69539571da19061ac7fda", addressSid = "TWILIO_IDENTIFIER_REMOVED_5";
  const originalLock = Draft.findOneAndUpdate, originalUpdate = Draft.updateOne;
  try {
    Object.assign(f.draft, { accountSid: "TWILIO_IDENTIFIER_REMOVED_1", accountOperation: "completed", regulatoryBundleSid: "TWILIO_IDENTIFIER_REMOVED_6", regulatoryAddress: { sid: addressSid }, automation: { maxAmount: "1.5", currency: "USD", functionAccepted: true } });
    let occupied = false, releaseQuote, buys = 0; const blocked = new Promise(resolve => { releaseQuote = resolve; });
    Draft.findOneAndUpdate = async (filter, update, options) => { if (filter.$or) { if (occupied) return null; occupied = true; } return originalLock(filter, update, options); };
    Draft.updateOne = async (filter, update) => { if (update.$unset?.["automation.runLeaseId"]) occupied = false; return originalUpdate(filter, update); };
    f.options.onboarding.quoteNumbers = async () => { await blocked; return { currency: "USD", regulatoryAddress: { sid: addressSid }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33322222222", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" }] }; };
    f.options.onboarding.buyNumber = async () => { buys++; throw Object.assign(new Error("Refus Twilio 21649"), { expose: true }); };
    const first = runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50", pilotPurchaseConfirmed: true });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50", pilotPurchaseConfirmed: true }), /Dossier de préparation indisponible/);
    releaseQuote(); const result = await first; assert.equal(result.status, "error"); assert.match(result.message, /21649/); assert.equal(buys, 1); assert.equal(f.draft.automation.status, "error");
  } finally { f.restore(); }
});
test("pilote : achat +333 puis reprise SIP, secours et routage avant les essais", async () => {
  const f = fixture(), pilot = "69c69539571da19061ac7fda", accountSid = "TWILIO_IDENTIFIER_REMOVED_1", bundleSid = "TWILIO_IDENTIFIER_REMOVED_6", addressSid = "TWILIO_IDENTIFIER_REMOVED_5", domains = [], originalOrigin = process.env.CALLSENSE_PUBLIC_ORIGIN;
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.test";
  try {
    Object.assign(f.draft, { accountSid, accountOperation: "completed", regulatoryBundleSid: bundleSid, regulatoryAddress: { sid: addressSid }, numberOperation: "not_started", domainOperation: "not_started", sipCredentialOperation: "not_started", webhookOperation: "not_started", checklist: {}, automation: { maxAmount: "1.5", currency: "USD", functionAccepted: true } });
    f.options.onboarding.inspectCompliance = async () => ({ bundle: { sid: bundleSid, status: "twilio-approved", compatible: true } });
    f.options.onboarding.quoteNumbers = async (_id, options) => { assert.equal(options.numberPrefix, "+333"); return { currency: "USD", regulatoryAddress: { sid: addressSid }, prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33322222222", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "local" }] }; };
    f.options.onboarding.buyNumber = async (_id, _actor, options) => { assert.equal(options.addressSid, addressSid); f.calls.push("number"); Object.assign(f.draft, { phoneNumberSid: "PNtest", twilioNumber: options.phoneNumber, numberOperation: "completed" }); };
    const lists = () => ({ credentials: { list: async () => [] } }); lists.list = async () => [];
    const resources = { inspectResources: async () => ({ numbers: [{ sid: "PNtest", phoneNumber: "+33322222222" }], domains: [...domains] }), createDomain: async () => { f.calls.push("domain"); Object.assign(f.draft, { sipDomainSid: "SDtest", sipDomain: `gusto-${pilot}.sip.twilio.com`, domainOperation: "completed" }); domains.push({ sid: "SDtest", domainName: f.draft.sipDomain, sipRegistration: true }); } };
    let deployReads = 0;
    const finalize = (rid, actor, options) => finalizeTechnical(rid, actor, { ...options, loadState: async () => ({ draft: f.draft, client: { sip: { credentialLists: lists } } }), onboarding: resources,
      configure: async () => { f.calls.push("sip"); Object.assign(f.draft, { sipCredentialOperation: "completed", sipUsername: "user" }); },
      deployFallback: async () => { deployReads++; if (deployReads === 1) return { status: "waiting" }; f.draft.fallbackFunction = { operation: "completed", url: "https://example.twil.io/callsense-fallback", sipUri: `sip:user@${f.draft.sipDomain}` }; return { status: "ready" }; },
      probeOrigin: async () => {}, configureHooks: async (_id, _actor, options) => { assert.equal(options.prepareTest, true); f.calls.push("webhook"); Object.assign(f.draft, { webhookOperation: "completed", fallbackProbeAt: new Date(), fallbackProbeUrl: f.draft.fallbackFunction.url, fallbackProbeSipUri: `sip:user@${f.draft.sipDomain}` }); }, verify: async () => {}, enterTestMode: async () => { f.draft.serviceStatus = "ready_for_test"; } });
    const first = await runOnboarding(pilot, "admin", { ...f.options, maxAmount: "1.50", pilotPurchaseConfirmed: true, finalize });
    assert.equal(first.status, "running"); assert.equal(first.phase, "technical"); assert.equal(f.draft.automation.resumeMode, "technical");
    assert.equal((await startTechnical(pilot, "admin", { confirm: true, finalize })).status, "completed");
    assert.deepEqual(f.calls, ["number", "domain", "sip", "webhook"]); assert.equal(f.draft.automation.phase, "tests");
    assert.equal(currentStep({ name: "Fictif", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" }, f.draft), 5);
    assert.notEqual(f.draft.checklist.fallbackTest, true); assert.notEqual(f.draft.serviceStatus, "active");
  } finally { if (originalOrigin === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = originalOrigin; f.restore(); }
});
test("l'ancienne stratégie partagée ne déclenche aucun clonage", async () => {
  const f = fixture(), previous = process.env.CALLSENSE_COMPLIANCE_STRATEGY;
  process.env.CALLSENSE_COMPLIANCE_STRATEGY = "shared_clone";
  try {
    f.draft.accountSid = "ACtest"; f.draft.accountOperation = "completed";
    const options = { ...f.options, cloneBundle: async () => { f.calls.push("clone"); f.draft.regulatoryBundleSid = "BUclone"; } };
    assert.match((await runOnboarding(id, "admin", options)).message, /dossier de conformité/); assert.deepEqual(f.calls, []);
    await runOnboarding(id, "admin", { ...options, sharedCloneConsent: true });
    assert.deepEqual(f.calls, []);
  } finally { if (previous === undefined) delete process.env.CALLSENSE_COMPLIANCE_STRATEGY; else process.env.CALLSENSE_COMPLIANCE_STRATEGY = previous; f.restore(); }
});
