const express = require("express");

const GiftCardOrderModel = require("../models/gift-card-order.model");
const {
  verifyGiftCardServiceSignature,
} = require("../middleware/gift-card-service-signature");
const {
  bindPaymentIntent,
  createGiftCardOrder,
  finalizeGiftCardOrder,
  markGiftCardPaymentState,
  serializeGiftCardOrder,
} = require("../services/gift-card-order.service");

const router = express.Router();

function handleError(req, res, error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) {
    console.error("[gift-card-order-route-error]", {
      checkoutId: req.body?.checkoutId || null,
      paymentIntentId:
        req.body?.paymentIntentId || req.body?.payment?.id || null,
      restaurantId:
        req.body?.restaurantId ||
        req.body?.payment?.metadata?.restaurantId ||
        null,
      giftId: req.body?.giftId || req.body?.payment?.metadata?.giftId || null,
      purchaseCode: req.body?.purchaseCode || null,
      code: error?.code || "INTERNAL_ERROR",
      message: error?.message || String(error),
    });
  }
  return res.status(status).json({
    error:
      status >= 500
        ? "La création de la carte cadeau est momentanément indisponible."
        : error?.message || "Requête invalide.",
    code: error?.code || "INTERNAL_ERROR",
  });
}

router.use("/gift-card-orders", verifyGiftCardServiceSignature);

router.post("/gift-card-orders/checkout", async (req, res) => {
  try {
    const order = await createGiftCardOrder(req.body || {});
    return res.status(200).json({ order: serializeGiftCardOrder(order) });
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.post("/gift-card-orders/payment-intent", async (req, res) => {
  try {
    const order = await bindPaymentIntent(req.body || {});
    return res.status(200).json({ order: serializeGiftCardOrder(order) });
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.post("/gift-card-orders/finalize", async (req, res) => {
  try {
    const order = await finalizeGiftCardOrder({
      checkoutId: req.body?.checkoutId,
      payment: req.body?.payment || {},
      trigger: req.body?.trigger || "service",
    });
    return res.status(200).json({ order: serializeGiftCardOrder(order) });
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.post("/gift-card-orders/payment-event", async (req, res) => {
  try {
    const order = await markGiftCardPaymentState({
      checkoutId: req.body?.checkoutId,
      payment: req.body?.payment || {},
      status: req.body?.status,
    });
    return res.status(200).json({ order: serializeGiftCardOrder(order) });
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.post("/gift-card-orders/status", async (req, res) => {
  try {
    const order = await GiftCardOrderModel.findOne({
      checkoutId: String(req.body?.checkoutId || ""),
      restaurantId: req.body?.restaurantId,
      giftId: req.body?.giftId,
    });
    if (!order) {
      return res.status(404).json({
        error: "Session de paiement introuvable.",
        code: "CHECKOUT_NOT_FOUND",
      });
    }
    return res.status(200).json({ order: serializeGiftCardOrder(order) });
  } catch (error) {
    return handleError(req, res, error);
  }
});

module.exports = router;
