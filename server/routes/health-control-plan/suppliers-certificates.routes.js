const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const SupplierCertificate = require("../../models/logs/supplier-certificate.model");

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
const normObjId = (v) => {
  if (!v) return null;
  const s = String(v);
  return Types.ObjectId.isValid(s) ? s : null;
};

function listSortExpr() {
  // Montre d'abord les certificats qui expirent le plus tôt, sinon par upload récent
  return { validUntil: 1, uploadedAt: -1, _id: -1 };
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/supplier-certificates",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const supplierId = normObjId(inData.supplierId);
      const supplierName = normStr(inData.supplierName);
      const type = normStr(inData.type);
      if (!type) return res.status(400).json({ error: "type est requis" });

      const doc = new SupplierCertificate({
        restaurantId,
        supplierId: supplierId ?? undefined,
        supplierName: supplierName ?? undefined,
        type,
        certificateNumber: normStr(inData.certificateNumber) ?? undefined,
        fileUrl: normStr(inData.fileUrl) ?? undefined,
        validFrom: normDate(inData.validFrom) ?? undefined,
        validUntil: normDate(inData.validUntil) ?? undefined,
        notes: normStr(inData.notes) ?? undefined,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /supplier-certificates:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du certificat" });
    }
  }
);

/* ------------------ LIST ------------------ */
// NB: filtre date_from/date_to appliqué sur validUntil (période d’expiration)
// status: "active" | "expired" | "expiring_soon" (nb jours paramétrable, défaut 30)
router.get(
  "/restaurants/:restaurantId/list-supplier-certificates",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        q,
        type,
        supplierId,
        status, // active|expired|expiring_soon
        soon_days = 30, // fenêtre "expiring_soon"
        date_from,
        date_to,
      } = req.query;

      const query = { restaurantId };

      // Filtres simples
      if (type && String(type).trim().length) query.type = String(type).trim();
      if (supplierId && normObjId(supplierId))
        query.supplierId = normObjId(supplierId);

      // Filtre status (calculable en base via dates)
      const now = new Date();
      const soon = new Date(now);
      soon.setDate(soon.getDate() + Number(soon_days || 30));

      if (status === "expired") {
        query.validUntil = { $lte: now };
      } else if (status === "active") {
        query.$or = [
          { validUntil: { $gt: now } },
          { validUntil: { $exists: false } },
        ];
      } else if (status === "expiring_soon") {
        query.validUntil = { $gt: now, $lte: soon };
      }

      // Intervalle de dates sur validUntil
      if (date_from || date_to) {
        const from = date_from ? normDate(date_from) : null;
        const to = date_to ? normDate(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        query.validUntil = {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {}),
          ...(query.validUntil || {}),
        };
      }

      // Recherche texte
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { supplierName: rx },
          { type: rx },
          { certificateNumber: rx },
          { notes: rx },
          { fileUrl: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        SupplierCertificate.find(query)
          .sort(listSortExpr())
          .skip(skip)
          .limit(Number(limit)),
        SupplierCertificate.countDocuments(query),
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
      console.error("GET /list-supplier-certificates:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des certificats" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/supplier-certificates/:certId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, certId } = req.params;
      const doc = await SupplierCertificate.findOne({
        _id: certId,
        restaurantId,
      });
      if (!doc)
        return res.status(404).json({ error: "Certificat introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /supplier-certificates/:certId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/supplier-certificates/:certId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, certId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await SupplierCertificate.findOne({
        _id: certId,
        restaurantId,
      });
      if (!prev)
        return res.status(404).json({ error: "Certificat introuvable" });

      const patch = {
        supplierId:
          inData.supplierId !== undefined
            ? normObjId(inData.supplierId)
            : prev.supplierId,
        supplierName:
          inData.supplierName !== undefined
            ? normStr(inData.supplierName)
            : prev.supplierName,
        type: inData.type !== undefined ? normStr(inData.type) : prev.type,
        certificateNumber:
          inData.certificateNumber !== undefined
            ? normStr(inData.certificateNumber)
            : prev.certificateNumber,
        fileUrl:
          inData.fileUrl !== undefined ? normStr(inData.fileUrl) : prev.fileUrl,
        validFrom:
          inData.validFrom !== undefined
            ? normDate(inData.validFrom)
            : prev.validFrom,
        validUntil:
          inData.validUntil !== undefined
            ? normDate(inData.validUntil)
            : prev.validUntil,
        notes: inData.notes !== undefined ? normStr(inData.notes) : prev.notes,
      };

      Object.assign(prev, patch);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /supplier-certificates/:certId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/supplier-certificates/:certId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, certId } = req.params;
      const doc = await SupplierCertificate.findOneAndDelete({
        _id: certId,
        restaurantId,
      });
      if (!doc)
        return res.status(404).json({ error: "Certificat introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /supplier-certificates/:certId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ------------------ DISTINCT (optionnels) ------------------ */
router.get(
  "/restaurants/:restaurantId/supplier-certificates/distinct/types",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await SupplierCertificate.aggregate([
        { $match: { restaurantId: new Types.ObjectId(String(restaurantId)) } },
        { $group: { _id: { type: "$type" }, count: { $sum: 1 } } },
        { $sort: { "_id.type": 1 } },
      ]);
      const items = rows.map((r) => ({
        type: r._id.type || "",
        count: r.count,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /supplier-certificates/distinct/types:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des types" });
    }
  }
);

module.exports = router;
