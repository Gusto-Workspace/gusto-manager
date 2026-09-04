const crypto = require("crypto");

const GiftCardOrderModel = require("../models/gift-card-order.model");
const RestaurantModel = require("../models/restaurant.model");
const { broadcastToRestaurant } = require("./sse-bus.service");
const { createAndBroadcastNotification } = require("./notifications.service");
const { sendGiftCardPurchaseEmail } = require("./gift-card-mailer.service");
const { upsertCustomer, onGiftPurchased } = require("./customers.service");

const STEPS = ["email", "notification", "crm"];
const MAX_ATTEMPTS = 8;
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const scheduledOrderIds = new Set();

function cleanError(error) {
  return String(
    error?.response?.body?.message ||
      error?.message ||
      "Traitement asynchrone impossible.",
  ).slice(0, 500);
}

function retryDate(attempts) {
  const delay = Math.min(
    6 * 60 * 60 * 1000,
    60 * 1000 * 2 ** Math.max(0, attempts - 1),
  );
  return new Date(Date.now() + delay);
}

async function claimStep(orderId, step) {
  const now = new Date();
  const staleLock = new Date(now.getTime() - LOCK_MAX_AGE_MS);
  const statusPath = `fulfillment.${step}.status`;
  const attemptsPath = `fulfillment.${step}.attempts`;
  const lockedAtPath = `fulfillment.${step}.lockedAt`;
  const lockTokenPath = `fulfillment.${step}.lockToken`;
  const nextRetryAtPath = `fulfillment.${step}.nextRetryAt`;
  const lockToken = crypto.randomUUID();

  const order = await GiftCardOrderModel.findOneAndUpdate(
    {
      _id: orderId,
      finalizationStatus: "finalized",
      [attemptsPath]: { $lt: MAX_ATTEMPTS },
      $or: [
        { [statusPath]: "pending" },
        {
          [statusPath]: "failed",
          $or: [
            { [nextRetryAtPath]: null },
            { [nextRetryAtPath]: { $lte: now } },
          ],
        },
        { [statusPath]: "processing", [lockedAtPath]: { $lt: staleLock } },
      ],
    },
    {
      $set: {
        [statusPath]: "processing",
        [lockedAtPath]: now,
        [lockTokenPath]: lockToken,
        [`fulfillment.${step}.lastErrorCode`]: "",
        [`fulfillment.${step}.lastError`]: "",
      },
      $inc: { [attemptsPath]: 1 },
    },
    { new: true },
  );

  return order ? { order, lockToken } : null;
}

async function getPurchase(order) {
  const restaurant = await RestaurantModel.findOne(
    { _id: order.restaurantId, "purchasesGiftCards._id": order.purchaseId },
    { purchasesGiftCards: { $elemMatch: { _id: order.purchaseId } } },
  ).lean();
  const purchase = restaurant?.purchasesGiftCards?.[0];
  if (!purchase) throw new Error("Carte cadeau finalisée introuvable.");
  return purchase;
}

async function sendEmail(order) {
  const purchase = await getPurchase(order);
  const response = await sendGiftCardPurchaseEmail({
    restaurant: order.restaurantSnapshot,
    purchase,
    message: purchase.message,
    hidePrice: purchase.hidePrice,
    fallbackImageUrl: order.fallbackImageUrl,
    idempotencyKey: `gift-card-${order._id}`,
    // Les erreurs image/Sharp sont réessayées. À la dernière tentative, un
    // fond neutre garantit malgré tout la délivrance de la carte.
    allowImageFallback:
      Number(order.fulfillment?.email?.attempts || 0) >= MAX_ATTEMPTS,
  });

  if (response?.skipped && response.reason !== "invalid_email") {
    throw new Error(`Envoi email indisponible (${response.reason}).`);
  }

  if (!response?.skipped) {
    await RestaurantModel.updateOne(
      { _id: order.restaurantId, "purchasesGiftCards._id": order.purchaseId },
      {
        $set: {
          "purchasesGiftCards.$.emailSentAt": new Date(),
          "purchasesGiftCards.$.emailSendError": "",
        },
      },
    );
  }

  return response?.skipped ? "skipped" : "completed";
}

async function sendNotification(order) {
  const purchase = await getPurchase(order);
  broadcastToRestaurant(String(order.restaurantId), {
    type: "giftcard_purchased",
    purchase,
  });
  await createAndBroadcastNotification({
    restaurantId: String(order.restaurantId),
    module: "gift_cards",
    type: "giftcard_purchased",
    dedupeKey: `gift-card-order:${order._id}:purchased`,
    data: {
      purchaseId: String(purchase._id),
      amount: purchase.amount,
      value: purchase.value,
      beneficiaryFirstName: purchase.beneficiaryFirstName,
      beneficiaryLastName: purchase.beneficiaryLastName,
      purchaseCode: purchase.purchaseCode,
      status: purchase.status,
      created_at: purchase.created_at,
    },
  });
  return "completed";
}

async function updateCrm(order) {
  const purchase = await getPurchase(order);
  const data = order.customerData;
  const customer = await upsertCustomer({
    restaurantId: order.restaurantId,
    firstName: data.buyerFirstName,
    lastName: data.buyerLastName,
    email: data.sendEmail,
    phone: data.buyerPhone,
  });

  if (!customer) return "skipped";
  await onGiftPurchased(customer._id, purchase);
  await Promise.all([
    RestaurantModel.updateOne(
      { _id: order.restaurantId, "purchasesGiftCards._id": order.purchaseId },
      { $set: { "purchasesGiftCards.$.customer": customer._id } },
    ),
    GiftCardOrderModel.updateOne(
      { _id: order._id },
      { $set: { customerId: customer._id } },
    ),
  ]);
  return "completed";
}

async function executeStep(order, step) {
  if (step === "email") return sendEmail(order);
  if (step === "notification") return sendNotification(order);
  if (step === "crm") return updateCrm(order);
  throw new Error(`Étape inconnue: ${step}`);
}

async function completeStep(orderId, step, lockToken, status) {
  await GiftCardOrderModel.updateOne(
    { _id: orderId, [`fulfillment.${step}.lockToken`]: lockToken },
    {
      $set: {
        [`fulfillment.${step}.status`]: status,
        [`fulfillment.${step}.completedAt`]: new Date(),
        [`fulfillment.${step}.lockedAt`]: null,
        [`fulfillment.${step}.lockToken`]: "",
        [`fulfillment.${step}.nextRetryAt`]: null,
        [`fulfillment.${step}.lastErrorCode`]: "",
        [`fulfillment.${step}.lastError`]: "",
      },
    },
  );
}

async function failStep(order, step, lockToken, error) {
  const message = cleanError(error);
  const errorCode =
    step === "email"
      ? "EMAIL_FAILED"
      : step === "crm"
        ? "CRM_FAILED"
        : "NOTIFICATION_FAILED";
  await GiftCardOrderModel.updateOne(
    { _id: order._id, [`fulfillment.${step}.lockToken`]: lockToken },
    {
      $set: {
        [`fulfillment.${step}.status`]: "failed",
        [`fulfillment.${step}.lockedAt`]: null,
        [`fulfillment.${step}.lockToken`]: "",
        [`fulfillment.${step}.nextRetryAt`]: retryDate(
          order.fulfillment?.[step]?.attempts || 1,
        ),
        [`fulfillment.${step}.lastErrorCode`]: errorCode,
        [`fulfillment.${step}.lastError`]: message,
      },
    },
  );

  if (step === "email") {
    await RestaurantModel.updateOne(
      { _id: order.restaurantId, "purchasesGiftCards._id": order.purchaseId },
      { $set: { "purchasesGiftCards.$.emailSendError": message } },
    );
  }
  console.error("[gift-card-fulfillment-error]", {
    checkoutId: order.checkoutId,
    paymentIntentId: order.paymentIntentId,
    restaurantId: String(order.restaurantId),
    giftId: String(order.giftId),
    purchaseCode: order.purchaseCode,
    step,
    attempt: order.fulfillment?.[step]?.attempts || 1,
    errorCode,
    errorMessage: message,
  });
}

async function processGiftCardOrder(orderId) {
  for (const step of STEPS) {
    const claimed = await claimStep(orderId, step);
    if (!claimed) continue;
    try {
      const status = await executeStep(claimed.order, step);
      await completeStep(orderId, step, claimed.lockToken, status);
    } catch (error) {
      await failStep(claimed.order, step, claimed.lockToken, error);
    }
  }
}

async function runGiftCardFulfillmentBatch() {
  const orders = await GiftCardOrderModel.find({
    finalizationStatus: "finalized",
    $or: STEPS.flatMap((step) => [
      {
        [`fulfillment.${step}.status`]: "pending",
        [`fulfillment.${step}.attempts`]: { $lt: MAX_ATTEMPTS },
      },
      {
        [`fulfillment.${step}.status`]: "failed",
        [`fulfillment.${step}.attempts`]: { $lt: MAX_ATTEMPTS },
        $or: [
          { [`fulfillment.${step}.nextRetryAt`]: null },
          { [`fulfillment.${step}.nextRetryAt`]: { $lte: new Date() } },
        ],
      },
      {
        [`fulfillment.${step}.status`]: "processing",
        [`fulfillment.${step}.lockedAt`]: {
          $lt: new Date(Date.now() - LOCK_MAX_AGE_MS),
        },
      },
    ]),
  })
    .select("_id")
    .limit(50)
    .lean();

  for (const order of orders) {
    await processGiftCardOrder(order._id);
  }
  return { processed: orders.length };
}

function scheduleGiftCardFulfillment(orderId) {
  const key = String(orderId);
  if (!key || scheduledOrderIds.has(key)) return;
  scheduledOrderIds.add(key);
  setImmediate(() => {
    processGiftCardOrder(orderId)
      .catch((error) =>
        console.error(
          "[gift-card-fulfillment-schedule-error]",
          key,
          cleanError(error),
        ),
      )
      .finally(() => scheduledOrderIds.delete(key));
  });
}

module.exports = {
  processGiftCardOrder,
  runGiftCardFulfillmentBatch,
  scheduleGiftCardFulfillment,
};
