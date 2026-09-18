const express = require("express");
const router = express.Router();
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const RestaurantModel = require("../../models/restaurant.model");
const SmsJobModel = require("../../models/sms-job.model");
const SmsUsagePeriodModel = require("../../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../../models/sms-destination-policy.model");
const {
  isSmsDestinationPolicyTechnicallyReady,
  SMS_DESTINATION_SENDER_MODES,
  syncAllFutureSmsJobs,
} = require("../../services/sms/sms-reminder.service");
const { DEFAULT_TIMEZONE } = require("../../services/sms/sms-schedule.service");
const SmsModeProvider = require("../../services/sms/smsmode-provider");

const SENDER_ID_PATTERN = /^[A-Za-z0-9 ._-]{3,11}$/;
const ADMIN_SMS_SENDERS_QUERY = {
  "reservationsSettings.smsReminder.sender.value": {
    $type: "string",
    $regex: /\S/,
  },
};

function resolveAdminSenderUpdate(currentSender = {}, input = {}) {
  const hasValue = Object.prototype.hasOwnProperty.call(input, "value");
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");
  if (!hasValue && !hasStatus) {
    const error = new Error("Valeur ou statut Sender ID requis.");
    error.statusCode = 400;
    throw error;
  }

  const currentValue = String(currentSender.value || "").trim();
  const nextValue = hasValue ? String(input.value || "").trim() : currentValue;
  if (!nextValue || !SENDER_ID_PATTERN.test(nextValue)) {
    const error = new Error(
      "Le Sender ID doit contenir 3 à 11 caractères autorisés.",
    );
    error.statusCode = 400;
    throw error;
  }

  const requestedStatus = hasStatus ? String(input.status || "") : "";
  if (
    hasStatus &&
    !["pending", "approved", "rejected"].includes(requestedStatus)
  ) {
    const error = new Error("Statut Sender ID invalide.");
    error.statusCode = 400;
    throw error;
  }
  if (requestedStatus === "approved") {
    const error = new Error(
      "L’approbation nécessite une vérification auprès de smsmode.",
    );
    error.statusCode = 400;
    throw error;
  }

  const valueChanged = nextValue !== currentValue;
  return {
    value: nextValue,
    status: valueChanged
      ? "pending"
      : requestedStatus || currentSender.status || "pending",
  };
}

async function verifyConfiguredSender(restaurant, provider) {
  const sender = restaurant.reservationsSettings?.smsReminder?.sender;
  const value = String(sender?.value || "").trim();
  if (!value) {
    const error = new Error("Configurez d’abord un Sender ID.");
    error.statusCode = 400;
    throw error;
  }

  try {
    const result = await provider.senderExists(value);
    if (result?.exists) {
      sender.status = "approved";
      if (restaurant.options?.sms_reminders) {
        restaurant.reservationsSettings.smsReminder.selfServiceEligible = true;
      }
      await restaurant.save();
      return {
        sender: { value, status: "approved" },
        verification: {
          status: "verified",
          channelId: result.channelId || "",
          channelName: result.channelName || "",
        },
      };
    }
    sender.status = "pending";
    await restaurant.save();
    return {
      sender: { value, status: "pending" },
      verification: { status: "not_found" },
    };
  } catch (_) {
    sender.status = "pending";
    await restaurant.save();
    return {
      sender: { value, status: "pending" },
      verification: {
        status: "unavailable",
        message:
          "Sender ID enregistré, mais la vérification smsmode n’a pas pu être effectuée.",
      },
    };
  }
}

async function configureAdminSender(restaurant, input, provider) {
  restaurant.reservationsSettings = restaurant.reservationsSettings || {};
  restaurant.reservationsSettings.smsReminder =
    restaurant.reservationsSettings.smsReminder || {};
  const currentSender = restaurant.reservationsSettings?.smsReminder?.sender;
  const currentValue = String(currentSender?.value || "").trim();
  const sender = resolveAdminSenderUpdate(currentSender, input);
  const valueChanged = sender.value !== currentValue;
  restaurant.reservationsSettings.smsReminder.sender = sender;
  await restaurant.save();

  if (valueChanged) return verifyConfiguredSender(restaurant, provider);
  return {
    sender,
    verification: { status: "not_required" },
  };
}

async function withRestaurantNames(items = []) {
  const restaurantIds = Array.from(
    new Set(items.map((item) => String(item.restaurantId || "")).filter(Boolean)),
  );
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select("name timezone")
        .lean()
    : [];
  const restaurantsById = new Map(
    restaurants.map((restaurant) => [
      String(restaurant._id),
      restaurant,
    ]),
  );

  return items.map((item) => {
    const restaurant = restaurantsById.get(String(item.restaurantId || ""));
    return {
      ...item,
      restaurantName: restaurant?.name || "Restaurant supprimé",
      restaurantTimezone: restaurant?.timezone || DEFAULT_TIMEZONE,
    };
  });
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeAdminSmsJob(job = {}) {
  return {
    ...job,
    scheduledAt: toIsoDate(job.scheduledAt),
    providerSubmissionStartedAt: toIsoDate(job.providerSubmissionStartedAt),
    sentAt: toIsoDate(job.sentAt),
    acceptedAt: toIsoDate(job.acceptedAt),
    deliveredAt: toIsoDate(job.deliveredAt),
    failedAt: toIsoDate(job.failedAt),
    cancelledAt: toIsoDate(job.cancelledAt),
    skippedAt: toIsoDate(job.skippedAt),
  };
}

router.get("/admin/sms/jobs", authenticateAdmin, async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.restaurantId) query.restaurantId = req.query.restaurantId;
  const jobs = await SmsJobModel.find(query).sort({ createdAt: -1 }).limit(200).select("restaurantId reservationId status skipReason failureCode failureReason destinationCountry billingCredits stripeUsageState stripeUsageFirstAttemptAt providerMessageId scheduledAt providerSubmissionStartedAt sentAt acceptedAt deliveredAt failedAt cancelledAt skippedAt createdAt").lean();
  const enrichedJobs = await withRestaurantNames(jobs);
  return res.json({ jobs: enrichedJobs.map(serializeAdminSmsJob) });
});

router.get("/admin/sms/usage", authenticateAdmin, async (_req, res) => {
  const usage = await SmsUsagePeriodModel.find().sort({ periodEnd: -1 }).limit(200).lean();
  return res.json({ usage: await withRestaurantNames(usage) });
});

function serializeAdminSenderRestaurant(restaurant = {}) {
  return {
    restaurantId: restaurant._id,
    restaurantName: restaurant.name,
    moduleActive: Boolean(restaurant.options?.sms_reminders),
    ...(restaurant.reservationsSettings?.smsReminder?.sender || {}),
  };
}

router.get("/admin/sms/senders", authenticateAdmin, async (_req, res) => {
  const restaurants = await RestaurantModel.find(ADMIN_SMS_SENDERS_QUERY)
    .select("name options.sms_reminders reservationsSettings.smsReminder.sender")
    .sort({ name: 1 })
    .lean();
  return res.json({ senders: restaurants.map(serializeAdminSenderRestaurant) });
});

function serializeAdminDestinationPolicy(policy = {}) {
  const value = typeof policy.toObject === "function" ? policy.toObject() : policy;
  const serialized = { ...value };
  delete serialized.technicalStatus;
  return {
    ...serialized,
    technicalReady: isSmsDestinationPolicyTechnicallyReady(serialized),
  };
}

router.get("/admin/sms/destination-policies", authenticateAdmin, async (_req, res) => {
  const policies = await SmsDestinationPolicyModel.find().sort({ country: 1 }).lean();
  return res.json({
    policies: policies.map(serializeAdminDestinationPolicy),
  });
});

function destinationPolicyValidationError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeDestinationPolicyInput(country, input = {}) {
  const billingCredits = Number(input.billingCredits);
  const providerRateHt = Number(input.providerRateHt);
  const senderMode = String(input.senderMode || "").trim() || null;
  const lastReviewedAt = new Date(input.lastReviewedAt);
  const senderRegistrationRequired =
    typeof input.senderRegistrationRequired === "boolean"
      ? input.senderRegistrationRequired
      : null;
  const supportsDlr =
    typeof input.supportsDlr === "boolean" ? input.supportsDlr : null;

  if (!/^[A-Z]{2}$/.test(country)) {
    throw destinationPolicyValidationError(
      "Pays ISO2 invalide.",
      "SMS_DESTINATION_COUNTRY_INVALID",
    );
  }
  if (
    !Number.isInteger(billingCredits) ||
    billingCredits < 1 ||
    !Number.isFinite(providerRateHt) ||
    providerRateHt < 0 ||
    Number.isNaN(lastReviewedAt.getTime())
  ) {
    throw destinationPolicyValidationError(
      "Politique tarifaire SMS incomplète.",
      "SMS_DESTINATION_PRICING_INCOMPLETE",
    );
  }
  if (
    senderMode !== null &&
    !SMS_DESTINATION_SENDER_MODES.includes(senderMode)
  ) {
    throw destinationPolicyValidationError(
      "Mode d’envoi SMS invalide.",
      "SMS_DESTINATION_SENDER_MODE_INVALID",
    );
  }

  const update = {
    country,
    enabled: Boolean(input.enabled),
    provider: "smsmode",
    senderMode,
    senderRegistrationRequired,
    supportsDlr,
    providerRateHt,
    billingCredits,
    fallbackSender: String(input.fallbackSender || "").trim(),
    lastReviewedAt,
  };
  if (
    update.enabled &&
    !isSmsDestinationPolicyTechnicallyReady(update)
  ) {
    throw destinationPolicyValidationError(
      "Cette destination ne peut pas être activée tant que sa configuration technique n’est pas prête.",
      "SMS_DESTINATION_NOT_READY",
      409,
    );
  }
  return update;
}

router.put("/admin/sms/destination-policies/:country", authenticateAdmin, requireAdminRole, async (req, res) => {
  const country = String(req.params.country || "").trim().toUpperCase();
  let update;
  try {
    update = normalizeDestinationPolicyInput(country, req.body || {});
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      code: error.code,
      message: error.message,
    });
  }
  const policy = await SmsDestinationPolicyModel.findOneAndUpdate(
    { country },
    { $set: update },
    { upsert: true, new: true, runValidators: true },
  );
  await syncAllFutureSmsJobs({ force: true });
  return res.json({
    policy: serializeAdminDestinationPolicy(policy),
  });
});

router.put("/admin/restaurants/:id/sms-sender", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    const input = req.body || {};
    if (Object.prototype.hasOwnProperty.call(input, "value")) {
      const result = await configureAdminSender(
        restaurant,
        input,
        new SmsModeProvider(),
      );
      return res.json(result);
    }
    const sender = resolveAdminSenderUpdate(
      restaurant.reservationsSettings?.smsReminder?.sender,
      input,
    );
    restaurant.reservationsSettings.smsReminder.sender = sender;
    await restaurant.save();
    return res.json({ sender, verification: { status: "not_required" } });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      message: error?.message || "Internal server error",
    });
  }
});

router.post("/admin/restaurants/:id/sms-sender/verify", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    return res.json(
      await verifyConfiguredSender(restaurant, new SmsModeProvider()),
    );
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      message: error?.message || "Internal server error",
    });
  }
});

module.exports = router;
module.exports.ADMIN_SMS_SENDERS_QUERY = ADMIN_SMS_SENDERS_QUERY;
module.exports.configureAdminSender = configureAdminSender;
module.exports.resolveAdminSenderUpdate = resolveAdminSenderUpdate;
module.exports.normalizeDestinationPolicyInput = normalizeDestinationPolicyInput;
module.exports.serializeAdminDestinationPolicy = serializeAdminDestinationPolicy;
module.exports.serializeAdminSenderRestaurant = serializeAdminSenderRestaurant;
module.exports.serializeAdminSmsJob = serializeAdminSmsJob;
module.exports.verifyConfiguredSender = verifyConfiguredSender;
