// server/routes/health-control-plan/cleaning-tasks.routes.js
const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const CleaningTask = require("../../models/logs/cleaning-task.model");
const Employee = require("../../models/employee.model");

/* ---------- helpers ---------- */
function currentUserFromToken(req) {
  const u = req.user || {};
  const role = (u.role || "").toLowerCase();
  if (!["owner", "employee"].includes(role) || !u.id) return null;
  return {
    userId: new Types.ObjectId(String(u.id)),
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
function normalizeStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  return String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
}
function listSortExpr() {
  // Dernière exécution descendante, puis création
  return { lastDoneAt: -1, createdAt: -1, _id: -1 };
}

/* ------------------ CREATE (Plan) ------------------ */
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

      const doc = new CleaningTask({
        restaurantId,
        zone,
        zoneId: normalizeStr(inData.zoneId) ?? undefined,
        description: normalizeStr(inData.description) ?? undefined,
        frequency: ["daily", "weekly", "monthly", "on_demand"].includes(
          String(inData.frequency)
        )
          ? String(inData.frequency)
          : "daily",
        riskLevel: ["low", "medium", "high"].includes(String(inData.riskLevel))
          ? String(inData.riskLevel)
          : "low",
        protocolSteps: normalizeStringArray(inData.protocolSteps),
        dwellTimeMin: normalizeNumber(inData.dwellTimeMin) ?? undefined,
        products: normalizeStringArray(inData.products),
        productFDSUrls: normalizeStringArray(inData.productFDSUrls),
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /cleaning-tasks:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du plan de nettoyage" });
    }
  }
);

/* ------------------ LIST (Plans) ------------------ */
router.get(
  "/restaurants/:restaurantId/list-cleaning-tasks",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        q,
        freq, // daily|weekly|monthly|on_demand
        zone, // texte (RegExp)
        date_from,
        date_to,
      } = req.query;

      const query = { restaurantId };

      if (
        freq &&
        ["daily", "weekly", "monthly", "on_demand"].includes(String(freq))
      ) {
        query.frequency = String(freq);
      }

      if (zone && String(zone).trim()) {
        query.zone = new RegExp(String(zone).trim(), "i");
      }

      // Recherche texte simple
      if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { zone: rx },
          { description: rx },
          { products: rx },
          { protocolSteps: rx },
          { riskLevel: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx }
        );
      }

      // Filtre date
      if (date_from || date_to) {
        const from = date_from ? new Date(date_from) : null;
        const to = date_to ? new Date(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        query.$or = [
          {
            lastDoneAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lte: to } : {}),
            },
          },
          {
            lastDoneAt: { $exists: false },
            createdAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lte: to } : {}),
            },
          },
        ];
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
        .json({ error: "Erreur lors de la récupération des plans" });
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
      if (!doc) return res.status(404).json({ error: "Plan introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du plan" });
    }
  }
);

/* ------------------ UPDATE (Plan) ------------------ */
router.put(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId } = req.params;
      const inData = { ...req.body };
      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.history; // l'historique ne se modifie pas ici

      const prev = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!prev) return res.status(404).json({ error: "Plan introuvable" });

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
          inData.frequency !== undefined &&
          ["daily", "weekly", "monthly", "on_demand"].includes(
            String(inData.frequency)
          )
            ? String(inData.frequency)
            : prev.frequency,
        riskLevel:
          inData.riskLevel !== undefined &&
          ["low", "medium", "high"].includes(String(inData.riskLevel))
            ? String(inData.riskLevel)
            : prev.riskLevel,
        protocolSteps:
          inData.protocolSteps !== undefined
            ? normalizeStringArray(inData.protocolSteps)
            : prev.protocolSteps,
        dwellTimeMin:
          inData.dwellTimeMin !== undefined
            ? normalizeNumber(inData.dwellTimeMin)
            : prev.dwellTimeMin,
        products:
          inData.products !== undefined
            ? normalizeStringArray(inData.products)
            : prev.products,
        productFDSUrls:
          inData.productFDSUrls !== undefined
            ? normalizeStringArray(inData.productFDSUrls)
            : prev.productFDSUrls,
      };

      Object.assign(prev, next);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du plan" });
    }
  }
);

/* ------------------ MARK DONE (append history + avatar) ------------------ */
router.post(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId/mark-done",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId } = req.params;
      const inData = { ...req.body }; // { proofUrls, note, verified, doneAt? }

      const currentUserRaw = currentUserFromToken(req);
      if (!currentUserRaw)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      // hydrate avatarUrl si employee
      let avatarUrl;
      if (currentUserRaw.role === "employee") {
        try {
          const emp = await Employee.findById(currentUserRaw.userId).select(
            "profilePicture.url"
          );
          avatarUrl = emp?.profilePicture?.url || undefined;
        } catch {}
      }
      const currentUser = { ...currentUserRaw, avatarUrl };

      const doc = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Plan introuvable" });

      const entry = {
        doneAt: normalizeDate(inData.doneAt) || new Date(),
        doneBy: currentUser,
        proofUrls: normalizeStringArray(inData.proofUrls),
        note: normalizeStr(inData.note) ?? undefined,
        verified: inData.verified === true,
        verifiedAt: inData.verified === true ? new Date() : undefined,
        verifiedBy: inData.verified === true ? currentUser : undefined,
      };

      doc.history.push(entry);
      doc.lastDoneAt = entry.doneAt;
      doc.lastDoneBy = currentUser;
      doc.lastProofCount = entry.proofUrls?.length || 0;

      await doc.save();
      return res.json(doc);
    } catch (err) {
      console.error("POST /cleaning-tasks/:taskId/mark-done:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de l’enregistrement du 'Fait'" });
    }
  }
);

/* ------------------ UPDATE NOTE (history by index, atomique) ------------------ */
router.put(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId/history/:index/note",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId, index } = req.params;
      const idx = Number.parseInt(index, 10);
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ error: "Index historique invalide" });
      }

      const doc = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Plan introuvable" });
      if (!Array.isArray(doc.history) || idx >= doc.history.length) {
        return res.status(400).json({ error: "Index historique hors limites" });
      }

      const note = (req.body?.note ?? "").toString().trim();
      const update =
        note.length > 0
          ? { $set: { [`history.${idx}.note`]: note } }
          : { $unset: { [`history.${idx}.note`]: "" } };

      const updated = await CleaningTask.findOneAndUpdate(
        { _id: taskId, restaurantId },
        update,
        { new: true }
      );

      return res.json(updated);
    } catch (err) {
      console.error("PUT /cleaning-tasks/:taskId/history/:index/note:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la note" });
    }
  }
);

/* ------------------ DELETE ONE HISTORY ENTRY (by index) ------------------ */
router.delete(
  "/restaurants/:restaurantId/cleaning-tasks/:taskId/history/:index",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, taskId, index } = req.params;
      const idx = Number.parseInt(index, 10);
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ error: "Index historique invalide" });
      }

      const doc = await CleaningTask.findOne({ _id: taskId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Plan introuvable" });

      if (!Array.isArray(doc.history) || idx >= doc.history.length) {
        return res.status(400).json({ error: "Index historique hors limites" });
      }

      // Supprime l'entrée à l'index
      doc.history.splice(idx, 1);

      // Recalcule lastDone* en fonction du dernier doneAt restant
      if (doc.history.length > 0) {
        const latest = doc.history.reduce((acc, cur) => {
          if (!acc) return cur;
          return new Date(cur.doneAt) > new Date(acc.doneAt) ? cur : acc;
        }, null);
        doc.lastDoneAt = latest?.doneAt || undefined;
        doc.lastDoneBy = latest?.doneBy || undefined;
        doc.lastProofCount = Array.isArray(latest?.proofUrls)
          ? latest.proofUrls.length
          : 0;
      } else {
        doc.lastDoneAt = undefined;
        doc.lastDoneBy = undefined;
        doc.lastProofCount = 0;
      }

      await doc.save();
      return res.json(doc);
    } catch (err) {
      console.error("DELETE /cleaning-tasks/:taskId/history/:index:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de l’exécution" });
    }
  }
);

/* ------------------ DELETE (Plan) ------------------ */
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
      if (!doc) return res.status(404).json({ error: "Plan introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /cleaning-tasks/:taskId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du plan" });
    }
  }
);

/* ------------------ DISTINCT ZONES ------------------ */
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
