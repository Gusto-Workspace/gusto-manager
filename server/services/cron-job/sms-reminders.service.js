const cron = require("node-cron");
const { runSmsReminderWorker } = require("../sms/sms-reminder.service");

cron.schedule("* * * * *", () => {
  runSmsReminderWorker().catch((error) =>
    console.error("[sms-reminder-worker]", error?.message || error),
  );
});

module.exports = runSmsReminderWorker;
