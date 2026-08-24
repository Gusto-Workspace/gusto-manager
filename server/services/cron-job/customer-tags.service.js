const cron = require("node-cron");

const { recomputeCustomerTags } = require("../customer-tags.service");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

async function runCustomerTagsRefresh() {
  const perfRun = createPerfRun("customerTagsRefresh");
  const perfMetrics = {
    candidateCount: 0,
    processedCount: 0,
    modifiedCount: 0,
    errorCount: 0,
    recomputeMs: 0,
  };
  let runFailed = false;

  try {
    const recomputeStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const result = await recomputeCustomerTags();
    if (perfRun.enabled) {
      perfMetrics.recomputeMs = perfNowMs() - recomputeStartedAt;
      perfMetrics.candidateCount = Number(result?.scanned || 0);
      perfMetrics.processedCount = Number(result?.scanned || 0);
      perfMetrics.modifiedCount = Number(result?.updated || 0);
    }

    return result;
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
  "15 3 * * *",
  () => {
    runCustomerTagsRefresh().catch((error) =>
      console.error("[customer-tags-cron-error]", error),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Customer tags recompute programmée chaque nuit à 03:15 (Europe/Paris)",
);

module.exports = runCustomerTagsRefresh;
