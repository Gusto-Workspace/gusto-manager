// server/routes/health-control-plan/oil-change.routes.js
const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const { Types } = mongoose;

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const OilChange = require("../../models/logs/oil-change.model");

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
function normalizeNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function normalizePercent(v) {
  const n = normalizeNumber(v);
  if (n == null) return null;
  // on borne 0..100 par sécurité
  return Math.max(0, Math.min(100, n));
}
function normalizeBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "on", "yes", "oui"].includes(s)) return true;
  if (["0", "false", "off", "no", "non"].includes(s)) return false;
  return null;
}
function normalizeObjectId(v) {
  if (!v) return null;
  const s = String(v);
  return Types.ObjectId.isValid(s) ? s : null;
}
/** True si au moins un champ métier a changé */
function hasBusinessChanges(prev, next) {
  const fields = [
    "fryerId",
    "qualityNotes",
    "disposalDocumentUrl",
    "litersRemoved",
    "tpmPercent",
    "filteredBeforeChange",
    "colorIndex",
    "odorCheck",
    "oilBrand",
  ];
  for (const f of fields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;

  const t1 = prev?.performedAt?.getTime?.() ?? null;
  const t2 = next?.performedAt?.getTime?.() ?? null;
  if (t1 !== t2) return true;

  const bn1 = prev?.newOilBatch?.batchNumber ?? null;
  const bn2 = next?.newOilBatch?.batchNumber ?? null;
  if (bn1 !== bn2) return true;

  const sid1 = String(prev?.newOilBatch?.supplier || "") || null;
  const sid2 = String(next?.newOilBatch?.supplier || "") || null;
  if (sid1 !== sid2) return true;

  return false;
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/oil-changes",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const fryerId = normalizeStr(inData.fryerId);
      const performedAt = normalizeDate(inData.performedAt) || new Date();
      const litersRemoved = normalizeNumber(inData.litersRemoved);
      const qualityNotes = normalizeStr(inData.qualityNotes);
      const disposalDocumentUrl = normalizeStr(inData.disposalDocumentUrl);

      const tpmPercent = normalizePercent(inData.tpmPercent);
      const filteredBeforeChange = normalizeBool(inData.filteredBeforeChange);
      const colorIndex = normalizeStr(inData.colorIndex);
      const odorCheck = normalizeStr(inData.odorCheck);
      const oilBrand = normalizeStr(inData.oilBrand);

      let newOilBatch = undefined;
      const batchNumber =
        normalizeStr(inData?.newOilBatch?.batchNumber) ??
        normalizeStr(inData?.batchNumber);
      const supplier =
        normalizeObjectId(inData?.newOilBatch?.supplier) ??
        normalizeObjectId(inData?.supplier);
      if (batchNumber || supplier) {
        newOilBatch = {
          ...(batchNumber ? { batchNumber } : {}),
          ...(supplier ? { supplier } : {}),
        };
      }

      const doc = new OilChange({
        restaurantId,
        fryerId: fryerId ?? undefined,
        performedAt,
        litersRemoved: litersRemoved ?? undefined,
        newOilBatch,
        qualityNotes: qualityNotes ?? undefined,
        disposalDocumentUrl: disposalDocumentUrl ?? undefined,
        tpmPercent: tpmPercent ?? undefined,
        filteredBeforeChange:
          filteredBeforeChange != null ? filteredBeforeChange : undefined,
        colorIndex: colorIndex ?? undefined,
        odorCheck: odorCheck ?? undefined,
        oilBrand: oilBrand ?? undefined,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /oil-changes:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de l'opération d'huile" });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-oil-changes",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q } = req.query;

      const query = { restaurantId };

      if (date_from || date_to) {
        query.performedAt = {};
        if (date_from) query.performedAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          query.performedAt.$lte = end;
        }
      }

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { fryerId: rx },
          { qualityNotes: rx },
          { disposalDocumentUrl: rx },
          { "newOilBatch.batchNumber": rx },
          { oilBrand: rx },
          { colorIndex: rx },
          { odorCheck: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        OilChange.find(query)
          .sort({ performedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        OilChange.countDocuments(query),
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
      console.error("GET /list-oil-changes:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des opérations" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/oil-changes/:oilId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, oilId } = req.params;
      const doc = await OilChange.findOne({ _id: oilId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Opération introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /oil-changes/:oilId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de l'opération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/oil-changes/:oilId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, oilId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await OilChange.findOne({ _id: oilId, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Opération introuvable" });

      const next = {
        fryerId:
          inData.fryerId !== undefined
            ? normalizeStr(inData.fryerId)
            : prev.fryerId,
        performedAt:
          inData.performedAt !== undefined
            ? normalizeDate(inData.performedAt) || prev.performedAt
            : prev.performedAt,
        litersRemoved:
          inData.litersRemoved !== undefined
            ? normalizeNumber(inData.litersRemoved)
            : prev.litersRemoved,
        qualityNotes:
          inData.qualityNotes !== undefined
            ? normalizeStr(inData.qualityNotes)
            : prev.qualityNotes,
        disposalDocumentUrl:
          inData.disposalDocumentUrl !== undefined
            ? normalizeStr(inData.disposalDocumentUrl)
            : prev.disposalDocumentUrl,

        tpmPercent:
          inData.tpmPercent !== undefined
            ? normalizePercent(inData.tpmPercent)
            : prev.tpmPercent,
        filteredBeforeChange:
          inData.filteredBeforeChange !== undefined
            ? normalizeBool(inData.filteredBeforeChange)
            : prev.filteredBeforeChange,
        colorIndex:
          inData.colorIndex !== undefined
            ? normalizeStr(inData.colorIndex)
            : prev.colorIndex,
        odorCheck:
          inData.odorCheck !== undefined
            ? normalizeStr(inData.odorCheck)
            : prev.odorCheck,
        oilBrand:
          inData.oilBrand !== undefined
            ? normalizeStr(inData.oilBrand)
            : prev.oilBrand,

        newOilBatch:
          inData.newOilBatch !== undefined ||
          inData.batchNumber !== undefined ||
          inData.supplier !== undefined
            ? (() => {
                const bn =
                  normalizeStr(inData?.newOilBatch?.batchNumber) ??
                  normalizeStr(inData?.batchNumber);
                const sid =
                  normalizeObjectId(inData?.newOilBatch?.supplier) ??
                  normalizeObjectId(inData?.supplier);
                if (bn || sid)
                  return {
                    ...(bn ? { batchNumber: bn } : {}),
                    ...(sid ? { supplier: sid } : {}),
                  };
                return undefined; // efface si pas d'info
              })()
            : prev.newOilBatch,
      };

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      prev.fryerId = next.fryerId ?? undefined;
      prev.performedAt = next.performedAt;
      prev.litersRemoved = next.litersRemoved ?? undefined;
      prev.qualityNotes = next.qualityNotes ?? undefined;
      prev.disposalDocumentUrl = next.disposalDocumentUrl ?? undefined;

      prev.tpmPercent = next.tpmPercent ?? undefined;
      prev.filteredBeforeChange =
        next.filteredBeforeChange != null
          ? next.filteredBeforeChange
          : prev.filteredBeforeChange;
      prev.colorIndex = next.colorIndex ?? undefined;
      prev.odorCheck = next.odorCheck ?? undefined;
      prev.oilBrand = next.oilBrand ?? undefined;

      prev.newOilBatch = next.newOilBatch;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /oil-changes/:oilId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de l'opération" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/oil-changes/:oilId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, oilId } = req.params;
      const doc = await OilChange.findOneAndDelete({
        _id: oilId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Opération introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /oil-changes/:oilId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de l'opération" });
    }
  }
);

/* ------------------ DISTINCT FRITEUSES (optionnel) ------------------ */
router.get(
  "/restaurants/:restaurantId/oil-changes/distinct/fryers",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await OilChange.aggregate([
        { $match: { restaurantId: new Types.ObjectId(String(restaurantId)) } },
        {
          $group: {
            _id: { fryerId: "$fryerId" },
            count: { $sum: 1 },
            lastAt: { $max: "$performedAt" },
          },
        },
        { $sort: { "_id.fryerId": 1 } },
      ]);
      const items = rows.map((r) => ({
        fryerId: r._id.fryerId || "",
        count: r.count,
        lastAt: r.lastAt,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /oil-changes/distinct/fryers:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des friteuses" });
    }
  }
);

module.exports = router;
