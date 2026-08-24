const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { decryptApiKey } = require("../encryption.service");
const {
  buildReservationBankHoldStripeMetadata,
} = require("../reservation-bank-hold-metadata.service");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

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
  const perfRun = createPerfRun("reservationBankHoldAuthorization");
  const perfMetrics = {
    candidateCount: 0,
    processedCount: 0,
    modifiedCount: 0,
    authorizedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lockMissCount: 0,
    errorCount: 0,
    mongoMs: 0,
    stripeCalls: 0,
    stripeTotalMs: 0,
  };
  const now = new Date();
  let runFailed = false;

  try {
    const candidatesQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
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
    if (perfRun.enabled) {
      perfMetrics.mongoMs += perfNowMs() - candidatesQueryStartedAt;
      perfMetrics.candidateCount = candidates.length;
    }

    if (!candidates.length) return;

    for (const candidate of candidates) {
      const lockStartedAt = perfRun.enabled ? perfNowMs() : 0;
      const locked = await lockReservationForBankHold(candidate._id);
      if (perfRun.enabled) {
        perfMetrics.mongoMs += perfNowMs() - lockStartedAt;
      }
      if (!locked) {
        if (perfRun.enabled) perfMetrics.lockMissCount += 1;
        continue;
      }
      if (perfRun.enabled) perfMetrics.processedCount += 1;

      try {
        if (!looksDue(locked.bankHold?.authorizationScheduledFor)) {
          const releaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
          await releaseBankHoldLock(locked._id);
          if (perfRun.enabled) {
            perfMetrics.mongoMs += perfNowMs() - releaseStartedAt;
            perfMetrics.skippedCount += 1;
          }
          continue;
        }

        const restaurantQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
        const restaurant = await RestaurantModel.findById(
          locked.restaurant_id,
        ).select("name stripeSecretKey");
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - restaurantQueryStartedAt;
        }

        if (!restaurant) {
          const markFailedStartedAt = perfRun.enabled ? perfNowMs() : 0;
          await markBankHoldFailed(locked._id, "Restaurant introuvable.");
          if (perfRun.enabled) {
            perfMetrics.mongoMs += perfNowMs() - markFailedStartedAt;
            perfMetrics.modifiedCount += 1;
            perfMetrics.failedCount += 1;
          }
          continue;
        }

        const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
        if (!stripeSecretKey) {
          const markFailedStartedAt = perfRun.enabled ? perfNowMs() : 0;
          await markBankHoldFailed(
            locked._id,
            "Clé Stripe du restaurant introuvable.",
          );
          if (perfRun.enabled) {
            perfMetrics.mongoMs += perfNowMs() - markFailedStartedAt;
            perfMetrics.modifiedCount += 1;
            perfMetrics.failedCount += 1;
          }
          continue;
        }

        const stripe = new Stripe(stripeSecretKey);
        const stripeStartedAt = perfRun.enabled ? perfNowMs() : 0;
        if (perfRun.enabled) perfMetrics.stripeCalls += 1;
        let paymentIntent;
        try {
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(Number(locked.bankHold?.amountTotal || 0) * 100),
            currency: locked.bankHold?.currency || "eur",
            customer: locked.bankHold?.stripeCustomerId,
            payment_method: locked.bankHold?.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            capture_method: "manual",
            metadata: buildReservationBankHoldStripeMetadata({
              reservation: locked,
              type: "reservation_bank_hold_scheduled_authorization",
            }),
          });
        } finally {
          if (perfRun.enabled) {
            perfMetrics.stripeTotalMs += perfNowMs() - stripeStartedAt;
          }
        }

        const markAuthorizedStartedAt = perfRun.enabled ? perfNowMs() : 0;
        await markBankHoldAuthorized(locked._id, paymentIntent);
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - markAuthorizedStartedAt;
          perfMetrics.modifiedCount += 1;
          perfMetrics.authorizedCount += 1;
        }
      } catch (e) {
        if (perfRun.enabled) perfMetrics.errorCount += 1;
        console.error(
          "[bank-hold-authorization-error]",
          String(locked?._id),
          e?.raw?.message || e?.message || e,
        );

        const markFailedStartedAt = perfRun.enabled ? perfNowMs() : 0;
        await markBankHoldFailed(
          locked._id,
          e?.raw?.message || e?.message || "Autorisation impossible.",
        );
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - markFailedStartedAt;
          perfMetrics.modifiedCount += 1;
          perfMetrics.failedCount += 1;
        }
      }
    }
  } catch (error) {
    runFailed = true;
    if (perfRun.enabled) perfMetrics.errorCount += 1;
    throw error;
  } finally {
    finishPerfRun(perfRun, {
      ...perfMetrics,
      failed: runFailed,
    });
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
