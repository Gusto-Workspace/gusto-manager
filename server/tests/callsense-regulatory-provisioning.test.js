const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const { createRegulatoryAddress, associateApprovedBundle } = require("../services/callsense-onboarding.service");
const id = "a".repeat(24), ac = `AC${"a".repeat(32)}`, pn = `PN${"b".repeat(32)}`, bu = `BU${"c".repeat(32)}`, rn = `RN${"d".repeat(32)}`, ad = `AD${"e".repeat(32)}`;
function fixture(t) {
  const oldKey = process.env.CALLSENSE_ENCRYPTION_KEY; process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);
  t.after(() => { if (oldKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = oldKey; });
  const draft = { _id: "draft", accountSid: ac, phoneNumberSid: pn, twilioNumber: "+33123456789", regulatoryBundleSid: bu, regulatorySubmission: { bundleSid: bu } };
  let config = null, writes = 0, addressCalls = 0, failAfterWrite = false, failAddress = false, addressRows = [];
  const number = { sid: pn, accountSid: ac, phoneNumber: draft.twilioNumber, bundleSid: "" };
  const set = fields => { for (const [path, value] of Object.entries(fields || {})) { const parts = path.split("."); let node = draft; for (const key of parts.slice(0, -1)) node = node[key] ||= {}; node[parts.at(-1)] = value; } };
  t.mock.method(Config, "exists", async () => config);
  t.mock.method(Config, "findOne", () => ({ lean: async () => config }));
  t.mock.method(Config, "updateOne", async (filter, update) => { if (!config || filter._id !== config._id || filter.regulatoryBundleSid !== config.regulatoryBundleSid) return { matchedCount: 0 }; Object.assign(config, update.$set); return { matchedCount: 1 }; });
  t.mock.method(Draft, "exists", async filter => { const which = filter["bundleAssociation.state"] ? "bundleAssociation" : "regulatoryAddress"; return draft[which]?.state === filter[`${which}.state`] && draft[which]?.attemptId === filter[`${which}.attemptId`]; });
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => {
    for (const which of ["bundleAssociation", "regulatoryAddress"]) {
      const expected = filter[`${which}.state`];
      if (expected?.$nin?.includes(draft[which]?.state) || typeof expected === "string" && draft[which]?.state !== expected || filter[`${which}.attemptId`] && draft[which]?.attemptId !== filter[`${which}.attemptId`]) return null;
    }
    set(update.$set); return structuredClone(draft);
  });
  t.mock.method(Draft, "updateOne", async (filter, update) => { const which = filter["bundleAssociation.state"] ? "bundleAssociation" : "regulatoryAddress"; if (draft[which]?.attemptId === filter[`${which}.attemptId`]) set(update.$set); return { matchedCount: 1 }; });
  const addresses = () => ({ fetch: async () => ({ sid: ad, accountSid: ac, isoCountry: "FR", validated: false }) });
  addresses.create = async values => { addressCalls++; addressRows.push({ ...values, sid: ad, accountSid: ac, validated: true }); if (failAddress) { failAddress = false; throw new Error("response lost"); } return { sid: ad, accountSid: ac }; };
  addresses.list = async () => addressRows;
  const client = { addresses, incomingPhoneNumbers: () => ({ fetch: async () => ({ ...number }), update: async data => { writes++; Object.assign(number, data); if (failAfterWrite) { failAfterWrite = false; throw new Error("response lost"); } } }), numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: bu, accountSid: ac, regulationSid: rn, status: "twilio-approved" }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } };
  const getDraftClient = async () => ({ draft: structuredClone(draft), client });
  return { draft, number, getDraftClient, config: value => { config = value; }, loseResponse: () => { failAfterWrite = true; }, loseAddressResponse: () => { failAddress = true; }, counts: () => ({ writes, addressCalls }) };
}
test("création d’adresse persistée sans inventer sa validation", async t => {
  const f = fixture(t);
  const input = { confirm: true, customerName: "Titulaire fictif", street: "1 rue Test", city: "Paris", postalCode: "75001", region: "", isoCountry: "FR", getDraftClient: f.getDraftClient };
  assert.deepEqual(await createRegulatoryAddress(id, "admin", input), { sid: ad, validated: false });
  assert.equal(f.draft.regulatoryAddress.state, "completed"); assert.equal(f.counts().addressCalls, 1);
  f.config({}); await assert.rejects(createRegulatoryAddress(id, "admin", input), /protégée/); assert.equal(f.counts().addressCalls, 1);
});
test("réponse d’adresse perdue : rapprochement par empreinte, sans deuxième création", async t => {
  const f = fixture(t); f.loseAddressResponse();
  const input = { confirm: true, customerName: "Titulaire fictif", street: "1 rue Test", city: "Paris", postalCode: "75001", region: "", isoCountry: "FR", getDraftClient: f.getDraftClient };
  await assert.rejects(createRegulatoryAddress(id, "admin", input), /incertaine/);
  await assert.rejects(createRegulatoryAddress(id, "admin", { ...input, reconcile: true, street: "autre rue" }), /correspondent/);
  assert.deepEqual(await createRegulatoryAddress(id, "admin", { ...input, reconcile: true }), { sid: ad, validated: true });
  assert.equal(f.counts().addressCalls, 1);
});
test("association vérifiée et rapprochement d’une réponse perdue sans réécriture", async t => {
  const f = fixture(t); f.loseResponse();
  const options = { confirm: true, getDraftClient: f.getDraftClient };
  await assert.rejects(associateApprovedBundle(id, "admin", options), /incertaine/);
  assert.equal(f.draft.bundleAssociation.state, "uncertain"); assert.equal(f.counts().writes, 1);
  assert.deepEqual(await associateApprovedBundle(id, "admin", options), { status: "associated", bundleSid: bu });
  assert.equal(f.draft.bundleAssociation.state, "completed"); assert.equal(f.counts().writes, 1);
});
test("association bloquée pour une installation historique ou un dossier partagé", async t => {
  const f = fixture(t); const options = { confirm: true, getDraftClient: f.getDraftClient };
  f.config({ managedByOnboarding: false }); await assert.rejects(associateApprovedBundle(id, "admin", options), /protégée/);
  f.config(null); f.draft.bundleCloneOperation = "completed"; await assert.rejects(associateApprovedBundle(id, "admin", options), /individuel/);
  assert.equal(f.counts().writes, 0);
});
test("association du bundle sur un numéro existant géré sans changer les autres réglages", async t => {
  const f = fixture(t); const config = { _id: "config", managedByOnboarding: true, accountSid: ac, phoneNumberSid: pn, twilioNumber: "+33123456789", regulatoryBundleSid: "ancien", enabled: true };
  f.config(config); await associateApprovedBundle(id, "admin", { confirm: true, getDraftClient: f.getDraftClient });
  assert.equal(config.regulatoryBundleSid, bu); assert.equal(config.enabled, true); assert.equal(f.counts().writes, 1);
});
test("migration historique explicite protège le POC et conserve les autres paramètres", async t => {
  const f = fixture(t); let name = "L’Atelier des Saveurs";
  t.mock.method(Restaurant, "findById", () => ({ select: () => ({ lean: async () => ({ name }) }) }));
  const config = { _id: "config", managedByOnboarding: false, accountSid: ac, phoneNumberSid: pn, twilioNumber: f.draft.twilioNumber, regulatoryBundleSid: "ancien", enabled: true, sipUri: "sip:pilot@example.test" };
  f.config(config); const options = { confirm: true, migrateHistorical: true, getDraftClient: f.getDraftClient };
  await assert.rejects(associateApprovedBundle(id, "admin", options), /protégée/); assert.equal(f.counts().writes, 0);
  name = "Restaurant pilote"; await associateApprovedBundle(id, "admin", options);
  assert.equal(config.regulatoryBundleSid, bu); assert.equal(config.sipUri, "sip:pilot@example.test"); assert.equal(config.enabled, true); assert.equal(f.counts().writes, 1);
});
test("les appels du mode essai ne sont pas placés en file de facturation", async t => {
  const Call = require("../models/callsense/callsense-call.model");
  const service = require("../services/callsense.service");
  const updates = [];
  t.mock.method(Call, "findOneAndUpdate", (_filter, update) => { updates.push(update); return { lean: async () => null }; });
  const config = { restaurantId: id, accountSid: ac, twilioNumber: "+33123456789", managedByOnboarding: true, provisioningStatus: "ready_for_test" };
  await service.recordIncoming(config, { From: "+33123456788", CallSid: "CAtest" });
  assert.equal(updates[0].$set.billingState, "complete");
  await service.recordIncoming({ ...config, provisioningStatus: "active" }, { From: "+33123456788", CallSid: "CAactive" });
  assert.equal(updates[1].$set.billingState, undefined);
});
