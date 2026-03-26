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

function getGiftCardSettings(source) {
  const raw = source?.giftCardSettings || source || {};

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

function computeGiftCardValidUntil(settingsSource, referenceDate = new Date()) {
  const settings = getGiftCardSettings(settingsSource);
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
  if (!restaurant || !Array.isArray(restaurant.purchasesGiftCards)) {
    return false;
  }

  const settings = getGiftCardSettings(restaurant);
  let changed = false;

  for (const purchase of restaurant.purchasesGiftCards) {
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
  };
}

module.exports = {
  DEFAULT_GIFT_CARD_SETTINGS,
  getGiftCardSettings,
  computeGiftCardValidUntil,
  applyGiftCardLifecycle,
  refreshGiftCardLifecycle,
  sanitizeGiftCardSettingsInput,
};
