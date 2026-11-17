const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const { encryptToken } = require("../../services/callsense/callsense-secrets.service");
const { testFallbackRouting } = require("../../services/callsense/callsense-provisioning.service");
const restaurantId = "a".repeat(24), accountSid = `AC${"a".repeat(32)}`, phoneNumberSid = `PN${"b".repeat(32)}`;

function setup(t) {
  const oldKey = process.env.CALLSENSE_ENCRYPTION_KEY; process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);
  t.after(() => { if (oldKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = oldKey; });
  const url = "https://example.twil.io/fallback";
  const state = { _id: "draft", restaurantId, accountSid, phoneNumberSid, twilioNumber: "+33123456789", numberOperation: "completed", sipCredentialOperation: "completed", sipUsername: "gtest", sipDomain: "gusto.sip.twilio.com", encryptedAuthToken: encryptToken("fake", restaurantId, accountSid), audit: [{ action: "number_purchased" }], fallbackFunction: { operation: "completed", url }, fallbackProbeUrl: url, fallbackProbeSipUri: "sip:gtest@gusto.sip.twilio.com", fallbackProbeAt: new Date() };
  const number = { sid: phoneNumberSid, accountSid, phoneNumber: state.twilioNumber, voiceUrl: "https://example.test/original", voiceMethod: "POST", voiceFallbackUrl: "", voiceFallbackMethod: "POST" };
  let writes = 0, loseResponse = false;
  const set = values => { for (const [path, value] of Object.entries(values || {})) { const keys = path.split("."); let obj = state; for (const key of keys.slice(0, -1)) obj = obj[key] ||= {}; obj[keys.at(-1)] = value; } };
  t.mock.method(Config, "exists", async () => null);
  t.mock.method(Draft, "exists", async query => state.testRouting?.attemptId === query["testRouting.attemptId"] && state.testRouting?.state === query["testRouting.state"]);
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => {
    const expected = filter["testRouting.state"];
    if (typeof expected === "string" && state.testRouting?.state !== expected || expected?.$in && !expected.$in.includes(state.testRouting?.state || null) || filter["testRouting.attemptId"] && state.testRouting?.attemptId !== filter["testRouting.attemptId"]) return null;
    set(update.$set); return structuredClone(state);
  });
  t.mock.method(Draft, "updateOne", async (filter, update) => { if (state.testRouting?.attemptId === filter["testRouting.attemptId"]) set(update.$set); return { matchedCount: 1 }; });
  const client = { incomingPhoneNumbers: () => ({ fetch: async () => ({ ...number }), update: async changes => { writes++; Object.assign(number, changes); if (loseResponse) { loseResponse = false; throw new Error("response lost"); } } }) };
  const opts = { confirm: true, loadState: async () => ({ draft: structuredClone(state), existing: null, client }), probeFallback: async () => ({}) };
  return { state, number, opts, writes: () => writes, loseResponse: () => { loseResponse = true; } };
}
test("routage temporaire puis restauration sans déclarer le test réussi", async t => {
  const f = setup(t); const original = f.number.voiceUrl;
  assert.deepEqual(await testFallbackRouting(restaurantId, "admin", f.opts), { state: "active" });
  assert.equal(f.number.voiceUrl, f.state.fallbackFunction.url); assert.equal(f.state.testRouting.previous.voiceUrl, original);
  assert.deepEqual(await testFallbackRouting(restaurantId, "admin", { ...f.opts, restore: true }), { state: "restored" });
  assert.equal(f.number.voiceUrl, original); assert.equal(f.writes(), 2); assert.notEqual(f.state.checklist?.fallbackTest, true);
});
test("réponse perdue après modification : reprise limitée à une restauration vérifiée", async t => {
  const f = setup(t); const original = f.number.voiceUrl; f.loseResponse();
  await assert.rejects(testFallbackRouting(restaurantId, "admin", f.opts), /incertain/);
  assert.equal(f.state.testRouting.state, "uncertain");
  await assert.rejects(testFallbackRouting(restaurantId, "admin", f.opts), /en cours/);
  await testFallbackRouting(restaurantId, "admin", { ...f.opts, restore: true });
  assert.equal(f.number.voiceUrl, original); assert.equal(f.state.testRouting.state, "restored");
});
test("installation existante, numéro associé et modification externe sont protégés", async t => {
  const f = setup(t);
  await assert.rejects(testFallbackRouting(restaurantId, "admin", { ...f.opts, loadState: async () => ({ draft: f.state, existing: { enabled: true }, client: {} }) }), /protégée/);
  f.state.audit = []; await assert.rejects(testFallbackRouting(restaurantId, "admin", f.opts), /acheté/); assert.equal(f.writes(), 0);
  f.state.audit = [{ action: "number_purchased" }]; await testFallbackRouting(restaurantId, "admin", f.opts);
  f.number.voiceUrl = "https://example.test/change-externe";
  await assert.rejects(testFallbackRouting(restaurantId, "admin", { ...f.opts, restore: true }), /modifié/); assert.equal(f.writes(), 1);
});
