const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const ReceptionDelivery = require("../../models/logs/reception-delivery.model");

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
function cleanAllergens(v) {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
function cleanPackagingCondition(v) {
  const allowed = ["ok", "damaged", "wet", "unknown"];
  return allowed.includes(v) ? v : "unknown";
}
function cleanLine(l) {
  if (!l || typeof l !== "object") return null;
  const out = {
    productName: normalizeStr(l.productName),
    supplierProductId: normalizeStr(l.supplierProductId),
    lotNumber: normalizeStr(l.lotNumber),
    dlc: normalizeDate(l.dlc),
    ddm: normalizeDate(l.ddm),
    qty: l.qty == null ? null : Number(l.qty),
    unit: normalizeStr(l.unit),
    tempOnArrival: l.tempOnArrival == null ? null : Number(l.tempOnArrival),
    allergens: cleanAllergens(l.allergens),
    packagingCondition: cleanPackagingCondition(l.packagingCondition),
  };
  // Si rien d'utile -> ignorer
  const hasSignal =
    out.productName ||
    out.supplierProductId ||
    out.lotNumber ||
    out.qty != null ||
    out.unit ||
    out.dlc ||
    out.ddm ||
    out.tempOnArrival != null ||
    (out.allergens && out.allergens.length);
  return hasSignal ? out : null;
}
function cleanLines(lines) {
  const src = Array.isArray(lines) ? lines : [];
  const cleaned = src.map(cleanLine).filter(Boolean);
  return cleaned;
}
function hasBusinessChanges(prev, next) {
  // comparaison simple sur champs racine + JSON des lignes
  const rootFields = ["supplier", "note", "billUrl"];
  for (const f of rootFields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;

  const t1 = prev?.receivedAt?.getTime?.() ?? null;
  const t2 = next?.receivedAt?.getTime?.() ?? null;
  if (t1 !== t2) return true;

  const a = JSON.stringify(prev?.lines || []);
  const b = JSON.stringify(next?.lines || []);
  return a !== b;
}

/* -------------------- CREATE -------------------- */
router.post(
  "/restaurants/:restaurantId/reception-deliveries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const supplier = normalizeStr(inData.supplier);
      if (!supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const lines = cleanLines(inData.lines);
      if (!lines.length)
        return res
          .status(400)
          .json({ error: "Au moins une ligne valide est requise" });

      // Valide numéros
      for (const l of lines) {
        if (l.qty != null && Number.isNaN(l.qty)) {
          return res.status(400).json({ error: "qty doit être un nombre" });
        }
        if (l.tempOnArrival != null && Number.isNaN(l.tempOnArrival)) {
          return res
            .status(400)
            .json({ error: "tempOnArrival doit être un nombre" });
        }
      }

      const doc = new ReceptionDelivery({
        restaurantId,
        supplier,
        receivedAt: normalizeDate(inData.receivedAt) || new Date(),
        lines,
        recordedBy: currentUser, // snapshot auteur
        note: normalizeStr(inData.note),
        billUrl: normalizeStr(inData.billUrl) || null, // pas d'upload pour l'instant
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
  "/restaurants/:restaurantId/reception-deliveries",
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
          { "lines.productName": rx },
          { "lines.lotNumber": rx },
          { "lines.unit": rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        ReceptionDelivery.find(query)
          .sort({ receivedAt: -1 })
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
  "/restaurants/:restaurantId/reception-deliveries/:recId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, recId } = req.params;
      const doc = await ReceptionDelivery.findOne({ _id: recId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Réception introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /reception-deliveries/:recId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de la réception" });
    }
  }
);

/* -------------------- UPDATE -------------------- */
router.put(
  "/restaurants/:restaurantId/reception-deliveries/:recId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, recId } = req.params;
      const inData = { ...req.body };

      // Le client ne doit pas modifier recordedBy
      delete inData.recordedBy;

      const prev = await ReceptionDelivery.findOne({ _id: recId, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Réception introuvable" });

      const nextLines =
        inData.lines !== undefined ? cleanLines(inData.lines) : prev.lines;
      if (!nextLines.length) {
        return res
          .status(400)
          .json({ error: "Au moins une ligne valide est requise" });
      }
      for (const l of nextLines) {
        if (l.qty != null && Number.isNaN(l.qty)) {
          return res.status(400).json({ error: "qty doit être un nombre" });
        }
        if (l.tempOnArrival != null && Number.isNaN(l.tempOnArrival)) {
          return res
            .status(400)
            .json({ error: "tempOnArrival doit être un nombre" });
        }
      }

      const next = {
        supplier:
          inData.supplier !== undefined
            ? normalizeStr(inData.supplier)
            : prev.supplier,
        receivedAt:
          inData.receivedAt !== undefined
            ? normalizeDate(inData.receivedAt) || prev.receivedAt
            : prev.receivedAt,
        lines: nextLines,
        note: inData.note !== undefined ? normalizeStr(inData.note) : prev.note,
        billUrl:
          inData.billUrl !== undefined
            ? normalizeStr(inData.billUrl)
            : prev.billUrl,
      };

      if (!next.supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      prev.supplier = next.supplier;
      prev.receivedAt = next.receivedAt;
      prev.lines = next.lines;
      prev.note = next.note;
      prev.billUrl = next.billUrl;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /reception-deliveries/:recId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la réception" });
    }
  }
);

/* -------------------- DELETE -------------------- */
router.delete(
  "/restaurants/:restaurantId/reception-deliveries/:recId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, recId } = req.params;
      const doc = await ReceptionDelivery.findOneAndDelete({
        _id: recId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Réception introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /reception-deliveries/:recId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de la réception" });
    }
  }
);

module.exports = router;
