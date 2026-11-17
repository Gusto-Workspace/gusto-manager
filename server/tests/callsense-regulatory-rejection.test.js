const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../models/callsense/callsense-config.model");
const { rejectedBundleDetails } = require("../services/callsense-onboarding.service");
const ac = `AC${"a".repeat(32)}`, bu = `BU${"b".repeat(32)}`, rn = `RN${"c".repeat(32)}`, user = `IT${"d".repeat(32)}`, doc = `RD${"e".repeat(32)}`;
function fixture(t) {
  t.mock.method(Config, "exists", async () => null);
  const draft = { accountSid: ac, regulatoryBundleSid: bu, regulatorySubmission: { bundleSid: bu, regulationSid: rn, endUserSid: user, documentSids: [doc] } };
  const rows = [{ accountSid: ac, bundleSid: bu, objectSid: user }, { accountSid: ac, bundleSid: bu, objectSid: doc }];
  const item = { sid: doc, accountSid: ac, type: "proof", status: "rejected", failureReason: "Document illisible", errors: [{ message: "Renouveler le justificatif" }] };
  const api = { bundles: () => ({ fetch: async () => ({ sid: bu, accountSid: ac, regulationSid: rn, status: "twilio-rejected" }), itemAssignments: { list: async () => rows } }), supportingDocuments: () => ({ fetch: async () => item }) };
  return { rows, item, draft, getDraftClient: async () => ({ draft, client: { numbers: { v2: { regulatoryCompliance: api } } } }) };
}
test("motif retourné uniquement pour un justificatif du dossier refusé", async t => {
  const f = fixture(t); const result = await rejectedBundleDetails("restaurant", { getDraftClient: f.getDraftClient });
  assert.equal(result.documents[0].failureReason, "Document illisible"); assert.equal(result.documents[0].errors[0].message, "Renouveler le justificatif");
});
test("un justificatif étranger ou désaffecté bloque la lecture", async t => {
  const f = fixture(t); f.item.accountSid = `AC${"f".repeat(32)}`;
  await assert.rejects(rejectedBundleDetails("restaurant", { getDraftClient: f.getDraftClient }), /non vérifié/);
  f.item.accountSid = ac; f.rows.pop(); await assert.rejects(rejectedBundleDetails("restaurant", { getDraftClient: f.getDraftClient }), /modifié/);
});
