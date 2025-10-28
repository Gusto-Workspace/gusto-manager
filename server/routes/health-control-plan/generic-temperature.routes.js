const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const TemperatureGeneric = require("../../models/logs/generic-temperature.model");

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
function hasBusinessChanges(prev, next) {
  const fields = ["location", "locationId", "value", "unit", "note"];
  for (const f of fields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  const t1 = prev?.createdAt?.getTime?.() ?? null;
  const t2 = next?.createdAt?.getTime?.() ?? null;
  return t1 !== t2;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/generic-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const location = normalizeStr(inData.location);
      if (!location)
        return res.status(400).json({ error: "location est requise" });

      if (inData.value === undefined || inData.value === null) {
        return res.status(400).json({ error: "value est requise" });
      }
      const numVal = Number(inData.value);
      if (Number.isNaN(numVal)) {
        return res.status(400).json({ error: "value doit être un nombre" });
      }

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const doc = new TemperatureGeneric({
        restaurantId,
        location,
        locationId: normalizeStr(inData.locationId),
        value: numVal,
        unit: inData.unit === "°F" ? "°F" : "°C",
        note: normalizeStr(inData.note),
        recordedBy: currentUser, // snapshot à la création
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /generic-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/generic-temperatures",
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
          { locationId: rx },
          { note: rx },
          { unit: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        TemperatureGeneric.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        TemperatureGeneric.countDocuments(query),
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
      console.error("GET /generic-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/generic-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await TemperatureGeneric.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /generic-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/generic-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      // pas de modification du snapshot auteur côté client
      delete inData.recordedBy;

      const prev = await TemperatureGeneric.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      const next = {
        location:
          inData.location !== undefined
            ? normalizeStr(inData.location)
            : prev.location,
        locationId:
          inData.locationId !== undefined
            ? normalizeStr(inData.locationId)
            : prev.locationId,
        value: inData.value !== undefined ? Number(inData.value) : prev.value,
        unit:
          inData.unit !== undefined
            ? inData.unit === "°F"
              ? "°F"
              : "°C"
            : prev.unit,
        note: inData.note !== undefined ? normalizeStr(inData.note) : prev.note,
        createdAt:
          inData.createdAt !== undefined
            ? normalizeDate(inData.createdAt) || prev.createdAt
            : prev.createdAt,
      };

      if (!next.location)
        return res.status(400).json({ error: "location est requise" });
      if (next.value !== undefined && Number.isNaN(next.value)) {
        return res.status(400).json({ error: "value doit être un nombre" });
      }

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      prev.location = next.location;
      prev.locationId = next.locationId;
      prev.value = next.value;
      prev.unit = next.unit;
      prev.note = next.note;
      prev.createdAt = next.createdAt;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /generic-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/generic-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await TemperatureGeneric.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /generic-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
