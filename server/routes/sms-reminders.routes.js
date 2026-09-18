const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authentificate-token");
const RestaurantModel = require("../models/restaurant.model");
const DocumentModel = require("../models/document.model");
const EmployeeModel = require("../models/employee.model");
const SmsUsagePeriodModel = require("../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../models/sms-destination-policy.model");
const {
  DEFAULT_SMS_TEMPLATE,
  normalizeDefaultSmsTemplate,
  validateSmsTemplate,
} = require("../services/sms/sms-message.service");
const {
  revalidateSmsSenderForReactivation,
  smsDestinationPolicyIsUsable,
  syncAllFutureSmsJobs,
} = require("../services/sms/sms-reminder.service");
const { findRestaurantSubscription } = require("../services/stripe-billing.service");
const {
  SMS_ADDON_CODE,
  buildCatalogSelectionMetadata,
  buildSubscriptionItemUpdatePayload,
  buildSubscriptionSummary,
} = require("../services/stripe-subscription-catalog.service");
const {
  buildStripeCommercialSnapshot,
} = require("../services/contract-commercial.service");
const {
  finalizeSelfServiceAmendment,
} = require("../services/contract-self-service.service");
const {
  releaseGustoSmsDeactivationSchedule,
  scheduleSmsDeactivation,
} = require("./admin/subscriptions.routes");
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

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

function serializeAvailableDestinationPolicies(policies = []) {
  return policies
    .filter(smsDestinationPolicyIsUsable)
    .map(serializeDestinationPolicy);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeCommercialState(restaurant, summary = null) {
  const deactivation =
    restaurant.reservationsSettings?.smsReminder?.commercialDeactivation || {};
  const fixedPriceId = normalizeString(process.env.STRIPE_SMS_FIXED_PRICE_ID);
  const smsAddon = (summary?.addons || []).find(
    (item) => item.code === SMS_ADDON_CODE || item.priceId === fixedPriceId,
  );
  return {
    selfServiceEligible: Boolean(
      restaurant.reservationsSettings?.smsReminder?.selfServiceEligible,
    ),
    canSelfManage: Boolean(
      restaurant.reservationsSettings?.smsReminder?.selfServiceEligible,
    ),
    active: Boolean(restaurant.options?.sms_reminders),
    status: deactivation.status || "none",
    effectiveAt: deactivation.effectiveAt || null,
    fixedMonthlyAmount: smsAddon ? Number(smsAddon.amount || 0) : 9.9,
    currency: smsAddon?.currency || summary?.currency || "EUR",
    includedCredits: 100,
    overageUnitAmount: 0.1,
    periodEnd:
      Number(summary?.subscription?.current_period_end || 0) > 0
        ? new Date(summary.subscription.current_period_end * 1000)
        : null,
  };
}

router.get("/restaurants/:id/sms-reminders", authenticateToken, async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    if (!(await canManageSms(req.user, restaurant))) return res.status(403).json({ message: "Forbidden" });
    const [usage, destinations, billingContext] = await Promise.all([
      SmsUsagePeriodModel.findOne({ restaurantId: restaurant._id, periodEnd: { $gt: new Date() } }).sort({ periodEnd: 1 }).lean(),
      SmsDestinationPolicyModel.find({ enabled: true }).sort({ country: 1 }).lean(),
      findRestaurantSubscription({ restaurantId: restaurant._id }).catch(() => null),
    ]);
    const summary = billingContext?.subscription
      ? await buildSubscriptionSummary(billingContext.subscription).catch(() => null)
      : null;
    const fixedPrice = process.env.STRIPE_SMS_FIXED_PRICE_ID
      ? await stripe.prices
          .retrieve(process.env.STRIPE_SMS_FIXED_PRICE_ID)
          .catch(() => null)
      : null;
    const commercialState = serializeCommercialState(restaurant, summary);
    if (!summary?.addons?.some((item) => item.code === SMS_ADDON_CODE) && fixedPrice) {
      commercialState.fixedMonthlyAmount = Number(fixedPrice.unit_amount || 0) / 100;
      commercialState.currency = String(fixedPrice.currency || "EUR").toUpperCase();
    }
    return res.json({
      subscribed: Boolean(restaurant.options?.sms_reminders),
      settings: serializeSettings(restaurant.reservationsSettings?.smsReminder),
      usage: usage || { includedCredits: 100, reservedCredits: 0, consumedCredits: 0, includedCreditsConsumed: 0, overageCredits: 0, overageAmount: 0 },
      destinations: serializeAvailableDestinationPolicies(destinations),
      commercial: {
        ...commercialState,
        canSelfManage:
          req.user?.role === "owner" &&
          Boolean(restaurant.reservationsSettings?.smsReminder?.selfServiceEligible),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "Internal server error" });
  }
});

router.post(
  "/restaurants/:id/sms-subscription/actions",
  authenticateToken,
  async (req, res) => {
    const action = normalizeString(req.body?.action);
    const idempotencyKey = normalizeString(
      req.get("Idempotency-Key") || req.body?.idempotencyKey,
    );
    const allowedActions = new Set([
      "schedule_deactivation",
      "cancel_deactivation",
      "reactivate",
    ]);
    if (!allowedActions.has(action) || idempotencyKey.length < 12) {
      return res.status(400).json({ message: "Action ou clé d’idempotence invalide." });
    }

    try {
      let restaurant = await RestaurantModel.findById(req.params.id);
      if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
      if (
        req.user?.role !== "owner" ||
        String(restaurant.owner_id) !== String(req.user.id)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!restaurant.reservationsSettings?.smsReminder?.selfServiceEligible) {
        return res.status(403).json({
          message: "Le module Rappels SMS doit d’abord être configuré par le service client.",
        });
      }

      let operation = restaurant.reservationsSettings.smsReminder.selfServiceOperation;
      if (
        operation?.idempotencyKey === idempotencyKey &&
        operation?.status === "completed"
      ) {
        return res.json({
          idempotent: true,
          commercial: serializeCommercialState(restaurant),
          documentId: operation.documentId || null,
        });
      }
      if (
        operation?.idempotencyKey === idempotencyKey &&
        operation?.status === "document_failed"
      ) {
        const pendingDocument = await DocumentModel.findOne({
          "selfServiceAcceptance.idempotencyKey": idempotencyKey,
        });
        if (pendingDocument) {
          const finalized = await finalizeSelfServiceAmendment({
            restaurantId: restaurant._id,
            stripeSnapshot: pendingDocument.commercialSnapshot,
            acceptance: pendingDocument.selfServiceAcceptance.toObject(),
          });
          operation.status = "completed";
          operation.documentId = finalized._id;
          operation.updatedAt = new Date();
          operation.error = "";
          await restaurant.save();
          return res.json({
            idempotent: true,
            commercial: serializeCommercialState(restaurant),
            documentId: finalized._id,
          });
        }
      }
      const lockedRestaurant = await RestaurantModel.findOneAndUpdate(
        {
          _id: restaurant._id,
          $or: [
            {
              "reservationsSettings.smsReminder.selfServiceOperation.status": {
                $ne: "processing",
              },
            },
            {
              "reservationsSettings.smsReminder.selfServiceOperation.updatedAt": {
                $lt: new Date(Date.now() - 5 * 60 * 1000),
              },
            },
          ],
        },
        {
          $set: {
            "reservationsSettings.smsReminder.selfServiceOperation.idempotencyKey":
              idempotencyKey,
            "reservationsSettings.smsReminder.selfServiceOperation.action": action,
            "reservationsSettings.smsReminder.selfServiceOperation.status":
              "processing",
            "reservationsSettings.smsReminder.selfServiceOperation.documentId":
              null,
            "reservationsSettings.smsReminder.selfServiceOperation.updatedAt":
              new Date(),
            "reservationsSettings.smsReminder.selfServiceOperation.error": "",
          },
        },
        { new: true },
      );
      if (!lockedRestaurant) {
        return res.status(409).json({ message: "Une modification est déjà en cours." });
      }
      restaurant = lockedRestaurant;
      operation = restaurant.reservationsSettings.smsReminder.selfServiceOperation;

      if (action === "reactivate") {
        const policies = await SmsDestinationPolicyModel.find({
          enabled: true,
        }).lean();
        const senderRevalidation = await revalidateSmsSenderForReactivation({
          settings: restaurant.reservationsSettings.smsReminder,
          policies,
        });
        if (senderRevalidation.senderStatusChanged) {
          await restaurant.save();
        }
        if (senderRevalidation.error) {
          const error = new Error(senderRevalidation.error.message);
          error.statusCode =
            senderRevalidation.error.code ===
            "SMS_SENDER_VERIFICATION_UNAVAILABLE"
              ? 503
              : 409;
          error.code = senderRevalidation.error.code;
          throw error;
        }
      }

      const context = await findRestaurantSubscription({ restaurantId: restaurant._id });
      if (!context?.subscription?.id) {
        const error = new Error("Abonnement Stripe introuvable.");
        error.statusCode = 409;
        throw error;
      }
      let subscription = await stripe.subscriptions.retrieve(
        context.subscription.id,
        { expand: ["items.data.price", "latest_invoice"] },
      );
      const beforeSummary = await buildSubscriptionSummary(subscription);
      const beforeSnapshot = buildStripeCommercialSnapshot(beforeSummary, subscription);
      const deactivation = restaurant.reservationsSettings.smsReminder.commercialDeactivation;
      let effectiveAt = new Date();
      let actionType = "SMS_REACTIVATED";
      let afterSummary;
      let afterSnapshot;
      let acceptedFixedAmount = Number(
        (beforeSummary.addons || []).find(
          (item) => item.code === SMS_ADDON_CODE,
        )?.amount || 0,
      );

      if (action === "schedule_deactivation") {
        if (!restaurant.options?.sms_reminders) {
          const error = new Error("Le module Rappels SMS n’est pas actif.");
          error.statusCode = 409;
          throw error;
        }
        let scheduled;
        if (deactivation.status === "scheduled" && deactivation.stripeScheduleId) {
          scheduled = {
            scheduleId: deactivation.stripeScheduleId,
            effectiveAt: Math.floor(new Date(deactivation.effectiveAt).getTime() / 1000),
          };
        } else {
          const targetSelection = {
            plan: beforeSummary.plan,
            addons: (beforeSummary.addons || []).filter(
              (item) => item.code !== SMS_ADDON_CODE,
            ),
          };
          scheduled = await scheduleSmsDeactivation({
            subscription,
            restaurantId: String(restaurant._id),
            targetSelection,
            idempotencyKey: `sms-self-service-schedule-${idempotencyKey}`,
          });
        }
        effectiveAt = new Date(scheduled.effectiveAt * 1000);
        Object.assign(deactivation, {
          status: "scheduled",
          stripeScheduleId: scheduled.scheduleId,
          effectiveAt,
          requestedAt: new Date(),
        });
        actionType = "SMS_DEACTIVATION_SCHEDULED";
        afterSnapshot = {
          ...beforeSnapshot,
          capturedAt: new Date(),
          items: (beforeSnapshot.items || []).filter(
            (item) => item.code !== SMS_ADDON_CODE && item.priceId !== process.env.STRIPE_SMS_FIXED_PRICE_ID,
          ),
        };
      } else if (action === "cancel_deactivation") {
        if (deactivation.status !== "scheduled") {
          const error = new Error("Aucune résiliation SMS n’est programmée.");
          error.statusCode = 409;
          throw error;
        }
        await releaseGustoSmsDeactivationSchedule({ subscription, restaurant });
        Object.assign(deactivation, {
          status: "cancelled",
          stripeScheduleId: "",
          effectiveAt: null,
        });
        actionType = "SMS_DEACTIVATION_CANCELLED";
        afterSnapshot = buildStripeCommercialSnapshot(beforeSummary, subscription);
      } else {
        const fixedPriceId = normalizeString(process.env.STRIPE_SMS_FIXED_PRICE_ID);
        if (!fixedPriceId || !process.env.STRIPE_SMS_METERED_PRICE_ID) {
          const error = new Error("La tarification Stripe SMS n’est pas configurée.");
          error.statusCode = 500;
          throw error;
        }
        const fixedPrice = await stripe.prices.retrieve(fixedPriceId);
        acceptedFixedAmount = Number(fixedPrice?.unit_amount || 0) / 100;
        const selection = {
          plan: beforeSummary.plan,
          addons: [
            ...(beforeSummary.addons || []).filter((item) => item.code !== SMS_ADDON_CODE),
            { code: SMS_ADDON_CODE, priceId: fixedPriceId, quantity: 1 },
          ],
        };
        const items = buildSubscriptionItemUpdatePayload({
          currentSummary: beforeSummary,
          selection,
        });
        subscription = await stripe.subscriptions.update(
          subscription.id,
          {
            items,
            proration_behavior: "create_prorations",
            metadata: {
              ...(subscription.metadata || {}),
              ...buildCatalogSelectionMetadata(selection),
            },
            expand: ["items.data.price", "latest_invoice"],
          },
          { idempotencyKey: `sms-self-service-${idempotencyKey}` },
        );
        afterSummary = await buildSubscriptionSummary(subscription);
        afterSnapshot = buildStripeCommercialSnapshot(afterSummary, subscription);
        restaurant.options.sms_reminders = true;
        restaurant.reservationsSettings.smsReminder.enabled = true;
        Object.assign(deactivation, {
          status: "cancelled",
          stripeScheduleId: "",
          effectiveAt: null,
        });
      }

      operation.status = "stripe_applied";
      operation.updatedAt = new Date();
      await restaurant.save();

      const actorName = [req.user?.firstname, req.user?.lastname]
        .filter(Boolean)
        .join(" ") || req.user?.email || "";
      let document;
      try {
        document = await finalizeSelfServiceAmendment({
          restaurantId: restaurant._id,
          stripeSnapshot: afterSnapshot,
          acceptance: {
            mode: "SELF_SERVICE",
            actionType,
            acceptedAt: new Date(),
            effectiveAt,
            acceptedByUserId: String(req.user.id),
            acceptedByName: actorName,
            acceptedByEmail: req.user?.email || restaurant.email || "",
            restaurantId: restaurant._id,
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
            idempotencyKey,
            previousCommercialSnapshot: beforeSnapshot,
            newCommercialSnapshot: afterSnapshot,
            acceptedTerms: {
              fixedMonthlyAmount: acceptedFixedAmount,
              includedCredits: 100,
              overageUnitAmount: 0.1,
              prorationBehavior:
                action === "reactivate" ? "create_prorations" : "none",
            },
          },
        });
        operation.status = "completed";
        operation.documentId = document._id;
      } catch (documentError) {
        operation.status = "document_failed";
        operation.error = String(documentError?.message || documentError).slice(0, 500);
        console.error("Erreur avenant self-service SMS:", documentError);
      }
      operation.updatedAt = new Date();
      await restaurant.save();

      return res.status(operation.status === "completed" ? 200 : 202).json({
        commercial: serializeCommercialState(restaurant, afterSummary || beforeSummary),
        documentId: document?._id || null,
        documentPending: operation.status !== "completed",
      });
    } catch (error) {
      await RestaurantModel.updateOne(
        { _id: req.params.id, "reservationsSettings.smsReminder.selfServiceOperation.idempotencyKey": idempotencyKey },
        {
          $set: {
            "reservationsSettings.smsReminder.selfServiceOperation.status": "",
            "reservationsSettings.smsReminder.selfServiceOperation.error": String(error?.message || error).slice(0, 500),
            "reservationsSettings.smsReminder.selfServiceOperation.updatedAt": new Date(),
          },
        },
      ).catch(() => {});
      return res.status(Number(error?.statusCode || 500)).json({
        message: error?.message || "Impossible de modifier l’abonnement SMS.",
        ...(error?.code ? { code: error.code } : {}),
      });
    }
  },
);

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
module.exports.serializeAvailableDestinationPolicies =
  serializeAvailableDestinationPolicies;
module.exports.applyRestaurantSmsSettings = applyRestaurantSmsSettings;
module.exports.serializeSettings = serializeSettings;
