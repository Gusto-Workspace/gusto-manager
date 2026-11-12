const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const { encryptToken } = require("../services/callsense-secrets.service");
const { deploy, uploadVersion } = require("../services/callsense-serverless.service");
const fallback = require("../services/callsense-fallback.service");

const id = "aaaaaaaaaaaaaaaaaaaaaaaa", account = `AC${"1".repeat(32)}`;
const sid = prefix => prefix + "a".repeat(32);
function fixture(t) {
  t.mock.method(Config, "findOne", () => ({ lean: async () => null }));
  const state = { _id: id, restaurantId: id, accountSid: account, encryptedAuthToken: encryptToken("fake-token", id, account), numberOperation: "completed", sipCredentialOperation: "completed", sipUsername: "gusto", sipDomain: "example.sip.twilio.com", fallbackFunction: {}, checklist: {} };
  const get = path => path.split(".").reduce((v, k) => v?.[k], state);
  const set = (path, value) => { const keys = path.split("."); const key = keys.pop(); let obj = state; for (const part of keys) obj = obj[part] ||= {}; obj[key] = value; };
  const matches = query => Object.entries(query).every(([k, v]) => v && typeof v === "object" && "$in" in v ? v.$in.some(x => x == null ? get(k) == null : x === get(k)) : get(k) === v);
  const update = changes => { for (const [k,v] of Object.entries(changes.$set || {})) set(k,v); for (const k of Object.keys(changes.$unset || {})) set(k, undefined); };
  t.mock.method(Draft, "findOne", () => ({ select: () => ({ lean: async () => structuredClone(state) }) }));
  t.mock.method(Draft, "findOneAndUpdate", async (query, changes) => { if (!matches(query)) return null; update(changes); return structuredClone(state); });
  t.mock.method(Draft, "updateOne", async (query, changes) => { if (matches(query)) update(changes); });
  const calls = [], info = { accountSid: account, serviceSid: sid("ZS") };
  let buildStatus = "completed";
  const builds = () => ({ fetch: async () => ({ ...info, status: buildStatus, functionVersions: [{ sid: sid("ZN"), account_sid: account, service_sid: sid("ZS"), function_sid: sid("ZH"), path: "/callsense-fallback", visibility: "protected" }] }) });
  builds.create = async () => { calls.push("build"); return { ...info, sid: sid("ZB") }; };
  const environments = () => ({ deployments: { create: async () => { calls.push("deployment"); return { ...info, sid: sid("ZD"), environmentSid: sid("ZE"), buildSid: sid("ZB") }; } }, fetch: async () => ({ ...info, buildSid: sid("ZB"), domainName: "example-123.twil.io" }) });
  environments.create = async () => { calls.push("environment"); return { ...info, sid: sid("ZE") }; };
  const services = () => ({ functions: { create: async () => { calls.push("function"); return { ...info, sid: sid("ZH") }; } }, builds, environments });
  services.list = async opts => { assert.deepEqual(opts, { limit: 101, pageSize: 50 }); return []; }; services.create = async () => { calls.push("service"); return { accountSid: account, sid: sid("ZS") }; };
  const options = { confirm: true, makeTwilio: () => ({ accountSid: account, serverless: { v1: { services } } }), upload: async ({ source }) => { calls.push("version"); assert.match(source, /sip:gusto@example\.sip\.twilio\.com/); assert.doesNotMatch(source, /fetch\(|mongodb|render\.com/i); return sid("ZN"); }, probe: async (draft, url) => { assert.equal(fallback.allowedUrl(draft, url), true); }, wait: async () => {} };
  return { state, calls, options, setBuildStatus: value => { buildStatus = value; } };
}
test("publication simulée persistée et reprise sans doublon ni validation téléphonique", async t => {
  process.env.CALLSENSE_ENCRYPTION_KEY = "a".repeat(64); const f = fixture(t);
  await assert.rejects(deploy(id, "admin", { ...f.options, confirm: false }), /Confirmation/);
  assert.equal((await deploy(id, "admin", f.options)).status, "ready");
  assert.deepEqual(f.calls, ["service", "function", "version", "build", "environment", "deployment"]);
  assert.equal(f.state.fallbackFunction.operation, "completed"); assert.equal(f.state.checklist.fallbackTest, false);
  await deploy(id, "admin", f.options); assert.equal(f.calls.length, 6);
  assert.equal(fallback.allowedUrl(f.state, "https://other.twil.io/callsense-fallback"), false);
});
test("build interrompu repris au point enregistré ; résultat incertain bloqué", async t => {
  process.env.CALLSENSE_ENCRYPTION_KEY = "a".repeat(64); const f = fixture(t);
  f.setBuildStatus("building"); assert.equal((await deploy(id, "admin", f.options)).status, "waiting");
  f.setBuildStatus("completed"); await deploy(id, "admin", f.options); assert.equal(f.calls.filter(x => x === "build").length, 1);
  f.state.fallbackFunction.operation = "uncertain"; await assert.rejects(deploy(id, "admin", f.options), /incertain/); assert.equal(f.calls.length, 6);
});
test("réponse perdue pendant la création bloque toute répétition", async t => {
  process.env.CALLSENSE_ENCRYPTION_KEY = "a".repeat(64); const f = fixture(t);
  f.options.upload = async () => { f.calls.push("version"); throw Error("timeout"); };
  await assert.rejects(deploy(id, "admin", f.options), /incertain/); assert.equal(f.state.fallbackFunction.operation, "uncertain");
  await assert.rejects(deploy(id, "admin", f.options), /incertain/); assert.equal(f.calls.filter(x => x === "version").length, 1);
});
test("upload utilise le point officiel, une Function protégée et aucun suivi de redirection", async t => {
  t.mock.method(global, "fetch", async (url, request) => {
    assert.equal(url, `https://serverless-upload.twilio.com/v1/Services/${sid("ZS")}/Functions/${sid("ZH")}/Versions`);
    assert.equal(request.redirect, "error"); assert.equal(request.body.get("Path"), "/callsense-fallback");
    assert.equal(request.body.get("Visibility"), "protected"); assert.equal(await request.body.get("Content").text(), "source simulée");
    return { ok: true, json: async () => ({ sid: sid("ZN"), account_sid: account, service_sid: sid("ZS"), function_sid: sid("ZH"), path: "/callsense-fallback", visibility: "protected" }) };
  });
  assert.equal(await uploadVersion({ accountSid: account, authToken: "fake-token", serviceSid: sid("ZS"), functionSid: sid("ZH"), source: "source simulée" }), sid("ZN"));
});
test("diagnostic limité à la phase et aux codes, sans fuite des erreurs Twilio", async t => {
  process.env.CALLSENSE_ENCRYPTION_KEY = "a".repeat(64); const f = fixture(t), logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  f.options.upload = async () => { throw Object.assign(new Error("secret interdit"), { status: 400, code: 12345, token: "secret interdit" }); };
  await assert.rejects(deploy(id, "admin", f.options), /incertain/);
  assert.match(logs.join("\n"), /"phase":"version"/); assert.match(logs.join("\n"), /"status":400/); assert.match(logs.join("\n"), /"code":12345/);
  assert.doesNotMatch(logs.join("\n"), /secret interdit/);
  assert.equal(f.state.fallbackFunction.operation, "uncertain");
});
