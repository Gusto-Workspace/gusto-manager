const cron = require("node-cron");
const { runWorker, runReconciliation } = require("../callsense-metering.service");
cron.schedule("* * * * *", () => { runWorker().catch((error) => console.error("[callsense-metering]", error.message)); });
cron.schedule("*/15 * * * *", () => { runReconciliation().catch((error) => console.error("[callsense-reconciliation]", error.message)); });
module.exports = runWorker;
