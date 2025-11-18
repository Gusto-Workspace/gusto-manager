const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const ServiceTemperature = require("../../models/logs/service-temperature.model");

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
    "serviceArea",
    "serviceId",
    "plateId",
    "dishName",
    "servingMode",
    "serviceType",
    "value",
    "unit",
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
  "/restaurants/:restaurantId/service-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const serviceArea = normalizeStr(inData.serviceArea);
      if (!serviceArea)
        return res.status(400).json({ error: "serviceArea est requis" });

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

      const doc = new ServiceTemperature({
        restaurantId,
        serviceArea,
        serviceId: normalizeStr(inData.serviceId),
        plateId: normalizeStr(inData.plateId),
        dishName: normalizeStr(inData.dishName),
        servingMode: (() => {
          const allowed = [
            "pass",
            "buffet-hot",
            "buffet-cold",
            "table",
            "delivery",
            "takeaway",
            "room-service",
            "catering",
            "other",
          ];
          return allowed.includes(inData.servingMode)
            ? inData.servingMode
            : "pass";
        })(),
        serviceType: ["hot", "cold", "unknown"].includes(inData.serviceType)
          ? inData.serviceType
          : "unknown",

        value: numVal,
        unit: inData.unit === "°F" ? "°F" : "°C",

        note: normalizeStr(inData.note),

        recordedBy: currentUser, // snapshot
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /service-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

router.get(
  "/restaurants/:restaurantId/service-temperatures",
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

      // 🔐 Recherche texte sécurisée avec escapeRegExp
      const trimmedQ = String(q || "").trim();
      if (trimmedQ) {
        const safe = escapeRegExp(trimmedQ);
        const rx = new RegExp(safe, "i");

        query.$or = [
          { serviceArea: rx },
          { serviceId: rx },
          { plateId: rx },
          { dishName: rx },
          { servingMode: rx },
          { serviceType: rx },
          { unit: rx },
          { note: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        ServiceTemperature.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        ServiceTemperature.countDocuments(query),
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
      console.error("GET /service-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/service-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await ServiceTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /service-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/service-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;

      const prev = await ServiceTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      const next = {
        serviceArea:
          inData.serviceArea !== undefined
            ? normalizeStr(inData.serviceArea)
            : prev.serviceArea,
        serviceId:
          inData.serviceId !== undefined
            ? normalizeStr(inData.serviceId)
            : prev.serviceId,
        plateId:
          inData.plateId !== undefined
            ? normalizeStr(inData.plateId)
            : prev.plateId,
        dishName:
          inData.dishName !== undefined
            ? normalizeStr(inData.dishName)
            : prev.dishName,
        servingMode:
          inData.servingMode !== undefined
            ? [
                "pass",
                "buffet-hot",
                "buffet-cold",
                "table",
                "delivery",
                "takeaway",
                "room-service",
                "catering",
                "other",
              ].includes(inData.servingMode)
              ? inData.servingMode
              : prev.servingMode
            : prev.servingMode,
        serviceType:
          inData.serviceType !== undefined
            ? ["hot", "cold", "unknown"].includes(inData.serviceType)
              ? inData.serviceType
              : prev.serviceType
            : prev.serviceType,

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

      if (!next.serviceArea)
        return res.status(400).json({ error: "serviceArea est requis" });
      if (next.value !== undefined && Number.isNaN(next.value)) {
        return res.status(400).json({ error: "value doit être un nombre" });
      }

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      // apply
      prev.serviceArea = next.serviceArea;
      prev.serviceId = next.serviceId;
      prev.plateId = next.plateId;
      prev.dishName = next.dishName;
      prev.servingMode = next.servingMode;
      prev.serviceType = next.serviceType;
      prev.value = next.value;
      prev.unit = next.unit;
      prev.note = next.note;
      prev.createdAt = next.createdAt;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /service-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/service-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await ServiceTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /service-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
