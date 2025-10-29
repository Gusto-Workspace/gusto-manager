const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const InventoryLot = require("../../models/logs/inventory-lot.model");

/* --------- ARRONDI (helper local au fichier) --------- */
function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0; // unités comptées
  return 3; // kg, g, L, mL -> 3 décimales
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

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
function normalizeNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function normalizeAllergens(v) {
  if (Array.isArray(v)) return v.map((a) => normalizeStr(a)).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}
function clampQtyRemaining(qtyRemaining, qtyReceived) {
  const q = Number.isFinite(Number(qtyRemaining)) ? Number(qtyRemaining) : 0;
  const r = Number.isFinite(Number(qtyReceived)) ? Number(qtyReceived) : 0;
  return Math.max(0, Math.min(q, r));
}

const PACKAGING = new Set(["compliant", "non-compliant"]);
const STATUS = new Set([
  "in_stock",
  "used",
  "expired",
  "discarded",
  "returned",
  "recalled",
]);

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/inventory-lots",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const productName = normalizeStr(inData.productName);
      const lotNumber = normalizeStr(inData.lotNumber);
      const unit = normalizeStr(inData.unit);
      const qtyReceivedRaw = normalizeNumber(inData.qtyReceived);

      if (!productName)
        return res.status(400).json({ error: "productName est requis" });
      if (!lotNumber)
        return res.status(400).json({ error: "lotNumber est requis" });
      if (!unit) return res.status(400).json({ error: "unit est requis" });
      if (qtyReceivedRaw == null)
        return res.status(400).json({ error: "qtyReceived est requis" });

      const qtyReceived = roundByUnit(qtyReceivedRaw, unit);

      const initialRemainingCandidate =
        normalizeNumber(inData.qtyRemaining) != null
          ? normalizeNumber(inData.qtyRemaining)
          : qtyReceived;
      const qtyRemainingRounded = roundByUnit(initialRemainingCandidate, unit);
      const qtyRemaining = clampQtyRemaining(qtyRemainingRounded, qtyReceived);

      const doc = new InventoryLot({
        restaurantId,
        receptionId: inData.receptionId ? inData.receptionId : undefined,

        productName,
        supplier: normalizeStr(inData.supplier),

        lotNumber,
        dlc: normalizeDate(inData.dlc),
        ddm: normalizeDate(inData.ddm),
        allergens: normalizeAllergens(inData.allergens),

        qtyReceived,
        qtyRemaining,
        unit,

        tempOnArrival: normalizeNumber(inData.tempOnArrival),
        packagingCondition: PACKAGING.has(inData.packagingCondition)
          ? inData.packagingCondition
          : "compliant",

        storageArea: normalizeStr(inData.storageArea),
        openedAt: normalizeDate(inData.openedAt),
        internalUseBy: normalizeDate(inData.internalUseBy),

        status: STATUS.has(inData.status) ? inData.status : "in_stock",
        disposalReason: normalizeStr(inData.disposalReason),

        labelCode: normalizeStr(inData.labelCode),
        notes: normalizeStr(inData.notes),

        createdBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /inventory-lots:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du lot" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/list-inventory-lots",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q, status } = req.query;

      const query = { restaurantId };

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

      if (status && STATUS.has(String(status))) query.status = String(status);

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { productName: rx },
          { supplier: rx },
          { lotNumber: rx },
          { unit: rx },
          { storageArea: rx },
          { status: rx },
          { labelCode: rx },
          { notes: rx },
          { disposalReason: rx },
          { "createdBy.firstName": rx },
          { "createdBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        InventoryLot.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        InventoryLot.countDocuments(query),
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
      console.error("GET /list-inventory-lots:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des lots" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/inventory-lots/:lotId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, lotId } = req.params;
      const doc = await InventoryLot.findOne({ _id: lotId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Lot introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /inventory-lots/:lotId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du lot" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/inventory-lots/:lotId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, lotId } = req.params;
      const inData = { ...req.body };

      delete inData.createdBy;
      delete inData.restaurantId;

      const prev = await InventoryLot.findOne({ _id: lotId, restaurantId });
      if (!prev) return res.status(404).json({ error: "Lot introuvable" });

      // unité finale (pour arrondir correctement)
      const nextUnit =
        inData.unit !== undefined ? normalizeStr(inData.unit) : prev.unit;

      // compute + round + clamp
      const nextQtyReceivedRaw =
        inData.qtyReceived !== undefined
          ? normalizeNumber(inData.qtyReceived)
          : prev.qtyReceived;
      const nextQtyRemainingRaw =
        inData.qtyRemaining !== undefined
          ? normalizeNumber(inData.qtyRemaining)
          : prev.qtyRemaining;

      const nextQtyReceived = roundByUnit(nextQtyReceivedRaw, nextUnit);
      let nextQtyRemaining = roundByUnit(nextQtyRemainingRaw, nextUnit);
      nextQtyRemaining = clampQtyRemaining(nextQtyRemaining, nextQtyReceived);

      const next = {
        receptionId:
          inData.receptionId !== undefined
            ? inData.receptionId
            : prev.receptionId,
        productName:
          inData.productName !== undefined
            ? normalizeStr(inData.productName)
            : prev.productName,
        supplier:
          inData.supplier !== undefined
            ? normalizeStr(inData.supplier)
            : prev.supplier,
        lotNumber:
          inData.lotNumber !== undefined
            ? normalizeStr(inData.lotNumber)
            : prev.lotNumber,
        dlc:
          inData.dlc !== undefined
            ? normalizeDate(inData.dlc) || null
            : prev.dlc,
        ddm:
          inData.ddm !== undefined
            ? normalizeDate(inData.ddm) || null
            : prev.ddm,
        allergens:
          inData.allergens !== undefined
            ? normalizeAllergens(inData.allergens)
            : prev.allergens,

        qtyReceived: nextQtyReceived,
        qtyRemaining: nextQtyRemaining,

        unit: nextUnit,
        tempOnArrival:
          inData.tempOnArrival !== undefined
            ? normalizeNumber(inData.tempOnArrival)
            : prev.tempOnArrival,
        packagingCondition:
          inData.packagingCondition !== undefined
            ? PACKAGING.has(inData.packagingCondition)
              ? inData.packagingCondition
              : prev.packagingCondition
            : prev.packagingCondition,
        storageArea:
          inData.storageArea !== undefined
            ? normalizeStr(inData.storageArea)
            : prev.storageArea,
        openedAt:
          inData.openedAt !== undefined
            ? normalizeDate(inData.openedAt) || null
            : prev.openedAt,
        internalUseBy:
          inData.internalUseBy !== undefined
            ? normalizeDate(inData.internalUseBy) || null
            : prev.internalUseBy,

        status:
          inData.status !== undefined
            ? STATUS.has(inData.status)
              ? inData.status
              : prev.status
            : prev.status,
        disposalReason:
          inData.disposalReason !== undefined
            ? normalizeStr(inData.disposalReason)
            : prev.disposalReason,

        labelCode:
          inData.labelCode !== undefined
            ? normalizeStr(inData.labelCode)
            : prev.labelCode,
        notes:
          inData.notes !== undefined ? normalizeStr(inData.notes) : prev.notes,
      };

      if (!next.productName)
        return res.status(400).json({ error: "productName est requis" });
      if (!next.lotNumber)
        return res.status(400).json({ error: "lotNumber est requis" });
      if (!next.unit) return res.status(400).json({ error: "unit est requis" });
      if (next.qtyReceived == null)
        return res.status(400).json({ error: "qtyReceived est requis" });

      Object.assign(prev, next);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /inventory-lots/:lotId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du lot" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/inventory-lots/:lotId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, lotId } = req.params;
      const doc = await InventoryLot.findOneAndDelete({
        _id: lotId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Lot introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /inventory-lots/:lotId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du lot" });
    }
  }
);

module.exports = router;
