const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const PostheatTemperature = require("../../models/logs/postheat-temperature.model");

/* --------- helpers --------- */
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
function hasBusinessChanges(prev, next) {
  const fields = [
    "equipmentName",
    "equipmentId",
    "location",
    "locationId",
    "value",
    "unit",
    "probeType",
    "phase",
    "note",
  ];
  for (const f of fields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  const t1 = prev?.createdAt?.getTime?.() ?? null;
  const t2 = next?.createdAt?.getTime?.() ?? null;
  return t1 !== t2;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/postheat-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const equipmentName = normalizeStr(inData.equipmentName);
      if (!equipmentName)
        return res.status(400).json({ error: "equipmentName est requis" });

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

      const doc = new PostheatTemperature({
        restaurantId,

        equipmentName,
        equipmentId: normalizeStr(inData.equipmentId),
        location: normalizeStr(inData.location),
        locationId: normalizeStr(inData.locationId),

        value: numVal,
        unit: inData.unit === "°F" ? "°F" : "°C",

        probeType: ["core", "surface", "ambient", "oil", "other"].includes(
          inData.probeType
        )
          ? inData.probeType
          : "core",

        phase: ["postheat", "reheat", "hot-holding"].includes(inData.phase)
          ? inData.phase
          : "postheat",

        note: normalizeStr(inData.note),

        recordedBy: currentUser,
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /postheat-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
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

      // 🔐 Recherche texte sécurisée
      const trimmedQ = String(q || "").trim();
      if (trimmedQ) {
        const safe = escapeRegExp(trimmedQ);
        const rx = new RegExp(safe, "i");

        query.$or = [
          { equipmentName: rx },
          { equipmentId: rx },
          { location: rx },
          { locationId: rx },
          { unit: rx },
          { probeType: rx },
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
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
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
      const doc = await PostheatTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /postheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
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

      const prev = await PostheatTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      const next = {
        equipmentName:
          inData.equipmentName !== undefined
            ? normalizeStr(inData.equipmentName)
            : prev.equipmentName,
        equipmentId:
          inData.equipmentId !== undefined
            ? normalizeStr(inData.equipmentId)
            : prev.equipmentId,
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

        probeType:
          inData.probeType !== undefined
            ? ["core", "surface", "ambient", "oil", "other"].includes(
                inData.probeType
              )
              ? inData.probeType
              : prev.probeType
            : prev.probeType,

        phase:
          inData.phase !== undefined
            ? ["postheat", "reheat", "hot-holding"].includes(inData.phase)
              ? inData.phase
              : prev.phase
            : prev.phase,

        note: inData.note !== undefined ? normalizeStr(inData.note) : prev.note,

        createdAt:
          inData.createdAt !== undefined
            ? normalizeDate(inData.createdAt) || prev.createdAt
            : prev.createdAt,
      };

      if (!next.equipmentName)
        return res.status(400).json({ error: "equipmentName est requis" });
      if (next.value !== undefined && Number.isNaN(next.value)) {
        return res.status(400).json({ error: "value doit être un nombre" });
      }

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      // apply
      prev.equipmentName = next.equipmentName;
      prev.equipmentId = next.equipmentId;
      prev.location = next.location;
      prev.locationId = next.locationId;
      prev.value = next.value;
      prev.unit = next.unit;
      prev.probeType = next.probeType;
      prev.phase = next.phase;
      prev.note = next.note;
      prev.createdAt = next.createdAt;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /postheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
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
      const doc = await PostheatTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /postheat-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

/* -------------------- DISTINCT ÉQUIPEMENTS -------------------- */
router.get(
  "/restaurants/:restaurantId/postheat-temperatures/distinct/equipments",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await PostheatTemperature.aggregate([
        { $match: { restaurantId } },
        {
          $group: {
            _id: {
              equipmentName: "$equipmentName",
              equipmentId: "$equipmentId",
              location: "$location",
              locationId: "$locationId",
            },
            count: { $sum: 1 },
            lastAt: { $max: "$createdAt" },
          },
        },
        { $sort: { "_id.equipmentName": 1 } },
      ]);
      const items = rows.map((r) => ({
        equipmentName: r._id.equipmentName || "",
        equipmentId: r._id.equipmentId || "",
        location: r._id.location || "",
        locationId: r._id.locationId || "",
        count: r.count,
        lastAt: r.lastAt,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /postheat-temperatures/distinct/equipments:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des équipements" });
    }
  }
);

module.exports = router;
