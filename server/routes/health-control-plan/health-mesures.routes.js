const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const HealthMeasure = require("../../models/logs/health-measure.model");

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
const normAttachments = (arr) => {
  if (!arr) return undefined;
  if (Array.isArray(arr))
    return arr
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 50);
  return undefined;
};
function normalize(inData = {}) {
  return {
    type: normStr(inData.type) ?? undefined,
    performedAt: normDate(inData.performedAt) ?? undefined,
    notes: normStr(inData.notes) ?? null,
    attachments: normAttachments(inData.attachments),
  };
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/health-measures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normalize(req.body);
      const doc = new HealthMeasure({
        restaurantId,
        ...body,
        createdBy: currentUser,
      });
      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /health-measures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la mesure" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres: type, date_from/date_to, q (notes/attachments/type), pagination
router.get(
  "/restaurants/:restaurantId/list-health-measures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, type, date_from, date_to, q } = req.query;

      const query = { restaurantId };

      if (type && String(type).trim().length) query.type = String(type).trim();

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
        if (Object.keys(range).length) query.performedAt = range;
      }

      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        query.$or = [{ notes: rx }, { attachments: rx }, { type: rx }];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        HealthMeasure.find(query)
          .sort({ performedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        HealthMeasure.countDocuments(query),
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
      console.error("GET /list-health-measures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des mesures" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Mesure introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /health-measures/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      // champs protégés
      delete inData.createdBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;

      const prev = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!prev) return res.status(404).json({ error: "Mesure introuvable" });

      const patch = normalize(inData);

      // si attachments explicitement fournis (même vide) → remplace
      if (Array.isArray(patch.attachments)) {
        prev.attachments = patch.attachments;
        delete patch.attachments;
      }

      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /health-measures/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la mesure" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Mesure introuvable" });

      await HealthMeasure.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /health-measures/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
