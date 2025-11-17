const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const authenticateToken = require("../../middleware/authentificate-token");
const Calibration = require("../../models/logs/calibration.model");

/* ---------- helpers ---------- */
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

/* ---------- LIST ---------- */
// Filtres supportés : q (texte), type (deviceType), status (all|overdue|due_soon|ok),
// date_from/date_to (sur calibratedAt), due_within_days (fenêtre "due_soon", défaut 14)
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
        type,
        status = "all",
        date_from,
        date_to,
        due_within_days,
      } = req.query;

      const query = { restaurantId };

      // recherche texte
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { deviceIdentifier: rx },
          { deviceType: rx },
          { method: rx },
          { provider: rx },
          { notes: rx },
        ];
      }

      // filtre type
      if (type && String(type).trim().length) {
        query.deviceType = String(type).trim();
      }

      // range sur calibratedAt
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

      // statut basé sur nextCalibrationDue
      const now = new Date();
      const soonDays = Math.max(
        1,
        Math.min(90, parseInt(due_within_days, 10) || 14)
      );
      const soonLimit = new Date(now);
      soonLimit.setDate(soonLimit.getDate() + soonDays);

      if (status === "overdue") {
        query.nextCalibrationDue = { $ne: null, $lt: now };
      } else if (status === "due_soon") {
        query.nextCalibrationDue = { $ne: null, $gte: now, $lte: soonLimit };
      } else if (status === "ok") {
        // "ok" = soit pas d'échéance, soit > soonLimit
        query.$or = [
          { nextCalibrationDue: null },
          { nextCalibrationDue: { $gt: soonLimit } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        Calibration.find(query)
          .sort({ calibratedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Calibration.countDocuments(query),
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
