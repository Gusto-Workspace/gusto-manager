require("dotenv").config();
const mongoose = require("mongoose");
const RestaurantModel = require("../models/restaurant.model");

async function main() {
  if (!process.env.CONNECTION_STRING_TEST) {
    throw new Error("CONNECTION_STRING_TEST manquante.");
  }
  await mongoose.connect(process.env.CONNECTION_STRING_TEST);
  const result = await RestaurantModel.updateMany(
    {
      $or: [
        { "options.sms_reminders": true },
        {
          "reservationsSettings.smsReminder.commercialDeactivation.status": {
            $in: ["scheduled", "effective", "cancelled"],
          },
        },
      ],
      "reservationsSettings.smsReminder.sender.status": "approved",
      "reservationsSettings.smsReminder.sender.value": { $ne: "" },
      "reservationsSettings.smsReminder.selfServiceEligible": { $ne: true },
    },
    {
      $set: {
        "reservationsSettings.smsReminder.selfServiceEligible": true,
      },
    },
  );
  console.log(
    `${result.modifiedCount} restaurant(s) SMS historique(s) rendu(s) éligible(s) au self-service.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
