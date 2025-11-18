const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const PestControl = require("../../models/logs/pest-control.model");

/* ---------- helpers ---------- */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
const normNum = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
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
      .slice(0, 50);
  return String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

const ALLOWED_FREQ = [
  "monthly",
  "bimonthly",
  "quarterly",
  "semester",
  "yearly",
  "on_demand",
];
const ALLOWED_ACTIVITY = ["none", "low", "medium", "high"];
const ALLOWED_COMPLIANCE = ["compliant", "non_compliant", "pending"];
const ALLOWED_SEVERITY = ["none", "low", "medium", "high"];

function normAction(a = {}) {
  const date = normDate(a.date);
  const action = normStr(a.action);
  const technician = normStr(a.technician);
  const zone = normStr(a.zone);
  const severity = ALLOWED_SEVERITY.includes(String(a.severity))
    ? String(a.severity)
    : "none";
  const findings = normStr(a.findings);
  const baitRefilled = normNum(a.baitRefilled);
  const proofUrls = normStringArray(a.proofUrls);
  const notes = normStr(a.notes);

  // garde si au moins date + un contenu
  if (!date) return null;
  const meaningful =
    action ||
    technician ||
    zone ||
    findings ||
    baitRefilled != null ||
    proofUrls.length ||
    notes;
  if (!meaningful) return null;

  return {
    date,
    action: action ?? undefined,
    technician: technician ?? undefined,
    zone: zone ?? undefined,
    severity,
    findings: findings ?? undefined,
    baitRefilled: baitRefilled ?? undefined,
    proofUrls,
    notes: notes ?? undefined,
  };
}

function computeLastVisitAt(inData) {
  // priorité: lastVisitAt fourni, sinon max(actions[].date)
  const fromArg = normDate(inData.lastVisitAt);
  if (fromArg) return fromArg;
  const dates = (inData.actions || [])
    .map((x) => normDate(x?.date))
    .filter(Boolean)
    .map((d) => d.getTime());
  if (dates.length) return new Date(Math.max(...dates));
  return null;
}

function listSortExpr() {
  return { lastVisitAt: -1, createdAt: -1, _id: -1 };
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/pest-controls",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const provider = normStr(inData.provider);
      if (!provider)
        return res.status(400).json({ error: "provider est requis" });

      const providerId = normObjId(inData.providerId);
      const providerContactName = normStr(inData.providerContactName);
      const providerPhone = normStr(inData.providerPhone);
      const providerEmail = normStr(inData.providerEmail);

      const contractStart = normDate(inData.contractStart);
      const contractEnd = normDate(inData.contractEnd);
      const visitFrequency = ALLOWED_FREQ.includes(
        String(inData.visitFrequency)
      )
        ? String(inData.visitFrequency)
        : "monthly";

      const baitStationsCount = normNum(inData.baitStationsCount);
      const trapsCount = normNum(inData.trapsCount);

      const lastVisitAt = computeLastVisitAt(inData);
      const nextPlannedVisit = normDate(inData.nextPlannedVisit);
      const activityLevel = ALLOWED_ACTIVITY.includes(
        String(inData.activityLevel)
      )
        ? String(inData.activityLevel)
        : "none";
      const complianceStatus = ALLOWED_COMPLIANCE.includes(
        String(inData.complianceStatus)
      )
        ? String(inData.complianceStatus)
        : "pending";

      const reportUrls = normStringArray(inData.reportUrls);
      const notes = normStr(inData.notes);

      const actions = Array.isArray(inData.actions)
        ? inData.actions.map(normAction).filter(Boolean)
        : [];

      const doc = new PestControl({
        restaurantId,
        provider,
        providerId: providerId ?? undefined,
        providerContactName: providerContactName ?? undefined,
        providerPhone: providerPhone ?? undefined,
        providerEmail: providerEmail ?? undefined,

        contractStart: contractStart ?? undefined,
        contractEnd: contractEnd ?? undefined,
        visitFrequency,

        baitStationsCount: baitStationsCount ?? undefined,
        trapsCount: trapsCount ?? undefined,

        lastVisitAt: lastVisitAt ?? undefined,
        nextPlannedVisit: nextPlannedVisit ?? undefined,
        activityLevel,
        complianceStatus,

        reportUrls,
        notes: notes ?? undefined,
        actions,

        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /pest-controls:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du suivi nuisibles" });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-pest-controls",
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
        status,
        freq,
        activity,
      } = req.query;

      const baseQuery = { restaurantId };
      const andConds = [];

      // Contrat: actif / expiré
      const now = new Date();
      if (status === "active_contract") {
        andConds.push({
          $or: [
            { contractEnd: { $exists: false } },
            { contractEnd: { $gt: now } },
          ],
        });
      } else if (status === "expired_contract") {
        andConds.push({
          contractEnd: { $lte: now },
        });
      }

      // Fréquence
      if (freq && ALLOWED_FREQ.includes(String(freq))) {
        baseQuery.visitFrequency = String(freq);
      }

      // Activité
      if (activity && ALLOWED_ACTIVITY.includes(String(activity))) {
        baseQuery.activityLevel = String(activity);
      }

      // Intervalle de dates sur lastVisitAt
      if (date_from || date_to) {
        const from = date_from ? new Date(date_from) : null;
        const to = date_to ? new Date(date_to) : null;
        if (to) {
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        andConds.push({
          lastVisitAt: {
            ...(from ? { $gte: from } : {}),
            ...(to ? { $lte: to } : {}),
          },
        });
      }

      // Recherche texte
      if (q && String(q).trim().length) {
        const safeQ = escapeRegExp(String(q).trim());
        const rx = new RegExp(safeQ, "i");
        andConds.push({
          $or: [
            { provider: rx },
            { providerContactName: rx },
            { providerPhone: rx },
            { providerEmail: rx },
            { notes: rx },
            { reportUrls: rx },
            { "actions.action": rx },
            { "actions.technician": rx },
            { "actions.zone": rx },
            { "actions.notes": rx },
          ],
        });
      }

      const finalQuery =
        andConds.length > 0 ? { ...baseQuery, $and: andConds } : baseQuery;

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        PestControl.find(finalQuery)
          .sort(listSortExpr())
          .skip(skip)
          .limit(Number(limit)),
        PestControl.countDocuments(finalQuery),
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
      console.error("GET /list-pest-controls:", err);
      return res.status(500).json({
        error: "Erreur lors de la récupération du suivi nuisibles",
      });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/pest-controls/:pcId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, pcId } = req.params;
      const doc = await PestControl.findOne({ _id: pcId, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Suivi nuisibles introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /pest-controls/:pcId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/pest-controls/:pcId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, pcId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await PestControl.findOne({ _id: pcId, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Suivi nuisibles introuvable" });

      const patch = {
        provider:
          inData.provider !== undefined
            ? normStr(inData.provider)
            : prev.provider,
        providerId:
          inData.providerId !== undefined
            ? normObjId(inData.providerId)
            : prev.providerId,
        providerContactName:
          inData.providerContactName !== undefined
            ? normStr(inData.providerContactName)
            : prev.providerContactName,
        providerPhone:
          inData.providerPhone !== undefined
            ? normStr(inData.providerPhone)
            : prev.providerPhone,
        providerEmail:
          inData.providerEmail !== undefined
            ? normStr(inData.providerEmail)
            : prev.providerEmail,

        contractStart:
          inData.contractStart !== undefined
            ? normDate(inData.contractStart)
            : prev.contractStart,
        contractEnd:
          inData.contractEnd !== undefined
            ? normDate(inData.contractEnd)
            : prev.contractEnd,
        visitFrequency:
          inData.visitFrequency !== undefined &&
          ALLOWED_FREQ.includes(String(inData.visitFrequency))
            ? String(inData.visitFrequency)
            : prev.visitFrequency,

        baitStationsCount:
          inData.baitStationsCount !== undefined
            ? normNum(inData.baitStationsCount)
            : prev.baitStationsCount,
        trapsCount:
          inData.trapsCount !== undefined
            ? normNum(inData.trapsCount)
            : prev.trapsCount,

        nextPlannedVisit:
          inData.nextPlannedVisit !== undefined
            ? normDate(inData.nextPlannedVisit)
            : prev.nextPlannedVisit,
        activityLevel:
          inData.activityLevel !== undefined &&
          ALLOWED_ACTIVITY.includes(String(inData.activityLevel))
            ? String(inData.activityLevel)
            : prev.activityLevel,
        complianceStatus:
          inData.complianceStatus !== undefined &&
          ALLOWED_COMPLIANCE.includes(String(inData.complianceStatus))
            ? String(inData.complianceStatus)
            : prev.complianceStatus,

        reportUrls:
          inData.reportUrls !== undefined
            ? normStringArray(inData.reportUrls)
            : prev.reportUrls || [],
        notes: inData.notes !== undefined ? normStr(inData.notes) : prev.notes,

        actions:
          inData.actions !== undefined && Array.isArray(inData.actions)
            ? inData.actions.map(normAction).filter(Boolean)
            : prev.actions || [],
      };

      // recalcul lastVisitAt si fourni/si actions changent
      const computedLast = computeLastVisitAt({
        lastVisitAt: inData.lastVisitAt,
        actions: patch.actions,
      });
      patch.lastVisitAt = computedLast ?? prev.lastVisitAt;

      Object.assign(prev, patch);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /pest-controls/:pcId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/pest-controls/:pcId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, pcId } = req.params;
      const doc = await PestControl.findOneAndDelete({
        _id: pcId,
        restaurantId,
      });
      if (!doc)
        return res.status(404).json({ error: "Suivi nuisibles introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /pest-controls/:pcId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ------------------ DISTINCT PROVIDERS (optionnel) ------------------ */
router.get(
  "/restaurants/:restaurantId/pest-controls/distinct/providers",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await PestControl.aggregate([
        { $match: { restaurantId: new Types.ObjectId(String(restaurantId)) } },
        { $group: { _id: { provider: "$provider" }, count: { $sum: 1 } } },
        { $sort: { "_id.provider": 1 } },
      ]);
      const items = rows.map((r) => ({
        provider: r._id.provider || "",
        count: r.count,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /pest-controls/distinct/providers:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des prestataires" });
    }
  }
);

module.exports = router;
