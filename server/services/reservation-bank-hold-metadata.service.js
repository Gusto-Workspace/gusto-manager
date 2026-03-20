function normalizeMetadataString(value) {
  return String(value || "").trim();
}

function normalizeMetadataGuestCount(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return String(Math.round(numericValue));
}

function normalizeMetadataDate(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function buildReservationBankHoldStripeMetadata({
  reservation,
  type = "",
  reservationId,
  restaurantId,
} = {}) {
  const metadata = {
    reservationId: normalizeMetadataString(
      reservationId || reservation?._id || "",
    ),
    restaurantId: normalizeMetadataString(
      restaurantId || reservation?.restaurant_id || "",
    ),
    type: normalizeMetadataString(type),
    reservationCustomerFirstName: normalizeMetadataString(
      reservation?.customerFirstName,
    ),
    reservationCustomerLastName: normalizeMetadataString(
      reservation?.customerLastName,
    ),
    reservationCustomerEmail: normalizeMetadataString(
      reservation?.customerEmail,
    ),
    reservationCustomerPhone: normalizeMetadataString(
      reservation?.customerPhone,
    ),
    reservationNumberOfGuests: normalizeMetadataGuestCount(
      reservation?.numberOfGuests,
    ),
    reservationDate: normalizeMetadataDate(reservation?.reservationDate),
    reservationTime: normalizeMetadataString(reservation?.reservationTime),
  };

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== ""),
  );
}

function extractReservationSnapshotFromStripeMetadata(readMetadataValue) {
  if (typeof readMetadataValue !== "function") return null;

  const reservationId = normalizeMetadataString(
    readMetadataValue("reservationId"),
  );
  const customerFirstName = normalizeMetadataString(
    readMetadataValue("reservationCustomerFirstName"),
  );
  const customerLastName = normalizeMetadataString(
    readMetadataValue("reservationCustomerLastName"),
  );
  const customerEmail = normalizeMetadataString(
    readMetadataValue("reservationCustomerEmail"),
  );
  const customerPhone = normalizeMetadataString(
    readMetadataValue("reservationCustomerPhone"),
  );
  const numberOfGuests = Math.max(
    0,
    Number(readMetadataValue("reservationNumberOfGuests") || 0),
  );
  const reservationDate =
    normalizeMetadataString(readMetadataValue("reservationDate")) || null;
  const reservationTime = normalizeMetadataString(
    readMetadataValue("reservationTime"),
  );

  const hasSnapshot = Boolean(
    reservationId ||
      customerFirstName ||
      customerLastName ||
      customerEmail ||
      customerPhone ||
      numberOfGuests ||
      reservationDate ||
      reservationTime,
  );

  if (!hasSnapshot) return null;

  return {
    reservationId,
    customerFirstName,
    customerLastName,
    customerEmail,
    customerPhone,
    numberOfGuests,
    reservationDate,
    reservationTime,
    commentary: "",
    reservationStatus: "",
    table: null,
    bankHold: {},
  };
}

module.exports = {
  buildReservationBankHoldStripeMetadata,
  extractReservationSnapshotFromStripeMetadata,
};
