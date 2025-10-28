const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODELS
const FridgeTemperature = require("../../models/logs/fridge-temperature.model");

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
  const fields = [
    "fridgeName",
    "fridgeId",
    "location",
    "locationId",
    "value",
    "unit",
    "sensorIdentifier",
    "doorState",
    "note",
  ];
  for (const f of fields) {
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  }
  if (
    (prev?.createdAt?.getTime?.() ?? null) !==
    (next?.createdAt?.getTime?.() ?? null)
  )
    return true;
  return false;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/fridge-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      // validations légères
      if (!inData.fridgeName || !String(inData.fridgeName).trim()) {
        return res.status(400).json({ error: "fridgeName est requis" });
      }
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

      const doc = new FridgeTemperature({
        restaurantId,
        fridgeName: String(inData.fridgeName).trim(),
        fridgeId: normalizeStr(inData.fridgeId),
        location: normalizeStr(inData.location),
        locationId: normalizeStr(inData.locationId),
        value: numVal,
        unit: inData.unit === "°F" ? "°F" : "°C",
        sensorIdentifier: normalizeStr(inData.sensorIdentifier),
        doorState: ["open", "closed", "unknown"].includes(inData.doorState)
          ? inData.doorState
          : "unknown",
        recordedBy: currentUser, // snapshot auteur (owner ou employee)
        note: normalizeStr(inData.note),
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();

      // pas de populate nécessaire: recordedBy est un snapshot embarqué
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /fridge-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/fridge-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        date_from,
        date_to,
        q, // filtre texte libre
      } = req.query;

      const query = { restaurantId };

      // filtre date: createdAt
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

      // recherche texte (nom, emplacement, capteur, porte, note, opérateur)
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { fridgeName: rx },
          { fridgeId: rx },
          { location: rx },
          { locationId: rx },
          { note: rx },
          { sensorIdentifier: rx },
          { doorState: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        FridgeTemperature.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        FridgeTemperature.countDocuments(query),
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
      console.error("GET /fridge-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await FridgeTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      // empêche toute tentative de modifier recordedBy côté client
      delete inData.recordedBy;

      const prev = await FridgeTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      // normalisations
      const next = {
        fridgeName:
          inData.fridgeName !== undefined
            ? normalizeStr(inData.fridgeName)
            : prev.fridgeName,
        fridgeId:
          inData.fridgeId !== undefined
            ? normalizeStr(inData.fridgeId)
            : prev.fridgeId,
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
        sensorIdentifier:
          inData.sensorIdentifier !== undefined
            ? normalizeStr(inData.sensorIdentifier)
            : prev.sensorIdentifier,
        doorState:
          inData.doorState !== undefined &&
          ["open", "closed", "unknown"].includes(inData.doorState)
            ? inData.doorState
            : prev.doorState,
        note: inData.note !== undefined ? normalizeStr(inData.note) : prev.note,
        createdAt:
          inData.createdAt !== undefined
            ? normalizeDate(inData.createdAt) || prev.createdAt
            : prev.createdAt,
      };

      if (next.value !== undefined && Number.isNaN(next.value)) {
        return res.status(400).json({ error: "value doit être un nombre" });
      }
      if (!next.fridgeName) {
        return res.status(400).json({ error: "fridgeName est requis" });
      }

      const changed = hasBusinessChanges(prev, next);
      if (!changed) {
        return res.json(prev);
      }

      // apply
      prev.fridgeName = next.fridgeName;
      prev.fridgeId = next.fridgeId;
      prev.location = next.location;
      prev.locationId = next.locationId;
      prev.value = next.value;
      prev.unit = next.unit;
      prev.sensorIdentifier = next.sensorIdentifier;
      prev.doorState = next.doorState;
      prev.note = next.note;
      prev.createdAt = next.createdAt;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await FridgeTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
