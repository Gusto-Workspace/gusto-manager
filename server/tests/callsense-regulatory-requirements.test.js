const test = require("node:test");
const assert = require("node:assert/strict");
const { regulatoryRequirements } = require("../services/callsense-onboarding.service");
const RN = `RN${"a".repeat(32)}`;
function fixture(regulations) {
  const calls = [];
  const list = (name, value) => ({ list: async opts => { calls.push([name, opts]); return value; } });
  const api = { regulations: list("regulations", regulations), endUserTypes: list("endUsers", [{ sid: "IT", machineName: "business", fields: [{ machine_name: "company_name" }] }]), supportingDocumentTypes: list("documents", [{ sid: "DT", machineName: "proof", fields: [{ machine_name: "file" }] }]) };
  return { calls, getDraftClient: async id => { assert.equal(id, "restaurant"); return { client: { numbers: { v2: { regulatoryCompliance: api } } } }; } };
}
test("lecture des exigences et contraintes actuelles dans le sous-compte du restaurant", async () => {
  const f = fixture([{ sid: RN, isoCountry: "FR", numberType: "local", endUserType: "business", requirements: { end_user: [{ fields: ["company_name"] }], supporting_document: [] } }]);
  const result = await regulatoryRequirements("restaurant", { ...f, endUserType: "business" });
  assert.equal(result.regulationSid, RN); assert.deepEqual(result.requirements.end_user[0].fields, ["company_name"]);
  assert.equal(result.supportingDocumentTypes[0].machineName, "proof");
  assert.deepEqual(f.calls.find(x => x[0] === "regulations")[1], { isoCountry: "FR", numberType: "local", endUserType: "business", includeConstraints: true, limit: 101, pageSize: 50 });
});
test("les exigences absentes, ambiguës ou les types non autorisés bloquent le parcours", async () => {
  const f = fixture([]);
  await assert.rejects(regulatoryRequirements("restaurant", { ...f, endUserType: "business" }), /ambiguës/);
  await assert.rejects(regulatoryRequirements("restaurant", { ...f, endUserType: "other" }), /invalide/);
  const item = { sid: RN, isoCountry: "FR", numberType: "local", endUserType: "business", requirements: {} };
  await assert.rejects(regulatoryRequirements("restaurant", { ...fixture([item, item]), endUserType: "business" }), /ambiguës/);
});
