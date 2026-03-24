const ReservationModel = require("../models/reservation.model");

const RESTAURANT_RESERVATIONS_SORT = {
  reservationDate: 1,
  reservationTime: 1,
  createdAt: 1,
};

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

  return query;
}

module.exports = {
  buildRestaurantReservationsQuery,
  getRestaurantReservationsList,
};
