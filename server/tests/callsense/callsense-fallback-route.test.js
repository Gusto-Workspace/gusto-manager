const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const Restaurant = require("../../models/restaurant.model");
const fallback = require("../../services/callsense/callsense-fallback.service");
const router = require("../../routes/callsense-onboarding.routes");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";

test("scénario d'acheminement enregistré uniquement pour un dossier non actif", async t => {
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/forwarding-scenario").route.stack.at(-1).handle;
  let live = null, writes = 0;
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => live }) }));
  t.mock.method(Restaurant, "findById", () => ({ select: () => ({ lean: async () => ({ name: "Test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "FR" }, phone: "01", email: "a@b.fr" }) }) }));
  t.mock.method(Draft, "findOne", () => ({ lean: async () => ({ accountSid: "ACtest", regulatoryBundleSid: "BUtest", regulatoryApproval: { accountSid: "ACtest", bundleSid: "BUtest", status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33300000000", numberOperation: "completed", sipDomain: "test", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url: "https://example.test" }, fallbackProbeAt: new Date(), fallbackProbeUrl: "https://example.test", fallbackProbeSipUri: "sip:user@test", webhookOperation: "completed" }) }));
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => { writes++; assert.equal(filter.restaurantId, A); return { forwardingScenario: update.$set.forwardingScenario }; });
  const res = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const req = scenario => ({ params: { restaurantId: A }, body: { scenario } });
  let result = res(); await handler(req("direct"), result); assert.equal(result.value.scenario, "direct");
  result = res(); await handler(req("invalid"), result); assert.equal(result.code, 400);
  live = { managedByOnboarding: false }; result = res(); await handler(req("forward"), result); assert.equal(result.code, 409); assert.equal(writes, 1);
});

test("choix d’acheminement autorisé en mode test et refusé sur un service actif", async t => {
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/forwarding-scenario").route.stack.at(-1).handle;
  let live = { managedByOnboarding: true, enabled: true, provisioningStatus: "ready_for_test" }, writes = 0;
  t.mock.method(Config, "findOne", () => ({ select: () => ({ lean: async () => live }) }));
  t.mock.method(Restaurant, "findById", () => ({ select: () => ({ lean: async () => ({ name: "Test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "FR" }, phone: "01", email: "a@b.fr" }) }) }));
  t.mock.method(Draft, "findOne", () => ({ lean: async () => ({ accountSid: "ACtest", regulatoryBundleSid: "BUtest", regulatoryApproval: { accountSid: "ACtest", bundleSid: "BUtest", status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33300000000", numberOperation: "completed", sipDomain: "test", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url: "https://example.test" }, fallbackProbeAt: new Date(), fallbackProbeUrl: "https://example.test", fallbackProbeSipUri: "sip:user@test", webhookOperation: "completed" }) }));
  t.mock.method(Draft, "findOneAndUpdate", async () => { writes++; return { forwardingScenario: "direct" }; });
  const res = () => ({ status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const req = { params: { restaurantId: A }, body: { scenario: "direct" } };
  let result = res(); await handler(req, result); assert.equal(result.value.scenario, "direct");
  live = { ...live, provisioningStatus: "active" }; result = res(); await handler(req, result); assert.equal(result.code, 409); assert.equal(writes, 1);
});

test("vérification du secours : preuve liée au restaurant et aucune validation téléphonique inventée", async () => {
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/fallback-probe").route.stack.at(-1).handle;
  const originals = { find: Draft.findOne, update: Draft.findOneAndUpdate, config: Config.findOne, probe: fallback.probe };
  const url = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  const draft = { restaurantId: A, sipUsername: "gtest", sipDomain: "gusto-test.sip.twilio.com", checklist: {} };
  let saved;
  Draft.findOne = () => ({ lean: async () => draft });
  Config.findOne = () => ({ lean: async () => null });
  Draft.findOneAndUpdate = async (filter, update) => { assert.equal(filter.restaurantId, A); saved = update; return { fallbackProbeAt: update.$set.fallbackProbeAt }; };
  fallback.probe = async () => ({ url, sipUri: "sip:gtest@gusto-test.sip.twilio.com" });
  const res = { status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  try {
    await handler({ params: { restaurantId: A }, user: { id: "admin" }, body: { fallbackUrl: url } }, res);
    assert.equal(res.value.ok, true);
    assert.equal(saved.$set.fallbackProbeUrl, url);
    assert.equal(saved.$set["checklist.fallbackTest"], false);
    assert.equal(saved.$unset.verifiedFallbackUrl, 1);
  } finally { Draft.findOne = originals.find; Draft.findOneAndUpdate = originals.update; Config.findOne = originals.config; fallback.probe = originals.probe; }
});

test("confirmation téléphonique refusée sans preuve HTTP récente et liée à la cible SIP", async () => {
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/fallback-verification").route.stack.at(-1).handle;
  const originals = { find: Draft.findOne, update: Draft.findOneAndUpdate, config: Config.findOne, origin: process.env.CALLSENSE_PUBLIC_ORIGIN };
  const url = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  const draft = { restaurantId: A, sipUsername: "gtest", sipDomain: "gusto-test.sip.twilio.com" };
  let filter;
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.com";
  Draft.findOne = () => ({ lean: async () => draft });
  Config.findOne = () => ({ lean: async () => null });
  Draft.findOneAndUpdate = async (query) => { filter = query; return null; };
  const res = { status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  try {
    await handler({ params: { restaurantId: A }, user: { id: "admin" }, body: { fallbackUrl: url, confirm: true } }, res);
    assert.equal(res.code, 409); assert.equal(filter.fallbackProbeUrl, url);
    assert.equal(filter.fallbackProbeSipUri, "sip:gtest@gusto-test.sip.twilio.com");
    assert.ok(filter.fallbackProbeAt.$gte instanceof Date);
  } finally { Draft.findOne = originals.find; Draft.findOneAndUpdate = originals.update; Config.findOne = originals.config; process.env.CALLSENSE_PUBLIC_ORIGIN = originals.origin; }
});

test("le mode essai peut vérifier le secours déjà configuré sans déclarer l’appel réussi", async t => {
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/fallback-probe").route.stack.at(-1).handle;
  const url = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
  const draft = { restaurantId: A, sipUsername: "gtest", sipDomain: "gusto-test.sip.twilio.com", voiceFallbackUrl: url, checklist: {} };
  let update;
  t.mock.method(Draft, "findOne", () => ({ lean: async () => draft }));
  t.mock.method(Config, "findOne", () => ({ lean: async () => ({ managedByOnboarding: true, enabled: true, provisioningStatus: "ready_for_test" }) }));
  t.mock.method(fallback, "probe", async () => ({ url, sipUri: `sip:${draft.sipUsername}@${draft.sipDomain}` }));
  t.mock.method(Draft, "findOneAndUpdate", async (_filter, changes) => { update = changes; return { fallbackProbeAt: new Date() }; });
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await handler({ params: { restaurantId: A }, user: { id: "admin" }, body: { fallbackUrl: url } }, res);
  assert.equal(res.value.ok, true); assert.equal(update.$set["checklist.fallbackTest"], false);
});
