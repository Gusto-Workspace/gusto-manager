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

const LATE_GRACE_PERIOD_MS = 5 * 60 * 1000;
const SHORT_LIVED_DELETE_MS = 10 * 60 * 1000;

function buildReservationDateTime(reservationDateUTC, reservationTime) {
  const d = new Date(reservationDateUTC);
  if (Number.isNaN(d.getTime())) return null;

  const [hh = "00", mm = "00"] = String(reservationTime || "00:00").split(":");

  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    parseInt(hh, 10) || 0,
    parseInt(mm, 10) || 0,
    0,
    0,
  );
}

function getServiceBucketFromTime(reservationTime) {
  const [hh = "0"] = String(reservationTime || "00:00").split(":");
  return Number(hh) < 16 ? "lunch" : "dinner";
}

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
    const value = Number(parameters?.deletion_duration_minutes || 1440);
    return Number.isFinite(value) && value > 0 ? value : 1440;
  }

  return 1440;
}

function applyActivationFields(reservation, nextStatus) {
  if (["Active", "Late"].includes(nextStatus)) {
    if (!reservation.activatedAt) reservation.activatedAt = new Date();
  } else {
    reservation.activatedAt = null;
  }

  reservation.finishedAt = nextStatus === "Finished" ? new Date() : null;
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

async function transitionReservationStatus({
  reservation,
  nextStatus,
  restaurantCache,
}) {
  const prevStatus = String(reservation?.status || "");
  if (!reservation?._id || prevStatus === nextStatus) return false;

  reservation.status = nextStatus;
  applyActivationFields(reservation, nextStatus);
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

    const paymentIntent = await stripe.paymentIntents.update(
      String(reservation.bankHold.paymentIntentId).trim(),
      {
        metadata: bankHoldMetadata,
      },
    );

    const latestChargeId = String(paymentIntent?.latest_charge || "").trim();
    if (latestChargeId) {
      await stripe.charges.update(latestChargeId, {
        metadata: bankHoldMetadata,
      });
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
    await persistCapturedBankHoldSnapshot({ reservation, restaurant });
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
  const now = new Date();
  const restaurantCache = new Map();

  const confirmedReservations = await ReservationModel.find({
    status: "Confirmed",
  }).select(
    "_id restaurant_id customer numberOfGuests reservationDate reservationTime status activatedAt finishedAt reminder24hDueAt reminder24hSentAt reminder24hLockedAt",
  );

  for (const reservation of confirmedReservations) {
    const reservationStart = buildReservationDateTime(
      reservation.reservationDate,
      reservation.reservationTime,
    );
    if (!reservationStart) continue;

    if (now.getTime() >= reservationStart.getTime() + LATE_GRACE_PERIOD_MS) {
      await transitionReservationStatus({
        reservation,
        nextStatus: "Late",
        restaurantCache,
      });
    }
  }

  const activeReservations = await ReservationModel.find({
    status: "Active",
  }).select(
    "_id restaurant_id customer numberOfGuests reservationDate reservationTime status activatedAt finishedAt reminder24hDueAt reminder24hSentAt reminder24hLockedAt",
  );

  for (const reservation of activeReservations) {
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
        restaurantCache,
      });
    }
  }

  const finishedReservations = await ReservationModel.find({
    status: "Finished",
    finishedAt: { $ne: null },
  }).select("_id restaurant_id status finishedAt bankHold");

  for (const reservation of finishedReservations) {
    const restaurant = await getRestaurantCached(
      restaurantCache,
      reservation.restaurant_id,
    );
    if (!restaurant) continue;

    const finishedAt = reservation?.finishedAt
      ? new Date(reservation.finishedAt)
      : null;
    if (!finishedAt || Number.isNaN(finishedAt.getTime())) continue;

    const deleteThreshold = new Date(
      finishedAt.getTime() + getDeletionMinutes(restaurant) * 60 * 1000,
    );

    if (now >= deleteThreshold) {
      await deleteReservation({ reservation, restaurantCache });
    }
  }

  const shortLivedReservations = await ReservationModel.find({
    status: { $in: ["Canceled", "Rejected"] },
    $or: [{ canceledAt: { $ne: null } }, { rejectedAt: { $ne: null } }],
  }).select("_id restaurant_id status canceledAt rejectedAt bankHold");

  for (const reservation of shortLivedReservations) {
    const baseDate =
      reservation.status === "Canceled"
        ? reservation.canceledAt
        : reservation.rejectedAt;

    const base = baseDate ? new Date(baseDate) : null;
    if (!base || Number.isNaN(base.getTime())) continue;

    const deleteThreshold = new Date(base.getTime() + SHORT_LIVED_DELETE_MS);
    if (now >= deleteThreshold) {
      await deleteReservation({ reservation, restaurantCache });
    }
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
