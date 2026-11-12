const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { runOnboarding } = require("../services/callsense-provisioning.service");
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
    quoteNumbers: async () => ({ currency: "USD", prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33123456789", numberType: "local", beta: false, capabilities: { voice: true }, addressRequirements: "none" }, { phoneNumber: "+33912345678", numberType: "national", capabilities: { voice: true }, addressRequirements: "none" }] }),
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
    assert.deepEqual(f.calls, ["account", "number:+33123456789", "technical"]);
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
test("un numéro bêta ou national ne déclenche aucun achat automatique", async () => {
  const f = fixture();
  try {
    f.draft.accountSid = "ACtest"; f.draft.accountOperation = "completed"; f.draft.regulatoryBundleSid = "BUtest";
    f.options.onboarding.quoteNumbers = async () => ({ currency: "USD", prices: [{ type: "local", amount: "1.35" }, { type: "national", amount: "1.35" }], numbers: [{ phoneNumber: "+33123456789", numberType: "local", beta: true, capabilities: { voice: true }, addressRequirements: "none" }, { phoneNumber: "+33912345678", numberType: "national", beta: false, capabilities: { voice: true }, addressRequirements: "none" }] });
    assert.equal((await runOnboarding(id, "admin", f.options)).phase, "number"); assert.deepEqual(f.calls, []);
  } finally { f.restore(); }
});
test("le clonage partagé exige un consentement et ne se répète pas à la reprise", async () => {
  const f = fixture(), previous = process.env.CALLSENSE_COMPLIANCE_STRATEGY;
  process.env.CALLSENSE_COMPLIANCE_STRATEGY = "shared_clone";
  try {
    f.draft.accountSid = "ACtest"; f.draft.accountOperation = "completed";
    const options = { ...f.options, cloneBundle: async () => { f.calls.push("clone"); f.draft.regulatoryBundleSid = "BUclone"; } };
    assert.match((await runOnboarding(id, "admin", options)).message, /Confirmez/); assert.deepEqual(f.calls, []);
    await runOnboarding(id, "admin", { ...options, sharedCloneConsent: true });
    assert.deepEqual(f.calls, ["clone", "number:+33123456789", "technical"]);
    await runOnboarding(id, "admin", options); assert.equal(f.calls.filter(x => x === "clone").length, 1);
  } finally { if (previous === undefined) delete process.env.CALLSENSE_COMPLIANCE_STRATEGY; else process.env.CALLSENSE_COMPLIANCE_STRATEGY = previous; f.restore(); }
});
