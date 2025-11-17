const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const NonConformity = require("../../models/logs/non-conformity.model");

/* ---------- helpers (conformes à pest-control) ---------- */
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
const normBool = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
};
const normObjId = (v) => {
  if (!v) return null;
  const s = String(v);
  return Types.ObjectId.isValid(s) ? s : null;
};
function normStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input))
    return input
      .map((x) => normStr(x))
      .filter(Boolean)
      .slice(0, 100);
  return String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
}

const ALLOWED_TYPES = [
  "temperature",
  "hygiene",
  "reception",
  "microbiology",
  "other",
];
const ALLOWED_SEVERITY = ["low", "medium", "high"];
const ALLOWED_STATUS = ["open", "in_progress", "closed"];

function normCorrectiveAction(a = {}) {
  const action = normStr(a.action);
  const done = a.done != null ? Boolean(a.done) : false;
  const doneAt = normDate(a.doneAt);
  const doneBy = normObjId(a.doneBy);
  const note = normStr(a.note);

  if (!action) return null;
  return {
    action,
    done,
    doneAt: done ? (doneAt ?? new Date()) : undefined,
    doneBy: doneBy ?? undefined,
    note: note ?? undefined,
  };
}

function listSortExpr() {
  return { reportedAt: -1, createdAt: -1, _id: -1 };
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/non-conformities",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const type = ALLOWED_TYPES.includes(String(inData.type))
        ? String(inData.type)
        : "other";
      const severity = ALLOWED_SEVERITY.includes(String(inData.severity))
        ? String(inData.severity)
        : "medium";
      const status = ALLOWED_STATUS.includes(String(inData.status))
        ? String(inData.status)
        : "open";

      const correctiveActions = Array.isArray(inData.correctiveActions)
        ? inData.correctiveActions.map(normCorrectiveAction).filter(Boolean)
        : [];

      const doc = new NonConformity({
        restaurantId,
        type,
        referenceId: normStr(inData.referenceId) ?? undefined,
        description: normStr(inData.description) ?? undefined,
        severity,
        reportedAt: normDate(inData.reportedAt) ?? new Date(),
        status,
        attachments: normStringArray(inData.attachments),
        correctiveActions,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /non-conformities:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la non-conformité" });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-non-conformities",
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
        type,
        severity,
        status,
      } = req.query;

      const query = { restaurantId };

      if (type && ALLOWED_TYPES.includes(String(type)))
        query.type = String(type);
      if (severity && ALLOWED_SEVERITY.includes(String(severity)))
        query.severity = String(severity);
      if (status && ALLOWED_STATUS.includes(String(status)))
        query.status = String(status);

      // Intervalle sur reportedAt
      if (date_from || date_to) {
        const from = date_from ? normDate(date_from) : null;
        const to = date_to ? normDate(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        if (from || to) {
          query.reportedAt = {
            ...(from ? { $gte: from } : {}),
            ...(to ? { $lte: to } : {}),
          };
        }
      }

      // Recherche texte
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { referenceId: rx },
          { description: rx },
          { attachments: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
          { "correctiveActions.action": rx },
          { "correctiveActions.note": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        NonConformity.find(query)
          .sort(listSortExpr())
          .skip(skip)
          .limit(Number(limit)),
        NonConformity.countDocuments(query),
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
      console.error("GET /list-non-conformities:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des non-conformités" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/non-conformities/:ncId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, ncId } = req.params;
      const doc = await NonConformity.findOne({ _id: ncId, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Non-conformité introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /non-conformities/:ncId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/non-conformities/:ncId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, ncId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await NonConformity.findOne({ _id: ncId, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Non-conformité introuvable" });

      const patch = {
        type:
          inData.type !== undefined &&
          ALLOWED_TYPES.includes(String(inData.type))
            ? String(inData.type)
            : prev.type,
        referenceId:
          inData.referenceId !== undefined
            ? normStr(inData.referenceId)
            : prev.referenceId,
        description:
          inData.description !== undefined
            ? normStr(inData.description)
            : prev.description,
        severity:
          inData.severity !== undefined &&
          ALLOWED_SEVERITY.includes(String(inData.severity))
            ? String(inData.severity)
            : prev.severity,
        reportedAt:
          inData.reportedAt !== undefined
            ? normDate(inData.reportedAt)
            : prev.reportedAt,
        status:
          inData.status !== undefined &&
          ALLOWED_STATUS.includes(String(inData.status))
            ? String(inData.status)
            : prev.status,
        attachments:
          inData.attachments !== undefined
            ? normStringArray(inData.attachments)
            : prev.attachments || [],
        correctiveActions:
          inData.correctiveActions !== undefined &&
          Array.isArray(inData.correctiveActions)
            ? inData.correctiveActions.map(normCorrectiveAction).filter(Boolean)
            : prev.correctiveActions || [],
      };

      Object.assign(prev, patch);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /non-conformities/:ncId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/non-conformities/:ncId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, ncId } = req.params;
      const doc = await NonConformity.findOneAndDelete({
        _id: ncId,
        restaurantId,
      });
      if (!doc)
        return res.status(404).json({ error: "Non-conformité introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /non-conformities/:ncId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
