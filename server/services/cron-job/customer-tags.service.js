const cron = require("node-cron");

const { recomputeCustomerTags } = require("../customer-tags.service");

async function runCustomerTagsRefresh() {
  const result = await recomputeCustomerTags();

  return result;
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
