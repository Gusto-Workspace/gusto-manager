const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const { finalizeTechnical } = require("../services/callsense-provisioning.service");
const { newDomainName } = require("../services/callsense-sip-domain.service");
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
function fixture() {
  const state = { accountSid: `AC${"a".repeat(32)}`, phoneNumberSid: "PNtest", twilioNumber: "+33123456789", numberOperation: "completed", domainOperation: "not_started", sipCredentialOperation: "not_started", webhookOperation: "not_started", checklist: {} };
  const domains = [], calls = [];
  const lists = () => ({ credentials: { list: async () => [] } }); lists.list = async () => [];
  const options = { confirm: true, loadState: async () => ({ draft: { ...state }, client: { sip: { credentialLists: lists } } }), onboarding: {
    inspectResources: async (_id, options) => { assert.equal(options.includeBundle, false); return { numbers: [{ sid: state.phoneNumberSid, phoneNumber: state.twilioNumber }], domains: [...domains] }; },
    createDomain: async () => { calls.push("createDomain"); Object.assign(state, { sipDomainSid: "SDtest", sipDomain: `gusto-${id}.sip.twilio.com`, domainOperation: "completed" }); domains.push({ sid: "SDtest", domainName: state.sipDomain, sipRegistration: true }); },
    associateDomain: async (_id, _actor, { sid }) => { calls.push("associateDomain"); Object.assign(state, { sipDomainSid: sid, sipDomain: domains.find(domain => domain.sid === sid).domainName, domainOperation: "completed" }); },
  }, configure: async () => { calls.push("configureSip"); state.sipCredentialOperation = "completed"; }, configureHooks: async () => { calls.push("webhooks"); state.webhookOperation = "completed"; }, probeOrigin: async () => { calls.push("probeOrigin"); }, verify: async () => { calls.push("verify"); }, enterTestMode: async (_id, _actor, options) => { assert.equal(options.status, "ready_for_test"); state.serviceStatus = "ready_for_test"; } };
  return { state, domains, calls, options };
}
test("préparation confirmée : SIP une seule fois et attente du secours réel", async () => {
  const f = fixture();
  await assert.rejects(finalizeTechnical(id, "admin", { ...f.options, confirm: false }), /Confirmation/);
  const first = await finalizeTechnical(id, "admin", f.options);
  assert.equal(first.status, "action_required"); assert.match(first.message, /secours/);
  assert.deepEqual(f.calls, ["createDomain", "configureSip"]);
  await finalizeTechnical(id, "admin", f.options);
  assert.deepEqual(f.calls, ["createDomain", "configureSip"]);
});
test("réutilisation du domaine et arrêt sûr en cas d’interruption ou de liste tronquée", async () => {
  const f = fixture(); f.domains.push({ sid: "SDexisting", domainName: `gusto-${id}.sip.twilio.com`, sipRegistration: true });
  await finalizeTechnical(id, "admin", f.options); assert.deepEqual(f.calls, ["associateDomain", "configureSip"]);
  const interrupted = fixture(); interrupted.state.domainOperation = "uncertain";
  assert.equal((await finalizeTechnical(id, "admin", interrupted.options)).status, "action_required"); assert.deepEqual(interrupted.calls, []);
  const truncated = fixture(); truncated.options.onboarding.inspectResources = async () => ({ numbers: [{ sid: "PNtest", phoneNumber: "+33123456789" }], domains: [], domainsTruncated: true });
  assert.equal((await finalizeTechnical(id, "admin", truncated.options)).status, "action_required"); assert.deepEqual(truncated.calls, []);
});
test("domaine incertain : rapprochement uniquement si correspondance unique vérifiée", async () => {
  const found = fixture(); found.state.domainOperation = "uncertain"; found.domains.push({ sid: "SDexisting", domainName: `gusto-${id}.sip.twilio.com`, sipRegistration: true });
  assert.equal((await finalizeTechnical(id, "admin", found.options)).status, "action_required"); assert.deepEqual(found.calls, ["associateDomain", "configureSip"]); assert.equal(found.state.domainOperation, "completed");
  const missing = fixture(); missing.state.domainOperation = "uncertain";
  assert.match((await finalizeTechnical(id, "admin", missing.options)).message, /Aucun domaine SIP/); assert.deepEqual(missing.calls, []);
  const ambiguous = fixture(); ambiguous.state.domainOperation = "uncertain"; ambiguous.domains.push({ sid: "SD1", domainName: `gusto-${id}.sip.twilio.com`, sipRegistration: true }, { sid: "SD2", domainName: `gusto-${id}.sip.twilio.com`, sipRegistration: true });
  assert.match((await finalizeTechnical(id, "admin", ambiguous.options)).message, /ambigu/); assert.deepEqual(ambiguous.calls, []);
  const newAttempt = fixture(); newAttempt.state.domainOperation = "uncertain";
  const name = newDomainName(id, newAttempt.state.accountSid);
  newAttempt.state.operationAttempts = { domain: { domainName: name } };
  newAttempt.domains.push({ sid: "SDnew", domainName: name, sipRegistration: true });
  await finalizeTechnical(id, "admin", newAttempt.options);
  assert.deepEqual(newAttempt.calls, ["associateDomain", "configureSip"]);
});
test("webhooks uniquement après secours déclaré et disponibilité publique", async () => {
  const f = fixture(); const original = process.env.CALLSENSE_PUBLIC_ORIGIN;
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.com";
  try {
    await finalizeTechnical(id, "admin", f.options);
    f.state.verifiedFallbackUrl = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`; f.state.checklist.fallbackTest = true;
    const probe = f.options.probeOrigin;
    f.options.probeOrigin = async () => { throw new Error("Route publique indisponible"); };
    await assert.rejects(finalizeTechnical(id, "admin", f.options), /indisponible/);
    assert.equal(f.calls.includes("webhooks"), false); f.options.probeOrigin = probe;
    assert.equal((await finalizeTechnical(id, "admin", f.options)).status, "completed");
    assert.deepEqual(f.calls, ["createDomain", "configureSip", "probeOrigin", "webhooks"]);
    await finalizeTechnical(id, "admin", f.options); assert.equal(f.calls.filter(x => x === "webhooks").length, 1);
  } finally { if (original === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = original; }
});
test("la Function est publiée puis le routage est préparé avant les essais réels", async () => {
  const f = fixture(); let deployments = 0;
  const original = process.env.CALLSENSE_PUBLIC_ORIGIN; process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.com";
  f.options.deployFallback = async () => { deployments++; const url = "https://example.twil.io/callsense-fallback"; f.state.sipUsername = "gtest"; f.state.fallbackFunction = { operation: "completed", url, sipUri: `sip:gtest@${f.state.sipDomain}` }; return { status: "ready", url }; };
  f.options.configureHooks = async (_id, _actor, options) => { assert.equal(options.prepareTest, true); f.calls.push("webhooks"); };
  try {
    await finalizeTechnical(id, "admin", f.options); assert.equal(deployments, 0);
    const result = await finalizeTechnical(id, "admin", { ...f.options, deployFunction: true });
    assert.equal(result.status, "completed"); assert.match(result.message, /essais réels/);
    assert.equal(deployments, 1); assert.equal(f.calls.includes("webhooks"), true); assert.notEqual(f.state.checklist.fallbackTest, true);
  } finally { if (original === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = original; }
});
test("interruption avant le mode test : reprise sans recréer le SIP ni les webhooks", async () => {
  const f = fixture(), oldOrigin = process.env.CALLSENSE_PUBLIC_ORIGIN;
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.com";
  const url = "https://example.twil.io/callsense-fallback";
  let attempts = 0;
  f.options.deployFallback = async () => { f.state.sipUsername = "user"; f.state.fallbackFunction = { operation: "completed", url, sipUri: `sip:user@${f.state.sipDomain}` }; return { status: "ready" }; };
  f.options.configureHooks = async () => { f.calls.push("webhooks"); f.state.webhookOperation = "completed"; f.state.voiceFallbackUrl = url; };
  f.options.enterTestMode = async () => { if (++attempts === 1) throw new Error("interruption"); f.state.serviceStatus = "ready_for_test"; };
  try {
    await assert.rejects(finalizeTechnical(id, "admin", { ...f.options, deployFunction: true }), /interruption/);
    assert.equal(f.state.webhookOperation, "completed");
    assert.equal((await finalizeTechnical(id, "admin", { ...f.options, deployFunction: true })).status, "completed");
    assert.equal(f.state.serviceStatus, "ready_for_test");
    assert.equal(f.calls.filter(call => call === "createDomain").length, 1);
    assert.equal(f.calls.filter(call => call === "configureSip").length, 1);
    assert.equal(f.calls.filter(call => call === "webhooks").length, 1);
  } finally { if (oldOrigin === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = oldOrigin; }
});
test("une Function déjà publiée permet la reprise technique sans redemander son autorisation", async () => {
  const f = fixture(), original = process.env.CALLSENSE_PUBLIC_ORIGIN; process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.com";
  await finalizeTechnical(id, "admin", f.options);
  const url = "https://example.twil.io/callsense-fallback"; f.state.sipUsername = "gtest";
  f.state.fallbackFunction = { operation: "completed", url, sipUri: `sip:gtest@${f.state.sipDomain}` };
  let reads = 0;
  f.options.deployFallback = async () => { reads++; return { status: "ready", url }; };
  f.options.configureHooks = async (_id, _actor, options) => { assert.equal(options.prepareTest, true); };
  try { assert.equal((await finalizeTechnical(id, "admin", f.options)).status, "completed"); assert.equal(reads, 1); }
  finally { if (original === undefined) delete process.env.CALLSENSE_PUBLIC_ORIGIN; else process.env.CALLSENSE_PUBLIC_ORIGIN = original; }
});
