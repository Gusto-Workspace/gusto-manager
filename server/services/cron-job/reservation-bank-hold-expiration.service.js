require("dotenv").config();
const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { broadcastToRestaurant } = require("../shared/sse-bus.service");
const { sendQueuedExpirationEmails } = require("../reservations/reservation-expiration-email.service");
const { decryptApiKey } = require("../shared/encryption.service");
const {
  triggerWaitlistAutoPromotionForReservationSlot,
} = require("../../routes/reservations.routes");

const BANK_HOLD_STRIPE_CHECK_AFTER_HOURS = 144; // 6 jours

// toutes les 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();

    /*
    ---------------------------------------------------------
    1️⃣ EXPIRATION SI CLIENT N'A PAS VALIDÉ LA CARTE
    ---------------------------------------------------------
    */

    const reservations = await ReservationModel.find({
      status: "AwaitingBankHold",
      "bankHold.enabled": true,
      "bankHold.status": { $in: ["setup_pending", "authorization_pending"] },
      "bankHold.expiresAt": { $ne: null, $lte: now },
    });

    for (const candidate of reservations) {
      const reservation = await ReservationModel.findOneAndUpdate({
        _id: candidate._id,
        status: "AwaitingBankHold",
        "bankHold.enabled": true,
        "bankHold.status": { $in: ["setup_pending", "authorization_pending"] },
        "bankHold.expiresAt": { $ne: null, $lte: now },
      }, { $set: {
        status: "Canceled", canceledAt: now,
        "bankHold.status": "expired",
        "bankHold.lastError": "Validation de l’empreinte bancaire non effectuée dans le délai imparti.",
        reminder24hDueAt: null, reminder24hSentAt: null, reminder24hLockedAt: null,
        expirationEmailQueuedAt: now,
      } }, { new: true });
      if (!reservation) continue;

      broadcastToRestaurant(String(reservation.restaurant_id), {
        type: "reservation_updated",
        restaurantId: String(reservation.restaurant_id),
        reservation: reservation.toObject
          ? reservation.toObject()
          : reservation,
      });

      await triggerWaitlistAutoPromotionForReservationSlot(reservation);

    }
    await sendQueuedExpirationEmails();

    /*
    ---------------------------------------------------------
    2️⃣ SYNCHRONISATION STRIPE POUR LES EMPREINTES AUTHORIZED
    ---------------------------------------------------------
    */

    const stripeCheckThreshold = new Date(
      now.getTime() - BANK_HOLD_STRIPE_CHECK_AFTER_HOURS * 60 * 60 * 1000,
    );

    const authorizedReservations = await ReservationModel.find({
      "bankHold.enabled": true,
      "bankHold.status": "authorized",
      "bankHold.paymentIntentId": { $ne: null },
      "bankHold.authorizedAt": { $lte: stripeCheckThreshold },
    });

    if (!authorizedReservations.length) {
      return;
    }

    const restaurantsCache = new Map();
    const stripeClients = new Map();

    for (const reservation of authorizedReservations) {
      try {
        let stripe = stripeClients.get(String(reservation.restaurant_id));

        if (!stripe) {
          let restaurant = restaurantsCache.get(
            String(reservation.restaurant_id),
          );

          if (!restaurant) {
            restaurant = await RestaurantModel.findById(
              reservation.restaurant_id,
            ).select("stripeSecretKey");

            restaurantsCache.set(String(reservation.restaurant_id), restaurant);
          }

          if (!restaurant?.stripeSecretKey) continue;

          const stripeSecretKey = decryptApiKey(restaurant.stripeSecretKey);

          stripe = new Stripe(stripeSecretKey);

          stripeClients.set(String(reservation.restaurant_id), stripe);
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(
          reservation.bankHold.paymentIntentId,
        );

        if (paymentIntent.status === "canceled") {
          reservation.bankHold.status = "expired";
          reservation.bankHold.lastError =
            "L’autorisation bancaire a expiré automatiquement.";

          await reservation.save();

          broadcastToRestaurant(String(reservation.restaurant_id), {
            type: "reservation_updated",
            restaurantId: String(reservation.restaurant_id),
            reservation: reservation.toObject
              ? reservation.toObject()
              : reservation,
          });
        }
      } catch (err) {
        if (err?.code === "resource_missing") {
          reservation.bankHold.status = "expired";
          reservation.bankHold.lastError =
            "Autorisation introuvable (probablement expirée).";

          await reservation.save();

          broadcastToRestaurant(String(reservation.restaurant_id), {
            type: "reservation_updated",
            restaurantId: String(reservation.restaurant_id),
            reservation: reservation.toObject
              ? reservation.toObject()
              : reservation,
          });

          continue;
        }

        console.error(
          "[bank-hold-stripe-sync-error]",
          reservation?._id?.toString?.(),
          err?.message || err,
        );
      }
    }
  } catch (error) {
    console.error("[bank-hold-expiration-cron-error]", error);
  }
});
