const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const provisioning = require("./callsense-provisioning.service");
const { decryptToken } = require("./callsense-secrets.service");
const twilio = require("twilio");
const SCENARIOS = ["http", "invalid", "timeout"];
const DURATION_MS = 90 * 1000;
function fail(message) { return Object.assign(new Error(message), { status: 409, expose: true }); }

async function mode(config, now = new Date()) {
  if (!config?.managedByOnboarding || config.enabled !== false || config.provisioningStatus !== "ready_for_test") return null;
  try {
    const draft = await Promise.race([
      Draft.findOne({ restaurantId: config.restaurantId, accountSid: config.accountSid, serviceStatus: "ready_for_test", "fallbackDrill.state": "running", "fallbackDrill.expiresAt": { $gt: now } }).select("fallbackDrill").maxTimeMS(300).lean(),
      new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error("timeout")), 500); timeout.unref(); }),
    ]);
    const drill = draft?.fallbackDrill;
    return drill && SCENARIOS.includes(drill.scenario) && new Date(drill.expiresAt).getTime() > Date.now() ? { scenario: drill.scenario, expiresAt: new Date(drill.expiresAt).getTime() } : null;
  } catch (_) { return null; }
}
async function triggered(config, scenario) {
  try {
    const result = await Promise.race([
      Draft.updateOne({ restaurantId: config.restaurantId, accountSid: config.accountSid, serviceStatus: "ready_for_test", activationOperation: { $ne: "pending" }, "fallbackDrill.state": "running", "fallbackDrill.scenario": scenario, "fallbackDrill.expiresAt": { $gt: new Date() } }, { $set: { "fallbackDrill.triggeredAt": new Date() } }, { maxTimeMS: 300 }),
      new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error("timeout")), 500); timeout.unref(); }),
    ]);
    return result.matchedCount === 1;
  } catch (_) { return false; }
}

async function start(restaurantId, actorId, { scenario, confirm, now = () => new Date() } = {}) {
  if (confirm !== true || !SCENARIOS.includes(scenario)) throw fail("Choisissez un scénario et confirmez le test.");
  const config = await Config.findOne({ restaurantId }).lean();
  if (!config?.managedByOnboarding || config.enabled !== false || config.provisioningStatus !== "ready_for_test" || !config.phoneNumberSid || !config.twilioNumber) throw fail("Test réservé au mode d’essai, avant activation.");
  const at = now();
  const draft = await Draft.findOneAndUpdate({ restaurantId, accountSid: config.accountSid, phoneNumberSid: config.phoneNumberSid, twilioNumber: config.twilioNumber, serviceStatus: "ready_for_test", webhookOperation: "completed", sipCredentialOperation: "completed", voiceFallbackUrl: { $nin: [null, ""] }, activationOperation: { $ne: "pending" }, "fallbackDrill.state": { $nin: ["running", "restoring"] } }, {
    $set: { "fallbackDrill.state": "running", "fallbackDrill.scenario": scenario, "fallbackDrill.startedAt": at, "fallbackDrill.expiresAt": new Date(at.getTime() + DURATION_MS), [`fallbackDrill.results.${scenario}`]: false },
    $unset: { "fallbackDrill.restoredAt": 1, "fallbackDrill.triggeredAt": 1 }, $push: { audit: { action: `fallback_drill_started_${scenario}`, actorId, at } },
  }, { new: true });
  if (!draft) throw fail("Un test ou une activation est déjà en cours ; terminez son rétablissement.");
  return require("./callsense-onboarding.service").clean(draft);
}

async function stop(restaurantId, actorId, { confirm, makeTwilio = twilio, verify = provisioning.verifyPrerequisites, probeOrigin = provisioning.probePublicOrigin } = {}) {
  if (confirm !== true) throw fail("Confirmez l’arrêt du test.");
  const draft = await Draft.findOneAndUpdate({ restaurantId, serviceStatus: "ready_for_test", "fallbackDrill.state": { $in: ["running", "restoring"] } }, { $set: { "fallbackDrill.state": "restoring", "fallbackDrill.expiresAt": new Date(0) }, $unset: { "fallbackDrill.restoredAt": 1 } }, { new: true }).select("+encryptedAuthToken");
  if (!draft) throw fail("Aucun test à arrêter.");
  const config = await Config.findOne({ restaurantId }).lean();
  if (!config?.managedByOnboarding || config.enabled !== false || config.provisioningStatus !== "ready_for_test" || config.accountSid !== draft.accountSid) throw fail("La configuration a changé ; rétablissement à vérifier.");
  try {
    const client = makeTwilio(draft.accountSid, decryptToken(draft.encryptedAuthToken, String(restaurantId), draft.accountSid));
    await probeOrigin(provisioning.webhookUrls(draft.voiceFallbackUrl, draft).voiceUrl);
    await verify(draft, client, { requireFallbackTest: false });
  } catch (_) { throw fail("Test arrêté, mais le fonctionnement normal n’a pas pu être vérifié. Réessayez."); }
  const saved = await Draft.findOneAndUpdate({ _id: draft._id, "fallbackDrill.state": "restoring", "fallbackDrill.scenario": draft.fallbackDrill.scenario }, { $set: { "fallbackDrill.restoredAt": new Date() }, $push: { audit: { action: "fallback_drill_restored", actorId, at: new Date() } } }, { new: true });
  if (!saved) throw fail("Le test a changé ; vérifiez à nouveau le rétablissement.");
  return require("./callsense-onboarding.service").clean(saved);
}

async function confirm(restaurantId, actorId, { fallbackWorked, normalCallWorked } = {}) {
  if (typeof fallbackWorked !== "boolean" || normalCallWorked !== true) throw fail("Confirmez l’appel réel après rétablissement et le résultat du test.");
  const draft = await Draft.findOne({ restaurantId }).lean();
  const scenario = draft?.fallbackDrill?.scenario;
  if (!SCENARIOS.includes(scenario) || draft.fallbackDrill.state !== "restoring" || !draft.fallbackDrill.restoredAt || (fallbackWorked && !draft.fallbackDrill.triggeredAt)) throw fail("Un appel pendant le test et la vérification du retour normal sont nécessaires pour confirmer sa réussite.");
  const complete = fallbackWorked && SCENARIOS.every(key => key === scenario || draft.fallbackDrill.results?.[key] === true);
  const saved = await Draft.findOneAndUpdate({ _id: draft._id, serviceStatus: "ready_for_test", activationOperation: { $ne: "pending" }, "fallbackDrill.state": "restoring", "fallbackDrill.scenario": scenario, "fallbackDrill.restoredAt": draft.fallbackDrill.restoredAt }, { $set: { "fallbackDrill.state": "completed", [`fallbackDrill.results.${scenario}`]: fallbackWorked, ...(complete ? { "checklist.fallbackHttpFailures": true } : {}) }, $push: { audit: { action: `fallback_drill_${fallbackWorked ? "confirmed" : "failed"}_${scenario}`, actorId, at: new Date() } } }, { new: true });
  if (!saved) throw fail("Le test a changé ; vérifiez à nouveau.");
  return require("./callsense-onboarding.service").clean(saved);
}
module.exports = { SCENARIOS, DURATION_MS, mode, triggered, start, stop, confirm };
