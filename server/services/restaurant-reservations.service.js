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

function normalizeHistoryTime(value) {
  return String(value || "")
    .trim()
    .replace(/h/i, ":");
}

function getHistoryReservationSortValue(item) {
  const dateValue = item?.reservationDate;
  const timeValue = normalizeHistoryTime(item?.reservationTime);
  const datePart =
    dateValue instanceof Date
      ? dateValue.toISOString().slice(0, 10)
      : String(dateValue || "").slice(0, 10);

  if (!datePart) return 0;

  const timestamp = new Date(
    `${datePart}T${timeValue || "00:00"}:00`,
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeCustomerLastReservations(lastReservations = []) {
  if (!Array.isArray(lastReservations)) return [];

  const seen = new Set();

  return lastReservations
    .slice()
    .sort(
      (a, b) =>
        getHistoryReservationSortValue(b) - getHistoryReservationSortValue(a),
    )
    .reduce((items, item) => {
      const reservationId = String(item?.reservationId || item?._id || "");
      const fallbackKey = [
        item?.reservationDate || "",
        item?.reservationTime || "",
        item?.numberOfGuests || "",
        item?.status || "",
      ].join("|");
      const key = reservationId || fallbackKey;

      if (key && seen.has(key)) return items;
      if (key) seen.add(key);

      items.push({
        _id: item?._id || item?.reservationId || undefined,
        reservationId: item?.reservationId || item?._id || undefined,
        reservationDate: item?.reservationDate || null,
        reservationTime: item?.reservationTime || "",
        numberOfGuests: item?.numberOfGuests || 0,
        status: item?.status || "",
      });

      return items;
    }, [])
    .slice(0, 5);
}

function normalizeCustomerSummary(customer) {
  if (!customer || typeof customer !== "object") return null;

  return {
    _id: customer._id,
    tags: Array.isArray(customer.tags) ? customer.tags : [],
    stats: customer.stats || {},
    notes: customer.notes || "",
    lastReservationAt: customer.lastReservationAt || null,
    lastReservations: normalizeCustomerLastReservations(
      customer.lastReservations,
    ),
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
    customers.map((customer) => {
      const customerId = String(customer._id);
      return [customerId, normalizeCustomerSummary(customer)];
    }),
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
