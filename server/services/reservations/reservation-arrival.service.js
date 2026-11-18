const Reservation = require("../../models/reservation.model");
const Restaurant = require("../../models/restaurant.model");
const {
  userCanAccessRestaurant,
} = require("../../middleware/authorize-restaurant-access");
const {
  getCurrentReservationServiceDay,
} = require("./reservation-service-time.service");

const ARRIVAL_STATUSES = ["Confirmed", "Active", "Late"];
const ARRIVAL_HISTORY_STATUSES = [...ARRIVAL_STATUSES, "Finished"];
const ARRIVAL_SELECT = "_id arrivedAt arrivalRevision";

async function canAccessReservationArrivals(user, restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId)
    .select("_id owner_id employees options.reservations")
    .populate("employees", "restaurantProfiles");
  return Boolean(
    restaurant?.options?.reservations === true &&
      (await userCanAccessRestaurant(
        { id: user?.id, role: user?.role },
        restaurant,
        { requiredOption: "reservations" },
      )),
  );
}

function serializeReservationArrival(reservation) {
  return {
    reservationId: String(reservation._id),
    arrivedAt: reservation.arrivedAt ?? null,
    arrivalRevision: reservation.arrivalRevision ?? 0,
  };
}

function omitReservationArrival(reservation) {
  const {
    arrivedAt: _arrivedAt,
    arrivalRevision: _arrivalRevision,
    ...publicReservation
  } = reservation?.toJSON ? reservation.toJSON() : reservation || {};
  return publicReservation;
}

async function updateReservationArrival({
  restaurantId,
  reservationId,
  arrived,
  now = new Date(),
}) {
  const scope = { _id: reservationId, restaurant_id: restaurantId };
  const eligible = {
    ...scope,
    status: { $in: arrived ? ARRIVAL_STATUSES : ARRIVAL_HISTORY_STATUSES },
  };
  if (arrived) {
    eligible.reservationDate = new Date(getCurrentReservationServiceDay(now));
  }

  const updated = await Reservation.findOneAndUpdate(
    { ...eligible, arrivedAt: arrived ? null : { $ne: null } },
    { $set: { arrivedAt: arrived ? now : null }, $inc: { arrivalRevision: 1 } },
    { new: true, timestamps: false },
  )
    .select(ARRIVAL_SELECT)
    .lean();
  if (updated) {
    return { changed: true, arrival: serializeReservationArrival(updated) };
  }

  const current = await Reservation.findOne(eligible)
    .select(ARRIVAL_SELECT)
    .lean();
  if (current) {
    return Boolean(current.arrivedAt) === arrived
      ? { changed: false, arrival: serializeReservationArrival(current) }
      : { errorStatus: 409 };
  }

  return { errorStatus: (await Reservation.exists(scope)) ? 409 : 404 };
}

module.exports = {
  ARRIVAL_HISTORY_STATUSES,
  canAccessReservationArrivals,
  omitReservationArrival,
  updateReservationArrival,
};
