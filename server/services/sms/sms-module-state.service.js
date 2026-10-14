const SmsJobModel = require("../../models/sms-job.model");
const { SMS_ADDON_CODE } = require("../stripe-subscription-catalog.service");

function smsModuleStates(restaurant) {
  return {
    reservations: restaurant.reservationsSettings?.smsReminder?.enabled === true,
    take_away: restaurant.takeAwaySettings?.smsNotifications?.enabled === true,
  };
}

function planSmsModuleChange(restaurant, module, enabled, now = new Date()) {
  const states = smsModuleStates(restaurant);
  const pending = restaurant.reservationsSettings?.smsReminder?.commercialDeactivation;
  if (enabled) {
    if (!restaurant.options?.sms_reminders ||
        (pending?.status === "scheduled" && new Date(pending.effectiveAt) <= now))
      return "reactivate";
    return pending?.status === "scheduled" ? "cancel_deactivation" : "local";
  }
  const other = module === "reservations" ? "take_away" : "reservations";
  return states[module] && !states[other] && restaurant.options?.sms_reminders &&
    pending?.status !== "scheduled" ? "schedule_deactivation" : "local";
}

function setSmsModuleEnabled(restaurant, module, enabled, now = new Date()) {
  const settings = module === "reservations"
    ? restaurant.reservationsSettings.smsReminder
    : restaurant.takeAwaySettings.smsNotifications;
  if (enabled && !settings.enabled) settings.enabledAt = now;
  settings.enabled = enabled;
}

async function cancelModuleSmsJobs(restaurantId, module, now = new Date(), model = SmsJobModel) {
  // Submitted messages cannot be recalled; their delivery and Meter reporting continue.
  return model.updateMany({
    restaurantId,
    type: module === "reservations" ? "reservation_reminder" : /^take_away_/,
    status: { $in: ["scheduled", "processing"] },
    providerSubmissionStartedAt: null,
  }, { $set: {
    status: "cancelled", cancelledAt: now, skipReason: "module_disabled",
    lockedAt: null, lockExpiresAt: null,
  } });
}

function serializeCommercialState(restaurant, summary = null) {
  const settings = restaurant.reservationsSettings?.smsReminder || {};
  const pending = settings.commercialDeactivation || {};
  const addon = (summary?.addons || []).find((item) =>
    item.code === SMS_ADDON_CODE || item.priceId === process.env.STRIPE_SMS_FIXED_PRICE_ID);
  const periodEnd = Number(summary?.subscription?.current_period_end || 0);
  return {
    selfServiceEligible: Boolean(settings.selfServiceEligible),
    canSelfManage: Boolean(settings.selfServiceEligible),
    active: Boolean(restaurant.options?.sms_reminders),
    status: pending.status || "none", effectiveAt: pending.effectiveAt || null,
    fixedMonthlyAmount: addon ? Number(addon.amount || 0) : 9.9,
    currency: addon?.currency || summary?.currency || "EUR",
    includedCredits: 100, overageUnitAmount: 0.1,
    periodEnd: periodEnd > 0 ? new Date(periodEnd * 1000) : pending.effectiveAt || null,
  };
}

function assertSmsActivationUnchanged(restaurant, module, input) {
  if (input && Object.hasOwn(input, "enabled") &&
      (typeof input.enabled !== "boolean" || input.enabled !== smsModuleStates(restaurant)[module])) {
    const error = new Error("Utilisez le toggle SMS pour modifier l’activation du module.");
    error.statusCode = 409;
    throw error;
  }
  if (["processing", "stripe_applied"].includes(
    restaurant.reservationsSettings?.smsReminder?.selfServiceOperation?.status)) {
    const error = new Error("Une modification SMS est déjà en cours.");
    error.statusCode = 409;
    throw error;
  }
}

function smsSettingsWriteFilter(restaurant) {
  const states = smsModuleStates(restaurant);
  return {
    _id: restaurant._id,
    "reservationsSettings.smsReminder.enabled": states.reservations ? true : { $ne: true },
    "takeAwaySettings.smsNotifications.enabled": states.take_away ? true : { $ne: true },
    "reservationsSettings.smsReminder.selfServiceOperation.status": {
      $nin: ["processing", "stripe_applied"],
    },
  };
}

module.exports = {
  smsModuleStates, planSmsModuleChange, setSmsModuleEnabled,
  cancelModuleSmsJobs, serializeCommercialState, assertSmsActivationUnchanged, smsSettingsWriteFilter,
};
