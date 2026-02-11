const express = require("express");
const router = express.Router();

const PushSubscriptionModel = require("../models/push-subscription.model");
const authenticateToken = require("../middleware/authentificate-token");

router.post("/subscribe", authenticateToken, async (req, res) => {
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

  const payload = {
    restaurantId,
    module,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    userId: req.user?._id,
    lastSeenAt: new Date(),
  };

  await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: payload },
    { upsert: true, new: true },
  );

  res.json({ ok: true });
});

router.post("/unsubscribe", authenticateToken, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ message: "Missing endpoint" });

  await PushSubscriptionModel.deleteOne({ endpoint });
  res.json({ ok: true });
});

module.exports = router;
