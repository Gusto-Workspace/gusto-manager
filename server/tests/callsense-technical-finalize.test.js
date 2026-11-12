const test = require("node:test");
const assert = require("node:assert/strict");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {} };
const { finalizeTechnical } = require("../services/callsense-provisioning.service");
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
function fixture() {
  const state = { phoneNumberSid: "PNtest", twilioNumber: "+33123456789", numberOperation: "completed", domainOperation: "not_started", sipCredentialOperation: "not_started", webhookOperation: "not_started", checklist: {} };
  const domains = [], calls = [];
  const lists = () => ({ credentials: { list: async () => [] } }); lists.list = async () => [];
  const options = { confirm: true, loadState: async () => ({ draft: { ...state }, client: { sip: { credentialLists: lists } } }), onboarding: {
    inspectResources: async () => ({ numbers: [{ sid: state.phoneNumberSid, phoneNumber: state.twilioNumber }], domains: [...domains] }),
    createDomain: async () => { calls.push("createDomain"); Object.assign(state, { sipDomainSid: "SDtest", sipDomain: `gusto-${id}.sip.twilio.com`, domainOperation: "completed" }); domains.push({ sid: "SDtest", domainName: state.sipDomain, sipRegistration: true }); },
    associateDomain: async (_id, _actor, { sid }) => { calls.push("associateDomain"); Object.assign(state, { sipDomainSid: sid, sipDomain: `gusto-${id}.sip.twilio.com`, domainOperation: "completed" }); },
  }, configure: async () => { calls.push("configureSip"); state.sipCredentialOperation = "completed"; }, configureHooks: async () => { calls.push("webhooks"); state.webhookOperation = "completed"; }, probeOrigin: async () => { calls.push("probeOrigin"); }, verify: async () => { calls.push("verify"); } };
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
test("la Function est publiée avec accord explicite, puis les webhooks attendent le test réel", async () => {
  const f = fixture(); let deployments = 0;
  f.options.deployFallback = async () => { deployments++; return { status: "ready", url: "https://example.twil.io/callsense-fallback" }; };
  await finalizeTechnical(id, "admin", f.options); assert.equal(deployments, 0);
  const result = await finalizeTechnical(id, "admin", { ...f.options, deployFunction: true });
  assert.equal(result.status, "action_required"); assert.match(result.message, /test téléphonique réel/);
  assert.equal(deployments, 1); assert.equal(f.calls.includes("webhooks"), false);
});
