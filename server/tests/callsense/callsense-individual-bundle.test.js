const test = require("node:test");
const assert = require("node:assert/strict");
const { requiresIndividualBundle } = require("../../services/callsense/callsense-individual-bundle.service");

test("le dossier individuel doit correspondre à la soumission de ce restaurant", () => {
  const bundle = `BU${"1".repeat(32)}`;
  assert.equal(requiresIndividualBundle({ regulatoryBundleSid: bundle, regulatorySubmission: { bundleSid: bundle } }), false);
  assert.equal(requiresIndividualBundle({ regulatoryBundleSid: bundle }), true);
  assert.equal(requiresIndividualBundle({ regulatoryBundleSid: bundle, regulatorySubmission: { bundleSid: `BU${"2".repeat(32)}` } }), true);
  assert.equal(requiresIndividualBundle({ regulatoryBundleSid: bundle, regulatorySubmission: { bundleSid: bundle }, bundleCloneOperation: "completed" }), true);
});
