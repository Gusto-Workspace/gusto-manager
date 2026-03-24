const ReservationModel = require("../models/reservation.model");

const RESTAURANT_RESERVATIONS_SORT = {
  reservationDate: 1,
  reservationTime: 1,
  createdAt: 1,
};

function buildReservationCustomerName(reservation) {
  const firstName = String(reservation?.customerFirstName || "").trim();
  const lastName = String(reservation?.customerLastName || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function normalizeReservationListItem(reservation) {
  if (!reservation || typeof reservation !== "object") return reservation;

  if (reservation.customerName) {
    return reservation;
  }

  const customerName = buildReservationCustomerName(reservation);
  if (!customerName) return reservation;

  return {
    ...reservation,
    customerName,
  };
}

function buildRestaurantReservationsQuery(restaurantId) {
  return ReservationModel.find({
    restaurant_id: restaurantId,
  }).sort(RESTAURANT_RESERVATIONS_SORT);
}

async function getRestaurantReservationsList(
  restaurantId,
  { select = null, lean = true } = {},
) {
  let query = buildRestaurantReservationsQuery(restaurantId);

  if (select) {
    query = query.select(select);
  }

  if (lean) {
    query = query.lean();
  }

  const reservations = await query;

  if (!lean || !Array.isArray(reservations)) {
    return reservations;
  }

  return reservations.map(normalizeReservationListItem);
}

module.exports = {
  buildRestaurantReservationsQuery,
  getRestaurantReservationsList,
};
