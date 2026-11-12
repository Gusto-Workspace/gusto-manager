const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const fallback = require("../services/callsense-fallback.service");
const router = require("../routes/callsense-onboarding.routes");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";

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
