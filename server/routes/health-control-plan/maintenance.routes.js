const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const Maintenance = require("../../models/logs/maintenance.model");

/* ---------- helpers ---------- */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
function normProofs(v) {
  if (Array.isArray(v)) {
    return v
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
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

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/maintenance",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const user = currentUserFromToken(req);
      if (!user)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const b = req.body || {};
      const equipment = normStr(b.equipment);
      if (!equipment)
        return res.status(400).json({ error: "equipment requis" });

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];
      const allowedFreq = ["daily", "weekly", "monthly", "on_demand"];

      const initialDoneAt = normDate(b.performedAt) || new Date();
      const initialProofs = normProofs(b.proofUrls);
      const initialNote = normStr(b.notes);

      const doc = new Maintenance({
        restaurantId,
        equipment,
        equipmentId: normStr(b.equipmentId) ?? undefined,
        type: allowedTypes.includes(b.type) ? b.type : "inspection",
        frequency: allowedFreq.includes(b.frequency) ? b.frequency : "monthly",

        // nextDue peut être envoyé ou calculé ensuite via fréquence / mark-done
        nextDue: normDate(b.nextDue) ?? undefined,

        provider: normStr(b.provider) ?? undefined,
        notes: normStr(b.planNotes) ?? undefined, // si tu veux séparer note plan / note exécution

        proofUrls: normProofs(b.proofUrls),

        // première exécution optionnelle si tu as déjà "performedAt"
        history:
          initialDoneAt || initialProofs.length || initialNote
            ? [
                {
                  doneAt: initialDoneAt,
                  doneBy: user,
                  proofUrls: initialProofs,
                  note: initialNote ?? undefined,
                },
              ]
            : [],

        lastDoneAt: initialDoneAt || undefined,
        lastDoneBy: initialDoneAt ? user : undefined,
        lastProofCount: initialProofs.length || 0,

        recordedBy: user,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /maintenance:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la maintenance" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres: q, type, status(all|overdue|due_soon|ok), date_from/date_to (sur lastDoneAt / createdAt), due_within_days (défaut 14), freq
router.get(
  "/restaurants/:restaurantId/list-maintenance",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        q,
        type,
        status = "all",
        date_from,
        date_to,
        due_within_days,
        freq,
      } = req.query;

      const baseQuery = { restaurantId };

      const andConds = [];

      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        andConds.push({
          $or: [
            { equipment: rx },
            { equipmentId: rx },
            { type: rx },
            { provider: rx },
            { notes: rx },
            { "recordedBy.firstName": rx },
            { "recordedBy.lastName": rx },
          ],
        });
      }

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];
      if (type && allowedTypes.includes(type)) {
        baseQuery.type = type;
      }

      const allowedFreq = ["daily", "weekly", "monthly", "on_demand"];
      if (freq && allowedFreq.includes(freq)) {
        baseQuery.frequency = freq;
      }

      // Filtre période exécution (sur lastDoneAt, fallback createdAt)
      if (date_from || date_to) {
        const from = normDate(date_from);
        const to = normDate(date_to);
        if (from || to) {
          const rangeLast = {};
          const rangeCreated = {};
          if (from) {
            rangeLast.$gte = from;
            rangeCreated.$gte = from;
          }
          if (to) {
            const end = new Date(to);
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(end.getMilliseconds() - 1);
            rangeLast.$lte = end;
            rangeCreated.$lte = end;
          }
          andConds.push({
            $or: [
              { lastDoneAt: rangeLast },
              { lastDoneAt: { $exists: false }, createdAt: rangeCreated },
            ],
          });
        }
      }

      // statut via nextDue
      const now = new Date();
      const soonDays = Math.max(
        1,
        Math.min(90, parseInt(due_within_days, 10) || 14)
      );
      const soonLimit = new Date(now);
      soonLimit.setDate(soonLimit.getDate() + soonDays);

      if (status === "overdue") {
        andConds.push({ nextDue: { $ne: null, $lt: now } });
      } else if (status === "due_soon") {
        andConds.push({
          nextDue: { $ne: null, $gte: now, $lte: soonLimit },
        });
      } else if (status === "ok") {
        andConds.push({
          $or: [{ nextDue: null }, { nextDue: { $gt: soonLimit } }],
        });
      }

      const finalQuery =
        andConds.length > 0 ? { ...baseQuery, $and: andConds } : baseQuery;

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        Maintenance.find(finalQuery)
          .sort({ lastDoneAt: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Maintenance.countDocuments(finalQuery),
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
      console.error("GET /list-maintenance:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des maintenances" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /maintenance/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE (Plan) ---------- */
router.put(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;
      delete inData.history;
      delete inData.lastDoneAt;
      delete inData.lastDoneBy;
      delete inData.lastProofCount;

      const prev = await Maintenance.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Maintenance introuvable" });

      const allowedTypes = ["filter_change", "inspection", "repair", "other"];
      const allowedFreq = ["daily", "weekly", "monthly", "on_demand"];

      const patch = {
        equipment:
          inData.equipment !== undefined
            ? normStr(inData.equipment)
            : prev.equipment,
        equipmentId:
          inData.equipmentId !== undefined
            ? normStr(inData.equipmentId)
            : prev.equipmentId,
        type:
          inData.type !== undefined && allowedTypes.includes(inData.type)
            ? inData.type
            : prev.type,
        frequency:
          inData.frequency !== undefined &&
          allowedFreq.includes(inData.frequency)
            ? inData.frequency
            : prev.frequency,
        nextDue:
          inData.nextDue !== undefined
            ? normDate(inData.nextDue)
            : prev.nextDue,

        provider:
          inData.provider !== undefined
            ? normStr(inData.provider)
            : prev.provider,
        notes: inData.notes !== undefined ? normStr(inData.notes) : prev.notes,
        proofUrls:
          inData.proofUrls !== undefined
            ? normProofs(inData.proofUrls)
            : prev.proofUrls,
      };

      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /maintenance/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la maintenance" });
    }
  }
);

/* ---------- MARK DONE (append history + calc nextDue) ---------- */
router.post(
  "/restaurants/:restaurantId/maintenance/:id/mark-done",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body }; // { proofUrls, note, verified, doneAt? }

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });

      const entry = {
        doneAt: normDate(inData.doneAt) || new Date(),
        doneBy: currentUser,
        proofUrls: normalizeStringArray(inData.proofUrls),
        note: normStr(inData.note) ?? undefined,
        verified: inData.verified === true,
        verifiedAt: inData.verified === true ? new Date() : undefined,
        verifiedBy: inData.verified === true ? currentUser : undefined,
      };

      doc.history.push(entry);
      doc.lastDoneAt = entry.doneAt;
      doc.lastDoneBy = currentUser;
      doc.lastProofCount = entry.proofUrls?.length || 0;

      // Prochaine échéance automatique selon fréquence
      const freqToDays = {
        daily: 1,
        weekly: 7,
        monthly: 30,
        on_demand: null,
      };
      const days = freqToDays[doc.frequency] || null;
      if (days) {
        const next = new Date(entry.doneAt);
        next.setDate(next.getDate() + days);
        doc.nextDue = next;
      }

      await doc.save();
      return res.json(doc);
    } catch (err) {
      console.error("POST /maintenance/:id/mark-done:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de l’enregistrement du 'Fait'" });
    }
  }
);

/* ---------- UPDATE NOTE (history by index) ---------- */
router.put(
  "/restaurants/:restaurantId/maintenance/:id/history/:index/note",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id, index } = req.params;
      const idx = Number.parseInt(index, 10);
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ error: "Index historique invalide" });
      }

      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });
      if (!Array.isArray(doc.history) || idx >= doc.history.length) {
        return res.status(400).json({ error: "Index historique hors limites" });
      }

      const note = (req.body?.note ?? "").toString().trim();
      const update =
        note.length > 0
          ? { $set: { [`history.${idx}.note`]: note } }
          : { $unset: { [`history.${idx}.note`]: "" } };

      const updated = await Maintenance.findOneAndUpdate(
        { _id: id, restaurantId },
        update,
        { new: true }
      );

      return res.json(updated);
    } catch (err) {
      console.error("PUT /maintenance/:id/history/:index/note:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la note" });
    }
  }
);

/* ---------- DELETE ONE HISTORY ENTRY ---------- */
router.delete(
  "/restaurants/:restaurantId/maintenance/:id/history/:index",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id, index } = req.params;
      const idx = Number.parseInt(index, 10);
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ error: "Index historique invalide" });
      }

      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });

      if (!Array.isArray(doc.history) || idx >= doc.history.length) {
        return res.status(400).json({ error: "Index historique hors limites" });
      }

      // Supprime l'entrée
      doc.history.splice(idx, 1);

      // Recalcule lastDone*
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
      console.error("DELETE /maintenance/:id/history/:index:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de l’exécution" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/maintenance/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Maintenance.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Maintenance introuvable" });

      await Maintenance.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /maintenance/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

module.exports = router;
