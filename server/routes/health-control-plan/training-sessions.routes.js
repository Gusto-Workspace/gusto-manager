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
  const status = ["attended", "absent", "excused"].includes(String(a.status))
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
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;

      const prev = await TrainingSession.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Formation introuvable" });

      const patch = normBody(inData);
      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();

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
