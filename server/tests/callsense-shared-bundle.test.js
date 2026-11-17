const test = require("node:test");
const assert = require("node:assert/strict");
const { cloneSharedBundle, complianceStrategy } = require("../services/callsense-provisioning.service");

test("le clonage réglementaire partagé est désactivé même si l'ancienne configuration l'autorise", async () => {
  const previous = process.env.CALLSENSE_COMPLIANCE_STRATEGY;
  process.env.CALLSENSE_COMPLIANCE_STRATEGY = "shared_clone";
  let calls = 0;
  try {
    assert.equal(complianceStrategy(), "individual");
    await assert.rejects(cloneSharedBundle("restaurant", "admin", { onboarding: { draftClient: () => { calls++; } } }), /désactivé/);
    assert.equal(calls, 0);
  } finally { if (previous === undefined) delete process.env.CALLSENSE_COMPLIANCE_STRATEGY; else process.env.CALLSENSE_COMPLIANCE_STRATEGY = previous; }
});
