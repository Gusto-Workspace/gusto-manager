const ReservationModel = require("../models/reservation.model");
const CustomerModel = require("../models/customer.model");

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

function normalizeCustomerSummary(customer) {
  if (!customer || typeof customer !== "object") return null;

  return {
    _id: customer._id,
    tags: Array.isArray(customer.tags) ? customer.tags : [],
    stats: customer.stats || {},
    notes: customer.notes || "",
    lastReservationAt: customer.lastReservationAt || null,
    lastReservations: Array.isArray(customer.lastReservations)
      ? customer.lastReservations
      : [],
    createdAt: customer.createdAt || null,
  };
}

async function enrichReservationsWithCustomerSummary(reservations = []) {
  if (!Array.isArray(reservations) || !reservations.length) return reservations;

  const customerIds = Array.from(
    new Set(
      reservations
        .map((reservation) => String(reservation?.customer || "").trim())
        .filter(Boolean),
    ),
  );

  if (!customerIds.length) return reservations;

  const customers = await CustomerModel.find({ _id: { $in: customerIds } })
    .select("_id tags stats notes lastReservationAt lastReservations createdAt")
    .lean();

  const customerSummaryById = new Map(
    customers.map((customer) => [
      String(customer._id),
      normalizeCustomerSummary(customer),
    ]),
  );

  return reservations.map((reservation) => {
    const customerSummary = customerSummaryById.get(
      String(reservation?.customer || ""),
    );

    if (!customerSummary) return reservation;

    return {
      ...reservation,
      customerSummary,
    };
  });
}

async function enrichReservationWithCustomerSummary(reservation) {
  if (!reservation) return reservation;

  const source =
    reservation && typeof reservation.toObject === "function"
      ? reservation.toObject()
      : reservation;

  const [enriched] = await enrichReservationsWithCustomerSummary([source]);
  return enriched || source;
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

  const normalizedReservations = reservations.map(normalizeReservationListItem);
  return enrichReservationsWithCustomerSummary(normalizedReservations);
}

module.exports = {
  buildRestaurantReservationsQuery,
  enrichReservationWithCustomerSummary,
  enrichReservationsWithCustomerSummary,
  getRestaurantReservationsList,
};
