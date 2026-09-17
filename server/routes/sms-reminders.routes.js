const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authentificate-token");
const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const SmsUsagePeriodModel = require("../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../models/sms-destination-policy.model");
const {
  DEFAULT_SMS_TEMPLATE,
  normalizeDefaultSmsTemplate,
  validateSmsTemplate,
} = require("../services/sms/sms-message.service");
const { syncAllFutureSmsJobs } = require("../services/sms/sms-reminder.service");

async function canManageSms(user, restaurant) {
  if (!user || !restaurant) return false;
  if (user.role === "owner") return String(restaurant.owner_id) === String(user.id);
  if (user.role !== "employee" || String(user.restaurantId) !== String(restaurant._id)) return false;
  const employee = await EmployeeModel.findById(user.id).select("restaurantProfiles");
  const profile = employee?.restaurantProfiles?.find((item) => String(item.restaurant) === String(restaurant._id));
  return Boolean(profile?.options?.reservations);
}

function serializeSettings(settings = {}) {
  return {
    enabled: Boolean(settings.enabled),
    delayMinutes: Number(settings.delayMinutes || 1440),
    deliveryMode: settings.deliveryMode || "sms_always",
    template: normalizeDefaultSmsTemplate(
      settings.template || DEFAULT_SMS_TEMPLATE,
    ),
    internationalEnabled: Boolean(settings.internationalEnabled),
    billingPeriodSpendingLimit: settings.billingPeriodSpendingLimit ?? null,
  };
}

function applyRestaurantSmsSettings(settings, input = {}) {
  const delayMinutes = Math.floor(Number(input.delayMinutes));
  if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 43200) {
    const error = new Error("Délai SMS invalide.");
    error.statusCode = 400;
    throw error;
  }
  if (!["sms_always", "eco"].includes(input.deliveryMode)) {
    const error = new Error("Mode d'envoi invalide.");
    error.statusCode = 400;
    throw error;
  }
  const template = validateSmsTemplate(
    normalizeDefaultSmsTemplate(input.template),
  );
  const rawLimit = input.billingPeriodSpendingLimit;
  const spendingLimit =
    rawLimit === null || rawLimit === "" || rawLimit === undefined
      ? null
      : Number(rawLimit);
  if (
    spendingLimit !== null &&
    (!Number.isFinite(spendingLimit) ||
      spendingLimit < 0 ||
      spendingLimit > 10000)
  ) {
    const error = new Error("Plafond de dépense invalide.");
    error.statusCode = 400;
    throw error;
  }

  settings.enabled = Boolean(input.enabled);
  settings.delayMinutes = delayMinutes;
  settings.deliveryMode = input.deliveryMode;
  settings.template = template;
  settings.internationalEnabled = Boolean(input.internationalEnabled);
  settings.billingPeriodSpendingLimit = spendingLimit;
  return settings;
}

function serializeDestinationPolicy(policy = {}) {
  return {
    country: policy.country || "",
    enabled: policy.enabled === true,
    billingCredits: Number(policy.billingCredits || 1),
    senderMode: policy.senderMode || "provider_default",
    fallbackSender: policy.fallbackSender || "",
  };
}

router.get("/restaurants/:id/sms-reminders", authenticateToken, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    if (!(await canManageSms(req.user, restaurant))) return res.status(403).json({ message: "Forbidden" });
    const [usage, destinations] = await Promise.all([
      SmsUsagePeriodModel.findOne({ restaurantId: restaurant._id, periodEnd: { $gt: new Date() } }).sort({ periodEnd: 1 }).lean(),
      SmsDestinationPolicyModel.find({ enabled: true }).sort({ country: 1 }).lean(),
    ]);
    return res.json({
      subscribed: Boolean(restaurant.options?.sms_reminders),
      settings: serializeSettings(restaurant.reservationsSettings?.smsReminder),
      usage: usage || { includedCredits: 100, reservedCredits: 0, consumedCredits: 0, includedCreditsConsumed: 0, overageCredits: 0, overageAmount: 0 },
      destinations: destinations.map(serializeDestinationPolicy),
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "Internal server error" });
  }
});

router.put("/restaurants/:id/sms-reminders", authenticateToken, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    if (!(await canManageSms(req.user, restaurant))) return res.status(403).json({ message: "Forbidden" });
    if (!restaurant.options?.sms_reminders) return res.status(403).json({ message: "Le module Rappels SMS n'est pas souscrit." });
    const input = req.body || {};
    applyRestaurantSmsSettings(
      restaurant.reservationsSettings.smsReminder,
      input,
    );
    await restaurant.save();
    await syncAllFutureSmsJobs({ force: true });
    return res.json({ settings: serializeSettings(restaurant.reservationsSettings.smsReminder) });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ message: error?.message || "Internal server error" });
  }
});

module.exports = router;
module.exports.applyRestaurantSmsSettings = applyRestaurantSmsSettings;
module.exports.serializeSettings = serializeSettings;
