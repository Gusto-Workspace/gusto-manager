const crypto = require("crypto");
const Stripe = require("stripe");
const { DateTime } = require("luxon");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const SmsJobModel = require("../../models/sms-job.model");
const SmsUsagePeriodModel = require("../../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../../models/sms-destination-policy.model");
const { findRestaurantSubscription } = require("../stripe-billing.service");
const {
  analyzeSingleSms,
  normalizeToGsm7,
  renderSmsTemplate,
} = require("./sms-message.service");
const { normalizeSmsPhone } = require("./sms-phone.service");
const { computeSmsSchedule, getRestaurantTimezone } = require("./sms-schedule.service");
const { buildStripeMeterEventParams } = require("./sms-meter.service");
const SmsModeProvider = require("./smsmode-provider");

const INCLUDED_CREDITS = 100;
const OVERAGE_UNIT_PRICE = 0.1;
const LOCK_MS = 3 * 60 * 1000;
const FINAL_JOB_STATUSES = ["accepted", "delivered", "failed", "uncertain"];
const ACCEPTED_RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROVIDER_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

function smsDestinationPolicyIsUsable(policy) {
  return Boolean(
    policy?.enabled === true &&
      Number(policy.billingCredits) >= 1 &&
      policy.senderMode &&
      policy.providerRateHt !== null &&
      policy.providerRateHt !== undefined &&
      policy.lastReviewedAt,
  );
}

function smsDestinationPolicyRequiresApprovedSender(policy) {
  return Boolean(
    policy?.senderRegistrationRequired ||
      policy?.senderMode === "registered_alpha",
  );
}

function validateSmsReactivationPrerequisites({ settings = {}, policies = [] }) {
  const applicablePolicies = policies.filter(
    (policy) =>
      policy?.country === "FR" || settings.internationalEnabled === true,
  );
  const francePolicy = applicablePolicies.find(
    (policy) => policy?.country === "FR",
  );
  if (!smsDestinationPolicyIsUsable(francePolicy)) {
    return {
      code: "SMS_CONFIGURATION_REQUIRED",
      message:
        "La configuration SMS doit être vérifiée par le service client avant la réactivation.",
    };
  }

  const senderRequired = applicablePolicies
    .filter(smsDestinationPolicyIsUsable)
    .some(smsDestinationPolicyRequiresApprovedSender);
  const senderValue = String(settings.sender?.value || "").trim();
  if (
    senderRequired &&
    (settings.sender?.status !== "approved" || !senderValue)
  ) {
    return {
      code: "SMS_SENDER_REVALIDATION_REQUIRED",
      message:
        "Le Sender ID doit être reconfiguré et validé par le service client avant la réactivation.",
    };
  }
  return null;
}

function sendingIsEnabled() {
  return process.env.SMS_SENDING_ENABLED === "true";
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

async function syncReservationSmsJob(
  reservation,
  restaurant,
  now = new Date(),
  { force = false, smsJobModel = SmsJobModel } = {},
) {
  const settings = restaurant?.reservationsSettings?.smsReminder || {};
  const mutableStatuses = ["scheduled", "processing", "skipped", "cancelled"];
  if (!settings.enabled || !restaurant?.options?.sms_reminders || reservation.status !== "Confirmed") {
    await smsJobModel.updateMany(
      { reservationId: reservation._id, status: { $in: ["scheduled", "processing"] }, providerSubmissionStartedAt: null },
      { $set: { status: "cancelled", cancelledAt: now, skipReason: settings.enabled ? "reservation_not_confirmed" : "feature_disabled", lockedAt: null, lockExpiresAt: null } },
    );
    return null;
  }

  const schedule = computeSmsSchedule({ reservation, restaurant, delayMinutes: settings.delayMinutes, now });
  if (!schedule.reservationStartsAt) return null;
  const occurrenceKey = buildOccurrenceKey(schedule.reservationStartsAt);
  await smsJobModel.updateMany(
    { reservationId: reservation._id, occurrenceKey: { $ne: occurrenceKey }, status: { $in: ["scheduled", "processing"] }, providerSubmissionStartedAt: null },
    { $set: { status: "cancelled", cancelledAt: now, skipReason: "reservation_rescheduled", lockedAt: null, lockExpiresAt: null } },
  );

  const reference = `gusto-sms-${reservation._id}-${crypto.createHash("sha256").update(occurrenceKey).digest("hex").slice(0, 12)}`;
  const skipReason = schedule.skipReason || (settings.deliveryMode === "eco" && hasUsableEmail(reservation.customerEmail) ? "eco_email" : "");
  const desiredStatus = skipReason ? "skipped" : "scheduled";
  const existing = await smsJobModel.findOne({ reservationId: reservation._id, type: "reservation_reminder", occurrenceKey });
  if (existing && FINAL_JOB_STATUSES.includes(existing.status)) return existing;
  if (existing?.status === "skipped" && !force) return existing;
  const skippedAt = desiredStatus === "skipped"
    ? existing?.status === "skipped"
      ? existing.skippedAt || null
      : now
    : null;

  return smsJobModel.findOneAndUpdate(
    { reservationId: reservation._id, type: "reservation_reminder", occurrenceKey, status: { $in: mutableStatuses } },
    {
      $set: {
        restaurantId: restaurant._id,
        reservationStartsAt: schedule.reservationStartsAt,
        reservationDateSnapshot: reservation.reservationDate,
        reservationTimeSnapshot: reservation.reservationTime,
        scheduledAt: schedule.scheduledAt || now,
        status: desiredStatus,
        cancelledAt: null,
        skippedAt,
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
    { $set: { status: "skipped", skippedAt: now, skipReason: "too_late" } },
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
      { $set: { status: "cancelled", cancelledAt: new Date(), skipReason: !reservation || reservation.status !== "Confirmed" ? "reservation_not_confirmed" : "feature_disabled" } },
    );
  }
}

async function finalizeDueSmsDeactivations(
  now = new Date(),
  {
    restaurantModel = RestaurantModel,
    smsJobModel = SmsJobModel,
    findSubscription = findRestaurantSubscription,
  } = {},
) {
  const restaurants = await restaurantModel.find({
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
      const context = await findSubscription({
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
      const updateResult = await restaurantModel.updateOne(
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

      await smsJobModel.updateMany(
        {
          restaurantId: restaurant._id,
          status: { $in: ["scheduled", "processing"] },
          providerSubmissionStartedAt: null,
        },
        {
          $set: {
            status: "cancelled",
            cancelledAt: now,
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

async function reserveUsage({
  restaurant,
  billingContext,
  credits,
  usagePeriodModel = SmsUsagePeriodModel,
}) {
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
    await usagePeriodModel.updateOne(
      identity,
      { $setOnInsert: { ...identity, includedCredits: INCLUDED_CREDITS } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  const periodBeforeReservation = await usagePeriodModel.findOneAndUpdate(
    { ...identity, $expr: { $lte: [{ $add: ["$reservedCredits", "$consumedCredits", credits] }, maxCommitted] } },
    { $inc: { reservedCredits: credits } },
    { new: false },
  );
  if (!periodBeforeReservation) return null;
  const committedBefore = periodBeforeReservation.reservedCredits + periodBeforeReservation.consumedCredits;
  const includedApplied = Math.min(credits, Math.max(0, INCLUDED_CREDITS - committedBefore));
  return { period: periodBeforeReservation, includedApplied, overage: credits - includedApplied };
}

async function releaseUsage(job, usagePeriodModel = SmsUsagePeriodModel) {
  if (job.usageState !== "reserved" || !job.usagePeriodId) return;
  await usagePeriodModel.updateOne({ _id: job.usagePeriodId, reservedCredits: { $gte: job.billingCredits } }, { $inc: { reservedCredits: -job.billingCredits } });
  job.usageState = "released";
}

async function consumeUsage(job, usagePeriodModel = SmsUsagePeriodModel) {
  if (job.usageState !== "reserved" || !job.usagePeriodId) return;
  const result = await usagePeriodModel.updateOne(
    { _id: job.usagePeriodId, reservedCredits: { $gte: job.billingCredits } },
    { $inc: { reservedCredits: -job.billingCredits, consumedCredits: job.billingCredits, includedCreditsConsumed: job.includedCreditsApplied, overageCredits: job.overageCredits, overageAmount: job.overageAmountSnapshot } },
  );
  if (!result.modifiedCount) throw new Error("Impossible de finaliser les crédits SMS");
  job.usageState = "consumed";
  job.stripeUsageState = "pending";
}

async function reportStripeUsage(job, billingContext, stripeClient) {
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
  const stripe = stripeClient || new Stripe(process.env.STRIPE_API_SECRET_KEY);
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
  const renderedMessage =
    prefix + renderSmsTemplate(settings.template, values);
  const message = normalizeToGsm7(renderedMessage).value;
  const analysis = analyzeSingleSms(message);
  return { message: analysis.message, analysis };
}

async function skipJob(job, reason, usagePeriodModel = SmsUsagePeriodModel) {
  await releaseUsage(job, usagePeriodModel);
  job.status = "skipped";
  job.skippedAt = job.skippedAt || new Date();
  job.skipReason = reason;
  job.lockedAt = null;
  job.lockExpiresAt = null;
  await job.save();
}

async function processClaimedJob(
  job,
  {
    reservationModel = ReservationModel,
    restaurantModel = RestaurantModel,
    destinationPolicyModel = SmsDestinationPolicyModel,
    usagePeriodModel = SmsUsagePeriodModel,
    getBillingContext = subscriptionAllowsSms,
    provider = new SmsModeProvider(),
    sendingEnabled = sendingIsEnabled,
    reportUsage = reportStripeUsage,
  } = {},
) {
  const [reservation, restaurant] = await Promise.all([
    reservationModel.findById(job.reservationId),
    restaurantModel.findById(job.restaurantId),
  ]);
  if (!reservation || !restaurant) return skipJob(job, !reservation ? "reservation_not_found" : "restaurant_not_found", usagePeriodModel);
  const settings = restaurant.reservationsSettings?.smsReminder || {};
  if (!settings.enabled || !restaurant.options?.sms_reminders) return skipJob(job, "feature_disabled", usagePeriodModel);
  if (reservation.status !== "Confirmed") return skipJob(job, "reservation_not_confirmed", usagePeriodModel);
  const schedule = computeSmsSchedule({ reservation, restaurant, delayMinutes: settings.delayMinutes });
  if (!schedule.reservationStartsAt || schedule.skipReason) return skipJob(job, schedule.skipReason || "too_late", usagePeriodModel);
  if (buildOccurrenceKey(schedule.reservationStartsAt) !== job.occurrenceKey) return skipJob(job, "reservation_rescheduled", usagePeriodModel);
  if (settings.deliveryMode === "eco" && hasUsableEmail(reservation.customerEmail)) return skipJob(job, "eco_email", usagePeriodModel);
  const phone = normalizeSmsPhone(reservation.customerPhone, "FR");
  if (!phone) return skipJob(job, "no_phone", usagePeriodModel);
  if (phone.country !== "FR" && !settings.internationalEnabled) return skipJob(job, "international_disabled", usagePeriodModel);
  const policy = await destinationPolicyModel.findOne({ country: phone.country, enabled: true });
  if (!smsDestinationPolicyIsUsable(policy)) return skipJob(job, "unsupported_destination", usagePeriodModel);

  const approvedSender = settings.sender?.status === "approved" ? String(settings.sender.value || "").trim() : "";
  if (
    smsDestinationPolicyRequiresApprovedSender(policy) &&
    !approvedSender
  ) {
    return skipJob(job, "sender_not_approved", usagePeriodModel);
  }
  const billingContext = await getBillingContext(restaurant);
  if (!billingContext) return skipJob(job, "subscription_inactive", usagePeriodModel);
  const supportsRestaurantSender = ["alpha", "registered_alpha"].includes(policy.senderMode) && approvedSender;
  const sender = supportsRestaurantSender ? approvedSender : policy.fallbackSender || "";
  const { message, analysis } = buildFinalMessage({ reservation, restaurant, settings, prefixRequired: !supportsRestaurantSender });
  if (!analysis.valid) return skipJob(job, "invalid_message", usagePeriodModel);

  const billingCredits = analysis.segmentCount * policy.billingCredits;

  const usageReservation = await reserveUsage({ restaurant, billingContext, credits: billingCredits, usagePeriodModel });
  if (!usageReservation) return skipJob(job, "budget_limit", usagePeriodModel);
  job.phone = phone.e164;
  job.destinationCountry = phone.country;
  job.senderId = sender;
  job.senderMode = policy.senderMode;
  job.message = message;
  job.segmentCount = analysis.segmentCount;
  job.billingCredits = billingCredits;
  job.providerCostSnapshot = analysis.segmentCount * policy.providerRateHt;
  job.usagePeriodId = usageReservation.period._id;
  job.usageState = "reserved";
  job.includedCreditsApplied = usageReservation.includedApplied;
  job.overageCredits = usageReservation.overage;
  job.overageUnitPriceSnapshot = OVERAGE_UNIT_PRICE;
  job.overageAmountSnapshot = usageReservation.overage * OVERAGE_UNIT_PRICE;
  await job.save();

  if (!sendingEnabled()) return skipJob(job, "sending_disabled", usagePeriodModel);
  job.providerSubmissionStartedAt = new Date();
  await job.save();
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
    const acceptedAt = new Date();
    job.sentAt = acceptedAt;
    job.acceptedAt = acceptedAt;
    job.lockedAt = null;
    job.lockExpiresAt = null;
    await consumeUsage(job, usagePeriodModel);
    await job.save();
    try {
      await reportUsage(job, billingContext);
    } catch (_) {
      // L'envoi reste accepted; le reporting est réconciliable via son identifiant déterministe.
    }
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const definitelyRejected = status >= 400 && status < 500 && status !== 429;
    if (definitelyRejected) {
      await releaseUsage(job, usagePeriodModel);
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

async function recoverExpiredJobs(smsJobModel = SmsJobModel) {
  const now = new Date();
  await smsJobModel.updateMany(
    { status: "processing", lockExpiresAt: { $lt: now }, providerSubmissionStartedAt: null },
    { $set: { status: "scheduled", nextAttemptAt: now, lockedAt: null, lockExpiresAt: null } },
  );
  await smsJobModel.updateMany(
    { status: "processing", lockExpiresAt: { $lt: now }, providerSubmissionStartedAt: { $ne: null } },
    { $set: { status: "uncertain", failureReason: "worker_crash_after_submission_started", lockedAt: null, lockExpiresAt: null } },
  );
}

function acceptedProviderStatusIsDue(job, now = new Date()) {
  if (
    job?.status !== "accepted" ||
    job?.provider !== "smsmode" ||
    !job?.providerMessageId
  ) {
    return false;
  }
  const acceptedAt = new Date(job.acceptedAt || 0).getTime();
  if (
    !acceptedAt ||
    acceptedAt < now.getTime() - ACCEPTED_RECONCILIATION_WINDOW_MS
  ) {
    return false;
  }
  const lastCheckedAt = job.providerStatusLastCheckedAt
    ? new Date(job.providerStatusLastCheckedAt).getTime()
    : 0;
  return (
    !lastCheckedAt ||
    lastCheckedAt <= now.getTime() - PROVIDER_RECONCILIATION_INTERVAL_MS
  );
}

async function loadProviderStatusCandidates(now) {
  const acceptedSince = new Date(
    now.getTime() - ACCEPTED_RECONCILIATION_WINDOW_MS,
  );
  const lastCheckedBefore = new Date(
    now.getTime() - PROVIDER_RECONCILIATION_INTERVAL_MS,
  );
  const [uncertainJobs, acceptedJobs] = await Promise.all([
    SmsJobModel.find({ status: "uncertain", provider: "smsmode" })
      .sort({ updatedAt: 1 })
      .limit(20),
    SmsJobModel.find({
      status: "accepted",
      provider: "smsmode",
      providerMessageId: { $ne: "" },
      acceptedAt: { $gte: acceptedSince },
      $or: [
        { providerStatusLastCheckedAt: null },
        { providerStatusLastCheckedAt: { $lte: lastCheckedBefore } },
      ],
    })
      .sort({ providerStatusLastCheckedAt: 1, acceptedAt: 1 })
      .limit(20),
  ]);
  return [...uncertainJobs, ...acceptedJobs];
}

async function reconcileProviderStatuses({
  now = new Date(),
  provider = new SmsModeProvider(),
  jobs,
} = {}) {
  const candidates = jobs || (await loadProviderStatusCandidates(now));
  for (const job of candidates) {
    const isUncertain =
      job?.status === "uncertain" && job?.provider === "smsmode";
    const isAcceptedDue = acceptedProviderStatusIsDue(job, now);
    if (!isUncertain && !isAcceptedDue) continue;

    if (isAcceptedDue) {
      job.providerStatusLastCheckedAt = now;
      try {
        await job.save();
      } catch (_) {
        continue;
      }
    }

    try {
      const remote = await provider.reconcile({ providerMessageId: job.providerMessageId, reference: job.providerReference });
      if (!remote) continue;
      await applyProviderStatus(job, remote);
    } catch (_) {
      // Statut conservé : aucun renvoi automatique.
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
  await reconcileProviderStatuses();
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
    if (value === "DELIVERED") {
      job.deliveredAt =
        job.deliveredAt ||
        new Date(providerPayload?.status?.deliveryDate || Date.now());
    }
    await job.save();
    if (job.stripeUsageState !== "reported") {
      const billing = await getSmsBillingContext(job.restaurantId);
      if (!billing) return job;
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
    if (job.stripeUsageState !== "reported") {
      const billing = await getSmsBillingContext(job.restaurantId);
      if (!billing) return job;
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
  ACCEPTED_RECONCILIATION_WINDOW_MS,
  PROVIDER_RECONCILIATION_INTERVAL_MS,
  acceptedProviderStatusIsDue,
  buildFinalMessage,
  consumeUsage,
  finalizeDueSmsDeactivations,
  getSmsBillingContext,
  hasUsableEmail,
  processClaimedJob,
  reconcileProviderStatuses,
  recoverExpiredJobs,
  releaseUsage,
  reportStripeUsage,
  reserveUsage,
  sendingIsEnabled,
  applyProviderStatus,
  runSmsReminderWorker,
  syncAllFutureSmsJobs,
  syncReservationSmsJob,
  smsDestinationPolicyIsUsable,
  smsDestinationPolicyRequiresApprovedSender,
  validateSmsReactivationPrerequisites,
};
