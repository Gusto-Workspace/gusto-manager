const cron = require("node-cron");
const Stripe = require("stripe");

const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { broadcastToRestaurant } = require("../sse-bus.service");
const { onReservationStatusChanged } = require("../customers.service");
const { decryptApiKey } = require("../encryption.service");
const {
  buildReservationBankHoldStripeMetadata,
} = require("../reservation-bank-hold-metadata.service");
const { runWaitlistMaintenance } = require("../../routes/reservations.routes");
const {
  buildReservationDateTime,
  getServiceBucketFromTime,
} = require("../reservation-service-time.service");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

const DEFAULT_RESERVATION_DELETION_MINUTES = 6 * 30 * 24 * 60;
const TERMINAL_STATUS_DATE_FIELDS = {
  Finished: "finishedAt",
  Canceled: "canceledAt",
  Rejected: "rejectedAt",
  NoShow: "noShowAt",
};
let lifecycleRunInProgress = false;

function getOccupancyMinutes(restaurant, reservationTime) {
  const parameters = restaurant?.reservationsSettings || {};
  const bucket = getServiceBucketFromTime(reservationTime);
  const rawValue =
    bucket === "lunch"
      ? parameters?.table_occupancy_lunch_minutes
      : parameters?.table_occupancy_dinner_minutes;

  const value = Number(rawValue || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getDeletionMinutes(restaurant) {
  const parameters = restaurant?.reservationsSettings || {};
  if (parameters?.deletion_duration === true) {
    const value = Number(
      parameters?.deletion_duration_minutes ||
        DEFAULT_RESERVATION_DELETION_MINUTES,
    );
    return Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_RESERVATION_DELETION_MINUTES;
  }

  return DEFAULT_RESERVATION_DELETION_MINUTES;
}

function getCurrentServiceDayEnd(now) {
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  );
}

function groupRestaurantsByDeletionMinutes(restaurants = []) {
  const groups = new Map();
  restaurants.forEach((restaurant) => {
    const deletionMinutes = getDeletionMinutes(restaurant);
    if (!groups.has(deletionMinutes)) groups.set(deletionMinutes, []);
    groups.get(deletionMinutes).push(restaurant._id);
  });
  return groups;
}

function applyActivationFields(reservation, nextStatus) {
  if (["Active", "Late"].includes(nextStatus)) {
    if (!reservation.activatedAt) reservation.activatedAt = new Date();
  } else {
    reservation.activatedAt = null;
  }

  reservation.finishedAt = nextStatus === "Finished" ? new Date() : null;
}

function applyNoShowFields(reservation, nextStatus) {
  reservation.noShowAt = nextStatus === "NoShow" ? new Date() : null;
}

async function getRestaurantCached(cache, restaurantId, perfRun, perfMetrics) {
  const key = String(restaurantId || "");
  if (cache.has(key)) return cache.get(key);

  const queryStartedAt = perfRun?.enabled ? perfNowMs() : 0;
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name stripeSecretKey reservationsSettings",
  );
  if (perfRun?.enabled) {
    perfMetrics.restaurantQueryCount += 1;
    perfMetrics.restaurantQueryMs += perfNowMs() - queryStartedAt;
  }
  cache.set(key, restaurant || null);
  return restaurant || null;
}

async function broadcastReservationUpdated(reservation, perfRun, perfMetrics) {
  const broadcastStartedAt = perfRun?.enabled ? perfNowMs() : 0;
  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(reservation.restaurant_id),
    reservation: reservation.toObject ? reservation.toObject() : reservation,
  });
  if (perfRun?.enabled) {
    perfMetrics.sseBroadcastCount += 1;
    perfMetrics.sseTotalMs += perfNowMs() - broadcastStartedAt;
  }
}

async function transitionReservationStatus({
  reservation,
  nextStatus,
  perfRun,
  perfMetrics,
}) {
  const prevStatus = String(reservation?.status || "");
  if (!reservation?._id || prevStatus === nextStatus) return false;

  reservation.status = nextStatus;
  applyActivationFields(reservation, nextStatus);
  applyNoShowFields(reservation, nextStatus);
  reservation.reminder24hDueAt = null;
  reservation.reminder24hSentAt = null;
  reservation.reminder24hLockedAt = null;

  const saveStartedAt = perfRun?.enabled ? perfNowMs() : 0;
  await reservation.save();
  if (perfRun?.enabled) {
    perfMetrics.mongoWriteCount += 1;
    perfMetrics.mongoWriteMs += perfNowMs() - saveStartedAt;
  }

  if (reservation.customer) {
    const customerSyncStartedAt = perfRun?.enabled ? perfNowMs() : 0;
    await onReservationStatusChanged(
      reservation.customer,
      reservation,
      prevStatus,
      nextStatus,
    );
    if (perfRun?.enabled) {
      perfMetrics.customerStatusSyncCount += 1;
      perfMetrics.customerStatusSyncMs += perfNowMs() - customerSyncStartedAt;
    }
  }

  await broadcastReservationUpdated(reservation, perfRun, perfMetrics);

  return true;
}

function getRestaurantStripeSecretKey(restaurant) {
  const encrypted = String(restaurant?.stripeSecretKey || "").trim();
  if (!encrypted) return null;

  try {
    const decrypted = decryptApiKey(encrypted);
    return String(decrypted || "").trim() || null;
  } catch (error) {
    console.error("[reservation-lifecycle] stripe secret decrypt failed", {
      restaurantId: String(restaurant?._id || ""),
      error: error?.message || error,
    });
    return null;
  }
}

async function persistCapturedBankHoldSnapshot({
  reservation,
  restaurant,
  perfRun,
  perfMetrics,
}) {
  if (
    String(reservation?.bankHold?.status || "") !== "captured" ||
    !String(reservation?.bankHold?.paymentIntentId || "").trim()
  ) {
    return;
  }

  const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
  if (!stripeSecretKey) return;

  try {
    const stripe = new Stripe(stripeSecretKey);
    const bankHoldMetadata = buildReservationBankHoldStripeMetadata({
      reservation,
      type: "reservation_bank_hold_payment",
    });

    const paymentIntentStartedAt = perfRun?.enabled ? perfNowMs() : 0;
    if (perfRun?.enabled) perfMetrics.stripeCalls += 1;
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.update(
        String(reservation.bankHold.paymentIntentId).trim(),
        {
          metadata: bankHoldMetadata,
        },
      );
    } finally {
      if (perfRun?.enabled) {
        perfMetrics.stripeTotalMs += perfNowMs() - paymentIntentStartedAt;
      }
    }

    const latestChargeId = String(paymentIntent?.latest_charge || "").trim();
    if (latestChargeId) {
      const chargeStartedAt = perfRun?.enabled ? perfNowMs() : 0;
      if (perfRun?.enabled) perfMetrics.stripeCalls += 1;
      try {
        await stripe.charges.update(latestChargeId, {
          metadata: bankHoldMetadata,
        });
      } finally {
        if (perfRun?.enabled) {
          perfMetrics.stripeTotalMs += perfNowMs() - chargeStartedAt;
        }
      }
    }
  } catch (error) {
    if (perfRun?.enabled) perfMetrics.externalErrorCount += 1;
    console.error(
      "[reservation-lifecycle] impossible de persister le snapshot avant suppression",
      {
        reservationId: String(reservation?._id || ""),
        error: error?.raw?.message || error?.message || error,
      },
    );
  }
}

async function deleteReservation({
  reservation,
  restaurantCache,
  perfRun,
  perfMetrics,
}) {
  if (!reservation?._id) return false;

  const restaurant = await getRestaurantCached(
    restaurantCache,
    reservation.restaurant_id,
    perfRun,
    perfMetrics,
  );
  if (restaurant) {
    await persistCapturedBankHoldSnapshot({
      reservation,
      restaurant,
      perfRun,
      perfMetrics,
    });
  }

  const deleteStartedAt = perfRun?.enabled ? perfNowMs() : 0;
  await ReservationModel.findByIdAndDelete(reservation._id);
  if (perfRun?.enabled) {
    perfMetrics.mongoWriteCount += 1;
    perfMetrics.mongoWriteMs += perfNowMs() - deleteStartedAt;
  }

  const broadcastStartedAt = perfRun?.enabled ? perfNowMs() : 0;
  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_deleted",
    restaurantId: String(reservation.restaurant_id),
    reservationId: String(reservation._id),
  });
  if (perfRun?.enabled) {
    perfMetrics.sseBroadcastCount += 1;
    perfMetrics.sseTotalMs += perfNowMs() - broadcastStartedAt;
  }

  return true;
}

async function runReservationLifecycleCron() {
  if (lifecycleRunInProgress) {
    return { skipped: true, reason: "previous-run-active" };
  }
  lifecycleRunInProgress = true;
  const perfRun = createPerfRun("reservationLifecycle");
  const perfMetrics = {
    autoFinishCandidateCount: 0,
    autoFinishedCount: 0,
    finishedCandidateCount: 0,
    deletedFinishedCount: 0,
    inactiveCandidateCount: 0,
    deletedInactiveCount: 0,
    restaurantQueryCount: 0,
    restaurantQueryMs: 0,
    mongoWriteCount: 0,
    mongoWriteMs: 0,
    customerStatusSyncCount: 0,
    customerStatusSyncMs: 0,
    sseBroadcastCount: 0,
    sseTotalMs: 0,
    stripeCalls: 0,
    stripeTotalMs: 0,
    externalErrorCount: 0,
    errorCount: 0,
    autoFinishMongoMs: 0,
    autoFinishPhaseMs: 0,
    finishedMongoMs: 0,
    finishedCleanupPhaseMs: 0,
    inactiveMongoMs: 0,
    inactiveCleanupPhaseMs: 0,
    waitlistMaintenanceMs: 0,
    configurationMongoMs: 0,
    configurationRestaurantCount: 0,
    cleanupQueryCount: 0,
    blockedRangesModifiedRestaurantCount: 0,
    blockedRangesPurgeMongoMs: 0,
  };
  const now = new Date();
  const restaurantCache = new Map();
  let runFailed = false;

  try {
    const configurationQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const lifecycleRestaurantIds = await ReservationModel.distinct(
      "restaurant_id",
      {
        status: {
          $in: [
            "Confirmed",
            "Active",
            "Late",
            "Finished",
            "Canceled",
            "Rejected",
            "NoShow",
          ],
        },
      },
    );
    const lifecycleRestaurants = await RestaurantModel.find({
      _id: { $in: lifecycleRestaurantIds },
    })
      .select("_id name stripeSecretKey reservationsSettings")
      .lean();
    if (perfRun.enabled) {
      perfMetrics.configurationMongoMs =
        perfNowMs() - configurationQueryStartedAt;
      perfMetrics.configurationRestaurantCount = lifecycleRestaurants.length;
    }
    lifecycleRestaurants.forEach((restaurant) => {
      restaurantCache.set(String(restaurant._id), restaurant);
    });

    const autoFinishPhaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const autoFinishQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const autoFinishRestaurantIds = lifecycleRestaurants
      .filter(
        (restaurant) =>
          restaurant?.reservationsSettings?.auto_finish_reservations === true,
      )
      .map((restaurant) => restaurant._id);
    const autoFinishReservations = await ReservationModel.find({
      restaurant_id: { $in: autoFinishRestaurantIds },
      status: { $in: ["Confirmed", "Active", "Late"] },
      reservationDate: { $lte: getCurrentServiceDayEnd(now) },
    }).select(
      "_id restaurant_id customer customerFirstName customerLastName customerEmail customerPhone numberOfGuests reservationDate reservationTime status activatedAt finishedAt reminder24hDueAt reminder24hSentAt reminder24hLockedAt",
    );
    if (perfRun.enabled) {
      perfMetrics.autoFinishMongoMs = perfNowMs() - autoFinishQueryStartedAt;
      perfMetrics.autoFinishCandidateCount = autoFinishReservations.length;
    }

    for (const reservation of autoFinishReservations) {
      const restaurant = await getRestaurantCached(
        restaurantCache,
        reservation.restaurant_id,
        perfRun,
        perfMetrics,
      );
      if (!restaurant?.reservationsSettings?.auto_finish_reservations) continue;

      const occupancyMinutes = getOccupancyMinutes(
        restaurant,
        reservation.reservationTime,
      );
      if (!occupancyMinutes) continue;

      const reservationStart = buildReservationDateTime(
        reservation.reservationDate,
        reservation.reservationTime,
      );
      if (!reservationStart) continue;

      const finishThreshold = new Date(
        reservationStart.getTime() + occupancyMinutes * 60 * 1000,
      );

      if (now >= finishThreshold) {
        const changed = await transitionReservationStatus({
          reservation,
          nextStatus: "Finished",
          perfRun,
          perfMetrics,
        });
        if (perfRun.enabled && changed) perfMetrics.autoFinishedCount += 1;
      }
    }
    if (perfRun.enabled) {
      perfMetrics.autoFinishPhaseMs = perfNowMs() - autoFinishPhaseStartedAt;
    }

    const deletionGroups =
      groupRestaurantsByDeletionMinutes(lifecycleRestaurants);
    const dueByStatus = new Map(
      Object.keys(TERMINAL_STATUS_DATE_FIELDS).map((status) => [status, []]),
    );

    for (const [deletionMinutes, restaurantIds] of deletionGroups) {
      const cutoff = new Date(now.getTime() - deletionMinutes * 60 * 1000);

      for (const [status, dateField] of Object.entries(
        TERMINAL_STATUS_DATE_FIELDS,
      )) {
        const queryStartedAt = perfRun.enabled ? perfNowMs() : 0;
        const dueReservations = await ReservationModel.find({
          restaurant_id: { $in: restaurantIds },
          status,
          [dateField]: { $lte: cutoff },
        }).select(
          `_id restaurant_id customerFirstName customerLastName customerEmail customerPhone numberOfGuests reservationDate reservationTime status ${dateField} bankHold`,
        );
        if (perfRun.enabled) {
          const queryMs = perfNowMs() - queryStartedAt;
          perfMetrics.cleanupQueryCount += 1;
          if (status === "Finished") {
            perfMetrics.finishedMongoMs += queryMs;
            perfMetrics.finishedCandidateCount += dueReservations.length;
          } else {
            perfMetrics.inactiveMongoMs += queryMs;
            perfMetrics.inactiveCandidateCount += dueReservations.length;
          }
        }
        dueByStatus.get(status).push(...dueReservations);
      }
    }

    const finishedCleanupPhaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
    for (const reservation of dueByStatus.get("Finished")) {
      const deleted = await deleteReservation({
        reservation,
        restaurantCache,
        perfRun,
        perfMetrics,
      });
      if (perfRun.enabled && deleted) perfMetrics.deletedFinishedCount += 1;
    }
    if (perfRun.enabled) {
      perfMetrics.finishedCleanupPhaseMs =
        perfNowMs() - finishedCleanupPhaseStartedAt;
    }

    const inactiveCleanupPhaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
    for (const status of ["Canceled", "Rejected", "NoShow"]) {
      for (const reservation of dueByStatus.get(status)) {
        const deleted = await deleteReservation({
          reservation,
          restaurantCache,
          perfRun,
          perfMetrics,
        });
        if (perfRun.enabled && deleted) perfMetrics.deletedInactiveCount += 1;
      }
    }
    if (perfRun.enabled) {
      perfMetrics.inactiveCleanupPhaseMs =
        perfNowMs() - inactiveCleanupPhaseStartedAt;
    }

    const blockedRangesPurgeStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const blockedRangesPurgeResult = await RestaurantModel.updateMany(
      { "reservationsSettings.blocked_ranges.endAt": { $lte: now } },
      {
        $pull: {
          "reservationsSettings.blocked_ranges": { endAt: { $lte: now } },
        },
      },
    );
    if (perfRun.enabled) {
      perfMetrics.blockedRangesPurgeMongoMs =
        perfNowMs() - blockedRangesPurgeStartedAt;
      perfMetrics.blockedRangesModifiedRestaurantCount = Number(
        blockedRangesPurgeResult?.modifiedCount || 0,
      );
    }

    const waitlistStartedAt = perfRun.enabled ? perfNowMs() : 0;
    await runWaitlistMaintenance();
    if (perfRun.enabled) {
      perfMetrics.waitlistMaintenanceMs = perfNowMs() - waitlistStartedAt;
    }
  } catch (error) {
    runFailed = true;
    if (perfRun.enabled) perfMetrics.errorCount += 1;
    throw error;
  } finally {
    lifecycleRunInProgress = false;
    finishPerfRun(perfRun, {
      ...perfMetrics,
      restaurantCount: restaurantCache.size,
      modifiedCount:
        perfMetrics.autoFinishedCount +
        perfMetrics.deletedFinishedCount +
        perfMetrics.deletedInactiveCount,
      deletedCount:
        perfMetrics.deletedFinishedCount + perfMetrics.deletedInactiveCount,
      mongoReadMs:
        perfMetrics.autoFinishMongoMs +
        perfMetrics.finishedMongoMs +
        perfMetrics.inactiveMongoMs +
        perfMetrics.configurationMongoMs +
        perfMetrics.blockedRangesPurgeMongoMs +
        perfMetrics.restaurantQueryMs,
      failed: runFailed,
    });
  }
}

cron.schedule(
  "* * * * *",
  () => {
    runReservationLifecycleCron().catch((error) =>
      console.error("[reservation-lifecycle-cron-error]", error),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Reservation lifecycle cron programmé toutes les minutes (Europe/Paris)",
);

module.exports = runReservationLifecycleCron;
