const cron = require("node-cron");
const mongoose = require("mongoose");
const { runWorker, runReconciliation } = require("../callsense-metering.service");
cron.schedule("* * * * *", () => { if (mongoose.connection.readyState === 1) runWorker().catch((error) => console.error("[callsense-metering]", error)); });
cron.schedule("*/15 * * * *", () => { if (mongoose.connection.readyState === 1) runReconciliation().catch((error) => console.error("[callsense-reconciliation]", error)); });
module.exports = runWorker;
