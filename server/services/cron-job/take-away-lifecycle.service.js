const cron = require("node-cron");

const {
  expirePendingTakeAwayOrders,
  replayPendingTakeAwayEffects,
  cleanupConfiguredCompletedTakeAwayOrders,
} = require("../take-away.service");
const { runAdjustmentLifecycle } = require("../take-away-adjustments.service");

let runInProgress = false;

async function runTakeAwayLifecycleCron() {
  if (runInProgress) return { skipped: true, reason: "previous-run-active" };
  runInProgress = true;
  try {
    const expiration = await expirePendingTakeAwayOrders();
    const adjustments = await runAdjustmentLifecycle();
    const effects = await replayPendingTakeAwayEffects();
    const cleanup = await cleanupConfiguredCompletedTakeAwayOrders();
    return { expiration, adjustments, effects, cleanup };
  } finally {
    runInProgress = false;
  }
}

cron.schedule(
  "* * * * *",
  () => {
    runTakeAwayLifecycleCron().catch((error) =>
      console.error("[take-away-lifecycle-cron-error]", error),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Take-away lifecycle cron programmé toutes les minutes (Europe/Paris)",
);

module.exports = runTakeAwayLifecycleCron;
