const express = require("express");
const router = express.Router();
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const RestaurantModel = require("../../models/restaurant.model");
const SmsJobModel = require("../../models/sms-job.model");
const SmsUsagePeriodModel = require("../../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../../models/sms-destination-policy.model");
const { syncAllFutureSmsJobs } = require("../../services/sms/sms-reminder.service");

router.get("/admin/sms/jobs", authenticateAdmin, async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.restaurantId) query.restaurantId = req.query.restaurantId;
  const jobs = await SmsJobModel.find(query).sort({ createdAt: -1 }).limit(200).select("restaurantId reservationId status skipReason failureCode failureReason destinationCountry billingCredits stripeUsageState stripeUsageFirstAttemptAt providerMessageId scheduledAt acceptedAt deliveredAt failedAt createdAt").lean();
  return res.json({ jobs });
});

router.get("/admin/sms/usage", authenticateAdmin, async (_req, res) => {
  const usage = await SmsUsagePeriodModel.find().sort({ periodEnd: -1 }).limit(200).lean();
  return res.json({ usage });
});

router.get("/admin/sms/senders", authenticateAdmin, async (_req, res) => {
  const restaurants = await RestaurantModel.find({
    "reservationsSettings.smsReminder.sender.status": { $in: ["pending", "rejected"] },
    "reservationsSettings.smsReminder.sender.value": { $ne: "" },
  })
    .select("name reservationsSettings.smsReminder.sender")
    .sort({ name: 1 })
    .lean();
  return res.json({ senders: restaurants.map((restaurant) => ({ restaurantId: restaurant._id, restaurantName: restaurant.name, ...restaurant.reservationsSettings.smsReminder.sender })) });
});

router.get("/admin/sms/destination-policies", authenticateAdmin, async (_req, res) => {
  return res.json({ policies: await SmsDestinationPolicyModel.find().sort({ country: 1 }).lean() });
});

router.put("/admin/sms/destination-policies/:country", authenticateAdmin, requireAdminRole, async (req, res) => {
  const country = String(req.params.country || "").trim().toUpperCase();
  const input = req.body || {};
  if (!/^[A-Z]{2}$/.test(country)) return res.status(400).json({ message: "Pays ISO2 invalide." });
  const billingCredits = Number(input.billingCredits);
  const providerRateHt = Number(input.providerRateHt);
  const senderModes = ["alpha", "registered_alpha", "numeric", "shortcode", "provider_default"];
  if (!Number.isInteger(billingCredits) || billingCredits < 1 || !Number.isFinite(providerRateHt) || providerRateHt < 0 || !senderModes.includes(input.senderMode) || !input.lastReviewedAt) {
    return res.status(400).json({ message: "Politique SMS incomplète; activation refusée." });
  }
  const policy = await SmsDestinationPolicyModel.findOneAndUpdate(
    { country },
    { $set: { country, enabled: Boolean(input.enabled), provider: "smsmode", senderMode: input.senderMode, senderRegistrationRequired: Boolean(input.senderRegistrationRequired), supportsDlr: Boolean(input.supportsDlr), providerRateHt, billingCredits, fallbackSender: String(input.fallbackSender || "").trim(), lastReviewedAt: new Date(input.lastReviewedAt) } },
    { upsert: true, new: true, runValidators: true },
  );
  await syncAllFutureSmsJobs({ force: true });
  return res.json({ policy });
});

router.put("/admin/restaurants/:id/sms-sender", authenticateAdmin, requireAdminRole, async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["pending", "approved", "rejected"].includes(status)) return res.status(400).json({ message: "Statut Sender ID invalide." });
  const restaurant = await RestaurantModel.findByIdAndUpdate(req.params.id, { $set: { "reservationsSettings.smsReminder.sender.status": status } }, { new: true });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  return res.json({ sender: restaurant.reservationsSettings?.smsReminder?.sender });
});

module.exports = router;
