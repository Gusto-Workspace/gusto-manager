const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authentificate-token");
const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const SmsUsagePeriodModel = require("../models/sms-usage-period.model");
const { validateSmsTemplate } = require("../services/sms/sms-message.service");
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
    template: settings.template || "",
    internationalEnabled: Boolean(settings.internationalEnabled),
    billingPeriodSpendingLimit: settings.billingPeriodSpendingLimit ?? null,
    sender: { value: settings.sender?.value || "", status: settings.sender?.status || "pending" },
  };
}

router.get("/restaurants/:id/sms-reminders", authenticateToken, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    if (!(await canManageSms(req.user, restaurant))) return res.status(403).json({ message: "Forbidden" });
    const usage = await SmsUsagePeriodModel.findOne({ restaurantId: restaurant._id, periodEnd: { $gt: new Date() } }).sort({ periodEnd: 1 }).lean();
    return res.json({
      subscribed: Boolean(restaurant.options?.sms_reminders),
      settings: serializeSettings(restaurant.reservationsSettings?.smsReminder),
      usage: usage || { includedCredits: 100, reservedCredits: 0, consumedCredits: 0, includedCreditsConsumed: 0, overageCredits: 0, overageAmount: 0 },
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
    const delayMinutes = Math.floor(Number(input.delayMinutes));
    if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 43200) return res.status(400).json({ message: "Délai SMS invalide." });
    if (!["sms_always", "eco"].includes(input.deliveryMode)) return res.status(400).json({ message: "Mode d'envoi invalide." });
    const template = validateSmsTemplate(input.template);
    const rawLimit = input.billingPeriodSpendingLimit;
    const spendingLimit = rawLimit === null || rawLimit === "" || rawLimit === undefined ? null : Number(rawLimit);
    if (spendingLimit !== null && (!Number.isFinite(spendingLimit) || spendingLimit < 0 || spendingLimit > 10000)) return res.status(400).json({ message: "Plafond de dépense invalide." });
    const senderValue = String(input.sender?.value || "").trim();
    if (senderValue && !/^[A-Za-z0-9 ._-]{3,11}$/.test(senderValue)) return res.status(400).json({ message: "Le Sender ID doit contenir 3 à 11 caractères autorisés." });
    const previous = restaurant.reservationsSettings?.smsReminder?.toObject?.() || restaurant.reservationsSettings?.smsReminder || {};
    restaurant.reservationsSettings.smsReminder = {
      enabled: Boolean(input.enabled),
      delayMinutes,
      deliveryMode: input.deliveryMode,
      template,
      internationalEnabled: Boolean(input.internationalEnabled),
      billingPeriodSpendingLimit: spendingLimit,
      sender: {
        value: senderValue,
        status: senderValue === String(previous.sender?.value || "") ? previous.sender?.status || "pending" : "pending",
      },
    };
    await restaurant.save();
    await syncAllFutureSmsJobs({ force: true });
    return res.json({ settings: serializeSettings(restaurant.reservationsSettings.smsReminder) });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ message: error?.message || "Internal server error" });
  }
});

module.exports = router;
