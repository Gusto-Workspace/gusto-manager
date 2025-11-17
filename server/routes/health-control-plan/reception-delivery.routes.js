const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const ReceptionDelivery = require("../../models/logs/reception-delivery.model");

/* --------- helpers --------- */
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

const ALLOWED_PACKAGING = new Set(["compliant", "non-compliant"]);

function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0;
  return 3;
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function normalizeLine(l = {}) {
  const productName = normalizeStr(l.productName);
  const supplierProductId = normalizeStr(l.supplierProductId);
  const lotNumber = normalizeStr(l.lotNumber);
  const dlc = normalizeDate(l.dlc);
  const ddm = normalizeDate(l.ddm);
  const qty = normalizeNumber(l.qty);
  const unit = normalizeStr(l.unit);
  const tempOnArrival = normalizeNumber(l.tempOnArrival);
  let allergens = Array.isArray(l.allergens)
    ? l.allergens
    : typeof l.allergens === "string"
      ? l.allergens
          .split(/[;,]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  allergens = allergens
    .map((a) => normalizeStr(a))
    .filter((a) => a && a.length);

  const packagingCondition = ALLOWED_PACKAGING.has(l.packagingCondition)
    ? l.packagingCondition
    : "compliant";

  // NOUVEAU : qtyRemaining normalisée et bornée à [0, qty]
  let qtyRemaining = normalizeNumber(l.qtyRemaining);
  if (qty != null) {
    const qrRaw = qtyRemaining == null ? qty : qtyRemaining;
    const roundedQty = roundByUnit(qty, unit);
    const roundedRemaining = roundByUnit(qrRaw, unit);
    qtyRemaining = Math.max(0, Math.min(roundedRemaining, roundedQty));
  } else {
    // si pas de qty, on ignore qtyRemaining (incohérent)
    qtyRemaining = undefined;
  }

  return {
    productName: productName ?? undefined,
    supplierProductId: supplierProductId ?? undefined,
    lotNumber: lotNumber ?? undefined,
    dlc: dlc ?? undefined,
    ddm: ddm ?? undefined,
    qty: qty != null ? roundByUnit(qty, unit) : undefined,
    unit: unit ?? undefined,
    tempOnArrival: tempOnArrival ?? undefined,
    allergens,
    packagingCondition,
    qtyRemaining,
  };
}

function isMeaningfulLine(x = {}) {
  return Boolean(
    x.productName ||
      x.supplierProductId ||
      x.lotNumber ||
      x.dlc ||
      x.ddm ||
      x.qty != null ||
      x.unit ||
      x.tempOnArrival != null ||
      (Array.isArray(x.allergens) && x.allergens.length > 0)
  );
}

function normalizeLines(inLines) {
  const arr = Array.isArray(inLines) ? inLines : [];
  return arr.map(normalizeLine).filter(isMeaningfulLine);
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/reception-deliveries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const supplier = normalizeStr(inData.supplier);
      if (!supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const receivedAt = normalizeDate(inData.receivedAt) || new Date();
      const note = normalizeStr(inData.note);
      const billUrl = normalizeStr(inData.billUrl);

      const lines = normalizeLines(inData.lines);

      const doc = new ReceptionDelivery({
        restaurantId,
        supplier,
        receivedAt,
        lines,
        recordedBy: currentUser,
        note: note ?? undefined,
        billUrl: billUrl ?? undefined,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /reception-deliveries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la réception" });
    }
  }
);

/* -------------------- LIST -------------------- */
router.get(
  "/restaurants/:restaurantId/list-reception-deliveries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q } = req.query;

      const query = { restaurantId };

      if (date_from || date_to) {
        query.receivedAt = {};
        if (date_from) query.receivedAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          query.receivedAt.$lte = end;
        }
      }

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { supplier: rx },
          { note: rx },
          { billUrl: rx },
          { "lines.productName": rx },
          { "lines.supplierProductId": rx },
          { "lines.lotNumber": rx },
          { "lines.unit": rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        ReceptionDelivery.find(query)
          .sort({ receivedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        ReceptionDelivery.countDocuments(query),
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
      console.error("GET /reception-deliveries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des réceptions" });
    }
  }
);

/* -------------------- READ ONE -------------------- */
router.get(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const doc = await ReceptionDelivery.findOne({
        _id: receptionId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Réception introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de la réception" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await ReceptionDelivery.findOne({
        _id: receptionId,
        restaurantId,
      });
      if (!prev)
        return res.status(404).json({ error: "Réception introuvable" });

      const supplier =
        inData.supplier !== undefined
          ? normalizeStr(inData.supplier)
          : prev.supplier;

      if (!supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const receivedAt =
        inData.receivedAt !== undefined
          ? normalizeDate(inData.receivedAt) || prev.receivedAt
          : prev.receivedAt;

      const note =
        inData.note !== undefined ? normalizeStr(inData.note) : prev.note;

      const billUrl =
        inData.billUrl !== undefined
          ? normalizeStr(inData.billUrl)
          : prev.billUrl;

      const lines =
        inData.lines !== undefined
          ? normalizeLines(inData.lines)
          : prev.lines || [];

      prev.supplier = supplier;
      prev.receivedAt = receivedAt;
      prev.note = note ?? undefined;
      prev.billUrl = billUrl ?? undefined;
      prev.lines = lines;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la réception" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const doc = await ReceptionDelivery.findOneAndDelete({
        _id: receptionId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Réception introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de la réception" });
    }
  }
);

module.exports = router;
