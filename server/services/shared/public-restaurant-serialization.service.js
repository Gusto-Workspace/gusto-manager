const PUBLIC_RESTAURANT_FIELDS = [
  "_id", "name", "address", "phone", "email", "website", "social_media",
  "opening_hours", "exceptional_closures", "dish_categories",
  "drink_categories", "wine_categories", "news", "menus", "giftCards",
  "giftCardSettings",
];

const PUBLIC_RESERVATION_SETTINGS = [
  "same_hours_as_restaurant", "auto_accept", "interval", "slot_cover_limits",
  "max_covers_lunch", "max_covers_dinner", "bank_hold", "manage_disponibilities",
  "tables", "table_occupancy_lunch_minutes", "table_occupancy_dinner_minutes",
  "floorplan", "waitlist", "reservation_hours", "exceptional_openings",
  "blocked_ranges", "table_blocked_ranges",
];

function pick(record, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(record, field))
    .map((field) => [field, record[field]]));
}

function sanitizePublicRestaurantData(input = {}) {
  const data = pick(input, PUBLIC_RESTAURANT_FIELDS);
  if (input.options) {
    data.options = pick(input.options, ["reservations", "gift_card", "take_away"]);
  }
  if (input.reservationsSettings) {
    data.reservationsSettings = pick(input.reservationsSettings, PUBLIC_RESERVATION_SETTINGS);
  }
  if (data.giftCardSettings) {
    const { archive_used_after_months, ...publicSettings } = data.giftCardSettings;
    data.giftCardSettings = publicSettings;
  }
  return data;
}

module.exports = { sanitizePublicRestaurantData };
