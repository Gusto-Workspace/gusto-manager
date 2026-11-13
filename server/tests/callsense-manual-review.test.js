const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const service = require("../services/callsense-onboarding.service");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const router = require("../routes/callsense-onboarding.routes");
const handler = router.stack.find(layer => layer.route?.path?.endsWith("/compliance-check")).route.stack[0].handle;
function response() { return { code: 200, status(code) { this.code = code; return this; }, set() { return this; }, json(value) { this.value = value; return this; } }; }
function fixture(t, authorized = true) {
  const state = { accountSid: "ACtest", regulatoryBundleSid: "BUtest", automation: { status: "running", phase: "compliance", ...(authorized ? { resumeMode: "onboarding", actorId: "admin", maxAmount: "2.00", currency: "USD" } : {}) } };
  let status = "pending-review", queues = 0;
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Draft, "findOne", () => ({ lean: async () => structuredClone(state) }));
  t.mock.method(service, "inspectCompliance", async () => ({ bundle: { sid: "BUtest", status, compatible: true } }));
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => {
    const oldCheck = state.regulatoryApproval?.checkedAt;
    const expected = filter["regulatoryApproval.checkedAt"];
    if (expected?.$exists === false ? Boolean(oldCheck) : Number(expected) !== Number(oldCheck)) return null;
    if (filter["automation.status"] && filter["automation.status"] !== state.automation.status) return null;
    for (const [key, value] of Object.entries(update.$set)) { const parts = key.split("."); if (parts.length === 2) state[parts[0]][parts[1]] = value; else state[key] = value; }
    if (update.$set["automation.nextAttemptAt"]) queues++;
    return structuredClone(state);
  });
  const invoke = async () => { const res = response(); await handler({ params: { restaurantId: "restaurant" } }, res); return res; };
  return { state, invoke, setStatus: value => { status = value; }, queued: () => queues };
}
test("vérification manuelle, décision en attente et approbation sans doublon", async t => {
  const f = fixture(t);
  const pending = await f.invoke(); assert.equal(pending.code, 200); assert.equal(f.state.automation.status, "waiting"); assert.equal(f.queued(), 0);
  f.setStatus("twilio-approved");
  const [first, second] = await Promise.all([f.invoke(), f.invoke()]);
  assert.equal(first.code, 200); assert.equal(second.code, 200); assert.equal(f.queued(), 1);
  assert.equal(f.state.automation.status, "running"); assert.equal(f.state.automation.manualApprovalBundleSid, "BUtest"); assert.equal(f.state.automation.manualApprovalAccountSid, "ACtest");
  const scheduled = f.state.automation.nextAttemptAt; await f.invoke(); assert.equal(f.queued(), 1); assert.equal(f.state.automation.nextAttemptAt, scheduled);
});
test("aucun achat n'est programmé sans autorisation et plafond enregistrés", async t => {
  const f = fixture(t, false); f.setStatus("twilio-approved");
  const result = await f.invoke(); assert.equal(result.code, 200); assert.equal(result.value.automaticResume, "authorization_required"); assert.equal(f.queued(), 0);
});
