const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const Draft = require("../models/callsense/callsense-onboarding.model");
const { cloneSharedBundle } = require("../services/callsense-provisioning.service");
const sourceSid = `AC${"a".repeat(32)}`, targetSid = `AC${"b".repeat(32)}`, sourceBundle = `BU${"c".repeat(32)}`, cloneSid = `BU${"d".repeat(32)}`, mainSid = `AC${"e".repeat(32)}`;
function fixture() {
  const old = { find: Draft.findOneAndUpdate, exists: Draft.exists, update: Draft.updateOne, source: process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_ACCOUNT_SID, bundle: process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_SID };
  process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_ACCOUNT_SID = sourceSid; process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_SID = sourceBundle;
  const state = { _id: "draft", accountSid: targetSid, regulatoryBundleSid: "", bundleCloneOperation: "not_started" };
  let creates = 0, reject = false, found = false, verifiedOwner = targetSid;
  Draft.exists = async () => state.bundleCloneOperation === "pending";
  Draft.findOneAndUpdate = async (_filter, update) => { if (update.$set.bundleCloneOperation === "pending" && state.bundleCloneOperation !== "not_started") return null; Object.assign(state, update.$set); return { ...state }; };
  Draft.updateOne = async (_filter, update) => { Object.assign(state, update.$set); return { modifiedCount: 1 }; };
  const target = { numbers: { v2: { regulatoryCompliance: { bundles: Object.assign(() => ({ fetch: async () => ({ sid: cloneSid, accountSid: verifiedOwner, regulationSid: "RNtest", status: "twilio-approved" }) }), { list: async () => found ? [{ regulationSid: "RNtest" }] : [] }) } } } };
  const source = { numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: sourceBundle, accountSid: process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_ACCOUNT_SID, status: "twilio-approved", regulationSid: "RNtest" }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) }, bundleClone: (sid) => ({ create: async (body) => { assert.equal(sid, sourceBundle); assert.deepEqual(body, { targetAccountSid: targetSid, moveToDraft: false }); creates++; if (reject) throw new Error("timeout"); return { bundleSid: cloneSid }; } }) } } };
  const onboarding = { draftClient: async () => ({ draft: { ...state }, client: target }), mainClient: () => ({ sid: mainSid, client: { numbers: source.numbers, api: { accounts: (sid) => ({ fetch: async () => ({ sid, ownerAccountSid: mainSid, status: "active", authToken: "secret" }) }) } } }) };
  return { state, onboarding, makeTwilio: () => source, count: () => creates, reject: () => { reject = true; }, found: () => { found = true; }, wrongOwner: () => { verifiedOwner = sourceSid; }, restore: () => { Draft.findOneAndUpdate = old.find; Draft.exists = old.exists; Draft.updateOne = old.update; for (const [key, value] of [["CALLSENSE_SHARED_BUNDLE_SOURCE_ACCOUNT_SID", old.source], ["CALLSENSE_SHARED_BUNDLE_SOURCE_SID", old.bundle]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } } };
}
test("clonage unique de la source configurée et validation du compte cible", async () => {
  const f = fixture(); try { await cloneSharedBundle("restaurant", "admin", f); assert.equal(f.count(), 1); assert.equal(f.state.regulatoryBundleSid, cloneSid); assert.equal(f.state.bundleCloneOperation, "completed"); await cloneSharedBundle("restaurant", "admin", f); assert.equal(f.count(), 1); } finally { f.restore(); }
});
test("résultat incertain ou dossier équivalent : aucun second clonage", async () => {
  const f = fixture(); try { f.reject(); await assert.rejects(cloneSharedBundle("restaurant", "admin", f), /incertain/); assert.equal(f.state.bundleCloneOperation, "uncertain"); await assert.rejects(cloneSharedBundle("restaurant", "admin", f), /incertain/); assert.equal(f.count(), 1); } finally { f.restore(); }
  const g = fixture(); try { g.found(); await assert.rejects(cloneSharedBundle("restaurant", "admin", g), /similaire/); assert.equal(g.count(), 0); } finally { g.restore(); }
});
test("deux demandes concurrentes ne créent qu’un clone", async () => {
  const f = fixture();
  try { const results = await Promise.allSettled([cloneSharedBundle("restaurant", "admin", f), cloneSharedBundle("restaurant", "admin", f)]); assert.equal(f.count(), 1); assert.equal(results.filter(result => result.status === "fulfilled").length, 1); }
  finally { f.restore(); }
});
test("un clone attribué au mauvais compte reste incertain et n’est pas enregistré", async () => {
  const f = fixture(); try { f.wrongOwner(); await assert.rejects(cloneSharedBundle("restaurant", "admin", f), /incertain/); assert.equal(f.state.regulatoryBundleSid, ""); assert.equal(f.state.bundleCloneOperation, "uncertain"); assert.equal(f.count(), 1); } finally { f.restore(); }
});
test("un Bundle du compte principal est cloné avec le client principal sans authentification du POC", async () => {
  const f = fixture();
  try {
    process.env.CALLSENSE_SHARED_BUNDLE_SOURCE_ACCOUNT_SID = mainSid;
    f.makeTwilio = () => { throw new Error("Le sous-compte source ne doit pas être utilisé"); };
    await cloneSharedBundle("restaurant", "admin", f);
    assert.equal(f.count(), 1); assert.equal(f.state.regulatoryBundleSid, cloneSid);
  } finally { f.restore(); }
});
