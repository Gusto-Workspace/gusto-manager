const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const WasteEntry = require("../../models/logs/waste-entry.model");

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
const normNum = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normAttachments = (arr) => {
  if (!arr) return undefined;
  if (Array.isArray(arr)) {
    return arr
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return undefined;
};

function normalizeWaste(inData = {}) {
  return {
    date: normDate(inData.date) ?? undefined,
    wasteType: normStr(inData.wasteType) ?? undefined,
    weightKg: normNum(inData.weightKg) ?? undefined,
    unit: normStr(inData.unit) ?? undefined,
    disposalMethod: normStr(inData.disposalMethod) ?? undefined,
    contractor: normStr(inData.contractor) ?? null,
    manifestNumber: normStr(inData.manifestNumber) ?? null,
    notes: normStr(inData.notes) ?? null,
    attachments: normAttachments(inData.attachments),
  };
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/waste-entries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normalizeWaste(req.body);
      if (!body.wasteType)
        return res.status(400).json({ error: "wasteType requis" });
      if (body.weightKg == null)
        return res.status(400).json({ error: "weightKg requis" });
      if (!body.date) body.date = new Date();

      const doc = new WasteEntry({
        restaurantId,
        ...body,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /waste-entries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de l'entrée déchets" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres : waste_type, method (disposalMethod), date_from/date_to, q (texte)
// Pagination: page/limit
router.get(
  "/restaurants/:restaurantId/list-waste-entries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        waste_type,
        method,
        date_from,
        date_to,
        q,
      } = req.query;

      const query = { restaurantId };

      if (waste_type && String(waste_type).trim().length) {
        query.wasteType = String(waste_type).trim();
      }
      if (method && String(method).trim().length) {
        query.disposalMethod = String(method).trim();
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
        if (Object.keys(range).length) query.date = range;
      }

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { contractor: rx },
          { manifestNumber: rx },
          { notes: rx },
          { wasteType: rx },
          { disposalMethod: rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        WasteEntry.find(query)
          .sort({ date: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        WasteEntry.countDocuments(query),
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
      console.error("GET /list-waste-entries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des déchets" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/waste-entries/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Entrée déchets introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /waste-entries/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de l'entrée" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/waste-entries/:id",
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

      const prev = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Entrée déchets introuvable" });

      const patch = normalizeWaste(inData);

      // Si attachments a été explicitement fourni (même vide), on remplace
      if (Array.isArray(patch.attachments)) {
        prev.attachments = patch.attachments;
        delete patch.attachments;
      }

      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /waste-entries/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de l'entrée" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/waste-entries/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Entrée déchets introuvable" });

      await WasteEntry.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /waste-entries/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
