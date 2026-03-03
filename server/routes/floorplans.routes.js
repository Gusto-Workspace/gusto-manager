const express = require("express");
const mongoose = require("mongoose");
const RestaurantModel = require("../models/restaurant.model");
const authenticateToken = require("../middleware/authentificate-token");

const router = express.Router();

function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(String(v || ""));
}

function safeString(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function safeNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureFloorplan(restaurant) {
  if (!restaurant.reservations) restaurant.reservations = {};
  if (!restaurant.reservations.parameters)
    restaurant.reservations.parameters = {};
  if (!restaurant.reservations.parameters.floorplan) {
    restaurant.reservations.parameters.floorplan = {
      enabled: false,
      rooms: [],
      version: 1,
    };
  }
  if (!Array.isArray(restaurant.reservations.parameters.floorplan.rooms)) {
    restaurant.reservations.parameters.floorplan.rooms = [];
  }
}

function getRooms(restaurant) {
  return restaurant?.reservations?.parameters?.floorplan?.rooms || [];
}

async function findRestaurantForOwner({ restaurantId, ownerId }) {
  return RestaurantModel.findOne({ _id: restaurantId, owner_id: ownerId });
}

/** ========================= GET ROOMS ========================= */
router.get(
  "/restaurants/:restaurantId/floorplans/rooms",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }

      if (!isObjectId(restaurantId))
        return res.status(400).json({ message: "restaurantId invalide." });

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      return res.json({
        rooms: getRooms(restaurant),
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res.status(500).json({ message: "Erreur serveur (GET rooms)." });
    }
  },
);

/** ========================= CREATE ROOM ========================= */
router.post(
  "/restaurants/:restaurantId/floorplans/rooms",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }
      if (!isObjectId(restaurantId))
        return res.status(400).json({ message: "restaurantId invalide." });

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      const name = safeString(req.body?.name, "Nouvelle salle");

      restaurant.reservations.parameters.floorplan.rooms.push({
        name,
        canvas: { width: 2000, height: 2000, gridSize: 50 },
        objects: [],
      });

      // auto enable dès la première salle
      restaurant.reservations.parameters.floorplan.enabled = true;

      restaurant.reservations.parameters.floorplan.version =
        Number(restaurant.reservations.parameters.floorplan.version || 1) + 1;

      await restaurant.save();

      return res.json({
        rooms: getRooms(restaurant),
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res.status(500).json({ message: "Erreur serveur (POST room)." });
    }
  },
);

/** ========================= UPDATE ROOM ========================= */
router.put(
  "/restaurants/:restaurantId/floorplans/rooms/:roomId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, roomId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }
      if (!isObjectId(restaurantId) || !isObjectId(roomId))
        return res
          .status(400)
          .json({ message: "restaurantId/roomId invalide." });

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      const room =
        restaurant.reservations.parameters.floorplan.rooms.id(roomId);
      if (!room) return res.status(404).json({ message: "Salle introuvable." });

      // canvas
      const canvas = req.body?.canvas || {};
      room.canvas.width = safeNumber(canvas.width, room.canvas.width);
      room.canvas.height = safeNumber(canvas.height, room.canvas.height);
      room.canvas.gridSize = safeNumber(canvas.gridSize, room.canvas.gridSize);

      // objects
      const incoming = Array.isArray(req.body?.objects) ? req.body.objects : [];

      // catalogue tables existantes (subdocs)
      const catalogIds = new Set(
        (restaurant.reservations?.parameters?.tables || []).map((t) =>
          String(t?._id),
        ),
      );

      const cleaned = incoming
        .filter((o) => o && typeof o === "object")
        .map((o) => ({
          id: safeString(o.id),

          type: o.type === "decor" ? "decor" : "table",

          tableRefId: o.tableRefId || null,

          x: safeNumber(o.x, 0),
          y: safeNumber(o.y, 0),
          w: safeNumber(o.w, 80),
          h: safeNumber(o.h, 50),
          r: safeNumber(o.r, 16),
          rotation: safeNumber(o.rotation, 0),

          decorKind: safeString(o.decorKind),
          shape: safeString(o.shape || "rect"),

          points: Array.isArray(o.points) ? o.points : [],

          style: typeof o.style === "object" ? o.style : {},
          meta: typeof o.meta === "object" ? o.meta : {},

          locked: Boolean(o.locked),
        }))
        .filter((o) => {
          if (!o.id) return false;

          if (o.type === "table") {
            if (!o.tableRefId) return false;
            return catalogIds.has(String(o.tableRefId));
          }

          return true;
        });

      // unique id
      const seen = new Set();
      const uniq = [];
      for (const o of cleaned) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        uniq.push(o);
      }

      room.objects = uniq;

      restaurant.reservations.parameters.floorplan.version =
        Number(restaurant.reservations.parameters.floorplan.version || 1) + 1;

      restaurant.markModified("reservations.parameters.floorplan.rooms");

      await restaurant.save();

      return res.json({
        room,
        rooms: getRooms(restaurant),
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res.status(500).json({ message: "Erreur serveur (PUT room)." });
    }
  },
);

/** ========================= DUPLICATE ROOM ========================= */
router.post(
  "/restaurants/:restaurantId/floorplans/rooms/:roomId/duplicate",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, roomId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }
      if (!isObjectId(restaurantId) || !isObjectId(roomId))
        return res
          .status(400)
          .json({ message: "restaurantId/roomId invalide." });

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      const room =
        restaurant.reservations.parameters.floorplan.rooms.id(roomId);
      if (!room) return res.status(404).json({ message: "Salle introuvable." });

      const clone = {
        name: `${room.name} (copie)`,
        canvas: { ...room.canvas },
        objects: (room.objects || []).map((o) => ({
          ...(o.toObject?.() ? o.toObject() : o),
          id: `${o.id}_copy_${Date.now()}`,
        })),
      };

      restaurant.reservations.parameters.floorplan.rooms.push(clone);

      restaurant.reservations.parameters.floorplan.version =
        Number(restaurant.reservations.parameters.floorplan.version || 1) + 1;

      await restaurant.save();

      return res.json({
        rooms: getRooms(restaurant),
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res
        .status(500)
        .json({ message: "Erreur serveur (duplicate room)." });
    }
  },
);

/** ========================= DELETE ROOM ========================= */
router.delete(
  "/restaurants/:restaurantId/floorplans/rooms/:roomId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, roomId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }
      if (!isObjectId(restaurantId) || !isObjectId(roomId))
        return res
          .status(400)
          .json({ message: "restaurantId/roomId invalide." });

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      const room =
        restaurant.reservations.parameters.floorplan.rooms.id(roomId);
      if (!room) return res.status(404).json({ message: "Salle introuvable." });

      room.deleteOne();

      restaurant.reservations.parameters.floorplan.version =
        Number(restaurant.reservations.parameters.floorplan.version || 1) + 1;

      await restaurant.save();

      return res.json({
        rooms: getRooms(restaurant),
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res.status(500).json({ message: "Erreur serveur (DELETE room)." });
    }
  },
);

module.exports = router;
