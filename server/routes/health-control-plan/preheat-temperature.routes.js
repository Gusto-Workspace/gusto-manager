const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const PreheatTemperature = require("../../models/logs/preheat-temperature.model");
const CookingEquipment = require("../../models/logs/cooking-equipment.model");

/* helpers */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentUserFromToken(req) {
  const u = req.user || {};
  const role = (u.role || "").toLowerCase();
  if (!["owner", "employee"].includes(role) || !u.id) return null;
  return {
    userId: u.id,
    role,
    firstName: u.firstname || "",
    lastName: u.lastname || "",
  };
}
function normalizeStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function normalizePhase(v) {
  const s = String(v || "").toLowerCase();
  return s === "hot-holding" ? "hot-holding" : "preheat";
}
async function loadEquipmentSnapshot(restaurantId, deviceRef) {
  const f = await CookingEquipment.findOne({ _id: deviceRef, restaurantId });
  if (!f) return null;
  return {
    name: f.name,
    equipmentCode: f.equipmentCode || null,
    location: f.location || null,
    locationCode: f.locationCode || null,
    unit: f.unit || "°C",
  };
}

router.use(authenticateToken);

/** CREATE
 * body: { deviceRef, value, phase, note, createdAt }
 */
router.post(
  "/restaurants/:restaurantId/preheat-temperatures",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const deviceRef = inData.deviceRef;
      if (!deviceRef)
        return res.status(400).json({ error: "deviceRef est requis" });

      if (inData.value === undefined || inData.value === null) {
        return res.status(400).json({ error: "value est requise" });
      }
      const numVal = Number(inData.value);
      if (Number.isNaN(numVal))
        return res.status(400).json({ error: "value doit être un nombre" });

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const snapshot = await loadEquipmentSnapshot(restaurantId, deviceRef);
      if (!snapshot) return res.status(404).json({ error: "Appareil inconnu" });

      const doc = new PreheatTemperature({
        restaurantId,
        deviceRef,
        device: snapshot,
        value: numVal,
        unit: snapshot.unit || "°C",
        phase: normalizePhase(inData.phase),
        recordedBy: currentUser,
        note: normalizeStr(inData.note),
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc.toJSON());
    } catch (err) {
      console.error("POST /preheat-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/** LIST
 * GET /restaurants/:restaurantId/preheat-temperatures?date_from=&date_to=&q=&deviceRef=&phase=
 */
router.get(
  "/restaurants/:restaurantId/preheat-temperatures",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 200,
        date_from,
        date_to,
        q,
        deviceRef,
        phase,
      } = req.query;

      const query = { restaurantId };
      if (deviceRef) query.deviceRef = deviceRef;
      if (phase) query.phase = normalizePhase(phase);

      if (date_from || date_to) {
        query.createdAt = {};
        if (date_from) query.createdAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          query.createdAt.$lte = end;
        }
      }

      // 🔐 Recherche texte sécurisée
      const trimmedQ = String(q || "").trim();
      if (trimmedQ) {
        const safe = escapeRegExp(trimmedQ);
        const rx = new RegExp(safe, "i");

        query.$or = [
          { "device.name": rx },
          { "device.equipmentCode": rx },
          { "device.location": rx },
          { "device.locationCode": rx },
          { note: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        PreheatTemperature.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        PreheatTemperature.countDocuments(query),
      ]);

      return res.json({
        items: items.map((d) => d.toJSON()),
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.max(1, Math.ceil(total / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /preheat-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/** READ ONE */
router.get(
  "/restaurants/:restaurantId/preheat-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await PreheatTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc.toJSON());
    } catch (err) {
      console.error("GET /preheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/** UPDATE */
router.put(
  "/restaurants/:restaurantId/preheat-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;

      const prev = await PreheatTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      if (inData.deviceRef) {
        const snapshot = await CookingEquipment.findOne({
          _id: inData.deviceRef,
          restaurantId,
        });
        if (!snapshot)
          return res.status(404).json({ error: "Appareil inconnu" });
        prev.deviceRef = snapshot._id;
        prev.device = {
          name: snapshot.name,
          equipmentCode: snapshot.equipmentCode || null,
          location: snapshot.location || null,
          locationCode: snapshot.locationCode || null,
          unit: snapshot.unit || "°C",
        };
        prev.unit = prev.device.unit;
      }

      if (inData.value !== undefined) {
        const numVal = Number(inData.value);
        if (Number.isNaN(numVal))
          return res.status(400).json({ error: "value doit être un nombre" });
        prev.value = numVal;
      }
      if (inData.phase !== undefined) prev.phase = normalizePhase(inData.phase);
      if (inData.note !== undefined) prev.note = normalizeStr(inData.note);
      if (inData.createdAt !== undefined) {
        prev.createdAt = normalizeDate(inData.createdAt) || prev.createdAt;
      }

      await prev.save();
      return res.json(prev.toJSON());
    } catch (err) {
      console.error("PUT /preheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/** DELETE */
router.delete(
  "/restaurants/:restaurantId/preheat-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await PreheatTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /preheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
