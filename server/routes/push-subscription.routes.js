const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const PushSubscriptionModel = require("../models/push-subscription.model");
const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const authenticateToken = require("../middleware/authentificate-token");
const NotificationModel = require("../models/notification.model");

const PUSH_MODULES = new Set(["reservations", "gift_cards", "take_away"]);

function hashEndpoint(endpoint) {
  return crypto
    .createHash("sha256")
    .update(String(endpoint || ""))
    .digest("hex")
    .slice(0, 12);
}

async function userCanAccessRestaurant(user, restaurantId, module) {
  const accessFilter =
    user?.role === "owner"
      ? { _id: restaurantId, owner_id: user.id }
      : user?.role === "employee"
        ? { _id: restaurantId, employees: user.id }
        : null;

  if (!accessFilter) return false;
  const restaurant = await RestaurantModel.findOne(accessFilter).select(
    "_id options.take_away",
  );
  if (!restaurant) return false;

  if (module !== "take_away") return true;
  if (restaurant.options?.take_away !== true) return false;
  if (user.role === "owner") return true;

  return Boolean(
    await EmployeeModel.exists({
      _id: user.id,
      restaurants: restaurantId,
      restaurantProfiles: {
        $elemMatch: {
          restaurant: restaurantId,
          "options.take_away": true,
        },
      },
    }),
  );
}

router.post("/push/subscribe", authenticateToken, async (req, res) => {
  try {
    const { restaurantId, module, subscription, previousEndpoint } = req.body;

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

    if (!(await userCanAccessRestaurant(req.user, restaurantId, module))) {
      return res.status(403).json({ message: "Restaurant mismatch" });
    }

    const existing = await PushSubscriptionModel.findOne({
      endpoint: subscription.endpoint,
    }).lean();
    if (
      existing &&
      (existing.module !== module ||
        (existing.userId && String(existing.userId) !== String(req.user.id)))
    ) {
      return res
        .status(409)
        .json({ message: "Subscription identity mismatch" });
    }
    const inheritedIds = [];
    if (
      module === "take_away" &&
      previousEndpoint &&
      previousEndpoint !== subscription.endpoint
    ) {
      const previous = await PushSubscriptionModel.findOne({
        endpoint: previousEndpoint,
        module,
        userId: req.user.id,
      }).lean();
      for (const id of previous?.restaurantIds ||
        (previous?.restaurantId ? [previous.restaurantId] : [])) {
        if (await userCanAccessRestaurant(req.user, id, module))
          inheritedIds.push(id);
      }
    }
    const payload = {
      keys: subscription.keys,
      userId: req.user?.id,
      lastSeenAt: new Date(),
    };

    // Backfill only while the array is still absent. A concurrent unsubscribe
    // that has already written [] must not be undone by an earlier read.
    if (existing?.restaurantId && !Array.isArray(existing.restaurantIds)) {
      await PushSubscriptionModel.updateOne(
        { _id: existing._id, restaurantIds: { $exists: false } },
        { $set: { restaurantIds: [existing.restaurantId] } },
      );
    }

    await PushSubscriptionModel.updateOne(
      {
        endpoint: subscription.endpoint,
        module,
        $or: [
          { userId: req.user.id },
          { userId: { $exists: false } },
          { userId: null },
        ],
      },
      {
        $set: payload,
        $setOnInsert: { restaurantId, module, endpoint: subscription.endpoint },
        $addToSet: {
          restaurantIds: {
            $each: [restaurantId, ...inheritedIds],
          },
        },
      },
      { upsert: true },
    );
    if (
      module === "take_away" &&
      previousEndpoint &&
      previousEndpoint !== subscription.endpoint
    ) {
      await PushSubscriptionModel.deleteOne({
        endpoint: previousEndpoint,
        module,
        userId: req.user.id,
      });
    }

    return res.json({
      ok: true,
      restaurantId,
      module,
      endpointHash: hashEndpoint(subscription.endpoint),
      legacyTransferred: Boolean(
        module === "take_away" &&
          previousEndpoint &&
          previousEndpoint !== subscription.endpoint,
      ),
    });
  } catch (_error) {
    if (_error?.code === 11000)
      return res
        .status(409)
        .json({ message: "Subscription identity mismatch" });
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

    if (!(await userCanAccessRestaurant(req.user, restaurantId, module))) {
      return res.status(403).json({ message: "Restaurant mismatch" });
    }

    // Pipeline is atomic with concurrent subscribe calls. Do not detach the
    // browser subscription when another restaurant still uses this endpoint.
    const mongoose = require("mongoose");
    const rid = new mongoose.Types.ObjectId(restaurantId);
    const updated = await PushSubscriptionModel.findOneAndUpdate(
      {
        endpoint,
        module,
        userId: req.user.id,
      },
      [
        {
          $set: {
            restaurantIds: {
              $setDifference: [
                { $ifNull: ["$restaurantIds", ["$restaurantId"]] },
                [rid],
              ],
            },
          },
        },
      ],
      { new: true },
    ).lean();
    const hasOtherRestaurants = Boolean(updated?.restaurantIds?.length);
    if (updated && !hasOtherRestaurants) {
      await PushSubscriptionModel.deleteOne({
        _id: updated._id,
        restaurantIds: { $size: 0 },
      });
    }
    return res.json({ ok: true, hasOtherRestaurants });
  } catch (_error) {
    return res.status(500).json({ message: "Push unsubscription failed" });
  }
});

// Resolve already-displayed historical pushes that did not carry restaurantId.
// Return routing metadata only, after checking access to that restaurant.
router.get(
  "/push/notifications/:notificationId/context",
  authenticateToken,
  async (req, res) => {
    try {
      const notification = await NotificationModel.findById(
        req.params.notificationId,
      )
        .select("restaurantId module")
        .lean();
      if (
        !notification ||
        !PUSH_MODULES.has(notification.module) ||
        !(await userCanAccessRestaurant(
          req.user,
          notification.restaurantId,
          notification.module,
        ))
      ) {
        return res.status(404).json({ message: "Notification unavailable" });
      }
      return res.json({
        restaurantId: String(notification.restaurantId),
        module: notification.module,
      });
    } catch {
      return res.status(404).json({ message: "Notification unavailable" });
    }
  },
);

module.exports = router;
module.exports.userCanAccessRestaurant = userCanAccessRestaurant;
