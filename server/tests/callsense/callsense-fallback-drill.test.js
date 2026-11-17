const test = require("node:test"), assert = require("node:assert/strict");
const pushPath = require.resolve("../../services/shared/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { sendPushToModule: async () => {} } };
const Draft = require("../../models/callsense/callsense-onboarding.model"), Config = require("../../models/callsense/callsense-config.model");
const drill = require("../../services/callsense/callsense-fallback-drill.service"), { encryptToken } = require("../../services/callsense/callsense-secrets.service");
const id = "aaaaaaaaaaaaaaaaaaaaaaaa", other = "bbbbbbbbbbbbbbbbbbbbbbbb", accountSid = `AC${"a".repeat(32)}`;
process.env.CALLSENSE_ENCRYPTION_KEY = "31".repeat(32); process.env.CALLSENSE_PUBLIC_ORIGIN = "https://example.test";

test("trois scénarios : expiration, interruption, annulation et confirmations explicites", async () => {
  const old = { find: Draft.findOne, update: Draft.updateOne, findUpdate: Draft.findOneAndUpdate, config: Config.findOne };
  let config = { restaurantId: id, accountSid, phoneNumberSid: "PNtest", twilioNumber: "+33323456789", managedByOnboarding: true, enabled: false, provisioningStatus: "ready_for_test" };
  const state = { _id: id, restaurantId: id, accountSid, phoneNumberSid: config.phoneNumberSid, twilioNumber: config.twilioNumber, encryptedAuthToken: encryptToken("fake", id, accountSid), serviceStatus: "ready_for_test", webhookOperation: "completed", sipCredentialOperation: "completed", activationOperation: "idle", voiceFallbackUrl: `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`, checklist: {}, fallbackDrill: {} };
  const get = (obj, key) => key.split(".").reduce((x, k) => x?.[k], obj);
  const set = (obj, key, value) => { const parts = key.split("."); let x = obj; for (const part of parts.slice(0, -1)) x = x[part] ||= {}; x[parts.at(-1)] = value; };
  const remove = (obj, key) => { const parts = key.split("."), parent = parts.slice(0, -1).reduce((x, k) => x?.[k], obj); if (parent) delete parent[parts.at(-1)]; };
  const matches = filter => Object.entries(filter).every(([key, expected]) => { const actual = get(state, key); if (expected && typeof expected === "object" && !(expected instanceof Date)) { if (expected.$in) return expected.$in.includes(actual); if (expected.$nin) return !expected.$nin.includes(actual); if (expected.$ne !== undefined) return actual !== expected.$ne; if (expected.$gt) return new Date(actual) > expected.$gt; } return expected instanceof Date ? +new Date(actual) === +expected : String(actual) === String(expected); });
  const mutate = (filter, update) => { if (!matches(filter)) return null; for (const [key, value] of Object.entries(update.$set || {})) set(state, key, value); for (const key of Object.keys(update.$unset || {})) remove(state, key); return structuredClone(state); };
  Draft.findOne = filter => ({ select() { return this; }, maxTimeMS() { return this; }, lean: async () => matches(filter) ? structuredClone(state) : null });
  Draft.updateOne = async (filter, update) => ({ matchedCount: mutate(filter, update) ? 1 : 0 });
  Draft.findOneAndUpdate = (filter, update) => { const result = Promise.resolve(mutate(filter, update)); result.select = () => result; return result; };
  Config.findOne = () => ({ lean: async () => config });
  const opts = { confirm: true, makeTwilio: () => ({}), verify: async () => {}, probeOrigin: async () => {} };
  try {
    assert.equal(await drill.mode({ ...config, restaurantId: other }), null);
    for (const scenario of drill.SCENARIOS) {
      await drill.start(id, "admin", { scenario, confirm: true });
      await assert.rejects(drill.start(id, "admin", { scenario, confirm: true }), /déjà en cours/);
      assert.equal((await drill.mode(config)).scenario, scenario); assert.equal(await drill.triggered(config, scenario), true);
      state.fallbackDrill.expiresAt = new Date(Date.now() - 1);
      assert.equal(await drill.mode(config), null);
      await drill.stop(id, "admin", opts);
      assert.equal(await drill.mode(config), null); assert.equal(state.fallbackDrill.state, "restoring");
      await assert.rejects(drill.confirm(id, "admin", { fallbackWorked: true, normalCallWorked: false }), /appel réel/);
      await drill.confirm(id, "admin", { fallbackWorked: true, normalCallWorked: true });
      assert.equal(state.fallbackDrill.results[scenario], true);
      if (scenario !== "timeout") assert.notEqual(state.checklist.fallbackHttpFailures, true);
    }
    assert.equal(state.checklist.fallbackHttpFailures, true);
    await drill.start(id, "admin", { scenario: "http", confirm: true });
    await drill.stop(id, "admin", opts);
    await assert.rejects(drill.confirm(id, "admin", { fallbackWorked: true, normalCallWorked: true }), /appel pendant le test/);
    await drill.confirm(id, "admin", { fallbackWorked: false, normalCallWorked: true });
    assert.equal(state.fallbackDrill.results.http, false);
    config = { ...config, enabled: true, provisioningStatus: "active" };
    await assert.rejects(drill.start(id, "admin", { scenario: "http", confirm: true }), /mode d’essai/);
    assert.equal(await drill.mode(config), null);
  } finally { Draft.findOne = old.find; Draft.updateOne = old.update; Draft.findOneAndUpdate = old.findUpdate; Config.findOne = old.config; }
});

test("échec de vérification : simulation arrêtée, rétablissement non validé", async () => {
  const old = { findUpdate: Draft.findOneAndUpdate, config: Config.findOne };
  const state = { _id: id, restaurantId: id, accountSid, encryptedAuthToken: encryptToken("fake", id, accountSid), voiceFallbackUrl: `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`, fallbackDrill: { state: "running", scenario: "http" } };
  Draft.findOneAndUpdate = (_filter, update) => { state.fallbackDrill.state = update.$set["fallbackDrill.state"]; const result = Promise.resolve(state); result.select = () => result; return result; };
  Config.findOne = () => ({ lean: async () => ({ accountSid, managedByOnboarding: true, enabled: false, provisioningStatus: "ready_for_test" }) });
  try { await assert.rejects(drill.stop(id, "admin", { confirm: true, makeTwilio: () => ({}), probeOrigin: async () => { throw Error("indisponible"); } }), /n’a pas pu être vérifié/); assert.equal(state.fallbackDrill.state, "restoring"); }
  finally { Draft.findOneAndUpdate = old.findUpdate; Config.findOne = old.config; }
});

test("webhook : erreurs simulées bornées et retour normal pour les autres restaurants", async () => {
  const router = require("../../routes/callsense.routes"), service = require("../../services/callsense/callsense.service");
  const handler = router.stack.find(layer => layer.route?.path === "/callsense/voice").route.stack.at(-1).handle;
  const old = { route: service.findRoute, incoming: service.recordIncoming, mode: drill.mode, triggered: drill.triggered, timeout: global.setTimeout };
  let scenario, callback, delay;
  service.findRoute = async () => ({ restaurantId: id, accountSid, twilioNumber: "+33323456789", sipUri: "sip:user@example.test" });
  service.recordIncoming = async () => {};
  drill.mode = async () => scenario ? { scenario, expiresAt: Date.now() + 90000 } : null; drill.triggered = async () => true;
  global.setTimeout = (fn, ms) => { callback = fn; delay = ms; return 42; };
  const response = () => ({ destroyed: false, headersSent: false, sendStatus(code) { this.code = code; return this; }, type() { return this; }, send(value) { this.body = value; return this; }, once() {} });
  const req = { body: { AccountSid: accountSid, To: "+33323456789", CallSid: "CA123" } };
  try {
    scenario = "http"; let res = response(); await handler(req, res); assert.equal(res.code, 500);
    scenario = "invalid"; res = response(); await handler(req, res); assert.equal(res.body, "<Response><Invalid");
    scenario = "timeout"; res = response(); await handler(req, res); assert.equal(res.code, undefined); assert.equal(delay, 16000); callback(); assert.equal(res.code, 504);
    scenario = "http"; drill.triggered = async () => false; res = response(); await handler(req, res); assert.match(res.body, /<Dial/);
  } finally { await new Promise(resolve => setImmediate(resolve)); service.findRoute = old.route; service.recordIncoming = old.incoming; drill.mode = old.mode; drill.triggered = old.triggered; global.setTimeout = old.timeout; }
});

test("les routes de simulation sont derrière l’authentification administrateur existante", () => {
  const router = require("../../routes/callsense-onboarding.routes");
  const prefix = router.stack.find(layer => !layer.route && layer.name === "router") || router.stack.find(layer => !layer.route && layer.handle?.name === "authenticateAdmin");
  assert.ok(prefix);
  const requireAdminRole = require("../../middleware/authenticate-admin").requireAdminRole;
  for (const role of ["owner", "employee", "seller"]) { const res = { status(code) { this.code = code; return this; }, json() { return this; } }; let passed = false; requireAdminRole({ user: { role } }, res, () => { passed = true; }); assert.equal(res.code, 403); assert.equal(passed, false); }
  for (const action of ["start", "stop", "confirm"]) assert.ok(router.stack.some(layer => layer.route?.path === `/admin/restaurants/:restaurantId/callsense-onboarding/fallback-drill/${action}` && layer.route.methods.post));
});
