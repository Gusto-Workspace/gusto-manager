const Draft = require("../../models/callsense/callsense-onboarding.model");
const provisioning = require("../callsense-provisioning.service");

// Only dossiers explicitly queued by a confirmed operation are eligible.
async function run({ now = () => new Date(), runOnboarding = provisioning.runOnboarding, startTechnical = provisioning.startTechnical } = {}) {
  const due = await Draft.find({ "automation.status": "running", "automation.resumeMode": { $in: ["onboarding", "technical"] }, "automation.actorId": { $type: "string", $ne: "" }, "automation.nextAttemptAt": { $lte: now() } }).select("restaurantId automation").limit(20).lean();
  for (const item of due) {
    const claimed = await Draft.findOneAndUpdate({ _id: item._id, "automation.status": "running", "automation.resumeMode": item.automation.resumeMode, "automation.nextAttemptAt": item.automation.nextAttemptAt }, { $set: { "automation.nextAttemptAt": new Date(now().getTime() + 10 * 60 * 1000) } }, { new: true });
    if (!claimed) continue;
    const { actorId, resumeMode, maxAmount, currency } = claimed.automation;
    try {
      if (resumeMode === "technical") await startTechnical(String(claimed.restaurantId), actorId, { confirm: true });
      else await runOnboarding(String(claimed.restaurantId), actorId, { confirm: true, maxAmount, currency });
    } catch (_) {
      await Draft.updateOne({ _id: claimed._id, "automation.status": "running" }, { $set: { "automation.status": "error", "automation.message": "Reprise interrompue : vérifiez le dossier avant de continuer." } });
    }
  }
}
if (process.env.NODE_ENV !== "test") {
  const tick = () => run().catch(() => {});
  const timer = setInterval(tick, 15000);
  timer.unref();
  setTimeout(tick, 2000).unref();
}
module.exports = { run };
