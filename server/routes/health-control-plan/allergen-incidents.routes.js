const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const AllergenIncident = require("../../models/logs/allergen-incident.model");

/* ---------- helpers ---------- */
const ALLOWED_SOURCE = ["supplier", "customer", "internal", "lab", "other"];
const ALLOWED_SEVERITY = ["low", "medium", "high"];

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
function normalizeStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => normalizeStr(x))
      .filter(Boolean)
      .slice(0, 100);
  }
  return String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
}

// Corrective action mapper depuis JSON
function normalizeCorrectiveAction(c = {}) {
  const action = normalizeStr(c.action);
  if (!action) return null;
  const done = normalizeBool(c.done) ?? false;
  const doneAt = normalizeDate(c.doneAt);
  const doneBy = normalizeObjectId(c.doneBy);
  const note = normalizeStr(c.note);
  return {
    action,
    done,
    doneAt: done ? (doneAt ?? new Date()) : undefined,
    doneBy: doneBy ?? undefined,
    note: note ?? undefined,
  };
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/allergen-incidents",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser) {
        return res.status(400).json({ error: "Utilisateur non reconnu" });
      }

      const source = ALLOWED_SOURCE.includes(String(inData.source))
        ? String(inData.source)
        : "internal";

      const itemName = normalizeStr(inData.itemName);
      const itemId = normalizeObjectId(inData.itemId);
      const itemRefModel = normalizeStr(inData.itemRefModel);
      const supplierId = normalizeObjectId(inData.supplierId);

      const detectedAt = normalizeDate(inData.detectedAt) || new Date();
      const detectedBy = normalizeObjectId(inData.detectedBy);

      const allergens = normalizeStringArray(inData.allergens);
      const severity = ALLOWED_SEVERITY.includes(String(inData.severity))
        ? String(inData.severity)
        : "medium";

      const description = normalizeStr(inData.description);
      const immediateAction = normalizeStr(inData.immediateAction);

      const correctiveActions = Array.isArray(inData.correctiveActions)
        ? inData.correctiveActions
            .map(normalizeCorrectiveAction)
            .filter(Boolean)
        : [];

      const attachments = normalizeStringArray(inData.attachments);

      const closed = normalizeBool(inData.closed) ?? false;
      const closedAt =
        normalizeDate(inData.closedAt) || (closed ? new Date() : undefined);

      const doc = new AllergenIncident({
        restaurantId,
        source,
        itemName: itemName ?? undefined,
        itemId: itemId ?? undefined,
        itemRefModel: itemRefModel ?? undefined,
        supplierId: supplierId ?? undefined,
        detectedAt,
        detectedBy: detectedBy ?? undefined,
        allergens,
        severity,
        description: description ?? undefined,
        immediateAction: immediateAction ?? undefined,
        correctiveActions,
        attachments,
        closed,
        closedAt: closed ? closedAt : undefined,
        recordedBy: currentUser,
      });

      const saved = await doc.save();
      await saved.populate([
        { path: "correctiveActions.doneBy", select: "firstname lastname" },
        { path: "detectedBy", select: "firstname lastname" },
      ]);
      return res.status(201).json(saved);
    } catch (err) {
      console.error("POST /allergen-incidents:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de l’incident allergène" });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-allergen-incidents",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        date_from,
        date_to,
        q,
        source,
        severity,
        status,
        supplierId,
        itemId,
      } = req.query;

      const query = { restaurantId };

      if (source && ALLOWED_SOURCE.includes(String(source)))
        query.source = String(source);
      if (severity && ALLOWED_SEVERITY.includes(String(severity)))
        query.severity = String(severity);
      if (status === "open") query.closed = false;
      else if (status === "closed") query.closed = true;

      const supId = normalizeObjectId(supplierId);
      if (supId) query.supplierId = supId;
      const itId = normalizeObjectId(itemId);
      if (itId) query.itemId = itId;

      if (date_from || date_to) {
        const from = date_from ? new Date(date_from) : null;
        const to = date_to ? new Date(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        query.detectedAt = {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {}),
        };
      }

      if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { itemName: rx },
          { description: rx },
          { immediateAction: rx },
          { allergens: rx },
          { "correctiveActions.action": rx },
          { "correctiveActions.note": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        AllergenIncident.find(query)
          .sort({ detectedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        AllergenIncident.countDocuments(query),
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
      console.error("GET /list-allergen-incidents:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des incidents" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/allergen-incidents/:incidentId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, incidentId } = req.params;
      const doc = await AllergenIncident.findOne({
        _id: incidentId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Incident introuvable" });
      await doc.populate([
        { path: "correctiveActions.doneBy", select: "firstname lastname" },
        { path: "detectedBy", select: "firstname lastname" },
      ]);
      return res.json(doc);
    } catch (err) {
      console.error("GET /allergen-incidents/:incidentId:", err);
      return res.status(500).json({ error: "Erreur de récupération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/allergen-incidents/:incidentId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, incidentId } = req.params;
      const inData = { ...req.body };
      delete inData.restaurantId;
      delete inData.recordedBy;

      const prev = await AllergenIncident.findOne({
        _id: incidentId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Incident introuvable" });

      const patch = {
        source:
          inData.source !== undefined &&
          ALLOWED_SOURCE.includes(String(inData.source))
            ? String(inData.source)
            : prev.source,

        itemName:
          inData.itemName !== undefined
            ? normalizeStr(inData.itemName)
            : prev.itemName,
        itemId:
          inData.itemId !== undefined
            ? normalizeObjectId(inData.itemId)
            : prev.itemId,
        itemRefModel:
          inData.itemRefModel !== undefined
            ? normalizeStr(inData.itemRefModel)
            : prev.itemRefModel,

        supplierId:
          inData.supplierId !== undefined
            ? normalizeObjectId(inData.supplierId)
            : prev.supplierId,

        detectedAt:
          inData.detectedAt !== undefined
            ? normalizeDate(inData.detectedAt)
            : prev.detectedAt,
        detectedBy:
          inData.detectedBy !== undefined
            ? normalizeObjectId(inData.detectedBy)
            : prev.detectedBy,

        allergens:
          inData.allergens !== undefined
            ? normalizeStringArray(inData.allergens)
            : prev.allergens || [],

        severity:
          inData.severity !== undefined &&
          ALLOWED_SEVERITY.includes(String(inData.severity))
            ? String(inData.severity)
            : prev.severity,

        description:
          inData.description !== undefined
            ? normalizeStr(inData.description)
            : prev.description,
        immediateAction:
          inData.immediateAction !== undefined
            ? normalizeStr(inData.immediateAction)
            : prev.immediateAction,

        correctiveActions:
          inData.correctiveActions !== undefined &&
          Array.isArray(inData.correctiveActions)
            ? inData.correctiveActions
                .map(normalizeCorrectiveAction)
                .filter(Boolean)
            : prev.correctiveActions || [],

        attachments:
          inData.attachments !== undefined
            ? normalizeStringArray(inData.attachments)
            : prev.attachments || [],

        closed:
          inData.closed !== undefined
            ? (normalizeBool(inData.closed) ?? prev.closed)
            : prev.closed,
        closedAt:
          inData.closedAt !== undefined
            ? normalizeDate(inData.closedAt)
            : prev.closedAt,
      };

      if (patch.closed && !patch.closedAt) patch.closedAt = new Date();
      if (!patch.closed) patch.closedAt = undefined;

      Object.assign(prev, patch);

      if (!prev.recordedBy || !prev.recordedBy.userId) {
        const cur = currentUserFromToken(req);
        if (cur) prev.recordedBy = cur;
      }

      const saved = await prev.save();
      await saved.populate([
        { path: "correctiveActions.doneBy", select: "firstname lastname" },
        { path: "detectedBy", select: "firstname lastname" },
      ]);
      return res.json(saved);
    } catch (err) {
      console.error("PUT /allergen-incidents/:incidentId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/allergen-incidents/:incidentId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, incidentId } = req.params;
      const doc = await AllergenIncident.findOneAndDelete({
        _id: incidentId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Incident introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /allergen-incidents/:incidentId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
