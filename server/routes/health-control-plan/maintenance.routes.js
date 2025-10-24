const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const Maintenance = require("../../models/logs/maintenance.model");

/* ---------- helpers ---------- */
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
function normProofs(v) {
  if (Array.isArray(v)) {
    return v
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/maintenance",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const user = currentUserFromToken(req);
      if (!user)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const b = req.body || {};
      const equipment = normStr(b.equipment);
      const performedAt = normDate(b.performedAt) || new Date();
      if (!equipment)
        return res.status(400).json({ error: "equipment requis" });

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];

      const doc = new Maintenance({
        restaurantId,
        equipment,
        equipmentId: normStr(b.equipmentId) ?? undefined,
        type: allowedTypes.includes(b.type) ? b.type : "inspection",
        performedAt,
        nextDue: normDate(b.nextDue) ?? undefined,

        // (retiré) usedBatchId / quantity / unit

        provider: normStr(b.provider) ?? undefined,
        notes: normStr(b.notes) ?? undefined,
        proofUrls: normProofs(b.proofUrls),

        recordedBy: user,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /maintenance:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la maintenance" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres: q, type, status(all|overdue|due_soon|ok), date_from/date_to (sur performedAt), due_within_days (défaut 14)
router.get(
  "/restaurants/:restaurantId/list-maintenance",
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

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { equipment: rx },
          { equipmentId: rx },
          { type: rx },
          { provider: rx },
          { notes: rx },
        ];
      }

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];
      if (type && allowedTypes.includes(type)) {
        query.type = type;
      }

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

      // statut via nextDue
      const now = new Date();
      const soonDays = Math.max(
        1,
        Math.min(90, parseInt(due_within_days, 10) || 14)
      );
      const soonLimit = new Date(now);
      soonLimit.setDate(soonLimit.getDate() + soonDays);

      if (status === "overdue") {
        query.nextDue = { $ne: null, $lt: now };
      } else if (status === "due_soon") {
        query.nextDue = { $ne: null, $gte: now, $lte: soonLimit };
      } else if (status === "ok") {
        query.$or = [{ nextDue: null }, { nextDue: { $gt: soonLimit } }];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        Maintenance.find(query)
          .sort({ performedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Maintenance.countDocuments(query),
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
      console.error("GET /list-maintenance:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des maintenances" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /maintenance/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;

      const prev = await Maintenance.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Maintenance introuvable" });

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];

      const patch = {
        equipment:
          inData.equipment !== undefined
            ? normStr(inData.equipment)
            : prev.equipment,
        equipmentId:
          inData.equipmentId !== undefined
            ? normStr(inData.equipmentId)
            : prev.equipmentId,
        type:
          inData.type !== undefined && allowedTypes.includes(inData.type)
            ? inData.type
            : prev.type,
        performedAt:
          inData.performedAt !== undefined
            ? normDate(inData.performedAt) || prev.performedAt
            : prev.performedAt,
        nextDue:
          inData.nextDue !== undefined
            ? normDate(inData.nextDue)
            : prev.nextDue,

        // (retiré) usedBatchId / quantity / unit

        provider:
          inData.provider !== undefined
            ? normStr(inData.provider)
            : prev.provider,
        notes: inData.notes !== undefined ? normStr(inData.notes) : prev.notes,
        proofUrls:
          inData.proofUrls !== undefined
            ? normProofs(inData.proofUrls)
            : prev.proofUrls,
      };

      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /maintenance/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la maintenance" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });

      await Maintenance.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /maintenance/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
