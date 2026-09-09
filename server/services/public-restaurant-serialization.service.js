const PRIVATE_RESTAURANT_FIELDS = [
  "stripeSecretKey",
  "stripeCustomerId",
  "owner_id",
  "employees",
  "purchasesGiftCards",
  "giftCardSold",
  "takeAwaySettings",
  "takeAwayCatalog",
];

const PRIVATE_RESERVATION_SETTINGS_FIELDS = [
  "email_templates",
  "auto_finish_reservations",
  "deletion_duration",
  "deletion_duration_minutes",
  "pending_duration_minutes",
  "manual_service_full_until",
  "notify_restaurant_on_new_public_reservation",
];

function sanitizePublicRestaurantData(input = {}) {
  const data = { ...input };
  for (const field of PRIVATE_RESTAURANT_FIELDS) delete data[field];

  if (data.reservationsSettings) {
    data.reservationsSettings = { ...data.reservationsSettings };
    for (const field of PRIVATE_RESERVATION_SETTINGS_FIELDS) {
      delete data.reservationsSettings[field];
    }
  }
  return data;
}

module.exports = { sanitizePublicRestaurantData };
