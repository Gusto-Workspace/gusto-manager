const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");
const NotificationModel = require("../models/notification.model");

// LIST (avec pagination simple)
router.get(
  "/restaurants/:restaurantId/notifications",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { module, unreadOnly, limit, cursor } = req.query;

      const q = { restaurantId };
      if (module) {
        q.module = module;
      }

      if (unreadOnly === "true") q.read = false;

      const pageLimit = Math.min(Math.max(parseInt(limit || "30", 10), 1), 100);

      if (cursor) {
        const d = new Date(cursor);
        if (!Number.isNaN(d.getTime())) q.createdAt = { $lt: d };
      }

      const itemsPlusOne = await NotificationModel.find(q)
        .sort({ createdAt: -1 })
        .limit(pageLimit + 1)
        .lean();

      const hasMore = itemsPlusOne.length > pageLimit;
      const items = hasMore ? itemsPlusOne.slice(0, pageLimit) : itemsPlusOne;

      const nextCursor = hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null;

      return res.json({ notifications: items, nextCursor });
    } catch (e) {
      console.error("GET notifications error:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// UNREAD COUNTS (par module + total)
router.get(
  "/restaurants/:restaurantId/notifications/unread-counts",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;

      const agg = await NotificationModel.aggregate([
        {
          $match: {
            restaurantId:
              require("mongoose").Types.ObjectId.createFromHexString(
                String(restaurantId),
              ),
            read: false,
          },
        },
        { $group: { _id: "$module", count: { $sum: 1 } } },
      ]);

      const byModule = {};
      for (const row of agg) {
        if (row?._id) byModule[row._id] = row.count || 0;
      }
      const total = agg.reduce((acc, r) => acc + (r.count || 0), 0);
      return res.json({ total, byModule });
    } catch (e) {
      console.error("GET unread-counts error:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// MARK ONE READ
router.post(
  "/restaurants/:restaurantId/notifications/:notifId/read",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, notifId } = req.params;

      const updated = await NotificationModel.findOneAndUpdate(
        { _id: notifId, restaurantId },
        { $set: { read: true, readAt: new Date() } },
        { new: true },
      ).lean();

      if (!updated)
        return res.status(404).json({ message: "Notification not found" });

      return res.json({ notification: updated });
    } catch (e) {
      console.error("POST notif read error:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// MARK ALL READ (optionnel par module)
router.post(
  "/restaurants/:restaurantId/notifications/read-all",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { module } = req.query;

      const q = { restaurantId, read: false };
      if (module) {
        q.module = module;
      }

      const r = await NotificationModel.updateMany(q, {
        $set: { read: true, readAt: new Date() },
      });

      return res.json({ ok: true, modifiedCount: r.modifiedCount || 0 });
    } catch (e) {
      console.error("POST read-all error:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
