const test = require("node:test");
const assert = require("node:assert/strict");
const { cloneSharedBundle, complianceStrategy } = require("../../services/callsense/callsense-provisioning.service");

test("seul le dossier individuel est proposé et le clonage est refusé", async () => {
  let calls = 0;
  assert.equal(complianceStrategy(), "individual");
  await assert.rejects(cloneSharedBundle("restaurant", "admin", { onboarding: { draftClient: () => { calls++; } } }), /désactivé/);
  assert.equal(calls, 0);
});
