const cron = require("node-cron");

const {
  runGiftCardFulfillmentBatch,
} = require("../gift-card-fulfillment.service");
const { expireAbandonedGiftCardOrders } = require("../gift-card-order.service");

cron.schedule("* * * * *", () => {
  runGiftCardFulfillmentBatch().catch((error) =>
    console.error("[gift-card-fulfillment-cron-error]", error),
  );
});

cron.schedule("25 2 * * *", () => {
  expireAbandonedGiftCardOrders().catch((error) =>
    console.error("[gift-card-checkout-expiration-error]", error),
  );
});

module.exports = { runGiftCardFulfillmentBatch };
