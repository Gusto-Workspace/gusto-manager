const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

const ReceptionTemperature = require("../../models/logs/reception-temperature.model");
const ReceptionDelivery = require("../../models/logs/reception-delivery.model");

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
function normalizeId(v) {
  return v == null ? null : String(v);
}
function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
/** True si au moins un champ métier a changé */
function hasBusinessChanges(prev, next) {
  const fields = ["value", "unit", "packagingCondition", "note"];
  for (const f of fields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  if (normalizeId(prev?.receptionId) !== normalizeId(next?.receptionId))
    return true;
  if (normalizeDate(prev?.receivedAt) !== normalizeDate(next?.receivedAt))
    return true;
  return false;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/reception-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const data = { ...req.body };

      if (data.value !== undefined) {
        data.value = Number(data.value);
        if (Number.isNaN(data.value)) {
          return res.status(400).json({ error: "value doit être un nombre" });
        }
      }
      if (data.receivedAt) data.receivedAt = new Date(data.receivedAt);

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const doc = new ReceptionTemperature({
        ...data,
        restaurantId,
        recordedBy: currentUser, // snapshot auteur
      });

      await doc.save();
      
      await doc.populate({
        path: "receptionId",
        select: "receivedAt supplier",
        model: "ReceptionDelivery",
      });

      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /reception-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/reception-temperatures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to } = req.query;

      const q = { restaurantId };
      if (date_from || date_to) {
        q.receivedAt = {};
        if (date_from) q.receivedAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          q.receivedAt.$lte = end;
        }
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        ReceptionTemperature.find(q)
          .sort({ receivedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate({
            path: "receptionId",
            select: "receivedAt supplier",
            model: "ReceptionDelivery",
          }),
        ReceptionTemperature.countDocuments(q),
      ]);

      return res.json({
        items,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (err) {
      console.error("GET /reception-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/reception-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await ReceptionTemperature.findOne({
        _id: tempId,
        restaurantId,
      }).populate({
        path: "receptionId",
        select: "receivedAt supplier",
        model: "ReceptionDelivery",
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /reception-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/reception-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      // empêche toute tentative de modifier recordedBy côté client
      delete inData.recordedBy;

      // Normalisation du champ de liaison
      const hasReceptionId = Object.prototype.hasOwnProperty.call(
        inData,
        "receptionId"
      );
      if (
        hasReceptionId &&
        (inData.receptionId === "" || inData.receptionId === null)
      ) {
        inData.receptionId = null;
      }

      if (inData.value !== undefined) {
        inData.value = Number(inData.value);
        if (Number.isNaN(inData.value)) {
          return res.status(400).json({ error: "value doit être un nombre" });
        }
      }
      if (inData.receivedAt) inData.receivedAt = new Date(inData.receivedAt);

      const prev = await ReceptionTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      const next = {
        value: inData.value !== undefined ? inData.value : prev.value,
        unit: inData.unit !== undefined ? inData.unit : prev.unit,
        packagingCondition:
          inData.packagingCondition !== undefined
            ? inData.packagingCondition
            : prev.packagingCondition,
        note: inData.note !== undefined ? inData.note : prev.note,
        receptionId: hasReceptionId ? inData.receptionId : prev.receptionId,
        receivedAt:
          inData.receivedAt !== undefined ? inData.receivedAt : prev.receivedAt,
      };

      const changed = hasBusinessChanges(prev, next);
      if (!changed) {
        // renvoyer aussi peuplé pour cohérence UI
        await prev.populate({
          path: "receptionId",
          select: "receivedAt supplier",
        });
        return res.json(prev);
      }

      prev.value = next.value;
      prev.unit = next.unit;
      prev.packagingCondition = next.packagingCondition;
      prev.note = next.note;
      prev.receptionId = next.receptionId;
      prev.receivedAt = next.receivedAt;

      await prev.save();
      await prev.populate({
        path: "receptionId",
        select: "receivedAt supplier",
      }); // 👈 populate retour
      return res.json(prev);
    } catch (err) {
      console.error("PUT /reception-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/reception-temperatures/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await ReceptionTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /reception-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

/* -------------------- RECEPTIONS LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/reception-deliveries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { limit = 50 } = req.query;

      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
      const items = await ReceptionDelivery.find({ restaurantId })
        .sort({ receivedAt: -1 })
        .limit(safeLimit)
        .select("_id receivedAt supplier note");

      return res.json({ items });
    } catch (err) {
      console.error("GET /reception-deliveries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des réceptions" });
    }
  }
);

module.exports = router;
