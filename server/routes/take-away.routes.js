const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");
const RestaurantModel = require("../models/restaurant.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
const {
  sanitizeTakeAwaySettingsInput,
  normalizeCatalogItemInput,
  listImportableSourceItems,
  upsertCatalogItemFromSource,
  createCustomCatalogItem,
  getAvailableSlots,
  createTakeAwayOrder,
  createOrderPaymentIntent,
  confirmOrderPayment,
  updateOrderStatus,
  loadRestaurantForTakeAway,
  cleanupCompletedTakeAwayOrders,
} = require("../services/take-away.service");

function canAccessRestaurant(req, restaurant) {
  if (!restaurant || !req.user) return false;

  if (req.user.role === "owner") {
    return String(restaurant.owner_id?._id || restaurant.owner_id) === String(req.user.id);
  }

  if (req.user.role === "employee") {
    if (String(req.user.restaurantId || "") !== String(restaurant._id)) return false;
    return req.user.options?.take_away === true;
  }

  return false;
}

async function loadAuthorizedRestaurant(req, res) {
  const restaurant = await loadRestaurantForTakeAway(req.params.restaurantId);
  if (!restaurant) {
    res.status(404).json({ message: "Restaurant not found" });
    return null;
  }
  if (!canAccessRestaurant(req, restaurant)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return restaurant;
}

function serializePublicCatalog(restaurant) {
  return (restaurant.takeAwayCatalog || [])
    .filter((item) => item.active !== false && item.visible !== false)
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

router.get("/restaurants/:restaurantId/take-away/public/catalog", async (req, res) => {
  try {
    const restaurant = await loadPublicRestaurant(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
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
    return handleError(res, error);
  }
});

router.get("/restaurants/:restaurantId/take-away/public/slots", async (req, res) => {
  try {
    const restaurant = await loadPublicRestaurant(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    const dateKey = String(req.query.date || "").trim();
    const slots = await getAvailableSlots({ restaurant, dateKey });
    return res.status(200).json({ slots });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post("/restaurants/:restaurantId/take-away/public/orders", async (req, res) => {
  try {
    const restaurant = await loadPublicRestaurant(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    const order = await createTakeAwayOrder({
      restaurant,
      payload: req.body || {},
      source: "public",
    });
    return res.status(201).json({ order });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post(
  "/restaurants/:restaurantId/take-away/public/orders/:orderId/payment-intent",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }
      const order = await TakeAwayOrderModel.findOne({
        _id: req.params.orderId,
        restaurant_id: req.params.restaurantId,
      });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      const paymentIntent = await createOrderPaymentIntent({ restaurant, order });
      return res.status(200).json({
        order,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/take-away/public/orders/:orderId/confirm-payment",
  async (req, res) => {
    try {
      const restaurant = await loadPublicRestaurant(req.params.restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }
      const order = await confirmOrderPayment({
        restaurant,
        restaurantId: req.params.restaurantId,
        orderId: req.params.orderId,
        paymentIntentId: req.body?.paymentIntentId,
      });
      return res.status(200).json({ order });
    } catch (error) {
      return handleError(res, error);
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
      await cleanupCompletedTakeAwayOrders(restaurant);

      const query = { restaurant_id: restaurant._id };
      if (req.query.status && req.query.status !== "all") {
        query.status = req.query.status;
      }
      if (req.query.fulfillmentMode && req.query.fulfillmentMode !== "all") {
        query.fulfillmentMode = req.query.fulfillmentMode;
      }
      if (req.query.date) {
        const [year, month, day] = String(req.query.date).split("-").map(Number);
        const start = new Date(year, month - 1, day, 0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        query.scheduledFor = { $gte: start, $lt: end };
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

router.patch(
  "/restaurants/:restaurantId/take-away/orders/:orderId/status",
  authenticateToken,
  async (req, res) => {
    try {
      const restaurant = await loadAuthorizedRestaurant(req, res);
      if (!restaurant) return;
      const order = await updateOrderStatus({
        restaurantId: restaurant._id,
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

      restaurant.takeAwaySettings = sanitizeTakeAwaySettingsInput(
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

      Object.assign(item, normalizeCatalogItemInput({ ...item.toObject(), ...req.body }));
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
