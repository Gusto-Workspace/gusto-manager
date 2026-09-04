const {
  getGiftCardValiditySettings,
} = require("./gift-card-lifecycle.service");
const {
  resolveGiftCardTypographyPreset,
} = require("./gift-card-typography.service");

function getGiftCardVisualById(restaurant, visualId) {
  if (!visualId) return null;
  return restaurant?.giftCardSettings?.visuals?.id?.(visualId) || null;
}

function getResolvedGiftCardVisual(restaurant, gift) {
  const visuals = restaurant?.giftCardSettings?.visuals || [];
  const giftVisual = getGiftCardVisualById(restaurant, gift?.visualId);
  const defaultVisual = getGiftCardVisualById(
    restaurant,
    restaurant?.giftCardSettings?.defaultVisualId,
  );

  return giftVisual || defaultVisual || visuals[0] || null;
}

function buildGiftCardVisualSnapshot(restaurant, gift) {
  const visual = getResolvedGiftCardVisual(restaurant, gift);
  const typographyPreset = resolveGiftCardTypographyPreset(restaurant);
  if (!visual) return { typographyPreset };

  return {
    visualId: String(visual._id || ""),
    name: visual.name || "",
    imageUrl: visual.imageUrl || "",
    imagePublicId: visual.imagePublicId || "",
    textColor: visual.textColor || "#000000",
    textLayout: visual.textLayout || "right",
    typographyPreset,
  };
}

function buildGiftCardSnapshot(restaurant, gift) {
  return {
    value: Number(gift.value),
    description: String(gift.description || ""),
    validity: getGiftCardValiditySettings(gift, restaurant?.giftCardSettings),
    visual: buildGiftCardVisualSnapshot(restaurant, gift),
  };
}

function buildGiftCardRestaurantSnapshot(restaurant) {
  const address =
    restaurant?.address?.toObject?.() || restaurant?.address || {};
  return {
    name: String(restaurant?.name || ""),
    phone: String(restaurant?.phone || ""),
    website: String(restaurant?.website || ""),
    address: {
      line1: String(address.line1 || ""),
      zipCode: String(address.zipCode || ""),
      city: String(address.city || ""),
      country: String(address.country || "France"),
    },
  };
}

module.exports = {
  buildGiftCardSnapshot,
  buildGiftCardVisualSnapshot,
  buildGiftCardRestaurantSnapshot,
  getGiftCardVisualById,
};
