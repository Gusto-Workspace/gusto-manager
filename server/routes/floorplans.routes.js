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
      if (req.body?.name !== undefined) {
        room.name = safeString(req.body.name, room.name);
      }
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

/** ========================= DELETE TABLE FROM CATALOG (AND ROOMS) =========================
 *  Supprime une table du catalogue + retire toutes ses instances des plans (toutes les rooms).
 */
router.delete(
  "/restaurants/:restaurantId/floorplans/catalog/tables/:tableId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tableId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }
      if (!isObjectId(restaurantId) || !isObjectId(tableId)) {
        return res
          .status(400)
          .json({ message: "restaurantId/tableId invalide." });
      }

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant introuvable." });

      ensureFloorplan(restaurant);

      const tables = restaurant?.reservations?.parameters?.tables || [];
      const beforeLen = tables.length;

      // 1) Supprimer du catalogue
      restaurant.reservations.parameters.tables = tables.filter(
        (t) => String(t._id) !== String(tableId),
      );

      if (restaurant.reservations.parameters.tables.length === beforeLen) {
        return res
          .status(404)
          .json({ message: "Table introuvable dans le catalogue." });
      }

      // 2) Nettoyer toutes les rooms (retirer les instances)
      const rooms = getRooms(restaurant);
      let removedInstances = 0;

      for (const room of rooms) {
        const prev = Array.isArray(room.objects) ? room.objects : [];
        const next = prev.filter(
          (o) =>
            !(
              o?.type === "table" &&
              String(o.tableRefId || "") === String(tableId)
            ),
        );
        removedInstances += prev.length - next.length;
        room.objects = next;
      }

      // bump version
      restaurant.reservations.parameters.floorplan.version =
        Number(restaurant.reservations.parameters.floorplan.version || 1) + 1;

      // important: marquer modifs
      restaurant.markModified("reservations.parameters.tables");
      restaurant.markModified("reservations.parameters.floorplan.rooms");

      await restaurant.save();

      return res.json({
        tables: restaurant.reservations.parameters.tables || [],
        rooms: getRooms(restaurant),
        removedInstances,
        enabled: Boolean(restaurant.reservations.parameters.floorplan.enabled),
        version: Number(
          restaurant.reservations.parameters.floorplan.version || 1,
        ),
      });
    } catch (e) {
      return res.status(500).json({
        message: "Erreur serveur (DELETE catalog table).",
      });
    }
  },
);

// ✅ ADD TABLE TO CATALOG (safe: preserve existing _id)
router.post(
  "/restaurants/:restaurantId/floorplans/catalog/tables",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const ownerId = req.user?.id;

      if (!ownerId) return res.status(403).json({ message: "Unauthorized." });
      if (String(req.user?.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "Restaurant mismatch" });
      }

      const restaurant = await findRestaurantForOwner({
        restaurantId,
        ownerId,
      });
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable." });
      }

      ensureFloorplan(restaurant);

      if (!restaurant.reservations) restaurant.reservations = {};
      if (!restaurant.reservations.parameters)
        restaurant.reservations.parameters = {};
      if (!Array.isArray(restaurant.reservations.parameters.tables)) {
        restaurant.reservations.parameters.tables = [];
      }

      const name = String(req.body?.name || "").trim();
      const seats = Number(req.body?.seats);

      if (!name) return res.status(400).json({ message: "Nom obligatoire." });
      if (!Number.isFinite(seats) || seats < 1) {
        return res.status(400).json({ message: "Places invalides." });
      }

      // anti-doublon case-insensitive
      const exists = restaurant.reservations.parameters.tables.some(
        (t) =>
          String(t?.name || "")
            .trim()
            .toLowerCase() === name.toLowerCase(),
      );
      if (exists) {
        return res
          .status(409)
          .json({ message: "Une table avec ce nom existe déjà." });
      }

      restaurant.reservations.parameters.tables.push({ name, seats });

      restaurant.markModified("reservations.parameters.tables");
      await restaurant.save();

      const tables = restaurant.reservations.parameters.tables || [];
      const created =
        [...tables].reverse().find(
          (t) =>
            String(t?.name || "")
              .trim()
              .toLowerCase() === name.toLowerCase(),
        ) || null;

      return res.json({ tables, created });
    } catch (e) {
      return res
        .status(500)
        .json({ message: "Erreur serveur (POST catalog table)." });
    }
  },
);

module.exports = router;
