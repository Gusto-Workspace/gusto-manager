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

async function getRestaurantCached(cache, restaurantId) {
  const key = String(restaurantId || "");
  if (cache.has(key)) return cache.get(key);

  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name stripeSecretKey reservationsSettings",
  );

  cache.set(key, restaurant || null);
  return restaurant || null;
}

async function broadcastReservationUpdated(reservation) {
  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(reservation.restaurant_id),
    reservation: reservation.toObject ? reservation.toObject() : reservation,
  });
}

async function transitionReservationStatus({ reservation, nextStatus }) {
  const prevStatus = String(reservation?.status || "");
  if (!reservation?._id || prevStatus === nextStatus) return false;

  reservation.status = nextStatus;
  applyActivationFields(reservation, nextStatus);
  applyNoShowFields(reservation, nextStatus);
  reservation.reminder24hDueAt = null;
  reservation.reminder24hSentAt = null;
  reservation.reminder24hLockedAt = null;

  await reservation.save();

  if (reservation.customer) {
    await onReservationStatusChanged(
      reservation.customer,
      reservation,
      prevStatus,
      nextStatus,
    );
  }

  await broadcastReservationUpdated(reservation);

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

async function persistCapturedBankHoldSnapshot({ reservation, restaurant }) {
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

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.update(
        String(reservation.bankHold.paymentIntentId).trim(),
        {
          metadata: bankHoldMetadata,
        },
      );
    } finally {
    }

    const latestChargeId = String(paymentIntent?.latest_charge || "").trim();
    if (latestChargeId) {
      try {
        await stripe.charges.update(latestChargeId, {
          metadata: bankHoldMetadata,
        });
      } finally {
      }
    }
  } catch (error) {
    console.error(
      "[reservation-lifecycle] impossible de persister le snapshot avant suppression",
      {
        reservationId: String(reservation?._id || ""),
        error: error?.raw?.message || error?.message || error,
      },
    );
  }
}

async function deleteReservation({ reservation, restaurantCache }) {
  if (!reservation?._id) return false;

  const restaurant = await getRestaurantCached(
    restaurantCache,
    reservation.restaurant_id,
  );
  if (restaurant) {
    await persistCapturedBankHoldSnapshot({
      reservation,
      restaurant,
    });
  }

  await ReservationModel.findByIdAndDelete(reservation._id);

  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_deleted",
    restaurantId: String(reservation.restaurant_id),
    reservationId: String(reservation._id),
  });

  return true;
}

async function runReservationLifecycleCron() {
  if (lifecycleRunInProgress) {
    return { skipped: true, reason: "previous-run-active" };
  }
  lifecycleRunInProgress = true;

  const now = new Date();
  const restaurantCache = new Map();

  try {
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

    lifecycleRestaurants.forEach((restaurant) => {
      restaurantCache.set(String(restaurant._id), restaurant);
    });

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

    for (const reservation of autoFinishReservations) {
      const restaurant = await getRestaurantCached(
        restaurantCache,
        reservation.restaurant_id,
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
        await transitionReservationStatus({
          reservation,
          nextStatus: "Finished",
        });
      }
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
        const dueReservations = await ReservationModel.find({
          restaurant_id: { $in: restaurantIds },
          status,
          [dateField]: { $lte: cutoff },
        }).select(
          `_id restaurant_id customerFirstName customerLastName customerEmail customerPhone numberOfGuests reservationDate reservationTime status ${dateField} bankHold`,
        );

        dueByStatus.get(status).push(...dueReservations);
      }
    }

    for (const reservation of dueByStatus.get("Finished")) {
      await deleteReservation({
        reservation,
        restaurantCache,
      });
    }

    for (const status of ["Canceled", "Rejected", "NoShow"]) {
      for (const reservation of dueByStatus.get(status)) {
        await deleteReservation({
          reservation,
          restaurantCache,
        });
      }
    }

    await RestaurantModel.updateMany(
      { "reservationsSettings.blocked_ranges.endAt": { $lte: now } },
      {
        $pull: {
          "reservationsSettings.blocked_ranges": { endAt: { $lte: now } },
        },
      },
    );

    await runWaitlistMaintenance();
  } catch (error) {
    throw error;
  } finally {
    lifecycleRunInProgress = false;
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
