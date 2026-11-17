const Draft = require("../../models/callsense/callsense-onboarding.model");
const provisioning = require("../callsense-provisioning.service");

// Only dossiers explicitly queued by a confirmed operation are eligible.
async function run({ now = () => new Date(), runOnboarding = provisioning.runOnboarding, startTechnical = provisioning.startTechnical } = {}) {
  // A dossier awaiting a decision is never polled by the worker. Once an
  // administrator has checked an approval, interrupted work may resume.
  const eligible = { $or: [{ "automation.phase": { $ne: "compliance" } }, { "automation.phase": "compliance", "regulatoryApproval.status": "twilio-approved", "regulatoryApproval.compatible": true, $expr: { $and: [{ $eq: ["$regulatoryApproval.bundleSid", "$regulatoryBundleSid"] }, { $eq: ["$regulatoryApproval.accountSid", "$accountSid"] }, { $eq: ["$automation.manualApprovalBundleSid", "$regulatoryBundleSid"] }, { $eq: ["$automation.manualApprovalAccountSid", "$accountSid"] }] } }] };
  const due = await Draft.find({ "automation.status": "running", "automation.resumeMode": { $in: ["onboarding", "technical"] }, "automation.actorId": { $type: "string", $ne: "" }, "automation.nextAttemptAt": { $lte: now() }, ...eligible }).select("restaurantId automation").limit(20).lean();
  for (const item of due) {
    const claimed = await Draft.findOneAndUpdate({ _id: item._id, "automation.status": "running", "automation.resumeMode": item.automation.resumeMode, "automation.nextAttemptAt": item.automation.nextAttemptAt, ...eligible }, { $set: { "automation.nextAttemptAt": new Date(now().getTime() + 10 * 60 * 1000) } }, { new: true });
    if (!claimed) continue;
    const { actorId, resumeMode, maxAmount, currency } = claimed.automation;
    try {
      if (resumeMode === "technical") await startTechnical(String(claimed.restaurantId), actorId, { confirm: true });
      else await runOnboarding(String(claimed.restaurantId), actorId, { confirm: true, maxAmount, currency, resume: true });
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
