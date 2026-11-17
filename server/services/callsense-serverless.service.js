const crypto = require("crypto");
const twilio = require("twilio");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const { decryptToken } = require("./callsense-secrets.service");
const fallback = require("./callsense-fallback.service");

function fail(message, status = 409) { return Object.assign(new Error(message), { status, expose: true }); }
function diagnostic(phase, error) {
  const numeric = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  console.error("[callsense-serverless]", JSON.stringify({ phase, status: numeric(error?.status), code: numeric(error?.code) }));
}
async function readPhase(phase, fn) {
  try { return await fn(); } catch (error) { diagnostic(phase, error); throw error; }
}
async function uploadVersion({ accountSid, authToken, serviceSid, functionSid, source }) {
  const body = new FormData();
  body.append("Path", "/callsense-fallback"); body.append("Visibility", "protected");
  body.append("Content", new Blob([source], { type: "application/javascript" }), "fallback.js");
  const response = await fetch(`https://serverless-upload.twilio.com/v1/Services/${serviceSid}/Functions/${functionSid}/Versions`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` }, body, redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Function upload failed"), { status: response.status, code: body.code });
  }
  const result = await response.json();
  if (!/^ZN[0-9a-f]{32}$/i.test(result.sid || "") || result.account_sid !== accountSid || result.service_sid !== serviceSid || result.function_sid !== functionSid || result.path !== "/callsense-fallback" || result.visibility !== "protected") throw new Error("Function upload response invalid");
  return result.sid;
}
async function deploy(restaurantId, actorId, { confirm, makeTwilio = twilio, upload = uploadVersion, probe = fallback.probe, wait = (ms) => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (confirm !== true) throw fail("Confirmation de déploiement Twilio Functions requise", 400);
  const existing = await Config.findOne({ restaurantId }).lean();
  if (existing && (!existing.managedByOnboarding || existing.enabled)) throw fail("Installation historique ou active protégée");
  let draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!draft?.accountSid || !draft.encryptedAuthToken || draft.numberOperation !== "completed" || draft.sipCredentialOperation !== "completed") throw fail("Numéro et identifiants SIP requis");
  if (existing && existing.accountSid !== draft.accountSid) throw fail("Sous-compte de l'installation existante différent");
  const uri = fallback.sipUri(draft), token = decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid);
  const client = makeTwilio(draft.accountSid, token, { autoRetry: false });
  try { await require("./callsense-account-status.service").requireActiveAccount(client, draft.accountSid); }
  catch (_) { throw fail("Statut du sous-compte impossible à confirmer : vérification nécessaire"); }
  const reload = async () => { draft = await Draft.findOne({ restaurantId }).select("+encryptedAuthToken").lean(); if (!draft || draft.accountSid !== client.accountSid || fallback.sipUri(draft) !== uri) throw fail("Configuration modifiée : vérification nécessaire"); };
  const current = () => draft.fallbackFunction || {};
  if (current().sipUri && current().sipUri !== uri) throw fail("Destination SIP modifiée : vérification du secours nécessaire");
  if (["pending", "uncertain"].includes(current().operation)) throw fail("Déploiement incertain ou en cours : rapprochez les ressources Twilio avant reprise");
  const audit = action => ({ action, actorId, at: new Date() });
  async function step(stage, field, create) {
    if (current()[field]) return current()[field];
    const attempt = crypto.randomUUID();
    const locked = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, [`fallbackFunction.${field}`]: { $in: [null, ""] }, "fallbackFunction.operation": { $in: [null, "waiting"] } }, { $set: { "fallbackFunction.operation": "pending", "fallbackFunction.stage": stage, "fallbackFunction.attemptId": attempt, "fallbackFunction.sipUri": uri }, $push: { audit: audit(`function_${stage}_requested`) } }, { new: true });
    if (!locked) throw fail("Déploiement déjà en cours ou configuration modifiée");
    try {
      const value = await create();
      if (typeof value !== "string" || !value) throw new Error("Invalid resource");
      const saved = await Draft.findOneAndUpdate({ _id: draft._id, "fallbackFunction.operation": "pending", "fallbackFunction.attemptId": attempt }, { $set: { [`fallbackFunction.${field}`]: value, "fallbackFunction.operation": "waiting" }, $unset: { "fallbackFunction.attemptId": 1 }, $push: { audit: audit(`function_${stage}_recorded`) } }, { new: true });
      if (!saved) throw new Error("State changed");
      await reload(); return value;
    } catch (error) {
      diagnostic(stage, error);
      await Draft.updateOne({ _id: draft._id, "fallbackFunction.operation": "pending", "fallbackFunction.attemptId": attempt }, { $set: { "fallbackFunction.operation": "uncertain" }, $push: { audit: audit(`function_${stage}_uncertain`) } }).catch(() => {});
      throw fail("Résultat du déploiement incertain : vérifiez les ressources Twilio avant toute reprise");
    }
  }
  if (current().operation === "completed") {
    await readPhase("twiml_probe", () => probe(draft, current().url, { authToken: token }));
    await Draft.updateOne({ _id: draft._id, "fallbackFunction.operation": "completed", "fallbackFunction.url": current().url, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain }, { $set: { fallbackProbeUrl: current().url, fallbackProbeSipUri: uri, fallbackProbeAt: new Date() } });
    return { status: "ready", url: current().url };
  }
  const uniqueName = `gusto-${restaurantId}`;
  if (!current().serviceSid) {
    const list = await readPhase("services_list", () => client.serverless.v1.services.list({ limit: 101, pageSize: 50 }));
    if (list.length >= 101 || list.some(x => x.uniqueName === uniqueName)) throw fail("Service Twilio existant ou liste incomplète : vérification nécessaire");
  }
  const serviceSid = await step("service", "serviceSid", async () => {
    const r = await client.serverless.v1.services.create({ uniqueName, friendlyName: "Gusto CallSense", includeCredentials: false });
    if (!/^ZS[0-9a-f]{32}$/i.test(r.sid || "") || r.accountSid !== draft.accountSid) throw Error("Invalid service"); return r.sid;
  });
  const service = client.serverless.v1.services(serviceSid);
  const functionSid = await step("function", "functionSid", async () => {
    const r = await service.functions.create({ friendlyName: "CallSense secours" });
    if (!/^ZH[0-9a-f]{32}$/i.test(r.sid || "") || r.accountSid !== draft.accountSid || r.serviceSid !== serviceSid) throw Error("Invalid function"); return r.sid;
  });
  const versionSid = await step("version", "versionSid", () => upload({ accountSid: draft.accountSid, authToken: token, serviceSid, functionSid, source: fallback.functionSource(draft) }));
  const buildSid = await step("build", "buildSid", async () => {
    const r = await service.builds.create({ functionVersions: [versionSid], runtime: "node24" });
    if (!/^ZB[0-9a-f]{32}$/i.test(r.sid || "") || r.accountSid !== draft.accountSid || r.serviceSid !== serviceSid) throw Error("Invalid build"); return r.sid;
  });
  let build;
  for (let i = 0; i < 10; i++) { build = await readPhase("build_read", () => service.builds(buildSid).fetch()); if (build.status !== "building") break; await wait(1000); }
  if (build?.status === "building") return { status: "waiting", message: "Build Twilio en cours." };
  const version = build?.functionVersions?.[0];
  const versionMatches = typeof version === "string" ? version === versionSid : version?.sid === versionSid && version.account_sid === draft.accountSid && version.service_sid === serviceSid && version.function_sid === functionSid && version.path === "/callsense-fallback" && version.visibility === "protected";
  if (build?.status !== "completed" || build.accountSid !== draft.accountSid || build.serviceSid !== serviceSid || !Array.isArray(build.functionVersions) || build.functionVersions.length !== 1 || !versionMatches) throw fail("Build Twilio non disponible ou contenu non vérifié : vérification nécessaire");
  const environmentSid = await step("environment", "environmentSid", async () => {
    const r = await service.environments.create({ uniqueName: "callsense", domainSuffix: "callsense" });
    if (!/^ZE[0-9a-f]{32}$/i.test(r.sid || "") || r.accountSid !== draft.accountSid || r.serviceSid !== serviceSid) throw Error("Invalid environment"); return r.sid;
  });
  const environment = service.environments(environmentSid);
  await step("deployment", "deploymentSid", async () => {
    const r = await environment.deployments.create({ buildSid });
    if (!/^ZD[0-9a-f]{32}$/i.test(r.sid || "") || r.accountSid !== draft.accountSid || r.serviceSid !== serviceSid || r.environmentSid !== environmentSid || r.buildSid !== buildSid) throw Error("Invalid deployment"); return r.sid;
  });
  const deployed = await readPhase("environment_read", () => environment.fetch());
  if (deployed.accountSid !== draft.accountSid || deployed.serviceSid !== serviceSid || deployed.buildSid !== buildSid || !/^[a-z0-9-]+\.twil\.io$/i.test(deployed.domainName || "")) throw fail("Déploiement Twilio non vérifié : reprenez la vérification");
  const url = `https://${deployed.domainName}/callsense-fallback`;
  const candidate = { ...draft, fallbackFunction: { ...current(), operation: "completed", url, sipUri: uri } };
  await readPhase("twiml_probe", () => probe(candidate, url, { authToken: token }));
  const saved = await Draft.findOneAndUpdate({ _id: draft._id, accountSid: draft.accountSid, sipUsername: draft.sipUsername, sipDomain: draft.sipDomain, "fallbackFunction.operation": "waiting", "fallbackFunction.deploymentSid": current().deploymentSid }, { $set: { "fallbackFunction.operation": "completed", "fallbackFunction.domainName": deployed.domainName, "fallbackFunction.url": url, fallbackProbeUrl: url, fallbackProbeSipUri: uri, fallbackProbeAt: new Date(), "checklist.fallbackTest": false }, $unset: { verifiedFallbackUrl: 1 }, $push: { audit: audit("function_http_verified") } }, { new: true });
  if (!saved) throw fail("Configuration modifiée : vérification nécessaire");
  return { status: "ready", url };
}
module.exports = { deploy, uploadVersion };
