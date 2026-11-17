const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const { resubmitRejectedBundle } = require("../../services/callsense/callsense-onboarding.service");
const ac = `AC${"a".repeat(32)}`, bu = `BU${"b".repeat(32)}`, rn = `RN${"c".repeat(32)}`;
function fixture(t, compliant, loseResponse = false) {
  const draft = { _id: "draft", accountSid: ac, regulatoryBundleSid: bu, regulatorySubmission: { state: "submitted", bundleSid: bu } }; let status = "twilio-rejected", writes = 0;
  t.mock.method(Config, "exists", async () => null);
  t.mock.method(Draft, "exists", async () => true);
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => { if (filter["regulatoryResubmission.state"]?.$nin?.includes(draft.regulatoryResubmission?.state) || filter["regulatoryCorrection.state"]?.$nin?.includes(draft.regulatoryCorrection?.state) || filter["regulatoryAddress.state"]?.$nin?.includes(draft.regulatoryAddress?.state)) return null; for (const [key, value] of Object.entries(update.$set)) { const parts = key.split("."); if (parts.length === 2) { draft[parts[0]] ||= {}; draft[parts[0]][parts[1]] = value; } } return draft; });
  t.mock.method(Draft, "updateOne", async (_filter, update) => { draft.regulatoryResubmission.state = update.$set["regulatoryResubmission.state"]; });
  const api = { bundles: sid => ({ fetch: async () => ({ sid, accountSid: ac, regulationSid: rn, status }), evaluations: { create: async () => ({ accountSid: ac, bundleSid: bu, regulationSid: rn, status: compliant ? "compliant" : "noncompliant", results: [] }) }, update: async () => { writes++; status = "pending-review"; if (loseResponse) throw new Error("response lost"); return { sid: bu, accountSid: ac, status }; } }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) };
  return { draft, writes: () => writes, getDraftClient: async () => ({ draft, client: { numbers: { v2: { regulatoryCompliance: api } } } }) };
}
test("un dossier refusé corrigé est évalué puis resoumis une seule fois", async t => {
  const f = fixture(t, true); const opts = { confirm: true, getDraftClient: f.getDraftClient };
  assert.equal((await resubmitRejectedBundle("restaurant", "admin", opts)).status, "pending-review");
  await assert.rejects(resubmitRejectedBundle("restaurant", "admin", opts), /refusé/); assert.equal(f.writes(), 1);
});
test("une réponse perdue est rapprochée par lecture sans seconde soumission", async t => {
  const f = fixture(t, true, true); const opts = { confirm: true, getDraftClient: f.getDraftClient };
  await assert.rejects(resubmitRejectedBundle("restaurant", "admin", opts), /incertaine/);
  assert.equal((await resubmitRejectedBundle("restaurant", "admin", opts)).status, "pending-review");
  assert.equal(f.writes(), 1); assert.equal(f.draft.regulatoryResubmission.state, "completed");
});
test("une évaluation non conforme ne soumet rien", async t => {
  const f = fixture(t, false); assert.equal((await resubmitRejectedBundle("restaurant", "admin", { confirm: true, getDraftClient: f.getDraftClient })).status, "noncompliant"); assert.equal(f.writes(), 0);
});
test("une correction ou création d'adresse incertaine interdit la resoumission", async t => {
  const f = fixture(t, true);
  f.draft.regulatoryCorrection = { state: "uncertain" };
  await assert.rejects(resubmitRejectedBundle("restaurant", "admin", { confirm: true, getDraftClient: f.getDraftClient }), /en cours ou incertaine/);
  f.draft.regulatoryCorrection = { state: "completed" }; f.draft.regulatoryAddress = { state: "pending" };
  await assert.rejects(resubmitRejectedBundle("restaurant", "admin", { confirm: true, getDraftClient: f.getDraftClient }), /en cours ou incertaine/);
  assert.equal(f.writes(), 0);
});
