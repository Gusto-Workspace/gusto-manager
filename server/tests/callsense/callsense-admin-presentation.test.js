const test = require("node:test");
const assert = require("node:assert/strict");
const Restaurant = require("../../models/restaurant.model");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const router = require("../../routes/callsense-onboarding.routes");
const base = "/admin/restaurants/:restaurantId/callsense-onboarding";
const A = "aaaaaaaaaaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
const response = () => ({ set() { return this; }, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test("configuration historique présentée sans secrets ni identifiant SIP", async () => {
  const original = { restaurant: Restaurant.findById, draft: Draft.findOne, config: Config.findOne };
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Restaurant" }) }) });
  Draft.findOne = () => ({ lean: async () => null });
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ enabled: true, accountSid: "ACtest", twilioNumber: "+33123456789", sipUri: "sip:private-user@example.sip.twilio.com", encryptedAuthToken: "private-secret" }) }) });
  try {
    const res = response(); await handler(base)({ params: { restaurantId: A } }, res);
    assert.equal(res.value.configuration.accountSid, "ACtest");
    assert.equal(res.value.configuration.sipDomain, "example.sip.twilio.com");
    assert.equal(res.value.configuration.terminalType, null);
    assert.equal(res.value.draft, null);
    assert.doesNotMatch(JSON.stringify(res.value), /private-user|private-secret/);
  } finally { Restaurant.findById = original.restaurant; Draft.findOne = original.draft; Config.findOne = original.config; }
});

test("conformité historique lue sur le bon numéro, sans divulguer le jeton", async () => {
  const originalFind = Config.findOne;
  const secrets = require("../../services/callsense/callsense-secrets.service");
  const decrypt = secrets.decryptToken;
  const twilioPath = require.resolve("twilio");
  const originalTwilio = require.cache[twilioPath].exports;
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ restaurantId: A, accountSid: "ACtest", twilioNumber: "+33123456789", encryptedAuthToken: "secret" }) }) });
  secrets.decryptToken = () => "private-token";
  require.cache[twilioPath].exports = () => ({ incomingPhoneNumbers: { list: async () => [{ accountSid: "ACtest", phoneNumber: "+33123456789", bundleSid: "BUtest" }] },
    numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ status: "twilio-approved" }) }) } } } });
  try {
    const res = response(); await handler(`${base}/live-compliance`)({ params: { restaurantId: A } }, res);
    assert.deepEqual(res.value, { verified: true, status: "twilio-approved" });
    assert.doesNotMatch(JSON.stringify(res.value), /token|secret|BUtest/);
  } finally { Config.findOne = originalFind; secrets.decryptToken = decrypt; require.cache[twilioPath].exports = originalTwilio; }
});

test("progression enregistrée par restaurant et installation historique protégée", async () => {
  const original = { config: Config.findOne, update: Draft.findOneAndUpdate, draft: Draft.findOne, restaurant: Restaurant.findById };
  const saved = {};
  Config.findOne = ({ restaurantId }) => ({ select: () => ({ lean: async () => restaurantId === B ? { managedByOnboarding: false } : null }) });
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "FR" }, phone: "0123456789", email: "test@example.test" }) }) });
  Draft.findOne = () => ({ lean: async () => ({ accountSid: "ACtest", regulatoryBundleSid: "BUtest", regulatoryApproval: { bundleSid: "BUtest", accountSid: "ACtest", status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33300000000", numberOperation: "completed" }) });
  Draft.findOneAndUpdate = async (filter, update) => { saved[filter.restaurantId] = update.$set.wizardStep; return { wizardStep: saved[filter.restaurantId] }; };
  try {
    let res = response(); await handler(`${base}/progress`)({ params: { restaurantId: A }, body: { step: 4 } }, res);
    assert.equal(res.value.step, 4);
    res = response(); await handler(`${base}/progress`)({ params: { restaurantId: A }, body: { step: 5 } }, res);
    assert.equal(res.code, 409); assert.equal(saved[A], 4);
    res = response(); await handler(`${base}/progress`)({ params: { restaurantId: B }, body: { step: 6 } }, res);
    assert.equal(res.code, 409); assert.equal(saved[B], undefined);
    res = response(); await handler(`${base}/progress`)({ params: { restaurantId: A }, body: { step: 7 } }, res);
    assert.equal(res.code, 400); assert.equal(saved[A], 4);
  } finally { Config.findOne = original.config; Draft.findOneAndUpdate = original.update; Draft.findOne = original.draft; Restaurant.findById = original.restaurant; }
});
