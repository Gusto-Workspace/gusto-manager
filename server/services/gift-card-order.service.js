const crypto = require("crypto");
const mongoose = require("mongoose");

const GiftCardOrderModel = require("../models/gift-card-order.model");
const RestaurantModel = require("../models/restaurant.model");
const { computeGiftCardValidUntil } = require("./gift-card-lifecycle.service");
const {
  buildGiftCardRestaurantSnapshot,
  buildGiftCardSnapshot,
} = require("./gift-card-snapshot.service");

const MAX_STRIPE_AMOUNT = 99_999_999;
const CHECKOUT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FINALIZATION_LOCK_MS = 5 * 60 * 1000;
const PURCHASE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_PURCHASE_CODE_ATTEMPTS = 25;
const CREATE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CREATE_RATE_LIMIT_MAX = 30;

class GiftCardOrderError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "GiftCardOrderError";
    this.code = code;
    this.status = status;
  }
}

function logOrderError(event, order, extra = {}) {
  console.error(
    "[gift-card-order]",
    JSON.stringify({
      event,
      checkoutId: order?.checkoutId || extra.checkoutId || null,
      paymentIntentId: order?.paymentIntentId || extra.paymentIntentId || null,
      restaurantId:
        String(order?.restaurantId || extra.restaurantId || "") || null,
      giftId: String(order?.giftId || extra.giftId || "") || null,
      purchaseCode: order?.purchaseCode || extra.purchaseCode || null,
      ...extra,
    }),
  );
}

function validateCheckoutId(value) {
  return /^[a-zA-Z0-9_-]{16,128}$/.test(String(value || ""));
}

function cleanString(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function sanitizeCustomerData(input = {}) {
  const customerData = {
    beneficiaryFirstName: cleanString(input.beneficiaryFirstName, 160),
    beneficiaryLastName: cleanString(input.beneficiaryLastName, 80),
    sender: cleanString(input.sender, 160),
    sendEmail: cleanString(input.sendEmail, 254).toLowerCase(),
    buyerFirstName: cleanString(input.buyerFirstName, 80),
    buyerLastName: cleanString(input.buyerLastName, 80),
    buyerPhone: cleanString(input.buyerPhone, 40),
    comment: cleanString(input.comment, 500),
    hidePrice: Boolean(input.hidePrice),
  };

  if (!customerData.beneficiaryFirstName) {
    throw new GiftCardOrderError(
      "INVALID_CUSTOMER_DATA",
      "Le bénéficiaire est requis.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.sendEmail)) {
    throw new GiftCardOrderError(
      "INVALID_CUSTOMER_DATA",
      "Une adresse email valide est requise.",
    );
  }

  return customerData;
}

function sanitizeFallbackImageUrl(value) {
  const url = cleanString(value, 2048);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function serializeGiftCardOrder(order) {
  if (!order) return null;
  return {
    checkoutId: order.checkoutId,
    restaurantId: String(order.restaurantId),
    giftId: String(order.giftId),
    paymentIntentId: order.paymentIntentId || null,
    amount: order.amount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    finalizationStatus: order.finalizationStatus,
    purchaseCode: order.purchaseCode || null,
    validUntil: order.validUntil || null,
    finalizedAt: order.finalizedAt || null,
    emailStatus: order.fulfillment?.email?.status || "pending",
    emailErrorCode: order.fulfillment?.email?.lastErrorCode || null,
  };
}

function assertSameOrder(order, { restaurantId, giftId }) {
  if (
    String(order.restaurantId) !== String(restaurantId) ||
    String(order.giftId) !== String(giftId)
  ) {
    throw new GiftCardOrderError(
      "CHECKOUT_MISMATCH",
      "Cette session ne correspond pas à la carte demandée.",
      409,
    );
  }
}

async function createGiftCardOrder({
  checkoutId,
  restaurantId,
  giftId,
  customerData,
  fallbackImageUrl,
  requestFingerprint = "",
}) {
  if (
    !validateCheckoutId(checkoutId) ||
    !mongoose.isValidObjectId(restaurantId) ||
    !mongoose.isValidObjectId(giftId)
  ) {
    throw new GiftCardOrderError(
      "INVALID_CHECKOUT",
      "Session de paiement invalide.",
    );
  }

  const sanitizedCustomerData = sanitizeCustomerData(customerData);
  const existing = await GiftCardOrderModel.findOne({ checkoutId });
  if (existing) {
    assertSameOrder(existing, { restaurantId, giftId });
    if (
      !existing.paymentIntentId &&
      existing.paymentStatus === "pending" &&
      existing.finalizationStatus === "pending"
    ) {
      existing.customerData = sanitizedCustomerData;
      existing.fallbackImageUrl = sanitizeFallbackImageUrl(fallbackImageUrl);
      await existing.save();
    }
    return existing;
  }

  const fingerprint = /^[a-f0-9]{64}$/.test(String(requestFingerprint || ""))
    ? String(requestFingerprint)
    : "";
  if (fingerprint) {
    const recentCheckouts = await GiftCardOrderModel.countDocuments({
      requestFingerprint: fingerprint,
      createdAt: { $gte: new Date(Date.now() - CREATE_RATE_LIMIT_WINDOW_MS) },
    });
    if (recentCheckouts >= CREATE_RATE_LIMIT_MAX) {
      throw new GiftCardOrderError(
        "RATE_LIMITED",
        "Trop de tentatives. Veuillez patienter quelques minutes.",
        429,
      );
    }
  }

  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant) {
    throw new GiftCardOrderError(
      "RESTAURANT_NOT_FOUND",
      "Restaurant introuvable.",
      404,
    );
  }
  const gift = restaurant.giftCards?.id(giftId);
  if (
    !gift ||
    restaurant.options?.gift_card !== true ||
    gift.visible !== true
  ) {
    throw new GiftCardOrderError(
      "GIFT_CARD_NOT_AVAILABLE",
      "Cette carte cadeau n’est plus disponible.",
      404,
    );
  }

  const amount = Math.round(Number(gift.value) * 100);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_STRIPE_AMOUNT
  ) {
    throw new GiftCardOrderError(
      "INVALID_AMOUNT",
      "Le montant de cette carte cadeau est invalide.",
    );
  }
  try {
    const order = await GiftCardOrderModel.create({
      checkoutId,
      restaurantId,
      giftId,
      currency: "eur",
      amount,
      giftSnapshot: buildGiftCardSnapshot(restaurant, gift),
      restaurantSnapshot: buildGiftCardRestaurantSnapshot(restaurant),
      customerData: sanitizedCustomerData,
      fallbackImageUrl: sanitizeFallbackImageUrl(fallbackImageUrl),
      requestFingerprint: fingerprint,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    });
    return order;
  } catch (error) {
    if (error?.code === 11000) {
      const racedOrder = await GiftCardOrderModel.findOne({ checkoutId });
      if (racedOrder) {
        assertSameOrder(racedOrder, { restaurantId, giftId });
        return racedOrder;
      }
    }
    throw error;
  }
}

async function bindPaymentIntent({
  checkoutId,
  restaurantId,
  giftId,
  paymentIntentId,
  stripeAccountId = "",
}) {
  const order = await GiftCardOrderModel.findOne({ checkoutId });
  if (!order) {
    throw new GiftCardOrderError(
      "CHECKOUT_NOT_FOUND",
      "Session de paiement introuvable.",
      404,
    );
  }
  assertSameOrder(order, { restaurantId, giftId });
  if (!/^pi_[a-zA-Z0-9_]+$/.test(String(paymentIntentId || ""))) {
    throw new GiftCardOrderError(
      "INVALID_PAYMENT_INTENT",
      "Paiement invalide.",
    );
  }
  if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) {
    throw new GiftCardOrderError(
      "PAYMENT_INTENT_MISMATCH",
      "Un autre paiement est déjà associé à cette session.",
      409,
    );
  }
  if (
    order.stripeAccountId &&
    stripeAccountId &&
    order.stripeAccountId !== stripeAccountId
  ) {
    throw new GiftCardOrderError(
      "STRIPE_ACCOUNT_MISMATCH",
      "Le compte de paiement ne correspond pas à cette session.",
      409,
    );
  }

  try {
    const bound = await GiftCardOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        $or: [{ paymentIntentId: null }, { paymentIntentId }],
      },
      {
        $set: {
          paymentIntentId,
          ...(stripeAccountId ? { stripeAccountId } : {}),
        },
      },
      { new: true },
    );
    if (!bound) {
      throw new GiftCardOrderError(
        "PAYMENT_INTENT_MISMATCH",
        "Un autre paiement est déjà associé à cette session.",
        409,
      );
    }
    return bound;
  } catch (error) {
    if (error?.code === 11000) {
      throw new GiftCardOrderError(
        "PAYMENT_INTENT_MISMATCH",
        "Ce paiement est déjà associé à une autre session.",
        409,
      );
    }
    throw error;
  }
}

function assertPaymentMatchesOrder(order, payment) {
  if (payment.status !== "succeeded") {
    throw new GiftCardOrderError(
      "PAYMENT_NOT_SUCCEEDED",
      "Le paiement n’est pas confirmé.",
      402,
    );
  }
  if (payment.id !== order.paymentIntentId) {
    throw new GiftCardOrderError(
      "PAYMENT_INTENT_MISMATCH",
      "Le paiement ne correspond pas à cette session.",
      409,
    );
  }
  if (
    Number(payment.amount) !== order.amount ||
    Number(payment.amountReceived) !== order.amount
  ) {
    throw new GiftCardOrderError(
      "AMOUNT_MISMATCH",
      "Le montant payé ne correspond pas à cette session.",
      409,
    );
  }
  if (String(payment.currency || "").toLowerCase() !== order.currency) {
    throw new GiftCardOrderError(
      "CURRENCY_MISMATCH",
      "La devise du paiement ne correspond pas à cette session.",
      409,
    );
  }
  const metadata = payment.metadata || {};
  if (
    metadata.checkoutId !== order.checkoutId ||
    metadata.restaurantId !== String(order.restaurantId) ||
    metadata.giftId !== String(order.giftId) ||
    metadata.type !== "gift_card"
  ) {
    throw new GiftCardOrderError(
      "PAYMENT_METADATA_MISMATCH",
      "Les références du paiement sont invalides.",
      409,
    );
  }
  if (
    order.stripeAccountId &&
    payment.stripeAccountId &&
    order.stripeAccountId !== payment.stripeAccountId
  ) {
    throw new GiftCardOrderError(
      "STRIPE_ACCOUNT_MISMATCH",
      "Le compte Stripe du paiement ne correspond pas.",
      409,
    );
  }
}

function generatePurchaseCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code +=
      PURCHASE_CODE_ALPHABET[crypto.randomInt(PURCHASE_CODE_ALPHABET.length)];
  }
  return code;
}

async function reservePurchaseIdentity(order) {
  let current = order;
  if (!current.purchaseId) {
    current =
      (await GiftCardOrderModel.findOneAndUpdate(
        { _id: current._id, purchaseId: null },
        { $set: { purchaseId: new mongoose.Types.ObjectId() } },
        { new: true },
      )) || (await GiftCardOrderModel.findById(current._id));
  }
  if (current.purchaseCode) return current;

  for (let attempt = 0; attempt < MAX_PURCHASE_CODE_ATTEMPTS; attempt += 1) {
    const purchaseCode = generatePurchaseCode();
    const historicalCollision = await RestaurantModel.exists({
      "purchasesGiftCards.purchaseCode": purchaseCode,
    });
    if (historicalCollision) continue;

    try {
      const reserved = await GiftCardOrderModel.findOneAndUpdate(
        { _id: current._id, purchaseCode: null },
        { $set: { purchaseCode } },
        { new: true },
      );
      if (reserved) return reserved;
      const alreadyReserved = await GiftCardOrderModel.findById(current._id);
      if (alreadyReserved?.purchaseCode) return alreadyReserved;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new GiftCardOrderError(
    "PURCHASE_CODE_UNAVAILABLE",
    "Impossible de réserver un code de carte cadeau.",
    503,
  );
}

function buildPurchaseFromOrder(order, validUntil) {
  const data = order.customerData;
  return {
    _id: order.purchaseId,
    value: order.giftSnapshot.value,
    description: order.giftSnapshot.description,
    purchaseCode: order.purchaseCode,
    validUntil,
    status: "Valid",
    beneficiaryFirstName: data.beneficiaryFirstName,
    beneficiaryLastName: data.beneficiaryLastName,
    sender: data.sender,
    message: data.comment,
    hidePrice: data.hidePrice,
    sendEmail: data.sendEmail,
    senderPhone: data.buyerPhone,
    customer: null,
    paymentIntentId: order.paymentIntentId,
    amount: order.amount,
    visualSnapshot: order.giftSnapshot.visual,
    buyerFirstName: data.buyerFirstName,
    buyerLastName: data.buyerLastName,
    created_at: order.paidAt || new Date(),
  };
}

async function finalizeGiftCardOrder({ checkoutId, payment, trigger }) {
  let order = await GiftCardOrderModel.findOne({ checkoutId });
  if (!order) {
    throw new GiftCardOrderError(
      "CHECKOUT_NOT_FOUND",
      "Session de paiement introuvable.",
      404,
    );
  }

  if (!order.paymentIntentId) {
    order = await bindPaymentIntent({
      checkoutId,
      restaurantId: payment.metadata?.restaurantId,
      giftId: payment.metadata?.giftId,
      paymentIntentId: payment.id,
      stripeAccountId: payment.stripeAccountId,
    });
  }
  assertPaymentMatchesOrder(order, payment);

  if (order.finalizationStatus === "finalized") {
    return order;
  }

  const now = new Date();
  const staleLock = new Date(now.getTime() - FINALIZATION_LOCK_MS);
  const lockToken = crypto.randomUUID();
  const locked = await GiftCardOrderModel.findOneAndUpdate(
    {
      _id: order._id,
      finalizationStatus: { $ne: "finalized" },
      $or: [
        { finalizationStatus: { $in: ["pending", "failed"] } },
        { finalizationLockedAt: null },
        { finalizationLockedAt: { $lt: staleLock } },
      ],
    },
    {
      $set: {
        paymentStatus: "succeeded",
        paidAt: order.paidAt || now,
        finalizationStatus: "processing",
        finalizationLockedAt: now,
        finalizationLockToken: lockToken,
        finalizationLastError: "",
        finalizationLastErrorCode: "",
        expiredAt: null,
      },
      $inc: { finalizationAttempts: 1 },
    },
    { new: true },
  );

  if (!locked) {
    const current = await GiftCardOrderModel.findById(order._id);
    if (current?.finalizationStatus === "finalized") return current;
    throw new GiftCardOrderError(
      "FINALIZATION_IN_PROGRESS",
      "La création de la carte cadeau est déjà en cours.",
      202,
    );
  }

  try {
    order = await reservePurchaseIdentity(locked);
    let validUntil = computeGiftCardValidUntil(
      order.giftSnapshot.validity,
      order.paidAt,
    );
    const purchase = buildPurchaseFromOrder(order, validUntil);

    const updateResult = await RestaurantModel.updateOne(
      {
        _id: order.restaurantId,
        "purchasesGiftCards.paymentIntentId": { $ne: order.paymentIntentId },
        "purchasesGiftCards._id": { $ne: order.purchaseId },
      },
      {
        $push: { purchasesGiftCards: purchase },
        $inc: { "giftCardSold.totalSold": 1 },
      },
    );
    const modified = Number(
      updateResult.modifiedCount ?? updateResult.nModified ?? 0,
    );
    if (!modified) {
      const existingDocument = await RestaurantModel.findOne(
        {
          _id: order.restaurantId,
          "purchasesGiftCards.paymentIntentId": order.paymentIntentId,
        },
        {
          purchasesGiftCards: {
            $elemMatch: { paymentIntentId: order.paymentIntentId },
          },
        },
      ).lean();
      const existingPurchase = existingDocument?.purchasesGiftCards?.[0];
      if (!existingPurchase) {
        throw new GiftCardOrderError(
          "FINALIZATION_FAILED",
          "La carte cadeau n’a pas pu être enregistrée.",
          500,
        );
      }
      order.purchaseId = existingPurchase._id;
      order.purchaseCode = existingPurchase.purchaseCode;
      validUntil = existingPurchase.validUntil;
      await GiftCardOrderModel.updateOne(
        { _id: order._id, finalizationLockToken: lockToken },
        {
          $set: {
            purchaseId: existingPurchase._id,
            purchaseCode: existingPurchase.purchaseCode,
            customerId: existingPurchase.customer || null,
            "fulfillment.email.status": existingPurchase.emailSentAt
              ? "completed"
              : "pending",
            "fulfillment.email.completedAt":
              existingPurchase.emailSentAt || null,
            "fulfillment.notification.status": "completed",
            "fulfillment.notification.completedAt": new Date(),
            "fulfillment.crm.status": "completed",
            "fulfillment.crm.completedAt": new Date(),
          },
        },
      );
    }

    const finalized = await GiftCardOrderModel.findOneAndUpdate(
      { _id: order._id, finalizationLockToken: lockToken },
      {
        $set: {
          paymentStatus: "succeeded",
          finalizationStatus: "finalized",
          finalizedAt: new Date(),
          validUntil,
          finalizationLastError: "",
          finalizationLastErrorCode: "",
          finalizationLockedAt: null,
          finalizationLockToken: "",
        },
      },
      { new: true },
    );
    if (!finalized) {
      throw new GiftCardOrderError(
        "FINALIZATION_FAILED",
        "La finalisation n’a pas pu être confirmée.",
        500,
      );
    }

    try {
      const {
        scheduleGiftCardFulfillment,
      } = require("./gift-card-fulfillment.service");
      scheduleGiftCardFulfillment(finalized._id);
    } catch (scheduleError) {
      logOrderError("fulfillment_schedule_failed", finalized, {
        trigger,
        errorCode: scheduleError?.code || "FULFILLMENT_SCHEDULE_FAILED",
        errorMessage: cleanString(scheduleError?.message, 300),
      });
    }
    return finalized;
  } catch (error) {
    await GiftCardOrderModel.updateOne(
      { _id: locked._id, finalizationLockToken: lockToken },
      {
        $set: {
          finalizationStatus: "failed",
          finalizationLastErrorCode: error?.code || "FINALIZATION_FAILED",
          finalizationLastError: cleanString(error?.message, 500),
          finalizationLockedAt: null,
          finalizationLockToken: "",
        },
      },
    );
    logOrderError("finalization_failed", order, {
      trigger,
      errorCode: error?.code || "FINALIZATION_FAILED",
      errorMessage: cleanString(error?.message, 300),
    });
    throw error;
  }
}

async function markGiftCardPaymentState({ checkoutId, payment, status }) {
  const order = await GiftCardOrderModel.findOne({ checkoutId });
  if (!order) {
    throw new GiftCardOrderError(
      "CHECKOUT_NOT_FOUND",
      "Session de paiement introuvable.",
      404,
    );
  }
  if (order.finalizationStatus === "finalized") return order;
  if (
    order.paymentIntentId !== payment.id ||
    payment.metadata?.checkoutId !== order.checkoutId ||
    payment.metadata?.restaurantId !== String(order.restaurantId) ||
    payment.metadata?.giftId !== String(order.giftId) ||
    payment.metadata?.type !== "gift_card"
  ) {
    throw new GiftCardOrderError(
      "PAYMENT_INTENT_MISMATCH",
      "Le paiement ne correspond pas à cette session.",
      409,
    );
  }
  if (
    Number(payment.amount) !== order.amount ||
    String(payment.currency || "").toLowerCase() !== order.currency
  ) {
    throw new GiftCardOrderError(
      Number(payment.amount) !== order.amount
        ? "AMOUNT_MISMATCH"
        : "CURRENCY_MISMATCH",
      "Les caractéristiques du paiement ne correspondent pas à cette session.",
      409,
    );
  }
  if (
    order.stripeAccountId &&
    payment.stripeAccountId &&
    order.stripeAccountId !== payment.stripeAccountId
  ) {
    throw new GiftCardOrderError(
      "STRIPE_ACCOUNT_MISMATCH",
      "Le compte Stripe du paiement ne correspond pas.",
      409,
    );
  }

  order.paymentStatus = status === "canceled" ? "canceled" : "failed";
  await order.save();
  return order;
}

async function expireAbandonedGiftCardOrders(now = new Date()) {
  const result = await GiftCardOrderModel.updateMany(
    {
      paymentStatus: "pending",
      finalizationStatus: "pending",
      expiresAt: { $lte: now },
      expiredAt: null,
    },
    { $set: { expiredAt: now } },
  );
  return Number(result.modifiedCount || 0);
}

module.exports = {
  GiftCardOrderError,
  bindPaymentIntent,
  createGiftCardOrder,
  expireAbandonedGiftCardOrders,
  finalizeGiftCardOrder,
  markGiftCardPaymentState,
  serializeGiftCardOrder,
};
