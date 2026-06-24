const RestaurantModel = require("../models/restaurant.model");

const DEFAULT_GIFT_CARD_SETTINGS = {
  validity_mode: "fixed_duration",
  validity_fixed_months: 6,
  validity_until_day: 25,
  validity_until_month: 6,
  archive_used_after_months: 2,
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toPlainObject(source) {
  if (!source) return {};
  if (source.toObject) return source.toObject({ depopulate: true });
  return source;
}

function hasGiftCardValidityConfig(source) {
  const raw = toPlainObject(source?.giftCardSettings || source);
  return (
    raw?.validity_mode !== undefined ||
    raw?.validity_fixed_months !== undefined ||
    raw?.validity_until_day !== undefined ||
    raw?.validity_until_month !== undefined
  );
}

function getGiftCardValiditySettings(source, fallbackSource = null) {
  const sourceRaw = toPlainObject(source?.giftCardSettings || source);
  const fallbackRaw = toPlainObject(
    fallbackSource?.giftCardSettings || fallbackSource,
  );
  const raw = hasGiftCardValidityConfig(sourceRaw) ? sourceRaw : fallbackRaw;

  return {
    validity_mode:
      raw?.validity_mode === "until_date" ? "until_date" : "fixed_duration",
    validity_fixed_months: clampInteger(
      raw?.validity_fixed_months,
      DEFAULT_GIFT_CARD_SETTINGS.validity_fixed_months,
      1,
      60,
    ),
    validity_until_day: clampInteger(
      raw?.validity_until_day,
      DEFAULT_GIFT_CARD_SETTINGS.validity_until_day,
      1,
      31,
    ),
    validity_until_month: clampInteger(
      raw?.validity_until_month,
      DEFAULT_GIFT_CARD_SETTINGS.validity_until_month,
      1,
      12,
    ),
  };
}

function getGiftCardSettings(source) {
  const raw = toPlainObject(source?.giftCardSettings || source);
  const validitySettings = getGiftCardValiditySettings(raw);

  return {
    ...validitySettings,
    archive_used_after_months: clampInteger(
      raw?.archive_used_after_months,
      DEFAULT_GIFT_CARD_SETTINGS.archive_used_after_months,
      0,
      60,
    ),
  };
}

function buildConfiguredAnnualDate(year, monthNumber, dayNumber) {
  const safeMonth = clampInteger(monthNumber, 1, 1, 12);
  const monthIndex = safeMonth - 1;
  const lastDayOfMonth = new Date(year, safeMonth, 0).getDate();
  const safeDay = Math.min(
    clampInteger(dayNumber, 1, 1, 31),
    lastDayOfMonth,
  );

  return new Date(year, monthIndex, safeDay, 23, 59, 59, 999);
}

function isGiftCardConfiguredWithAnnualDate(giftCard) {
  return toPlainObject(giftCard)?.validity_mode === "until_date";
}

function buildGiftCardVisibilityDeadline(
  giftCard,
  referenceDate = new Date(),
  fallbackSettingsSource = null,
) {
  const settings = getGiftCardValiditySettings(
    giftCard,
    fallbackSettingsSource,
  );
  const baseDate = new Date(referenceDate);

  return buildConfiguredAnnualDate(
    baseDate.getFullYear(),
    settings.validity_until_month,
    settings.validity_until_day,
  );
}

function getGiftCardAutoHiddenYearForVisibility(
  giftCard,
  referenceDate = new Date(),
  fallbackSettingsSource = null,
) {
  if (!isGiftCardConfiguredWithAnnualDate(giftCard)) return undefined;

  const baseDate = new Date(referenceDate);
  const deadline = buildGiftCardVisibilityDeadline(
    giftCard,
    baseDate,
    fallbackSettingsSource,
  );

  return deadline < baseDate ? baseDate.getFullYear() : undefined;
}

function computeGiftCardValidUntil(
  settingsSource,
  referenceDate = new Date(),
  fallbackSettingsSource = null,
) {
  const settings = getGiftCardValiditySettings(
    settingsSource,
    fallbackSettingsSource,
  );
  const baseDate = new Date(referenceDate);

  if (settings.validity_mode === "until_date") {
    let candidate = buildConfiguredAnnualDate(
      baseDate.getFullYear(),
      settings.validity_until_month,
      settings.validity_until_day,
    );

    if (candidate < baseDate) {
      candidate = buildConfiguredAnnualDate(
        baseDate.getFullYear() + 1,
        settings.validity_until_month,
        settings.validity_until_day,
      );
    }

    return candidate;
  }

  const validUntil = new Date(baseDate);
  validUntil.setMonth(
    validUntil.getMonth() + settings.validity_fixed_months,
  );
  validUntil.setHours(23, 59, 59, 999);
  return validUntil;
}

function applyGiftCardLifecycle(restaurant, now = new Date()) {
  if (!restaurant) {
    return false;
  }

  const settings = getGiftCardSettings(restaurant);
  let changed = false;

  for (const giftCard of restaurant.giftCards || []) {
    if (
      giftCard?.visible !== false &&
      isGiftCardConfiguredWithAnnualDate(giftCard)
    ) {
      const autoHiddenYear = getGiftCardAutoHiddenYearForVisibility(
        giftCard,
        now,
        restaurant?.giftCardSettings,
      );

      if (
        autoHiddenYear !== undefined &&
        Number(giftCard.validity_auto_hidden_year) !== autoHiddenYear
      ) {
        giftCard.visible = false;
        giftCard.validity_auto_hidden_year = autoHiddenYear;
        changed = true;
      }
    }
  }

  for (const purchase of restaurant.purchasesGiftCards || []) {
    if (
      purchase?.status === "Valid" &&
      purchase?.validUntil &&
      new Date(purchase.validUntil) < now
    ) {
      purchase.status = "Expired";
      changed = true;
      continue;
    }

    if (purchase?.status === "Used" && purchase?.useDate) {
      const archiveThreshold = new Date(purchase.useDate);
      archiveThreshold.setMonth(
        archiveThreshold.getMonth() + settings.archive_used_after_months,
      );

      if (archiveThreshold <= now) {
        purchase.status = "Archived";
        changed = true;
      }
    }
  }

  return changed;
}

async function refreshGiftCardLifecycle(restaurantId) {
  if (!restaurantId) return null;

  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant) return null;

  const changed = applyGiftCardLifecycle(restaurant);
  if (changed) {
    await restaurant.save();
  }

  return restaurant;
}

function sanitizeGiftCardSettingsInput(input = {}) {
  const current = getGiftCardSettings(input);
  const raw = toPlainObject(input);

  return {
    validity_mode:
      input?.validity_mode === "until_date" ? "until_date" : "fixed_duration",
    validity_fixed_months: clampInteger(
      input?.validity_fixed_months,
      current.validity_fixed_months,
      1,
      60,
    ),
    validity_until_day: clampInteger(
      input?.validity_until_day,
      current.validity_until_day,
      1,
      31,
    ),
    validity_until_month: clampInteger(
      input?.validity_until_month,
      current.validity_until_month,
      1,
      12,
    ),
    archive_used_after_months: clampInteger(
      input?.archive_used_after_months,
      current.archive_used_after_months,
      0,
      60,
    ),
    visuals: Array.isArray(raw.visuals) ? raw.visuals : [],
    defaultVisualId: raw.defaultVisualId || "",
  };
}

function sanitizeGiftCardValidityInput(input = {}, fallbackInput = {}) {
  const current = getGiftCardValiditySettings(input, fallbackInput);

  return {
    validity_mode:
      input?.validity_mode === "until_date"
        ? "until_date"
        : current.validity_mode,
    validity_fixed_months: clampInteger(
      input?.validity_fixed_months,
      current.validity_fixed_months,
      1,
      60,
    ),
    validity_until_day: clampInteger(
      input?.validity_until_day,
      current.validity_until_day,
      1,
      31,
    ),
    validity_until_month: clampInteger(
      input?.validity_until_month,
      current.validity_until_month,
      1,
      12,
    ),
  };
}

module.exports = {
  DEFAULT_GIFT_CARD_SETTINGS,
  getGiftCardAutoHiddenYearForVisibility,
  getGiftCardValiditySettings,
  getGiftCardSettings,
  computeGiftCardValidUntil,
  applyGiftCardLifecycle,
  refreshGiftCardLifecycle,
  sanitizeGiftCardSettingsInput,
  sanitizeGiftCardValidityInput,
};
