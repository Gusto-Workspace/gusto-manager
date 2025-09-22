const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const ReceptionTemperature = require("../models/logs/reception-temperature.model");
const ReceptionDelivery = require("../models/logs/reception-delivery.model");

// CREATE RECEPTION TEMPERATURE
router.post(
  "/restaurants/:restaurantId/temperature-receptions",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const data = req.body;

      if (data.value !== undefined) {
        data.value = Number(data.value);
        if (Number.isNaN(data.value)) {
          return res.status(400).json({ error: "value doit être un nombre" });
        }
      }

      const doc = new ReceptionTemperature({ ...data, restaurantId });
      await doc.save();
      res.status(201).json(doc);
    } catch (err) {
      console.error("Erreur POST /temperature-receptions:", err);
      res.status(500).json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

// LIST RECEPTION TEMPERATURE (avec pagination + filtres date)
router.get(
  "/restaurants/:restaurantId/temperature-receptions",
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
          .populate("recordedBy", "firstName lastName"),
        ReceptionTemperature.countDocuments(q),
      ]);

      res.json({
        items,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Erreur GET /temperature-receptions:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

// READ ONE RECEPTION TEMPERATURE
router.get(
  "/restaurants/:restaurantId/temperature-receptions/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;

      const doc = await ReceptionTemperature.findOne({
        _id: tempId,
        restaurantId,
      })
        .populate("recordedBy", "firstName lastName")

      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      res.json(doc);
    } catch (err) {
      console.error("Erreur GET /temperature-receptions/:tempId:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

// UPDATE ONE RECEPTION TEMPERATURE
router.put(
  "/restaurants/:restaurantId/temperature-receptions/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const data = req.body;

      if (data.value !== undefined) {
        data.value = Number(data.value);
        if (Number.isNaN(data.value)) {
          return res.status(400).json({ error: "value doit être un nombre" });
        }
      }

      const doc = await ReceptionTemperature.findOneAndUpdate(
        { _id: tempId, restaurantId },
        { $set: data },
        { new: true }
      );

      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      res.json(doc);
    } catch (err) {
      console.error("Erreur PUT /temperature-receptions/:tempId:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

// DELETE ONE RECEPTION TEMPERATURE
router.delete(
  "/restaurants/:restaurantId/temperature-receptions/:tempId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;

      const doc = await ReceptionTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });

      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      res.json({ success: true });
    } catch (err) {
      console.error("Erreur DELETE /temperature-receptions/:tempId:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

// GET LIST DELIVERED RECEPTIONS FOR TEMPERATURE LINKING
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

      res.json({ items });
    } catch (err) {
      console.error("Erreur GET /reception-deliveries:", err);
      res.status(500).json({
        error: "Erreur lors de la récupération des réceptions",
      });
    }
  }
);
module.exports = router;
