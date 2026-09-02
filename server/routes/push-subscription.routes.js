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

function logSubscriptionSync(details) {
  console.info(`[webpush-subscription-sync] ${JSON.stringify(details)}`);
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

    const endpointHash = hashEndpoint(subscription.endpoint);
    if (!(await userCanAccessRestaurant(req.user, restaurantId))) {
      logSubscriptionSync({
        synchronizedAt: new Date().toISOString(),
        restaurantId: String(restaurantId),
        module,
        endpointHash,
        result: "rejected",
        statusCode: 403,
      });
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

    const result = await PushSubscriptionModel.updateOne(
      { endpoint: subscription.endpoint },
      { $set: payload },
      { upsert: true },
    );

    logSubscriptionSync({
      synchronizedAt: new Date().toISOString(),
      restaurantId: String(restaurantId),
      module,
      endpointHash,
      result: result.upsertedCount ? "created" : "refreshed",
    });

    return res.json({ ok: true, restaurantId, module, endpointHash });
  } catch (error) {
    console.error("[webpush-subscription-sync-error]", {
      errorName: error?.name || "Error",
      errorCode: error?.code || null,
      errorMessage: "Subscription synchronization failed",
    });
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

    const endpointHash = hashEndpoint(endpoint);
    const result = await PushSubscriptionModel.deleteOne({
      restaurantId,
      module,
      endpoint,
    });
    console.info(
      `[webpush-subscription-unsubscribe] ${JSON.stringify({
        unsubscribedAt: new Date().toISOString(),
        restaurantId: String(restaurantId),
        module,
        endpointHash,
        removed: Number(result?.deletedCount || 0),
      })}`,
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("[webpush-unsubscribe-error]", {
      errorName: error?.name || "Error",
      errorCode: error?.code || null,
      errorMessage: "Push unsubscription failed",
    });
    return res.status(500).json({ message: "Push unsubscription failed" });
  }
});

module.exports = router;
