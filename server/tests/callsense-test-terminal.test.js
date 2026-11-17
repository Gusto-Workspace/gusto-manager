const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const router = require("../routes/callsense-onboarding.routes");
const restaurantId = "aaaaaaaaaaaaaaaaaaaaaaaa", accountSid = `AC${"a".repeat(32)}`, bundle = `BU${"b".repeat(32)}`;

test("changer de terminal en mode test réinitialise la recette sans modifier les ressources", async () => {
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding" && layer.route.methods.put).route.stack.at(-1).handle;
  const old = { exists: Config.exists, config: Config.findOne, draft: Draft.findOne, update: Draft.findOneAndUpdate };
  let live = { managedByOnboarding: true, enabled: false, provisioningStatus: "ready_for_test", accountSid }, captured;
  Config.exists = async () => true;
  Config.findOne = () => ({ select: () => ({ lean: async () => live }) });
  Draft.findOne = () => ({ lean: async () => ({ accountSid, regulatoryBundleSid: bundle, terminalType: "softphone", serviceStatus: "ready_for_test" }) });
  Draft.findOneAndUpdate = async (filter, update) => { captured = { filter, update }; return { restaurantId, accountSid, terminalType: "HT813" }; };
  const response = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const req = { params: { restaurantId }, body: { terminalType: "HT813", regulatoryBundleSid: bundle, operator: "" } };
  try {
    let res = response(); await handler(req, res);
    assert.equal(res.value.terminalType, "HT813");
    assert.equal(captured.update.$set["checklist.terminalConnected"], false);
    assert.equal(captured.update.$set["checklist.incomingTest"], false);
    assert.equal(captured.update.$set["checklist.fallbackTest"], false);
    assert.equal(captured.update.$unset.verifiedFallbackUrl, 1);
    assert.equal(captured.update.$set.regulatoryBundleSid, undefined);
    captured = null; live = { ...live, enabled: true, provisioningStatus: "active" };
    res = response(); await handler(req, res); assert.equal(res.code, 409); assert.equal(captured, null);
  } finally { Config.exists = old.exists; Config.findOne = old.config; Draft.findOne = old.draft; Draft.findOneAndUpdate = old.update; }
});

test("changement de scénario en mode test invalide les essais précédents", async () => {
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/forwarding-scenario").route.stack.at(-1).handle;
  const old = { config: Config.findOne, restaurant: Restaurant.findById, draft: Draft.findOne, update: Draft.findOneAndUpdate };
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ managedByOnboarding: true, enabled: false, provisioningStatus: "ready_for_test" }) }) });
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Test", phone: "01", email: "a@b.test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "FR" } }) }) });
  Draft.findOne = () => ({ lean: async () => ({ accountSid, regulatoryBundleSid: bundle, regulatoryApproval: { accountSid, bundleSid: bundle, status: "twilio-approved", compatible: true }, phoneNumberSid: "PN", twilioNumber: "+33300000000", numberOperation: "completed", sipDomain: "x.sip.twilio.com", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url: "https://x.twil.io/fallback" }, fallbackProbeAt: new Date(), fallbackProbeUrl: "https://x.twil.io/fallback", fallbackProbeSipUri: "sip:user@x.sip.twilio.com", webhookOperation: "completed", forwardingScenario: "direct", checklist: { terminalConnected: true } }) });
  let update;
  Draft.findOneAndUpdate = async (_filter, changes) => { update = changes; return { forwardingScenario: "forward" }; };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  try {
    await handler({ params: { restaurantId }, body: { scenario: "forward" } }, res);
    assert.equal(res.value.scenario, "forward"); assert.equal(update.$set["checklist.operatorForwarding"], false);
    assert.equal(update.$set["checklist.incomingTest"], false); assert.equal(update.$set["checklist.fallbackTest"], false);
  } finally { Config.findOne = old.config; Restaurant.findById = old.restaurant; Draft.findOne = old.draft; Draft.findOneAndUpdate = old.update; }
});
