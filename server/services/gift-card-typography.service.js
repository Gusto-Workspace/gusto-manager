const GIFT_CARD_TYPOGRAPHY_PRESETS = [
  "classic",
  "ambassade",
  "coquille",
];

function normalizeTypographyPreset(value, fallback = "classic") {
  const preset = String(value || "").trim().toLowerCase();
  return GIFT_CARD_TYPOGRAPHY_PRESETS.includes(preset) ? preset : fallback;
}

function normalizeRestaurantIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferGiftCardTypographyPreset(restaurant) {
  const identity = normalizeRestaurantIdentity(
    [restaurant?.name, restaurant?.website].filter(Boolean).join(" "),
  );

  if (/(^| )l ambassade( |$)/.test(identity)) return "ambassade";
  if (/(^| )la coquille( |$)/.test(identity)) return "coquille";
  return "classic";
}

function resolveGiftCardTypographyPreset(restaurant, snapshot = null) {
  const snapshotPreset = normalizeTypographyPreset(
    snapshot?.typographyPreset,
    "",
  );
  if (snapshotPreset) return snapshotPreset;

  const configuredPreset = normalizeTypographyPreset(
    restaurant?.giftCardSettings?.typographyPreset,
    "",
  );
  if (configuredPreset) return configuredPreset;

  return inferGiftCardTypographyPreset(restaurant);
}

module.exports = {
  GIFT_CARD_TYPOGRAPHY_PRESETS,
  inferGiftCardTypographyPreset,
  normalizeTypographyPreset,
  resolveGiftCardTypographyPreset,
};
