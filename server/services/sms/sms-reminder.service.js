const crypto = require("crypto");
const Stripe = require("stripe");
const { DateTime } = require("luxon");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const SmsJobModel = require("../../models/sms-job.model");
const SmsUsagePeriodModel = require("../../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../../models/sms-destination-policy.model");
const { findRestaurantSubscription } = require("../stripe-billing.service");
const { analyzeSingleSms, renderSmsTemplate } = require("./sms-message.service");
const { normalizeSmsPhone } = require("./sms-phone.service");
const { computeSmsSchedule, getRestaurantTimezone } = require("./sms-schedule.service");
const { buildStripeMeterEventParams } = require("./sms-meter.service");
const SmsModeProvider = require("./smsmode-provider");

const INCLUDED_CREDITS = 100;
const OVERAGE_UNIT_PRICE = 0.1;
const LOCK_MS = 3 * 60 * 1000;
const FINAL_JOB_STATUSES = ["accepted", "delivered", "failed", "uncertain"];

function sendingIsEnabled() {
  return (
    process.env.SMS_SENDING_ENABLED === "true" &&
    process.env.NODE_ENV === "production"
  );
}

function hasUsableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildOccurrenceKey(reservationStartsAt) {
  return new Date(reservationStartsAt).toISOString();
}

async function getSmsBillingContext(restaurantId) {
  if (!process.env.STRIPE_API_SECRET_KEY) return null;
  const context = await findRestaurantSubscription({ restaurantId });
  const subscription = context?.subscription;
  if (!subscription || !["active", "trialing"].includes(subscription.status)) return null;

  const fixedPriceId = String(process.env.STRIPE_SMS_FIXED_PRICE_ID || "").trim();
  const meteredPriceId = String(process.env.STRIPE_SMS_METERED_PRICE_ID || "").trim();
  if (!fixedPriceId || !meteredPriceId) return null;
  const priceIds = (subscription.items?.data || []).map((item) => item?.price?.id).filter(Boolean);
  if (!priceIds.includes(fixedPriceId) || !priceIds.includes(meteredPriceId)) return null;

  const periodStartSeconds = Number(subscription.current_period_start || subscription.items?.data?.[0]?.current_period_start || 0);
  const periodEndSeconds = Number(subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end || 0);
  if (!periodStartSeconds || !periodEndSeconds) return null;
  return {
    subscriptionId: subscription.id,
    stripeCustomerId: context.stripeCustomerId,
    periodStart: new Date(periodStartSeconds * 1000),
    periodEnd: new Date(periodEndSeconds * 1000),
  };
}

async function subscriptionAllowsSms(restaurant) {
  if (!restaurant?.options?.sms_reminders) return null;
  return getSmsBillingContext(restaurant._id);
}

async function syncReservationSmsJob(reservation, restaurant, now = new Date(), { force = false } = {}) {
  const settings = restaurant?.reservationsSettings?.smsReminder || {};
  const mutableStatuses = ["scheduled", "processing", "skipped", "cancelled"];
  if (!settings.enabled || !restaurant?.options?.sms_reminders || reservation.status !== "Confirmed") {
    await SmsJobModel.updateMany(
      { reservationId: reservation._id, status: { $in: ["scheduled", "processing"] }, providerSubmissionStartedAt: null },
      { $set: { status: "cancelled", skipReason: settings.enabled ? "reservation_not_confirmed" : "feature_disabled", lockedAt: null, lockExpiresAt: null } },
    );
    return null;
  }

  const schedule = computeSmsSchedule({ reservation, restaurant, delayMinutes: settings.delayMinutes, now });
  if (!schedule.reservationStartsAt) return null;
  const occurrenceKey = buildOccurrenceKey(schedule.reservationStartsAt);
  await SmsJobModel.updateMany(
    { reservationId: reservation._id, occurrenceKey: { $ne: occurrenceKey }, status: { $in: ["scheduled", "processing"] }, providerSubmissionStartedAt: null },
    { $set: { status: "cancelled", skipReason: "reservation_rescheduled", lockedAt: null, lockExpiresAt: null } },
  );

  const reference = `gusto-sms-${reservation._id}-${crypto.createHash("sha256").update(occurrenceKey).digest("hex").slice(0, 12)}`;
  const skipReason = schedule.skipReason || (settings.deliveryMode === "eco" && hasUsableEmail(reservation.customerEmail) ? "eco_email" : "");
  const desiredStatus = skipReason ? "skipped" : "scheduled";
  const existing = await SmsJobModel.findOne({ reservationId: reservation._id, type: "reservation_reminder", occurrenceKey });
  if (existing && FINAL_JOB_STATUSES.includes(existing.status)) return existing;
  if (existing?.status === "skipped" && !force) return existing;

  return SmsJobModel.findOneAndUpdate(
    { reservationId: reservation._id, type: "reservation_reminder", occurrenceKey, status: { $in: mutableStatuses } },
    {
      $set: {
        restaurantId: restaurant._id,
        reservationStartsAt: schedule.reservationStartsAt,
        reservationDateSnapshot: reservation.reservationDate,
        reservationTimeSnapshot: reservation.reservationTime,
        scheduledAt: schedule.scheduledAt || now,
        status: desiredStatus,
        skipReason,
        nextAttemptAt: schedule.scheduledAt || now,
        providerReference: reference,
        lockedAt: null,
        lockExpiresAt: null,
      },
      $setOnInsert: { type: "reservation_reminder" },
    },
    { upsert: true, new: true, runValidators: true },
  );
}

async function syncAllFutureSmsJobs({ force = false } = {}) {
  const restaurants = await RestaurantModel.find({
    "options.sms_reminders": true,
    "reservationsSettings.smsReminder.enabled": true,
  }).select("name timezone options reservationsSettings.smsReminder");
  const now = new Date();
  for (const restaurant of restaurants) {
    const delayMinutes = Math.max(
      1,
      Number(restaurant.reservationsSettings?.smsReminder?.delayMinutes || 1440),
    );
    const reservations = await ReservationModel.find({
      restaurant_id: restaurant._id,
      status: "Confirmed",
      reservationDate: {
        $gte: DateTime.fromJSDate(now).minus({ days: 1 }).startOf("day").toJSDate(),
        $lte: DateTime.fromJSDate(now)
          .plus({ minutes: delayMinutes, days: 2 })
          .endOf("day")
          .toJSDate(),
      },
    }).select("restaurant_id customerFirstName customerEmail customerPhone numberOfGuests reservationDate reservationTime status");
    for (const reservation of reservations) await syncReservationSmsJob(reservation, restaurant, now, { force });
  }
  await SmsJobModel.updateMany(
    { status: "scheduled", reservationStartsAt: { $lte: now } },
    { $set: { status: "skipped", skipReason: "too_late" } },
  );
}

async function cancelIneligibleScheduledJobs() {
  const jobs = await SmsJobModel.find({ status: "scheduled" })
    .sort({ scheduledAt: 1 })
    .limit(500)
    .select("restaurantId reservationId");
  for (const job of jobs) {
    const [reservation, restaurant] = await Promise.all([
      ReservationModel.findById(job.reservationId).select("status"),
      RestaurantModel.findById(job.restaurantId).select("options.sms_reminders reservationsSettings.smsReminder.enabled"),
    ]);
    if (
      reservation?.status === "Confirmed" &&
      restaurant?.options?.sms_reminders &&
      restaurant?.reservationsSettings?.smsReminder?.enabled
    ) continue;
    await SmsJobModel.updateOne(
      { _id: job._id, status: "scheduled" },
      { $set: { status: "cancelled", skipReason: !reservation || reservation.status !== "Confirmed" ? "reservation_not_confirmed" : "feature_disabled" } },
    );
  }
}

async function finalizeDueSmsDeactivations(now = new Date()) {
  const restaurants = await RestaurantModel.find({
    "reservationsSettings.smsReminder.commercialDeactivation.status":
      "scheduled",
    "reservationsSettings.smsReminder.commercialDeactivation.effectiveAt": {
      $lte: now,
    },
  }).select("reservationsSettings.smsReminder.commercialDeactivation");

  const smsPriceIds = [
    String(process.env.STRIPE_SMS_FIXED_PRICE_ID || "").trim(),
    String(process.env.STRIPE_SMS_METERED_PRICE_ID || "").trim(),
  ].filter(Boolean);

  for (const restaurant of restaurants) {
    try {
      const context = await findRestaurantSubscription({
        restaurantId: restaurant._id,
      });
      const activePriceIds = new Set(
        (context?.subscription?.items?.data || [])
          .map((item) => item?.price?.id)
          .filter(Boolean),
      );
      if (smsPriceIds.some((priceId) => activePriceIds.has(priceId))) continue;

      const deactivation =
        restaurant.reservationsSettings?.smsReminder?.commercialDeactivation;
      const updateResult = await RestaurantModel.updateOne(
        {
          _id: restaurant._id,
          "reservationsSettings.smsReminder.commercialDeactivation.status":
            "scheduled",
          "reservationsSettings.smsReminder.commercialDeactivation.stripeScheduleId":
            deactivation?.stripeScheduleId || "",
        },
        {
          $set: {
            "options.sms_reminders": false,
            "reservationsSettings.smsReminder.enabled": false,
            "reservationsSettings.smsReminder.commercialDeactivation.status":
              "effective",
          },
        },
      );
      if (!updateResult.modifiedCount) continue;

      await SmsJobModel.updateMany(
        {
          restaurantId: restaurant._id,
          status: { $in: ["scheduled", "processing"] },
          providerSubmissionStartedAt: null,
        },
        {
          $set: {
            status: "cancelled",
            skipReason: "feature_disabled",
            lockedAt: null,
            lockExpiresAt: null,
          },
        },
      );
    } catch (error) {
      console.error(
        "[sms-deactivation]",
        String(restaurant._id),
        error?.message || error,
      );
    }
  }
}

async function reserveUsage({ restaurant, billingContext, credits }) {
  const settings = restaurant.reservationsSettings?.smsReminder || {};
  const limit = settings.billingPeriodSpendingLimit;
  const maxOverageCredits = limit === null || limit === undefined
    ? Number.MAX_SAFE_INTEGER
    : Math.floor((Number(limit) + Number.EPSILON) / OVERAGE_UNIT_PRICE);
  const maxCommitted = INCLUDED_CREDITS + Math.max(0, maxOverageCredits);
  const identity = {
    restaurantId: restaurant._id,
    stripeSubscriptionId: billingContext.subscriptionId,
    periodStart: billingContext.periodStart,
    periodEnd: billingContext.periodEnd,
  };
  try {
    await SmsUsagePeriodModel.updateOne(
      identity,
      { $setOnInsert: { ...identity, includedCredits: INCLUDED_CREDITS } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  const periodBeforeReservation = await SmsUsagePeriodModel.findOneAndUpdate(
    { ...identity, $expr: { $lte: [{ $add: ["$reservedCredits", "$consumedCredits", credits] }, maxCommitted] } },
    { $inc: { reservedCredits: credits } },
    { new: false },
  );
  if (!periodBeforeReservation) return null;
  const committedBefore = periodBeforeReservation.reservedCredits + periodBeforeReservation.consumedCredits;
  const includedApplied = Math.min(credits, Math.max(0, INCLUDED_CREDITS - committedBefore));
  return { period: periodBeforeReservation, includedApplied, overage: credits - includedApplied };
}

async function releaseUsage(job) {
  if (job.usageState !== "reserved" || !job.usagePeriodId) return;
  await SmsUsagePeriodModel.updateOne({ _id: job.usagePeriodId, reservedCredits: { $gte: job.billingCredits } }, { $inc: { reservedCredits: -job.billingCredits } });
  job.usageState = "released";
}

async function consumeUsage(job) {
  if (job.usageState !== "reserved" || !job.usagePeriodId) return;
  const result = await SmsUsagePeriodModel.updateOne(
    { _id: job.usagePeriodId, reservedCredits: { $gte: job.billingCredits } },
    { $inc: { reservedCredits: -job.billingCredits, consumedCredits: job.billingCredits, includedCreditsConsumed: job.includedCreditsApplied, overageCredits: job.overageCredits, overageAmount: job.overageAmountSnapshot } },
  );
  if (!result.modifiedCount) throw new Error("Impossible de finaliser les crédits SMS");
  job.usageState = "consumed";
  job.stripeUsageState = "pending";
}

async function reportStripeUsage(job, billingContext) {
  if (job.stripeUsageState === "reported") return;
  const identifier = job.stripeUsageIdentifier || `gusto_sms_${job._id}`;
  const firstAttemptAt = job.stripeUsageFirstAttemptAt
    ? new Date(job.stripeUsageFirstAttemptAt)
    : new Date();
  if (Date.now() - firstAttemptAt.getTime() >= 23 * 60 * 60 * 1000) {
    job.stripeUsageState = "uncertain";
    job.failureReason = job.failureReason || "stripe_usage_result_unknown";
    await job.save();
    return;
  }
  job.stripeUsageIdentifier = identifier;
  job.stripeUsageFirstAttemptAt = firstAttemptAt;
  await job.save();
  const stripe = new Stripe(process.env.STRIPE_API_SECRET_KEY);
  try {
    const event = await stripe.billing.meterEvents.create(
      buildStripeMeterEventParams(job, billingContext),
      { idempotencyKey: identifier },
    );
    job.stripeUsageState = "reported";
    job.stripeUsageReportedAt = new Date();
    job.stripeUsageEventId = event?.identifier || identifier;
  } catch (error) {
    job.stripeUsageState = error?.statusCode && error.statusCode < 500 ? "failed" : "uncertain";
    job.failureReason = job.failureReason || "stripe_usage_reporting";
    throw error;
  } finally {
    await job.save();
  }
}

function formatMessageValues(reservation, restaurant) {
  const zone = getRestaurantTimezone(restaurant);
  const date = DateTime.fromJSDate(new Date(reservation.reservationDate), { zone: "utc" });
  return {
    firstName: reservation.customerFirstName || "",
    date: date.setLocale("fr").toFormat("dd/MM/yyyy"),
    time: String(reservation.reservationTime || "").slice(0, 5),
    guests: reservation.numberOfGuests,
    restaurantName: restaurant.name || "Restaurant",
    zone,
  };
}

function buildFinalMessage({ reservation, restaurant, settings, prefixRequired }) {
  const values = formatMessageValues(reservation, restaurant);
  const prefix = prefixRequired ? `${restaurant.name || "Restaurant"}: ` : "";
  let message = prefix + renderSmsTemplate(settings.template, values);
  let analysis = analyzeSingleSms(message);
  if (!analysis.valid) {
    const safeRestaurantName = String(restaurant.name || "Restaurant")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ._'&-]/g, "")
      .trim() || "Restaurant";
    const safePrefix = prefixRequired ? `${safeRestaurantName}: ` : "";
    message = `${safePrefix}Rappel reservation le ${values.date} a ${values.time}, ${values.guests} pers.`;
    analysis = analyzeSingleSms(message);
  }
  return { message: analysis.message, analysis };
}

async function skipJob(job, reason) {
  await releaseUsage(job);
  job.status = "skipped";
  job.skipReason = reason;
  job.lockedAt = null;
  job.lockExpiresAt = null;
  await job.save();
}

async function processClaimedJob(job) {
  const [reservation, restaurant] = await Promise.all([
    ReservationModel.findById(job.reservationId),
    RestaurantModel.findById(job.restaurantId),
  ]);
  if (!reservation || !restaurant) return skipJob(job, !reservation ? "reservation_not_found" : "restaurant_not_found");
  const settings = restaurant.reservationsSettings?.smsReminder || {};
  if (!settings.enabled || !restaurant.options?.sms_reminders) return skipJob(job, "feature_disabled");
  if (reservation.status !== "Confirmed") return skipJob(job, "reservation_not_confirmed");
  const schedule = computeSmsSchedule({ reservation, restaurant, delayMinutes: settings.delayMinutes });
  if (!schedule.reservationStartsAt || schedule.skipReason) return skipJob(job, schedule.skipReason || "too_late");
  if (buildOccurrenceKey(schedule.reservationStartsAt) !== job.occurrenceKey) return skipJob(job, "reservation_rescheduled");
  if (settings.deliveryMode === "eco" && hasUsableEmail(reservation.customerEmail)) return skipJob(job, "eco_email");
  const phone = normalizeSmsPhone(reservation.customerPhone, "FR");
  if (!phone) return skipJob(job, "no_phone");
  if (phone.country !== "FR" && !settings.internationalEnabled) return skipJob(job, "international_disabled");
  const policy = await SmsDestinationPolicyModel.findOne({ country: phone.country, enabled: true });
  if (!policy || !policy.billingCredits || !policy.senderMode || policy.providerRateHt === null || !policy.lastReviewedAt) return skipJob(job, "unsupported_destination");
  const billingContext = await subscriptionAllowsSms(restaurant);
  if (!billingContext) return skipJob(job, "subscription_inactive");

  const approvedSender = settings.sender?.status === "approved" ? String(settings.sender.value || "").trim() : "";
  const supportsRestaurantSender = ["alpha", "registered_alpha"].includes(policy.senderMode) && approvedSender;
  const sender = supportsRestaurantSender ? approvedSender : policy.fallbackSender || "";
  const { message, analysis } = buildFinalMessage({ reservation, restaurant, settings, prefixRequired: !supportsRestaurantSender });
  if (!analysis.valid || analysis.segmentCount !== 1) return skipJob(job, "message_too_long");

  const usageReservation = await reserveUsage({ restaurant, billingContext, credits: policy.billingCredits });
  if (!usageReservation) return skipJob(job, "budget_limit");
  job.phone = phone.e164;
  job.destinationCountry = phone.country;
  job.senderId = sender;
  job.senderMode = policy.senderMode;
  job.message = message;
  job.segmentCount = 1;
  job.billingCredits = policy.billingCredits;
  job.providerCostSnapshot = policy.providerRateHt;
  job.usagePeriodId = usageReservation.period._id;
  job.usageState = "reserved";
  job.includedCreditsApplied = usageReservation.includedApplied;
  job.overageCredits = usageReservation.overage;
  job.overageUnitPriceSnapshot = OVERAGE_UNIT_PRICE;
  job.overageAmountSnapshot = usageReservation.overage * OVERAGE_UNIT_PRICE;
  await job.save();

  if (!sendingIsEnabled()) return skipJob(job, "sending_disabled");
  job.providerSubmissionStartedAt = new Date();
  await job.save();
  const provider = new SmsModeProvider();
  try {
    const result = await provider.send({
      to: phone.e164,
      sender,
      message,
      reference: job.providerReference,
      callbackUrl: process.env.SMSMODE_DLR_CALLBACK_URL,
    });
    job.providerMessageId = result.providerMessageId;
    job.status = "accepted";
    job.sentAt = new Date();
    job.acceptedAt = new Date();
    job.lockedAt = null;
    job.lockExpiresAt = null;
    await consumeUsage(job);
    await job.save();
    try {
      await reportStripeUsage(job, billingContext);
    } catch (_) {
      // L'envoi reste accepted; le reporting est réconciliable via son identifiant déterministe.
    }
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const definitelyRejected = status >= 400 && status < 500 && status !== 429;
    if (definitelyRejected) {
      await releaseUsage(job);
      job.status = "failed";
      job.failedAt = new Date();
      job.failureCode = String(status);
      job.failureReason = "provider_rejected";
    } else {
      job.status = "uncertain";
      job.failureCode = status ? String(status) : "network_or_timeout";
      job.failureReason = "provider_result_unknown";
    }
    job.lockedAt = null;
    job.lockExpiresAt = null;
    await job.save();
  }
}

async function recoverExpiredJobs() {
  const now = new Date();
  await SmsJobModel.updateMany(
    { status: "processing", lockExpiresAt: { $lt: now }, providerSubmissionStartedAt: null },
    { $set: { status: "scheduled", nextAttemptAt: now, lockedAt: null, lockExpiresAt: null } },
  );
  await SmsJobModel.updateMany(
    { status: "processing", lockExpiresAt: { $lt: now }, providerSubmissionStartedAt: { $ne: null } },
    { $set: { status: "uncertain", failureReason: "worker_crash_after_submission_started", lockedAt: null, lockExpiresAt: null } },
  );
}

async function reconcileUncertainJobs() {
  const jobs = await SmsJobModel.find({ status: "uncertain", provider: "smsmode" }).sort({ updatedAt: 1 }).limit(20);
  const provider = new SmsModeProvider();
  for (const job of jobs) {
    try {
      const remote = await provider.reconcile({ providerMessageId: job.providerMessageId, reference: job.providerReference });
      if (!remote) continue;
      await applyProviderStatus(job, remote);
    } catch (_) {
      // Conservé uncertain : aucun renvoi automatique.
    }
  }
}

async function runSmsReminderWorker() {
  await finalizeDueSmsDeactivations();
  await recoverExpiredJobs();
  await cancelIneligibleScheduledJobs();
  await syncAllFutureSmsJobs();
  for (let index = 0; index < 50; index += 1) {
    const now = new Date();
    const job = await SmsJobModel.findOneAndUpdate(
      { status: "scheduled", scheduledAt: { $lte: now }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      { $set: { status: "processing", processingStartedAt: now, lockedAt: now, lockExpiresAt: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 }, $currentDate: { lastAttemptAt: true } },
      { new: true, sort: { scheduledAt: 1 } },
    );
    if (!job) break;
    await processClaimedJob(job);
  }
  await reconcileUncertainJobs();
  await reconcileStripeUsage();
}

async function applyProviderStatus(job, providerPayload) {
  if (!job) return null;
  const value = String(providerPayload?.status?.value || providerPayload?.status || "").toUpperCase();
  if (job.status === "delivered") return job;
  if (job.status === "failed" && value !== "DELIVERED") return job;
  job.providerMessageId = providerPayload?.messageId || job.providerMessageId;
  if (["SCHEDULED", "ENROUTE", "DELIVERED"].includes(value)) {
    if (job.usageState === "reserved") await consumeUsage(job);
    job.acceptedAt = job.acceptedAt || new Date(providerPayload?.acceptedAt || Date.now());
    job.sentAt = job.sentAt || new Date(providerPayload?.sentDate || Date.now());
    job.status = value === "DELIVERED" ? "delivered" : "accepted";
    if (value === "DELIVERED") job.deliveredAt = new Date(providerPayload?.status?.deliveryDate || Date.now());
    await job.save();
    const billing = await getSmsBillingContext(job.restaurantId);
    if (billing && job.stripeUsageState !== "reported") {
      try {
        await reportStripeUsage(job, billing);
      } catch (_) {
        // Etat Stripe conservé uncertain/failed pour diagnostic et réconciliation.
      }
    }
  } else if (["UNDELIVERABLE", "UNDELIVERED"].includes(value)) {
    if (job.usageState === "reserved") await consumeUsage(job);
    job.status = "failed";
    job.failedAt = new Date(providerPayload?.status?.deliveryDate || Date.now());
    job.failureCode = String(providerPayload?.status?.detail || value);
    job.failureReason = "provider_delivery_failed";
    await job.save();
    const billing = await getSmsBillingContext(job.restaurantId);
    if (billing && job.stripeUsageState !== "reported") {
      try {
        await reportStripeUsage(job, billing);
      } catch (_) {
        // Etat Stripe conservé pour réconciliation.
      }
    }
  }
  return job;
}

async function reconcileStripeUsage() {
  const jobs = await SmsJobModel.find({
    usageState: "consumed",
    stripeUsageState: { $in: ["pending", "uncertain"] },
  })
    .sort({ updatedAt: 1 })
    .limit(20);
  for (const job of jobs) {
    try {
      const billing = await getSmsBillingContext(job.restaurantId);
      if (billing) await reportStripeUsage(job, billing);
    } catch (_) {
      // L'identifiant déterministe permet une nouvelle tentative sans double usage.
    }
  }
}

module.exports = {
  INCLUDED_CREDITS,
  OVERAGE_UNIT_PRICE,
  finalizeDueSmsDeactivations,
  getSmsBillingContext,
  applyProviderStatus,
  runSmsReminderWorker,
  syncAllFutureSmsJobs,
  syncReservationSmsJob,
};
