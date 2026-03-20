require("dotenv").config();
const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { broadcastToRestaurant } = require("../sse-bus.service");
const { sendReservationEmail } = require("../reservations-mailer.service");
const { decryptApiKey } = require("../encryption.service");

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

    for (const reservation of reservations) {
      reservation.status = "Canceled";
      reservation.canceledAt = new Date();
      reservation.bankHold.status = "expired";
      reservation.bankHold.lastError =
        "Validation de l’empreinte bancaire non effectuée dans le délai imparti.";

      reservation.reminder24hDueAt = null;
      reservation.reminder24hSentAt = null;
      reservation.reminder24hLockedAt = null;

      await reservation.save();

      broadcastToRestaurant(String(reservation.restaurant_id), {
        type: "reservation_updated",
        restaurantId: String(reservation.restaurant_id),
        reservation: reservation.toObject
          ? reservation.toObject()
          : reservation,
      });

      try {
        const restaurant = await RestaurantModel.findById(
          reservation.restaurant_id,
        ).select("name reservations.parameters.email_templates");

        await sendReservationEmail("canceled", {
          reservation,
          restaurantName: restaurant?.name || "Restaurant",
          restaurant,
        });
      } catch (mailErr) {
        console.error(
          "[bank-hold-expiration-email-error]",
          reservation?._id?.toString?.(),
          mailErr?.response?.body || mailErr,
        );
      }
    }

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
            "L’autorisation bancaire a expiré automatiquement côté Stripe.";

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
            "Autorisation Stripe introuvable (probablement expirée).";

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
