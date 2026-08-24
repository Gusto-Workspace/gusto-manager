require("dotenv").config();
const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { broadcastToRestaurant } = require("../sse-bus.service");
const { sendReservationEmail } = require("../reservations-mailer.service");
const { decryptApiKey } = require("../encryption.service");
const {
  triggerWaitlistAutoPromotionForReservationSlot,
} = require("../../routes/reservations.routes");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

const BANK_HOLD_STRIPE_CHECK_AFTER_HOURS = 144; // 6 jours

async function runReservationBankHoldExpirationAndSync() {
  const maintenanceRun = createPerfRun("reservationBankHoldMaintenance");
  let maintenanceFailed = false;

  try {
    const now = new Date();

    /*
    ---------------------------------------------------------
    1️⃣ EXPIRATION SI CLIENT N'A PAS VALIDÉ LA CARTE
    ---------------------------------------------------------
    */

    const expirationRun = createPerfRun("reservationBankHoldExpiration");
    const expirationMetrics = {
      candidateCount: 0,
      processedCount: 0,
      modifiedCount: 0,
      errorCount: 0,
      mongoQueryMs: 0,
      mongoWriteCount: 0,
      mongoWriteMs: 0,
      restaurantQueryCount: 0,
      restaurantQueryMs: 0,
      waitlistCalls: 0,
      waitlistTotalMs: 0,
      emailCalls: 0,
      emailTotalMs: 0,
      sseBroadcastCount: 0,
      sseTotalMs: 0,
    };
    let expirationFailed = false;

    try {
      const expirationQueryStartedAt = expirationRun.enabled ? perfNowMs() : 0;
      const reservations = await ReservationModel.find({
        status: "AwaitingBankHold",
        "bankHold.enabled": true,
        "bankHold.status": {
          $in: ["setup_pending", "authorization_pending"],
        },
        "bankHold.expiresAt": { $ne: null, $lte: now },
      });
      if (expirationRun.enabled) {
        expirationMetrics.mongoQueryMs = perfNowMs() - expirationQueryStartedAt;
        expirationMetrics.candidateCount = reservations.length;
      }

      for (const reservation of reservations) {
        if (expirationRun.enabled) expirationMetrics.processedCount += 1;

        reservation.status = "Canceled";
        reservation.canceledAt = new Date();
        reservation.bankHold.status = "expired";
        reservation.bankHold.lastError =
          "Validation de l’empreinte bancaire non effectuée dans le délai imparti.";

        reservation.reminder24hDueAt = null;
        reservation.reminder24hSentAt = null;
        reservation.reminder24hLockedAt = null;

        const saveStartedAt = expirationRun.enabled ? perfNowMs() : 0;
        await reservation.save();
        if (expirationRun.enabled) {
          expirationMetrics.mongoWriteCount += 1;
          expirationMetrics.mongoWriteMs += perfNowMs() - saveStartedAt;
          expirationMetrics.modifiedCount += 1;
        }

        const broadcastStartedAt = expirationRun.enabled ? perfNowMs() : 0;
        broadcastToRestaurant(String(reservation.restaurant_id), {
          type: "reservation_updated",
          restaurantId: String(reservation.restaurant_id),
          reservation: reservation.toObject
            ? reservation.toObject()
            : reservation,
        });
        if (expirationRun.enabled) {
          expirationMetrics.sseBroadcastCount += 1;
          expirationMetrics.sseTotalMs += perfNowMs() - broadcastStartedAt;
        }

        const waitlistStartedAt = expirationRun.enabled ? perfNowMs() : 0;
        if (expirationRun.enabled) expirationMetrics.waitlistCalls += 1;
        try {
          await triggerWaitlistAutoPromotionForReservationSlot(reservation);
        } finally {
          if (expirationRun.enabled) {
            expirationMetrics.waitlistTotalMs +=
              perfNowMs() - waitlistStartedAt;
          }
        }

        try {
          const restaurantQueryStartedAt = expirationRun.enabled
            ? perfNowMs()
            : 0;
          const restaurant = await RestaurantModel.findById(
            reservation.restaurant_id,
          ).select("name reservationsSettings.email_templates");
          if (expirationRun.enabled) {
            expirationMetrics.restaurantQueryCount += 1;
            expirationMetrics.restaurantQueryMs +=
              perfNowMs() - restaurantQueryStartedAt;
          }

          const emailStartedAt = expirationRun.enabled ? perfNowMs() : 0;
          if (expirationRun.enabled) expirationMetrics.emailCalls += 1;
          try {
            await sendReservationEmail("canceled", {
              reservation,
              restaurantName: restaurant?.name || "Restaurant",
              restaurant,
            });
          } finally {
            if (expirationRun.enabled) {
              expirationMetrics.emailTotalMs += perfNowMs() - emailStartedAt;
            }
          }
        } catch (mailErr) {
          if (expirationRun.enabled) expirationMetrics.errorCount += 1;
          console.error(
            "[bank-hold-expiration-email-error]",
            reservation?._id?.toString?.(),
            mailErr?.response?.body || mailErr,
          );
        }
      }
    } catch (error) {
      expirationFailed = true;
      if (expirationRun.enabled) expirationMetrics.errorCount += 1;
      throw error;
    } finally {
      finishPerfRun(expirationRun, {
        ...expirationMetrics,
        maintenanceRunId: maintenanceRun.runId || null,
        failed: expirationFailed,
      });
    }

    /*
    ---------------------------------------------------------
    2️⃣ SYNCHRONISATION STRIPE POUR LES EMPREINTES AUTHORIZED
    ---------------------------------------------------------
    */

    const stripeCheckThreshold = new Date(
      now.getTime() - BANK_HOLD_STRIPE_CHECK_AFTER_HOURS * 60 * 60 * 1000,
    );

    const stripeSyncRun = createPerfRun("reservationBankHoldStripeSync");
    const stripeSyncMetrics = {
      candidateCount: 0,
      processedCount: 0,
      modifiedCount: 0,
      skippedCount: 0,
      resourceMissingCount: 0,
      errorCount: 0,
      mongoQueryMs: 0,
      mongoWriteCount: 0,
      mongoWriteMs: 0,
      restaurantQueryCount: 0,
      restaurantQueryMs: 0,
      restaurantCount: 0,
      stripeCalls: 0,
      stripeTotalMs: 0,
      sseBroadcastCount: 0,
      sseTotalMs: 0,
    };
    let stripeSyncFailed = false;

    try {
      const stripeSyncQueryStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
      const authorizedReservations = await ReservationModel.find({
        "bankHold.enabled": true,
        "bankHold.status": "authorized",
        "bankHold.paymentIntentId": { $ne: null },
        "bankHold.authorizedAt": { $lte: stripeCheckThreshold },
      });
      if (stripeSyncRun.enabled) {
        stripeSyncMetrics.mongoQueryMs = perfNowMs() - stripeSyncQueryStartedAt;
        stripeSyncMetrics.candidateCount = authorizedReservations.length;
      }

      if (!authorizedReservations.length) return;

      const restaurantsCache = new Map();
      const stripeClients = new Map();

      for (const reservation of authorizedReservations) {
        if (stripeSyncRun.enabled) stripeSyncMetrics.processedCount += 1;
        try {
          let stripe = stripeClients.get(String(reservation.restaurant_id));

          if (!stripe) {
            let restaurant = restaurantsCache.get(
              String(reservation.restaurant_id),
            );

            if (!restaurant) {
              const restaurantQueryStartedAt = stripeSyncRun.enabled
                ? perfNowMs()
                : 0;
              restaurant = await RestaurantModel.findById(
                reservation.restaurant_id,
              ).select("stripeSecretKey");
              if (stripeSyncRun.enabled) {
                stripeSyncMetrics.restaurantQueryCount += 1;
                stripeSyncMetrics.restaurantQueryMs +=
                  perfNowMs() - restaurantQueryStartedAt;
              }

              restaurantsCache.set(
                String(reservation.restaurant_id),
                restaurant,
              );
            }

            if (!restaurant?.stripeSecretKey) {
              if (stripeSyncRun.enabled) stripeSyncMetrics.skippedCount += 1;
              continue;
            }

            const stripeSecretKey = decryptApiKey(restaurant.stripeSecretKey);

            stripe = new Stripe(stripeSecretKey);

            stripeClients.set(String(reservation.restaurant_id), stripe);
          }

          const stripeStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
          if (stripeSyncRun.enabled) stripeSyncMetrics.stripeCalls += 1;
          let paymentIntent;
          try {
            paymentIntent = await stripe.paymentIntents.retrieve(
              reservation.bankHold.paymentIntentId,
            );
          } finally {
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.stripeTotalMs += perfNowMs() - stripeStartedAt;
            }
          }

          if (paymentIntent.status === "canceled") {
            reservation.bankHold.status = "expired";
            reservation.bankHold.lastError =
              "L’autorisation bancaire a expiré automatiquement.";

            const saveStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
            await reservation.save();
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.mongoWriteCount += 1;
              stripeSyncMetrics.mongoWriteMs += perfNowMs() - saveStartedAt;
              stripeSyncMetrics.modifiedCount += 1;
            }

            const broadcastStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
            broadcastToRestaurant(String(reservation.restaurant_id), {
              type: "reservation_updated",
              restaurantId: String(reservation.restaurant_id),
              reservation: reservation.toObject
                ? reservation.toObject()
                : reservation,
            });
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.sseBroadcastCount += 1;
              stripeSyncMetrics.sseTotalMs += perfNowMs() - broadcastStartedAt;
            }
          }
        } catch (err) {
          if (err?.code === "resource_missing") {
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.resourceMissingCount += 1;
            }
            reservation.bankHold.status = "expired";
            reservation.bankHold.lastError =
              "Autorisation introuvable (probablement expirée).";

            const saveStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
            await reservation.save();
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.mongoWriteCount += 1;
              stripeSyncMetrics.mongoWriteMs += perfNowMs() - saveStartedAt;
              stripeSyncMetrics.modifiedCount += 1;
            }

            const broadcastStartedAt = stripeSyncRun.enabled ? perfNowMs() : 0;
            broadcastToRestaurant(String(reservation.restaurant_id), {
              type: "reservation_updated",
              restaurantId: String(reservation.restaurant_id),
              reservation: reservation.toObject
                ? reservation.toObject()
                : reservation,
            });
            if (stripeSyncRun.enabled) {
              stripeSyncMetrics.sseBroadcastCount += 1;
              stripeSyncMetrics.sseTotalMs += perfNowMs() - broadcastStartedAt;
            }

            continue;
          }

          if (stripeSyncRun.enabled) stripeSyncMetrics.errorCount += 1;
          console.error(
            "[bank-hold-stripe-sync-error]",
            reservation?._id?.toString?.(),
            err?.message || err,
          );
        }
      }
      if (stripeSyncRun.enabled) {
        stripeSyncMetrics.restaurantCount = restaurantsCache.size;
      }
    } catch (error) {
      stripeSyncFailed = true;
      if (stripeSyncRun.enabled) stripeSyncMetrics.errorCount += 1;
      throw error;
    } finally {
      finishPerfRun(stripeSyncRun, {
        ...stripeSyncMetrics,
        maintenanceRunId: maintenanceRun.runId || null,
        failed: stripeSyncFailed,
      });
    }
  } catch (error) {
    maintenanceFailed = true;
    console.error("[bank-hold-expiration-cron-error]", error);
  } finally {
    finishPerfRun(maintenanceRun, {
      failed: maintenanceFailed,
      errorCount: maintenanceFailed ? 1 : 0,
    });
  }
}

// toutes les 5 minutes
cron.schedule("*/5 * * * *", async () => {
  await runReservationBankHoldExpirationAndSync();
});
