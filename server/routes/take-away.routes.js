const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");
const {
  userCanAccessRestaurant,
} = require("../middleware/authorize-restaurant-access");
const RestaurantModel = require("../models/restaurant.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
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
  constructTakeAwayWebhookEvent,
  handleTakeAwayStripeWebhookEvent,
  normalizeTakeAwayDateKey,
  getBlockedTakeAwayDates,
} = require("../services/take-away.service");
const { broadcastToRestaurant } = require("../services/sse-bus.service");

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
  const status = error?.status || 500;
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
    slotId: order.slotId,
    items: (order.items || []).map((item) => ({
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
    currency: order.currency,
    deliveryAddress:
      order.fulfillmentMode === "delivery" ? order.deliveryAddress : undefined,
    customerNote: order.customerNote || "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

router.post("/take-away/stripe/webhook", async (req, res) => {
  try {
    const { event, restaurant } = await constructTakeAwayWebhookEvent({
      rawBody: req.body,
      signature: req.headers["stripe-signature"],
    });
    const result = await handleTakeAwayStripeWebhookEvent({
      event,
      restaurant,
    });
    return res.status(200).json({ received: true, handled: result.handled });
  } catch (error) {
    return handleError(res, error);
  }
});

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
      return res.status(200).json({
        order: serializePublicOrder(order),
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
        const [year, month, day] = String(req.query.date)
          .split("-")
          .map(Number);
        const start = new Date(year, month - 1, day, 0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        query.scheduledFor = { $gte: start, $lt: end };
      } else if (req.query.dateFrom || req.query.dateTo) {
        query.scheduledFor = {};
        if (req.query.dateFrom) {
          const [year, month, day] = String(req.query.dateFrom)
            .split("-")
            .map(Number);
          query.scheduledFor.$gte = new Date(year, month - 1, day, 0, 0, 0, 0);
        }
        if (req.query.dateTo) {
          const [year, month, day] = String(req.query.dateTo)
            .split("-")
            .map(Number);
          query.scheduledFor.$lt = new Date(
            year,
            month - 1,
            day + 1,
            0,
            0,
            0,
            0,
          );
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

router.put(
  "/restaurants/:restaurantId/take-away/settings",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;

      restaurant.takeAwaySettings = mergeTakeAwaySettingsInput(
        restaurant.takeAwaySettings,
        req.body?.settings || req.body || {},
      );
      await restaurant.save();

      const updatedRestaurant = await loadRestaurantForTakeAway(restaurant._id);
      return res.status(200).json({ restaurant: updatedRestaurant });
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
