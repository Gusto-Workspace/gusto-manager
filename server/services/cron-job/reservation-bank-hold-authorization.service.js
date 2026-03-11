const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { decryptApiKey } = require("../encryption.service");

const BATCH_SIZE = 50;
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

function looksDue(d) {
  return (
    d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() <= Date.now()
  );
}

function getRestaurantStripeSecretKey(restaurant) {
  const encrypted = String(restaurant?.stripeSecretKey || "").trim();
  if (!encrypted) return null;

  try {
    const decrypted = decryptApiKey(encrypted);
    return String(decrypted || "").trim() || null;
  } catch (e) {
    console.error(
      "[bank-hold-cron] impossible de déchiffrer la clé Stripe du restaurant",
      {
        restaurantId: String(restaurant?._id || ""),
        error: e?.message || e,
      },
    );
    return null;
  }
}

async function lockReservationForBankHold(reservationId) {
  const now = new Date();
  const expiredLock = new Date(now.getTime() - LOCK_MAX_AGE_MS);

  return ReservationModel.findOneAndUpdate(
    {
      _id: reservationId,
      "bankHold.enabled": true,
      "bankHold.flow": "scheduled",
      "bankHold.status": "card_saved",
      "bankHold.authorizationScheduledFor": { $ne: null, $lte: now },
      status: { $in: ["Confirmed", "Pending"] },
      $or: [
        { "bankHold.processingLockedAt": null },
        { "bankHold.processingLockedAt": { $lt: expiredLock } },
      ],
    },
    {
      $set: { "bankHold.processingLockedAt": now },
    },
    { new: true },
  );
}

async function releaseBankHoldLock(reservationId) {
  await ReservationModel.updateOne(
    { _id: reservationId },
    {
      $unset: {
        "bankHold.processingLockedAt": 1,
      },
    },
  );
}

async function markBankHoldAuthorized(reservationId, paymentIntent) {
  await ReservationModel.updateOne(
    { _id: reservationId },
    {
      $set: {
        "bankHold.paymentIntentId": paymentIntent.id || "",
        "bankHold.status": "authorized",
        "bankHold.authorizedAt": new Date(),
        "bankHold.lastError": "",
      },
      $unset: {
        "bankHold.processingLockedAt": 1,
      },
    },
  );
}

async function markBankHoldFailed(reservationId, message) {
  await ReservationModel.updateOne(
    { _id: reservationId },
    {
      $set: {
        "bankHold.status": "failed",
        "bankHold.lastError": String(message || "Autorisation impossible."),
      },
      $unset: {
        "bankHold.processingLockedAt": 1,
      },
    },
  );
}

async function runReservationBankHoldAuthorization() {
  const now = new Date();

  const candidates = await ReservationModel.find({
    "bankHold.enabled": true,
    "bankHold.flow": "scheduled",
    "bankHold.status": "card_saved",
    "bankHold.authorizationScheduledFor": { $ne: null, $lte: now },
    status: { $in: ["Confirmed", "Pending"] },
    "bankHold.stripeCustomerId": { $exists: true, $ne: "" },
    "bankHold.stripePaymentMethodId": { $exists: true, $ne: "" },
  })
    .sort({ "bankHold.authorizationScheduledFor": 1 })
    .limit(BATCH_SIZE);

  if (!candidates.length) return;

  for (const candidate of candidates) {
    const locked = await lockReservationForBankHold(candidate._id);
    if (!locked) continue;

    try {
      if (!looksDue(locked.bankHold?.authorizationScheduledFor)) {
        await releaseBankHoldLock(locked._id);
        continue;
      }

      const restaurant = await RestaurantModel.findById(
        locked.restaurant_id,
      ).select("name stripeSecretKey");

      if (!restaurant) {
        await markBankHoldFailed(locked._id, "Restaurant introuvable.");
        continue;
      }

      const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
      if (!stripeSecretKey) {
        await markBankHoldFailed(
          locked._id,
          "Clé Stripe du restaurant introuvable.",
        );
        continue;
      }

      const stripe = new Stripe(stripeSecretKey);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(locked.bankHold?.amountTotal || 0) * 100),
        currency: locked.bankHold?.currency || "eur",
        customer: locked.bankHold?.stripeCustomerId,
        payment_method: locked.bankHold?.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        capture_method: "manual",
        metadata: {
          reservationId: String(locked._id),
          restaurantId: String(locked.restaurant_id),
          type: "reservation_bank_hold_scheduled_authorization",
        },
      });

      await markBankHoldAuthorized(locked._id, paymentIntent);

      console.log("[bank-hold-authorized]", {
        reservationId: String(locked._id),
        paymentIntentId: paymentIntent?.id || null,
      });
    } catch (e) {
      console.error(
        "[bank-hold-authorization-error]",
        String(locked?._id),
        e?.raw?.message || e?.message || e,
      );

      await markBankHoldFailed(
        locked._id,
        e?.raw?.message || e?.message || "Autorisation impossible.",
      );
    }
  }
}

cron.schedule(
  "*/5 * * * *",
  () => {
    runReservationBankHoldAuthorization().catch((err) =>
      console.error("Bank hold authorization échouée ❌", err),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Bank hold authorization programmée toutes les 5 minutes (Europe/Paris)",
);

module.exports = runReservationBankHoldAuthorization;
