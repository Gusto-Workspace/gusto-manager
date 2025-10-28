const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const Employee = require("../../models/employee.model");
const TrainingSession = require("../../models/logs/training-session.model");

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
  return mongoose.Types.ObjectId.isValid(s) ? s : null;
};

function normAttendance(a = {}) {
  const employeeId = normObjId(a.employeeId);
  if (!employeeId) return null;
  const status = ["attended", "absent"].includes(String(a.status))
    ? String(a.status)
    : "attended";
  return {
    employeeId,
    status,
    certificateUrl: normStr(a.certificateUrl) ?? undefined,
    signedAt: normDate(a.signedAt) ?? undefined,
    notes: normStr(a.notes) ?? undefined,
  };
}
function normAttendees(arr) {
  const inArr = Array.isArray(arr) ? arr : [];
  const out = [];
  for (const a of inArr) {
    const na = normAttendance(a);
    if (na) out.push(na);
  }
  return out;
}

function normBody(inData = {}) {
  return {
    title: normStr(inData.title) ?? undefined,
    topic: normStr(inData.topic) ?? undefined,
    provider: normStr(inData.provider) ?? undefined,
    date: normDate(inData.date) ?? undefined,
    durationMinutes:
      inData.durationMinutes != null &&
      !Number.isNaN(Number(inData.durationMinutes))
        ? Number(inData.durationMinutes)
        : undefined,
    location: normStr(inData.location) ?? undefined,
    materialsUrl: normStr(inData.materialsUrl) ?? undefined,
    attendees: normAttendees(inData.attendees),
    validUntil: normDate(inData.validUntil) ?? undefined,
    notes: normStr(inData.notes) ?? undefined,
  };
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/training-sessions",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normBody(req.body);
      if (!body.title) return res.status(400).json({ error: "title requis" });
      if (!body.date) return res.status(400).json({ error: "date requise" });

      const doc = new TrainingSession({
        restaurantId,
        ...body,
        recordedBy: currentUser,
      });

      await doc.save();

      const attendedEmployeeIds = (doc.attendees || [])
        .filter((a) => a && a.employeeId)
        .map((a) => a.employeeId);

      if (attendedEmployeeIds.length) {
        await Employee.updateMany(
          { _id: { $in: attendedEmployeeIds } },
          { $addToSet: { trainingSessions: doc._id } }
        );
      }

      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /training-sessions:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la formation" });
    }
  }
);

/* ---------- LIST ---------- */
router.get(
  "/restaurants/:restaurantId/list-training-sessions",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        q,
        topic,
        status = "all",
        date_from,
        date_to,
        due_within_days, // facultatif : si non fourni -> 14
      } = req.query;

      const query = { restaurantId };

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { title: rx },
          { topic: rx },
          { provider: rx },
          { location: rx },
          { notes: rx }
        );
      }

      if (topic && String(topic).trim().length) {
        query.topic = String(topic).trim();
      }

      // Filtre par "date" (date de tenue de la session)
      if (date_from || date_to) {
        const from = normDate(date_from);
        const to = normDate(date_to);
        const range = {};
        if (from) range.$gte = from;
        if (to) {
          const end = new Date(to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          range.$lte = end;
        }
        if (Object.keys(range).length) query.date = range;
      }

      // Statut par rapport à validUntil
      const now = new Date();
      const soonDays = Math.max(
        1,
        Math.min(365, parseInt(due_within_days, 10) || 14)
      );
      const soonLimit = new Date(now);
      soonLimit.setDate(soonLimit.getDate() + soonDays);

      if (status === "expired") {
        query.validUntil = { $ne: null, $lt: now };
      } else if (status === "due_soon") {
        query.validUntil = { $ne: null, $gte: now, $lte: soonLimit };
      } else if (status === "valid") {
        query.$or = [{ validUntil: null }, { validUntil: { $gt: soonLimit } }];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        TrainingSession.find(query)
          .sort({ date: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        TrainingSession.countDocuments(query),
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
      console.error("GET /list-training-sessions:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des formations" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/training-sessions/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await TrainingSession.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Formation introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /training-sessions/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/training-sessions/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;

      const prev = await TrainingSession.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Formation introuvable" });

      // —— NOUVEAU: mode patch présence —— //
      const attendanceUpdate = req.body?.attendanceUpdate;
      if (
        attendanceUpdate?.employeeId &&
        ["attended", "absent"].includes(String(attendanceUpdate.status))
      ) {
        const employeeId = String(attendanceUpdate.employeeId);
        const status = String(attendanceUpdate.status);

        // Sécurité basique : un employé ne peut patcher que lui-même
        const me = req.user || {};
        if (me.role === "employee" && String(me.id) !== employeeId) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const emp =
          await Employee.findById(employeeId).select("_id restaurant");
        if (!emp) return res.status(404).json({ error: "Employé introuvable" });

        // Upsert dans attendees
        const idx = (prev.attendees || []).findIndex(
          (a) => String(a.employeeId) === employeeId
        );
        if (idx >= 0) {
          prev.attendees[idx].status = status;
          prev.attendees[idx].signedAt =
            status === "attended"
              ? prev.attendees[idx].signedAt || new Date()
              : prev.attendees[idx].signedAt || undefined;
        } else {
          prev.attendees.push({
            employeeId,
            status,
            signedAt: status === "attended" ? new Date() : undefined,
          });
        }

        prev.updatedAt = new Date();
        await prev.save();

        await Employee.updateOne(
          { _id: employeeId },
          { $addToSet: { trainingSessions: prev._id } }
        );

        const att = (prev.attendees || []).find(
          (a) => String(a.employeeId) === employeeId
        );

        return res.json({
          sessionId: String(prev._id),
          employeeId,
          myStatus: att?.status || status,
          mySignedAt: att?.signedAt || null,
          myCertificateUrl: att?.certificateUrl || null,
          myNotes: att?.notes || null,
          updatedAt: prev.updatedAt,
        });
      }

      // —— Comportement existant (mise à jour "full") —— //
      const inData = { ...req.body };
      delete inData.attendanceUpdate; // on évite l'injection dans normBody
      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;

      // 1) IDs avant patch
      const prevIds = new Set(
        (prev.attendees || []).map((a) => String(a.employeeId))
      );

      const patch = normBody(inData);

      // (Optionnel) dédoublonner les attendees par employeeId
      if (Array.isArray(patch.attendees) && patch.attendees.length) {
        const uniq = new Map();
        for (const a of patch.attendees) {
          if (a?.employeeId) uniq.set(String(a.employeeId), a);
        }
        patch.attendees = Array.from(uniq.values());
      }

      // 2) IDs après patch (si attendees fournis)
      let toAdd = [];
      let toRemove = [];

      if (Array.isArray(patch.attendees)) {
        const nextIds = new Set(
          patch.attendees.map((a) => String(a.employeeId))
        );
        toAdd = [...nextIds].filter((id) => !prevIds.has(id));
        toRemove = [...prevIds].filter((id) => !nextIds.has(id));
      }

      // 3) Appliquer le patch sur la session
      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();

      // 4) Synchroniser les employés
      const ops = [];
      if (toAdd.length) {
        ops.push(
          Employee.updateMany(
            { _id: { $in: toAdd } },
            { $addToSet: { trainingSessions: prev._id } }
          )
        );
      }
      if (toRemove.length) {
        ops.push(
          Employee.updateMany(
            { _id: { $in: toRemove } },
            { $pull: { trainingSessions: prev._id } }
          )
        );
      }
      if (ops.length) await Promise.all(ops);

      return res.json(prev);
    } catch (err) {
      console.error("PUT /training-sessions/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la formation" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/training-sessions/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await TrainingSession.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Formation introuvable" });

      // Retirer la session de tous les employés qui l'ont
      await Employee.updateMany(
        { trainingSessions: doc._id },
        { $pull: { trainingSessions: doc._id } }
      );

      await TrainingSession.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /training-sessions/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ---------- SELECT EMPLOYÉS ---------- */
router.get(
  "/restaurants/:restaurantId/employees-select",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { q = "", limit = 200 } = req.query;

      // ⚠️ Le champ dans le modèle Employee s'appelle "restaurant" (et pas restaurantId)
      const find = { restaurant: restaurantId };

      if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim(), "i");
        find.$or = [
          { firstname: rx },
          { lastname: rx },
          { email: rx },
          { phone: rx },
        ];
      }

      const rows = await Employee.find(find)
        .sort({ lastname: 1, firstname: 1 })
        .limit(Math.max(1, Math.min(Number(limit) || 50, 500)))
        .select("_id firstname lastname email phone");

      // On renvoie les clés attendues par le front (lastName/firstName)
      const items = rows.map((e) => ({
        _id: String(e._id),
        firstName: e.firstname || "",
        lastName: e.lastname || "",
        email: e.email || "",
        phone: e.phone || "",
      }));

      res.json({ items });
    } catch (err) {
      console.error("GET /employees-select:", err);
      res.status(500).json({ error: "Erreur lors du chargement des employés" });
    }
  }
);

module.exports = router;
