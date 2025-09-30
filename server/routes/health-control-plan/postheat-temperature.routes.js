const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const PostheatTemperature = require("../../models/logs/postheat-temperature.model");

/* --------- helpers --------- */
function currentUserFromToken(req) {
  const u = req.user || {};
  const role = (u.role || "").toLowerCase();
  if (!["owner", "employee"].includes(role) || !u.id) return null;
  return {
    userId: u.id,
    role,
    firstName: u.firstname || u.firstName || "",
    lastName: u.lastname || u.lastName || "",
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
/** True si au moins un champ métier a changé */
function hasBusinessChanges(prev, next) {
  const fields = ["location", "equipmentId", "locationId", "value", "unit", "phase", "note"];
  for (const f of fields) if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  const prevTime = prev?.createdAt?.getTime?.() ?? null;
  const nextTime = next?.createdAt?.getTime?.() ?? null;
  return prevTime !== nextTime;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/postheat-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const location = normalizeStr(inData.location);
      if (!location) return res.status(400).json({ error: "location est requise" });

      if (inData.value === undefined || inData.value === null)
        return res.status(400).json({ error: "value est requise" });
      const numVal = Number(inData.value);
      if (Number.isNaN(numVal))
        return res.status(400).json({ error: "value doit être un nombre" });

      const currentUser = currentUserFromToken(req);
      if (!currentUser) return res.status(400).json({ error: "Utilisateur non reconnu" });

      const doc = new PostheatTemperature({
        restaurantId,
        location,
        equipmentId: normalizeStr(inData.equipmentId),
        locationId: normalizeStr(inData.locationId),
        value: numVal,
        unit: inData.unit === "°F" ? "°F" : "°C",
        phase: normalizeStr(inData.phase) || "postheat",
        note: normalizeStr(inData.note),
        recordedBy: currentUser, // snapshot
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /postheat-temperatures:", err);
      return res.status(500).json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/postheat-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q } = req.query;

      const query = { restaurantId };

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

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { location: rx },
          { equipmentId: rx },
          { locationId: rx },
          { unit: rx },
          { phase: rx },
          { note: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        PostheatTemperature.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        PostheatTemperature.countDocuments(query),
      ]);

      return res.json({
        items,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.max(1, Math.ceil(total / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /postheat-temperatures:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/postheat-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await PostheatTemperature.findOne({ _id: tempId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /postheat-temperatures/:tempId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/postheat-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;

      const prev = await PostheatTemperature.findOne({ _id: tempId, restaurantId });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      const next = {
        location: inData.location !== undefined ? normalizeStr(inData.location) : prev.location,
        equipmentId:
          inData.equipmentId !== undefined ? normalizeStr(inData.equipmentId) : prev.equipmentId,
        locationId:
          inData.locationId !== undefined ? normalizeStr(inData.locationId) : prev.locationId,
        value: inData.value !== undefined ? Number(inData.value) : prev.value,
        unit:
          inData.unit !== undefined ? (inData.unit === "°F" ? "°F" : "°C") : prev.unit,
        phase:
          inData.phase !== undefined ? (normalizeStr(inData.phase) || "postheat") : prev.phase,
        note: inData.note !== undefined ? normalizeStr(inData.note) : prev.note,
        createdAt:
          inData.createdAt !== undefined
            ? normalizeDate(inData.createdAt) || prev.createdAt
            : prev.createdAt,
      };

      if (!next.location) return res.status(400).json({ error: "location est requise" });
      if (next.value !== undefined && Number.isNaN(next.value))
        return res.status(400).json({ error: "value doit être un nombre" });

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      prev.location = next.location;
      prev.equipmentId = next.equipmentId;
      prev.locationId = next.locationId;
      prev.value = next.value;
      prev.unit = next.unit;
      prev.phase = next.phase;
      prev.note = next.note;
      prev.createdAt = next.createdAt;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /postheat-temperatures/:tempId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/postheat-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await PostheatTemperature.findOneAndDelete({ _id: tempId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /postheat-temperatures/:tempId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
