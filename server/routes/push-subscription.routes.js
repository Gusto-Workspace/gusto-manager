const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const PushSubscriptionModel = require("../models/push-subscription.model");
const RestaurantModel = require("../models/restaurant.model");
const authenticateToken = require("../middleware/authentificate-token");

const PUSH_MODULES = new Set(["reservations", "gift_cards"]);

function hashEndpoint(endpoint) {
  return crypto
    .createHash("sha256")
    .update(String(endpoint || ""))
    .digest("hex")
    .slice(0, 12);
}

async function userCanAccessRestaurant(user, restaurantId) {
  const accessFilter =
    user?.role === "owner"
      ? { _id: restaurantId, owner_id: user.id }
      : user?.role === "employee"
        ? { _id: restaurantId, employees: user.id }
        : null;

  if (!accessFilter) return false;
  return Boolean(await RestaurantModel.exists(accessFilter));
}

router.post("/push/subscribe", authenticateToken, async (req, res) => {
  try {
    const { restaurantId, module, subscription } = req.body;

    if (
      !restaurantId ||
      !module ||
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (!PUSH_MODULES.has(module)) {
      return res.status(400).json({ message: "Invalid module" });
    }

    if (!(await userCanAccessRestaurant(req.user, restaurantId))) {
      return res.status(403).json({ message: "Restaurant mismatch" });
    }

    const payload = {
      restaurantId,
      module,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: req.user?.id,
      lastSeenAt: new Date(),
    };

    await PushSubscriptionModel.updateOne(
      { endpoint: subscription.endpoint },
      { $set: payload },
      { upsert: true },
    );

    return res.json({
      ok: true,
      restaurantId,
      module,
      endpointHash: hashEndpoint(subscription.endpoint),
    });
  } catch (_error) {
    return res.status(500).json({ message: "Subscription sync failed" });
  }
});

router.post("/push/unsubscribe", authenticateToken, async (req, res) => {
  try {
    const { restaurantId, module, endpoint } = req.body;
    if (!restaurantId || !module || !endpoint) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (!PUSH_MODULES.has(module)) {
      return res.status(400).json({ message: "Invalid module" });
    }

    if (!(await userCanAccessRestaurant(req.user, restaurantId))) {
      return res.status(403).json({ message: "Restaurant mismatch" });
    }

    await PushSubscriptionModel.deleteOne({
      restaurantId,
      module,
      endpoint,
    });
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ message: "Push unsubscription failed" });
  }
});

module.exports = router;
