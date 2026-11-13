const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateIndividualBundle } = require("../services/callsense-onboarding.service");
const accountSid = `AC${"a".repeat(32)}`, bundleSid = `BU${"b".repeat(32)}`, regulationSid = `RN${"c".repeat(32)}`;
function fixture() {
  let calls = 0;
  const draft = { accountSid, regulatoryBundleSid: bundleSid };
  const api = { bundles: sid => ({ fetch: async () => ({ sid, accountSid, regulationSid }), evaluations: { create: async () => { calls++; return { accountSid, bundleSid, regulationSid, status: "noncompliant", results: [{ valid: false, error_code: "missing" }] }; } } }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) };
  return { draft, count: () => calls, getDraftClient: async () => ({ draft, client: { numbers: { v2: { regulatoryCompliance: api } } } }) };
}
test("évaluation officielle d'un dossier individuel du bon sous-compte", async () => {
  const f = fixture(); const result = await evaluateIndividualBundle("restaurant", { confirm: true, getDraftClient: f.getDraftClient });
  assert.equal(result.status, "noncompliant"); assert.equal(result.results[0].valid, false); assert.equal(f.count(), 1);
});
test("aucune évaluation sans confirmation ou avec dossier partagé", async () => {
  const f = fixture(); await assert.rejects(evaluateIndividualBundle("restaurant", { getDraftClient: f.getDraftClient }), /Confirmation/);
  f.draft.bundleCloneOperation = "completed"; await assert.rejects(evaluateIndividualBundle("restaurant", { confirm: true, getDraftClient: f.getDraftClient }), /partagé/); assert.equal(f.count(), 0);
});
