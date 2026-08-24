const cron = require("node-cron");

const RestaurantModel = require("../../models/restaurant.model");
const {
  applyGiftCardLifecycle,
} = require("../gift-card-lifecycle.service");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

async function runGiftCardLifecycleCron() {
  const perfRun = createPerfRun("giftCardLifecycle");
  const perfMetrics = {
    candidateCount: 0,
    processedCount: 0,
    modifiedCount: 0,
    errorCount: 0,
    mongoQueryMs: 0,
    mongoWriteCount: 0,
    mongoWriteMs: 0,
    lifecycleProcessingMs: 0,
  };
  let runFailed = false;

  try {
    const queryStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const restaurants = await RestaurantModel.find({
      $or: [
        {
          giftCards: {
            $elemMatch: {
              visible: { $ne: false },
              validity_mode: "until_date",
            },
          },
        },
        {
          purchasesGiftCards: {
            $elemMatch: {
              status: { $in: ["Valid", "Used"] },
            },
          },
        },
      ],
    });
    if (perfRun.enabled) {
      perfMetrics.mongoQueryMs = perfNowMs() - queryStartedAt;
      perfMetrics.candidateCount = restaurants.length;
    }

    for (const restaurant of restaurants) {
      const processingStartedAt = perfRun.enabled ? perfNowMs() : 0;
      const changed = applyGiftCardLifecycle(restaurant);
      if (perfRun.enabled) {
        perfMetrics.processedCount += 1;
        perfMetrics.lifecycleProcessingMs += perfNowMs() - processingStartedAt;
      }
      if (changed) {
        const saveStartedAt = perfRun.enabled ? perfNowMs() : 0;
        await restaurant.save();
        if (perfRun.enabled) {
          perfMetrics.mongoWriteCount += 1;
          perfMetrics.mongoWriteMs += perfNowMs() - saveStartedAt;
          perfMetrics.modifiedCount += 1;
        }
      }
    }

    return { checked: restaurants.length };
  } catch (error) {
    runFailed = true;
    if (perfRun.enabled) perfMetrics.errorCount += 1;
    throw error;
  } finally {
    finishPerfRun(perfRun, {
      ...perfMetrics,
      failed: runFailed,
    });
  }
}

cron.schedule(
  "10 0 * * *",
  () => {
    runGiftCardLifecycleCron().catch((error) =>
      console.error("[gift-card-lifecycle-cron-error]", error),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Gift card lifecycle cron programmé chaque nuit à 00:10 (Europe/Paris)",
);

module.exports = runGiftCardLifecycleCron;
