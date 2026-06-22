const cron = require("node-cron");

const RestaurantModel = require("../../models/restaurant.model");
const {
  applyGiftCardLifecycle,
} = require("../gift-card-lifecycle.service");

async function runGiftCardLifecycleCron() {
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

  for (const restaurant of restaurants) {
    const changed = applyGiftCardLifecycle(restaurant);
    if (changed) {
      await restaurant.save();
    }
  }

  return { checked: restaurants.length };
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
