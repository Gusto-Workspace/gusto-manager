const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const authenticateToken = require("../../middleware/authentificate-token");
const Calibration = require("../../models/logs/calibration.model");

/* ---------- helpers ---------- */
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
const normStr = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const normDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
function normCalibration(inData = {}) {
  return {
    deviceIdentifier: normStr(inData.deviceIdentifier) ?? undefined,
    deviceType: normStr(inData.deviceType) ?? undefined,
    calibratedAt: normDate(inData.calibratedAt) ?? undefined,
    nextCalibrationDue: normDate(inData.nextCalibrationDue) ?? undefined,
    method: normStr(inData.method) ?? undefined,
    certificateUrl: normStr(inData.certificateUrl) ?? undefined,
    provider: normStr(inData.provider) ?? undefined,
    notes: normStr(inData.notes) ?? undefined,
  };
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/calibrations",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normCalibration(req.body);
      if (!body.deviceIdentifier)
        return res.status(400).json({ error: "deviceIdentifier requis" });
      if (!body.calibratedAt)
        return res.status(400).json({ error: "calibratedAt requis" });

      const doc = new Calibration({
        restaurantId,
        ...body,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /calibrations:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la calibration" });
    }
  }
);

router.get(
  "/restaurants/:restaurantId/list-calibrations",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        q,
        status = "all",
        date_from,
        date_to,
        soon_days = 14,
      } = req.query;

      const query = { restaurantId };

      // Recherche texte sécurisée
      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        query.$or = [
          { deviceIdentifier: rx },
          { deviceType: rx },
          { method: rx },
          { provider: rx },
          { notes: rx },
          { certificateUrl: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      // Dates calibratedAt
      if (date_from || date_to) {
        const from = normDate(date_from);
        const to = normDate(date_to);
        const range = {};
        if (from) range.$gte = from;
        if (to) {
          const end = new Date(to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          range.$lte = end;
        }
        if (Object.keys(range).length) query.calibratedAt = range;
      }

      // Statut basé sur nextCalibrationDue
      const now = new Date();
      const days = Math.max(1, Math.min(90, Number(soon_days) || 14));
      const soonLimit = new Date(now);
      soonLimit.setDate(soonLimit.getDate() + days);

      if (status === "overdue") {
        query.nextCalibrationDue = { $lt: now, $ne: null };
      } else if (status === "due_soon") {
        query.nextCalibrationDue = { $gte: now, $lte: soonLimit };
      } else if (status === "ok") {
        query.$or = [
          { nextCalibrationDue: null },
          { nextCalibrationDue: { $gt: soonLimit } },
        ];
      }

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await Promise.all([
        Calibration.find(query)
          .sort({ calibratedAt: -1, _id: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Calibration.countDocuments(query),
      ]);

      return res.json({
        items,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum)),
        },
      });
    } catch (err) {
      console.error("GET /list-calibrations:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des calibrations" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/calibrations/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Calibration.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Calibration introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /calibrations/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/calibrations/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      // champs protégés
      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;

      const prev = await Calibration.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Calibration introuvable" });

      // normalise
      const patch = normCalibration(inData);

      // mise à jour
      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();

      return res.json(prev);
    } catch (err) {
      console.error("PUT /calibrations/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la calibration" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/calibrations/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;

      const doc = await Calibration.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Calibration introuvable" });

      await Calibration.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /calibrations/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
