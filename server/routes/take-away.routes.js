const express = require("express");
const router = express.Router();
const { DateTime } = require("luxon");

const authenticateToken = require("../middleware/authentificate-token");
const {
  userCanAccessRestaurant,
} = require("../middleware/authorize-restaurant-access");
const { verifyServiceSignature } = require("../middleware/service-signature");
const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
const SmsUsagePeriodModel = require("../models/sms-usage-period.model");
const SmsDestinationPolicyModel = require("../models/sms-destination-policy.model");
const { smsDestinationPolicyIsUsable } = require("../services/sms/sms-reminder.service");
const {
  smsModuleStates, serializeCommercialState, assertSmsActivationUnchanged, smsSettingsWriteFilter,
} = require("../services/sms/sms-module-state.service");
const { TAKE_AWAY_SMS_EVENTS, takeAwaySmsVariables, serializeTakeAwaySmsSettings } = require("../services/sms/take-away-sms-settings.service");
const {
  mergeTakeAwaySettingsInput,
  normalizeCatalogItemInput,
  listImportableSourceItems,
  upsertCatalogItemFromSource,
  createCustomCatalogItem,
  getAvailableSlots,
  createTakeAwayOrder,
  createOrderPaymentIntent,
  confirmOrderPayment,
  findPublicOrderByAccessToken,
  findPublicOrderByAttempt,
  updateOrderStatus,
  loadRestaurantForTakeAway,
  validateTakeAwayStripeEventEnvelope,
  normalizeTakeAwayDateKey,
  getBlockedTakeAwayDates,
} = require("../services/take-away.service");
const { broadcastToRestaurant } = require("../services/sse-bus.service");
const { processTakeAwayStripeEvent } = require("../services/take-away-stripe-events.service");
const {
  rejectItems,
  lineId,
  remainingQuantity,
} = require("../services/take-away-adjustments.service");

async function loadAuthorizedRestaurant(req, res) {
  const restaurant = await loadRestaurantForTakeAway(req.params.restaurantId);
  if (!restaurant) {
    res.status(404).json({ message: "Restaurant not found" });
    return null;
  }
  if (restaurant.options?.take_away !== true) {
    res.status(403).json({ message: "Take-away module unavailable" });
    return null;
  }
  if (
    !(await userCanAccessRestaurant(req.user, restaurant, {
      requiredOption: "take_away",
    }))
  ) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return restaurant;
}

async function canManageSharedSmsSettings(user, restaurant) {
  if (user?.role === "owner")
    return (
      String(restaurant.owner_id?._id || restaurant.owner_id || "") ===
      String(user.id || "")
    );
  if (
    user?.role !== "employee" ||
    String(user.restaurantId) !== String(restaurant._id)
  )
    return false;
  const employee = await EmployeeModel.findById(user.id).select(
    "restaurantProfiles",
  );
  const profile = employee?.restaurantProfiles?.find(
    (item) => String(item.restaurant) === String(restaurant._id),
  );
  return Boolean(profile?.options?.reservations);
}

function serializePublicCatalog(restaurant) {
  return (restaurant.takeAwayCatalog || [])
    .filter(
      (item) =>
        item.active !== false &&
        item.visible !== false &&
        item.sourceDeleted !== true,
    )
    .sort((a, b) => {
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .map((item) => ({
      _id: String(item._id),
      name: item.name,
      description: item.description || "",
      categoryName: item.categoryName || "À emporter",
      price: item.price || 0,
      image: item.image || "",
      sourceType: item.sourceType || "custom",
      options: (item.options || []).map((option) => ({
        _id: String(option._id),
        name: option.name,
        price: option.price || 0,
      })),
    }));
}

async function loadPublicRestaurant(restaurantId) {
  return RestaurantModel.findById(restaurantId).populate("menus");
}

function handleError(res, error) {
  const status = error?.status || error?.statusCode || 500;
  if (status >= 500) {
    console.error("Take-away route error:", error);
  }
  return res.status(status).json({
    message: error?.message || "Internal server error",
  });
}

function handlePublicError(res, error) {
  const status =
    Number(error?.status) >= 400 && Number(error?.status) < 500
      ? Number(error.status)
      : 500;
  if (status >= 500) {
    console.error("Public take-away route error:", error);
  }
  return res.status(status).json({
    message:
      status >= 500
        ? "Le service est momentanément indisponible. Veuillez réessayer."
        : error?.message || "La demande n'a pas pu être traitée.",
  });
}

function getPublicOrderToken(req) {
  return String(req.get("X-Take-Away-Token") || "").trim();
}

function serializePublicOrder(input) {
  const order = input?.toObject ? input.toObject() : input || {};
  return {
    _id: String(order._id || ""),
    orderNumber: order.orderNumber || "",
    fulfillmentMode: order.fulfillmentMode,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    scheduledFor: order.scheduledFor,
    confirmationDeadlineAt: order.confirmationDeadlineAt,
    slotId: order.slotId,
    items: (order.items || []).map((item, index) => ({
      lineId: lineId(order, item, index),
      refusedQuantity: Number(item.refusedQuantity || 0),
      retainedQuantity: remainingQuantity(item),
      catalogItemId: String(item.catalogItemId || ""),
      name: item.name,
      description: item.description || "",
      categoryName: item.categoryName || "",
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      options: (item.options || []).map((option) => ({
        name: option.name,
        price: option.price,
      })),
      optionsTotal: item.optionsTotal,
      lineTotal: item.lineTotal,
      note: item.note || "",
    })),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    remainingAmountCents:
      order.remainingAmountCents ?? Math.round(order.total * 100),
    refundedAmountCents: order.refundedAmountCents || 0,
    stripeRefundStatus: order.stripeRefundStatus || "",
    adjustments: (order.adjustments || []).map((operation) => ({
      id: operation.id,
      type: operation.type,
      reason: operation.reason,
      lines: operation.lines,
      amountCents: operation.amountCents,
      state: operation.state,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    })),
    currency: order.currency,
    deliveryAddress:
      order.fulfillmentMode === "delivery" ? order.deliveryAddress : undefined,
    customerNote: order.customerNote || "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

router.post(
  "/take-away/stripe-events",
  verifyServiceSignature,
  async (req, res) => {
    try {
      const restaurantId = String(req.body?.restaurantId || "").trim();
      const event = req.body?.event;
      const validation = validateTakeAwayStripeEventEnvelope({
        restaurantId,
        event,
      });
      if (!validation.supported) {
        return res.status(200).json({ received: true, handled: false });
      }

      const restaurant = await loadRestaurantForTakeAway(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found", code: "TAKE_AWAY_RESTAURANT_NOT_FOUND" });
      }
      // Existing payments still need reconciliation after a module is disabled.
      const result = await processTakeAwayStripeEvent({
        event,
        restaurant,
      });
      return res.status(200).json({ received: true, handled: result.handled });
    } catch (error) {
      console.error("[take-away-stripe-event-error]", {
        eventId: req.body?.event?.id,
        eventType: req.body?.event?.type,
        restaurantId: req.body?.restaurantId,
        status: error.status || 500,
        code: error.code || "STRIPE_PROCESSING_FAILED",
        errorType: error.name || "Error",
      });
      return res.status(error.status || 500).json({
        error: "Traitement webhook impossible",
        code: error.code || "STRIPE_PROCESSING_FAILED",
      });
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/public/catalog",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }

      const settings = restaurant.takeAwaySettings || {};
      if (!restaurant.options?.take_away || !settings.enabled) {
        return res.status(403).json({ message: "Take-away unavailable" });
      }

      return res.status(200).json({
        settings: {
          pickupEnabled: settings.pickupEnabled !== false,
          deliveryEnabled: settings.deliveryEnabled === true,
          paymentPolicy: settings.paymentPolicy || "on_site",
          minimumPickupOrder: settings.minimumPickupOrder || 0,
          deliveryZones: (settings.deliveryZones || [])
            .filter((zone) => zone.active !== false)
            .map((zone) => ({
              _id: String(zone._id),
              name: zone.name,
              zipCodes: zone.zipCodes || [],
              fee: zone.fee || 0,
              minimumOrder: zone.minimumOrder || 0,
              estimatedMinutes: zone.estimatedMinutes || 30,
            })),
        },
        catalog: serializePublicCatalog(restaurant),
      });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/public/slots",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }
      const settings = restaurant.takeAwaySettings || {};
      if (!restaurant.options?.take_away || !settings.enabled) {
        return res.status(403).json({ message: "Take-away unavailable" });
      }
      const mode = String(req.query.mode || "pickup");
      if (
        (mode === "pickup" && settings.pickupEnabled === false) ||
        (mode === "delivery" && settings.deliveryEnabled !== true) ||
        !["pickup", "delivery"].includes(mode)
      ) {
        return res
          .status(400)
          .json({ message: "Fulfillment mode unavailable" });
      }
      const dateKey = String(req.query.date || "").trim();
      const slots = await getAvailableSlots({ restaurant, dateKey });
      return res.status(200).json({ slots });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/public/orders",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }
      const order = await createTakeAwayOrder({
        restaurant,
        payload: {
          ...(req.body || {}),
          idempotencyKey:
            req.get("Idempotency-Key") || req.body?.idempotencyKey,
        },
        source: "public",
      });
      return res
        .status(order?.$locals?.idempotentReplay ? 200 : 201)
        .json({ order: serializePublicOrder(order) });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/public/orders/recover",
  async (req, res) => {
    try {
      const order = await findPublicOrderByAttempt({
        restaurantId: req.params.restaurantId,
        idempotencyKey: req.get("Idempotency-Key"),
        token: getPublicOrderToken(req),
      });
      if (!order) {
        return res.status(404).json({ message: "Commande introuvable" });
      }
      return res.status(200).json({ order: serializePublicOrder(order) });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/public/orders/:orderId/payment-intent",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }
      const order = await findPublicOrderByAccessToken({
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        token: getPublicOrderToken(req),
      });
      if (!order) {
        return res.status(404).json({ message: "Commande introuvable" });
      }
      const paymentIntent = await createOrderPaymentIntent({
        restaurant,
        order,
      });
      // Creation/reuse can reconcile a success or race a cancellation. Return
      // the stored state, not the document loaded before the Stripe request.
      const currentOrder = await findPublicOrderByAccessToken({
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        token: getPublicOrderToken(req),
      });
      if (!currentOrder) {
        return res.status(503).json({ message: "Le statut de la commande doit être vérifié. Veuillez réessayer." });
      }
      return res.status(200).json({
        order: serializePublicOrder(currentOrder),
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/public/orders/:orderId/confirm-payment",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }
      const accessibleOrder = await findPublicOrderByAccessToken({
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        token: getPublicOrderToken(req),
      });
      if (!accessibleOrder) {
        return res.status(404).json({ message: "Commande introuvable" });
      }
      const order = await confirmOrderPayment({
        restaurant,
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        paymentIntentId: req.body?.paymentIntentId,
      });
      return res.status(200).json({ order: serializePublicOrder(order) });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/public/orders/:orderId/status",
  async (req, res) => {
    try {
      const order = await findPublicOrderByAccessToken({
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        token: getPublicOrderToken(req),
      });
      if (!order) {
        return res.status(404).json({ message: "Commande introuvable" });
      }
      return res.status(200).json({ order: serializePublicOrder(order) });
    } catch (error) {
      return handlePublicError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/orders",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      const query = {
        restaurant_id: restaurant._id,
        $or: [
          { source: "dashboard" },
          { paymentMethod: { $ne: "online" } },
          { paymentStatus: { $in: ["paid", "refunded"] } },
        ],
      };
      if (req.query.status && req.query.status !== "all") {
        query.status = req.query.status;
      }
      if (req.query.fulfillmentMode && req.query.fulfillmentMode !== "all") {
        query.fulfillmentMode = req.query.fulfillmentMode;
      }
      if (req.query.date) {
        const start = DateTime.fromISO(String(req.query.date), {
          zone: "Europe/Paris",
        }).startOf("day");
        if (!start.isValid)
          return res.status(400).json({ message: "Date invalide" });
        query.scheduledFor = {
          $gte: start.toJSDate(),
          $lt: start.plus({ days: 1 }).toJSDate(),
        };
      } else if (req.query.dateFrom || req.query.dateTo) {
        query.scheduledFor = {};
        if (req.query.dateFrom) {
          const start = DateTime.fromISO(String(req.query.dateFrom), {
            zone: "Europe/Paris",
          }).startOf("day");
          if (!start.isValid)
            return res.status(400).json({ message: "Date invalide" });
          query.scheduledFor.$gte = start.toJSDate();
        }
        if (req.query.dateTo) {
          const end = DateTime.fromISO(String(req.query.dateTo), {
            zone: "Europe/Paris",
          }).startOf("day");
          if (!end.isValid)
            return res.status(400).json({ message: "Date invalide" });
          query.scheduledFor.$lt = end.plus({ days: 1 }).toJSDate();
        }
      }

      const orders = await TakeAwayOrderModel.find(query)
        .sort({ scheduledFor: -1, createdAt: -1 })
        .limit(Math.min(200, Number(req.query.limit || 100)));

      return res.status(200).json({ orders });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/orders",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const order = await createTakeAwayOrder({
        restaurant,
        payload: req.body || {},
        source: "dashboard",
      });
      return res.status(201).json({ order });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/orders/:orderId",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      const order = await TakeAwayOrderModel.findOne({
        _id: req.params.orderId,
        restaurant_id: restaurant._id,
        $or: [
          { source: "dashboard" },
          { paymentMethod: { $ne: "online" } },
          { paymentStatus: { $in: ["paid", "refunded"] } },
        ],
      });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      return res.status(200).json({ order });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.patch(
  "/restaurants/:restaurantId/take-away/orders/:orderId/status",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      const order = await updateOrderStatus({
        restaurant,
        orderId: req.params.orderId,
        status: req.body?.status,
      });
      return res.status(200).json({ order });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/orders/:orderId/rejections",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      const order = await rejectItems({
        restaurant,
        orderId: req.params.orderId,
        requestKey: req.get("Idempotency-Key") || req.body?.requestKey,
        lines: req.body?.lines,
        reason: req.body?.reason || "",
        actorId: req.user?.id || req.user?._id || req.user?.userId || "",
      });
      return res.status(200).json({ order });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.get("/restaurants/:restaurantId/take-away/sms-notifications", authenticateToken, async (req, res) => {
  try {
    const restaurant = await loadAuthorizedRestaurant(req, res);
    if (!restaurant) return;
    const now = new Date();
    const [usage, policies] = await Promise.all([
      SmsUsagePeriodModel.findOne({ restaurantId: restaurant._id, periodStart: { $lte: now }, periodEnd: { $gt: now } }).sort({ periodEnd: 1 }).lean(),
      SmsDestinationPolicyModel.find({ enabled: true }).sort({ country: 1 }).lean(),
    ]);
    const shared = restaurant.reservationsSettings?.smsReminder || {};
    return res.json({
      subscribed: restaurant.options?.sms_reminders === true,
      settings: serializeTakeAwaySmsSettings(restaurant.takeAwaySettings?.smsNotifications),
      modules: smsModuleStates(restaurant),
      commercial: {
        ...serializeCommercialState(restaurant),
        canSelfManage: req.user?.role === "owner" && shared.selfServiceEligible === true,
      },
      canEditSharedSettings: await canManageSharedSmsSettings(
        req.user,
        restaurant,
      ),
      sender: { value: shared.sender?.value || "", status: shared.sender?.status || "pending" },
      internationalEnabled: shared.internationalEnabled === true,
      billingPeriodSpendingLimit: shared.billingPeriodSpendingLimit ?? null,
      usage: usage || { includedCredits: 100, consumedCredits: 0, reservedCredits: 0, includedCreditsConsumed: 0, overageCredits: 0, overageAmount: 0 },
      destinations: policies
        .filter(smsDestinationPolicyIsUsable)
        .map((policy) => ({
          country: policy.country,
          enabled: true,
          billingCredits: policy.billingCredits,
          senderMode: policy.senderMode,
        })),
      events: Object.entries(TAKE_AWAY_SMS_EVENTS).map(([key, event]) => ({ key, ...event, variables: [...takeAwaySmsVariables(key)] })),
    });
  } catch (error) { return handleError(res, error); }
});

router.put(
  "/restaurants/:restaurantId/take-away/settings",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const patch = req.body?.settings || req.body || {};
      if (patch.smsNotifications || patch.smsSharedSettings) {
        assertSmsActivationUnchanged(restaurant, "take_away", patch.smsNotifications);
      }
      const smsFilter = smsSettingsWriteFilter(restaurant);
      if (patch.smsNotifications && !restaurant.options?.sms_reminders) {
        return res.status(403).json({ message: "L’option SMS n’est pas souscrite." });
      }

      const sharedSmsPatch = patch.smsSharedSettings;
      let spendingLimit;
      if (sharedSmsPatch && typeof sharedSmsPatch === "object") {
        if (!(await canManageSharedSmsSettings(req.user, restaurant))) {
          return res.status(403).json({ message: "Forbidden" });
        }
        if (Object.hasOwn(sharedSmsPatch, "billingPeriodSpendingLimit")) {
          const rawLimit = sharedSmsPatch.billingPeriodSpendingLimit;
          spendingLimit =
            rawLimit === null || rawLimit === "" ? null : Number(rawLimit);
          if (
            spendingLimit !== null &&
            (!Number.isFinite(spendingLimit) ||
              spendingLimit < 0 ||
              spendingLimit > 10000)
          ) {
            return res.status(400).json({
              message: "Plafond de dépense invalide.",
            });
          }
        }
      }
      restaurant.takeAwaySettings = mergeTakeAwaySettingsInput(
        restaurant.takeAwaySettings,
        patch,
      );
      if (sharedSmsPatch && typeof sharedSmsPatch === "object") {
        const sharedSms = restaurant.reservationsSettings.smsReminder;
        if (Object.hasOwn(sharedSmsPatch, "internationalEnabled")) {
          sharedSms.internationalEnabled =
            sharedSmsPatch.internationalEnabled === true;
        }
        if (Object.hasOwn(sharedSmsPatch, "billingPeriodSpendingLimit")) {
          sharedSms.billingPeriodSpendingLimit = spendingLimit;
        }
      }
      if (patch.smsNotifications || patch.smsSharedSettings) {
        const written = await RestaurantModel.updateOne(smsFilter, { $set: {
          takeAwaySettings: restaurant.takeAwaySettings.toObject?.() || restaurant.takeAwaySettings,
          "reservationsSettings.smsReminder.internationalEnabled": restaurant.reservationsSettings.smsReminder.internationalEnabled,
          "reservationsSettings.smsReminder.billingPeriodSpendingLimit": restaurant.reservationsSettings.smsReminder.billingPeriodSpendingLimit,
        } }, { runValidators: true });
        if (!written.matchedCount) return res.status(409).json({ message: "Les activations SMS ont changé. Rechargez les paramètres." });
      } else {
        // Ordinary take-away settings must not overwrite an SMS activation
        // that changed concurrently through the shared commercial route.
        const settings = restaurant.takeAwaySettings.toObject?.() || restaurant.takeAwaySettings;
        restaurant.unmarkModified?.("takeAwaySettings");
        for (const key of Object.keys(settings)) {
          if (key !== "smsNotifications") restaurant.markModified?.(`takeAwaySettings.${key}`);
        }
        await restaurant.save();
      }

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(200).json({
        restaurant: updatedRestaurant,
        sharedSmsSettings: {
          internationalEnabled:
            restaurant.reservationsSettings.smsReminder.internationalEnabled ===
            true,
          billingPeriodSpendingLimit:
            restaurant.reservationsSettings.smsReminder
              .billingPeriodSpendingLimit ?? null,
        },
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.put(
  "/restaurants/:restaurantId/take-away/blocked-dates/:date",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const dateKey = normalizeTakeAwayDateKey(req.params.date);
      if (!dateKey) {
        return res.status(400).json({ message: "Date invalide" });
      }

      const blocked = req.body?.blocked === true;
      const blockedDates = new Set(
        getBlockedTakeAwayDates(restaurant.takeAwaySettings || {}),
      );
      if (blocked) blockedDates.add(dateKey);
      else blockedDates.delete(dateKey);

      restaurant.takeAwaySettings = mergeTakeAwaySettingsInput(
        restaurant.takeAwaySettings,
        { blockedDates: Array.from(blockedDates) },
      );
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      broadcastToRestaurant(String(restaurant._id), {
        type: "takeaway_availability_updated",
        module: "take_away",
        restaurantId: String(restaurant._id),
        date: dateKey,
        blocked,
        blockedDates: getBlockedTakeAwayDates(
          updatedRestaurant?.takeAwaySettings || {},
        ),
      });
      return res.status(200).json({
        restaurant: updatedRestaurant,
        date: dateKey,
        blocked,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/take-away/catalog/importable",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      return res.status(200).json({
        items: listImportableSourceItems(restaurant),
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/catalog/import",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const imported = upsertCatalogItemFromSource({
        restaurant,
        sourceType: req.body?.sourceType,
        sourceItemId: req.body?.sourceItemId,
        sourceCategoryId: req.body?.sourceCategoryId,
        sourceSubCategoryId: req.body?.sourceSubCategoryId,
        overrides: req.body?.overrides || {},
      });
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(201).json({
        item: imported,
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/catalog",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const item = createCustomCatalogItem(restaurant, req.body || {});
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(201).json({ item, restaurant: updatedRestaurant });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.patch(
  "/restaurants/:restaurantId/take-away/catalog/:itemId",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const item = restaurant.takeAwayCatalog.id(req.params.itemId);
      if (!item) {
        return res.status(404).json({ message: "Catalog item not found" });
      }

      Object.assign(
        item,
        normalizeCatalogItemInput({ ...item.toObject(), ...req.body }),
      );
      if (item.sourceDeleted === true && req.body?.active === true) {
        item.sourceType = "custom";
        item.sourceCategoryId = null;
        item.sourceSubCategoryId = null;
        item.sourceItemId = null;
        item.sourceDeleted = false;
        item.syncedWithSource = false;
      }
      item.updatedAt = new Date();
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(200).json({ item, restaurant: updatedRestaurant });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.delete(
  "/restaurants/:restaurantId/take-away/catalog/:itemId",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      const item = restaurant.takeAwayCatalog.id(req.params.itemId);
      if (!item) {
        return res.status(404).json({ message: "Catalog item not found" });
      }
      restaurant.takeAwayCatalog.pull({ _id: req.params.itemId });
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

module.exports = router;
