const test = require("node:test");
const assert = require("node:assert/strict");
const { currentStep } = require("../../services/callsense/callsense-onboarding-progress.service");
const Restaurant = require("../../models/restaurant.model");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const pushPath = require.resolve("../../services/shared/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const router = require("../../routes/callsense-onboarding.routes");
const restaurant = { name: "Fictif", address: { line1: "1 rue Test", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" };
function readyDraft() {
  return { accountSid: "ACtest", regulatoryBundleSid: "BUtest", regulatoryApproval: { accountSid: "ACtest", bundleSid: "BUtest", status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33123456789", numberOperation: "completed", sipDomain: "test.example", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url: "https://example.test/fallback" }, fallbackProbeUrl: "https://example.test/fallback", fallbackProbeSipUri: "sip:user@test.example", fallbackProbeAt: new Date(), webhookOperation: "completed", checklist: {} };
}
test("la progression reprend uniquement sur des preuves cohérentes", () => {
  assert.equal(currentStep({}, {}), 0);
  assert.equal(currentStep(restaurant, {}), 1);
  const draft = readyDraft();
  draft.regulatoryApproval.status = "pending-review"; assert.equal(currentStep(restaurant, draft), 2);
  draft.regulatoryApproval.status = "twilio-approved"; draft.regulatoryApproval.bundleSid = "BUautre"; assert.equal(currentStep(restaurant, draft), 2);
  draft.regulatoryApproval.bundleSid = "BUtest"; draft.numberOperation = "uncertain"; assert.equal(currentStep(restaurant, draft), 3);
  draft.numberOperation = "completed"; draft.webhookOperation = "pending"; assert.equal(currentStep(restaurant, draft), 4);
  draft.webhookOperation = "completed"; assert.equal(currentStep(restaurant, draft), 5);
  draft.checklist.terminalConnected = true; draft.forwardingScenario = "forward"; assert.equal(currentStep(restaurant, draft), 5);
  draft.checklist.operatorForwarding = true; assert.equal(currentStep(restaurant, draft), 6);
});
test("les routes bloquent les opérations et la progression prématurées", async t => {
  const draft = readyDraft(); draft.regulatoryApproval.status = "pending-review";
  t.mock.method(Restaurant, "findById", () => ({ select: () => ({ lean: async () => restaurant }) }));
  t.mock.method(Draft, "findOne", () => ({ lean: async () => draft }));
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  let writes = 0; t.mock.method(Draft, "findOneAndUpdate", async () => { writes++; return { wizardStep: 5 }; });
  const guard = router.stack.find(layer => layer.handle.name === "requireCurrentStage").handle;
  const progress = router.stack.find(layer => layer.route?.path?.endsWith("/progress")).route.stack[0].handle;
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  let res = response(), continued = false;
  await guard({ method: "POST", path: "/number-purchase", params: { restaurantId: "fictif" } }, res, () => { continued = true; });
  assert.equal(res.code, 409); assert.equal(continued, false); assert.equal(writes, 0);
  res = response(); await progress({ params: { restaurantId: "fictif" }, body: { step: 5 } }, res); assert.equal(res.code, 409); assert.equal(writes, 0);
  res = response(); continued = false; await guard({ method: "POST", path: "/regulatory-submission", params: { restaurantId: "fictif" } }, res, () => { continued = true; }); assert.equal(continued, true);
});
