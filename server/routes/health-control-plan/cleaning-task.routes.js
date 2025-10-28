const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const CleaningTask = require("../../models/logs/cleaning-task.model");

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
      .slice(0, 50);
  }
  // string -> split , ; \n
  const parts = String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 50);
}
/** tri logique: doneAt desc si done, sinon dueAt desc, sinon createdAt desc */
function listSortExpr() {
  return {
    done: -1, // faits d'abord
    doneAt: -1,
    dueAt: -1,
    createdAt: -1,
    _id: -1,
  };
}
function hasBusinessChanges(prev, next) {
  const fields = [
    "zone",
    "zoneId",
    "description",
    "frequency",
    "assignedTo",
    "done",
    "productUsed",
    "productFDSUrl",
    "riskLevel",
    "verified",
    "dwellTimeMin",
  ];
  for (const f of fields)
    if ((prev?.[f] ?? null) !== (next?.[f] ?? null)) return true;

  const t1 = prev?.dueAt?.getTime?.() ?? null;
  const t2 = next?.dueAt?.getTime?.() ?? null;
  if (t1 !== t2) return true;

  const d1 = prev?.doneAt?.getTime?.() ?? null;
  const d2 = next?.doneAt?.getTime?.() ?? null;
  if (d1 !== d2) return true;

  const v1 = prev?.verifiedAt?.getTime?.() ?? null;
  const v2 = next?.verifiedAt?.getTime?.() ?? null;
  if (v1 !== v2) return true;

  // arrays
  const a = (prev?.proofUrls || []).join("||");
  const b = (next?.proofUrls || []).join("||");
  if (a !== b) return true;

  const p1 = (prev?.protocolSteps || []).join("||");
  const p2 = (next?.protocolSteps || []).join("||");
  if (p1 !== p2) return true;

  // verifiedBy
  const vb1 = JSON.stringify(prev?.verifiedBy || null);
  const vb2 = JSON.stringify(next?.verifiedBy || null);
  if (vb1 !== vb2) return true;

  return false;
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/cleaning-tasks",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const zone = normalizeStr(inData.zone);
      if (!zone) return res.status(400).json({ error: "zone est requise" });

      const zoneId = normalizeStr(inData.zoneId);
      const description = normalizeStr(inData.description);
      const frequency = normalizeStr(inData.frequency) || "daily";
      const dueAt = normalizeDate(inData.dueAt);
      const assignedTo = normalizeObjectId(inData.assignedTo);

      const done = normalizeBool(inData.done) ?? false;
      const doneAt =
        normalizeDate(inData.doneAt) || (done ? new Date() : undefined);

      const proofUrls = normalizeStringArray(inData.proofUrls);
      const productUsed = normalizeStr(inData.productUsed);
      const productFDSUrl = normalizeStr(inData.productFDSUrl);

      const protocolSteps = normalizeStringArray(inData.protocolSteps);
      const dwellTimeMin = normalizeNumber(inData.dwellTimeMin);

      const riskLevel = ["low", "medium", "high"].includes(
        String(inData.riskLevel)
      )
        ? String(inData.riskLevel)
        : "low";

      const verified = normalizeBool(inData.verified) ?? false;
      const verifiedAt =
        normalizeDate(inData.verifiedAt) || (verified ? new Date() : undefined);
      const verifiedBy = verified
        ? currentUser // par défaut, celui qui enregistre peut vérifier
        : undefined;

      const doc = new CleaningTask({
        restaurantId,
        zone,
        zoneId: zoneId ?? undefined,
        description: description ?? undefined,
        frequency,
        dueAt: dueAt ?? undefined,
        assignedTo: assignedTo ?? undefined,
        done,
        doneAt: doneAt ?? undefined,
        proofUrls,
        productUsed: productUsed ?? undefined,
        productFDSUrl: productFDSUrl ?? undefined,
        protocolSteps,
        dwellTimeMin: dwellTimeMin ?? undefined,
        riskLevel,
        verified,
        verifiedAt: verifiedAt ?? undefined,
        verifiedBy,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /cleaning-tasks:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la tâche de nettoyage" });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-cleaning-tasks",
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
        status, // "all" | "done" | "todo"
        freq, // daily | weekly | monthly | on_demand
        zone, // text filter
      } = req.query;

      const query = { restaurantId };

      // status
      if (status === "done") query.done = true;
      else if (status === "todo") query.done = false;

      // frequency
      if (
        freq &&
        ["daily", "weekly", "monthly", "on_demand"].includes(String(freq))
      ) {
        query.frequency = String(freq);
      }

      // zone text
      if (zone && String(zone).trim()) {
        query.zone = new RegExp(String(zone).trim(), "i");
      }

      // date range — on cherche dans doneAt si done, sinon dueAt, sinon createdAt
      if (date_from || date_to) {
        const from = date_from ? new Date(date_from) : null;
        const to = date_to ? new Date(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }

        query.$or = [
          {
            done: true,
            ...(from || to
              ? {
                  doneAt: {
                    ...(from ? { $gte: from } : {}),
                    ...(to ? { $lte: to } : {}),
                  },
                }
              : {}),
          },
          {
            done: false,
            dueAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lte: to } : {}),
            },
          },
          {
            done: false,
            dueAt: { $exists: false },
            createdAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lte: to } : {}),
            },
          },
        ];
      }

      // recherche texte
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { zone: rx },
          { description: rx },
          { productUsed: rx },
          { productFDSUrl: rx },
          { protocolSteps: rx },
          { riskLevel: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        CleaningTask.find(query)
          .sort(listSortExpr())
          .skip(skip)
          .limit(Number(limit)),
        CleaningTask.countDocuments(query),
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
      console.error("GET /list-cleaning-tasks:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des tâches" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId } = req.params;
      const doc = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Tâche introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de la tâche" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!prev) return res.status(404).json({ error: "Tâche introuvable" });

      const next = {
        zone: inData.zone !== undefined ? normalizeStr(inData.zone) : prev.zone,
        zoneId:
          inData.zoneId !== undefined
            ? normalizeStr(inData.zoneId)
            : prev.zoneId,
        description:
          inData.description !== undefined
            ? normalizeStr(inData.description)
            : prev.description,
        frequency:
          inData.frequency !== undefined
            ? normalizeStr(inData.frequency) || prev.frequency
            : prev.frequency,
        dueAt:
          inData.dueAt !== undefined ? normalizeDate(inData.dueAt) : prev.dueAt,
        assignedTo:
          inData.assignedTo !== undefined
            ? normalizeObjectId(inData.assignedTo)
            : prev.assignedTo,

        done:
          inData.done !== undefined ? normalizeBool(inData.done) : prev.done,
        doneAt:
          inData.doneAt !== undefined
            ? normalizeDate(inData.doneAt)
            : prev.doneAt,

        proofUrls:
          inData.proofUrls !== undefined
            ? normalizeStringArray(inData.proofUrls)
            : prev.proofUrls || [],

        productUsed:
          inData.productUsed !== undefined
            ? normalizeStr(inData.productUsed)
            : prev.productUsed,
        productFDSUrl:
          inData.productFDSUrl !== undefined
            ? normalizeStr(inData.productFDSUrl)
            : prev.productFDSUrl,

        protocolSteps:
          inData.protocolSteps !== undefined
            ? normalizeStringArray(inData.protocolSteps)
            : prev.protocolSteps || [],
        dwellTimeMin:
          inData.dwellTimeMin !== undefined
            ? normalizeNumber(inData.dwellTimeMin)
            : prev.dwellTimeMin,

        riskLevel:
          inData.riskLevel !== undefined &&
          ["low", "medium", "high"].includes(String(inData.riskLevel))
            ? String(inData.riskLevel)
            : prev.riskLevel,

        verified:
          inData.verified !== undefined
            ? normalizeBool(inData.verified)
            : prev.verified,
        verifiedAt:
          inData.verifiedAt !== undefined
            ? normalizeDate(inData.verifiedAt)
            : prev.verifiedAt,
        verifiedBy:
          inData.verified !== undefined
            ? normalizeBool(inData.verified)
              ? prev.verifiedBy || currentUserFromToken(req)
              : undefined
            : prev.verifiedBy,
      };

      // auto-compléter dates si flags changent
      if (next.done && !next.doneAt) next.doneAt = new Date();
      if (!next.done) next.doneAt = undefined;

      if (next.verified && !next.verifiedAt) next.verifiedAt = new Date();
      if (!next.verified) {
        next.verifiedAt = undefined;
        next.verifiedBy = undefined;
      }

      const changed = hasBusinessChanges(prev, next);
      if (!changed) return res.json(prev);

      Object.assign(prev, next);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la tâche" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId } = req.params;
      const doc = await CleaningTask.findOneAndDelete({
        _id: taskId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Tâche introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de la tâche" });
    }
  }
);

/* ------------------ DISTINCT ZONES (optionnel) ------------------ */
router.get(
  "/restaurants/:restaurantId/cleaning-tasks/distinct/zones",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await CleaningTask.aggregate([
        { $match: { restaurantId: new Types.ObjectId(String(restaurantId)) } },
        { $group: { _id: { zone: "$zone" }, count: { $sum: 1 } } },
        { $sort: { "_id.zone": 1 } },
      ]);
      const items = rows.map((r) => ({
        zone: r._id.zone || "",
        count: r.count,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /cleaning-tasks/distinct/zones:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des zones" });
    }
  }
);

module.exports = router;
