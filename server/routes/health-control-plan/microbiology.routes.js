const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const Microbiology = require("../../models/logs/microbiology.model");

/* ---------- helpers (alignés sur pest-control) ---------- */
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

function listSortExpr() {
  return { sampledAt: -1, createdAt: -1, _id: -1 };
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/microbiology",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const sampleType = ["surface", "food", "water"].includes(
        String(inData.sampleType)
      )
        ? String(inData.sampleType)
        : null;
      if (!sampleType)
        return res
          .status(400)
          .json({ error: "sampleType est requis (surface|food|water)" });

      const sampledAt = normDate(inData.sampledAt);
      if (!sampledAt)
        return res
          .status(400)
          .json({ error: "sampledAt est requis (date valide)" });

      const doc = new Microbiology({
        restaurantId,

        sampleType,
        sampledAt,
        analysedAt: normDate(inData.analysedAt) ?? undefined,
        samplingPoint: normStr(inData.samplingPoint) ?? undefined,
        productName: normStr(inData.productName) ?? undefined,
        lotNumber: normStr(inData.lotNumber) ?? undefined,

        labName: normStr(inData.labName) ?? undefined,
        labReference: normStr(inData.labReference) ?? undefined,
        method: normStr(inData.method) ?? undefined,
        detectionLimit: normStr(inData.detectionLimit) ?? undefined,
        criterion: normStr(inData.criterion) ?? undefined,

        parameter: normStr(inData.parameter) ?? undefined,
        result: normStr(inData.result) ?? undefined,
        unit: normStr(inData.unit) ?? undefined,
        passed: normBool(inData.passed),

        reportUrl: normStr(inData.reportUrl) ?? undefined,
        notes: normStr(inData.notes) ?? undefined,

        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /microbiology:", err);
      return res
        .status(500)
        .json({
          error: "Erreur lors de la création de l'analyse microbiologique",
        });
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-microbiology",
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
        type, // surface|food|water
        passed, // true|false
      } = req.query;

      const query = { restaurantId };

      // Type
      if (type && ["surface", "food", "water"].includes(String(type))) {
        query.sampleType = String(type);
      }

      // Conformité
      const passedVal = normBool(passed);
      if (passedVal !== null) query.passed = passedVal;

      // Intervalle sur sampledAt
      if (date_from || date_to) {
        const from = date_from ? normDate(date_from) : null;
        const to = date_to ? normDate(date_to) : null;
        if (to) {
          // inclure toute la journée "to"
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        if (from || to) {
          query.sampledAt = {
            ...(from ? { $gte: from } : {}),
            ...(to ? { $lte: to } : {}),
          };
        }
      }

      // Recherche texte
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { parameter: rx },
          { result: rx },
          { unit: rx },
          { labName: rx },
          { labReference: rx },
          { samplingPoint: rx },
          { productName: rx },
          { lotNumber: rx },
          { notes: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        Microbiology.find(query)
          .sort(listSortExpr())
          .skip(skip)
          .limit(Number(limit)),
        Microbiology.countDocuments(query),
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
      console.error("GET /list-microbiology:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des analyses" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/microbiology/:mId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, mId } = req.params;
      const doc = await Microbiology.findOne({ _id: mId, restaurantId });
      if (!doc)
        return res
          .status(404)
          .json({ error: "Analyse microbiologique introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /microbiology/:mId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/microbiology/:mId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, mId } = req.params;
      const inData = { ...req.body };

      // interdit de modifier ces champs
      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await Microbiology.findOne({ _id: mId, restaurantId });
      if (!prev)
        return res
          .status(404)
          .json({ error: "Analyse microbiologique introuvable" });

      const patch = {
        sampleType:
          inData.sampleType !== undefined &&
          ["surface", "food", "water"].includes(String(inData.sampleType))
            ? String(inData.sampleType)
            : prev.sampleType,
        sampledAt:
          inData.sampledAt !== undefined
            ? normDate(inData.sampledAt)
            : prev.sampledAt,
        analysedAt:
          inData.analysedAt !== undefined
            ? normDate(inData.analysedAt)
            : prev.analysedAt,

        samplingPoint:
          inData.samplingPoint !== undefined
            ? normStr(inData.samplingPoint)
            : prev.samplingPoint,
        productName:
          inData.productName !== undefined
            ? normStr(inData.productName)
            : prev.productName,
        lotNumber:
          inData.lotNumber !== undefined
            ? normStr(inData.lotNumber)
            : prev.lotNumber,

        labName:
          inData.labName !== undefined ? normStr(inData.labName) : prev.labName,
        labReference:
          inData.labReference !== undefined
            ? normStr(inData.labReference)
            : prev.labReference,
        method:
          inData.method !== undefined ? normStr(inData.method) : prev.method,
        detectionLimit:
          inData.detectionLimit !== undefined
            ? normStr(inData.detectionLimit)
            : prev.detectionLimit,
        criterion:
          inData.criterion !== undefined
            ? normStr(inData.criterion)
            : prev.criterion,

        parameter:
          inData.parameter !== undefined
            ? normStr(inData.parameter)
            : prev.parameter,
        result:
          inData.result !== undefined ? normStr(inData.result) : prev.result,
        unit: inData.unit !== undefined ? normStr(inData.unit) : prev.unit,
        passed:
          inData.passed !== undefined ? normBool(inData.passed) : prev.passed,

        reportUrl:
          inData.reportUrl !== undefined
            ? normStr(inData.reportUrl)
            : prev.reportUrl,
        notes: inData.notes !== undefined ? normStr(inData.notes) : prev.notes,
      };

      Object.assign(prev, patch);
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /microbiology/:mId:", err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/microbiology/:mId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, mId } = req.params;
      const doc = await Microbiology.findOneAndDelete({
        _id: mId,
        restaurantId,
      });
      if (!doc)
        return res
          .status(404)
          .json({ error: "Analyse microbiologique introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /microbiology/:mId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ------------------ DISTINCT PARAMETERS (optionnel) ------------------ */
router.get(
  "/restaurants/:restaurantId/microbiology/distinct/parameters",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const rows = await Microbiology.aggregate([
        { $match: { restaurantId: new Types.ObjectId(String(restaurantId)) } },
        { $group: { _id: { parameter: "$parameter" }, count: { $sum: 1 } } },
        { $sort: { "_id.parameter": 1 } },
      ]);
      const items = rows.map((r) => ({
        parameter: r._id.parameter || "",
        count: r.count,
      }));
      return res.json({ items });
    } catch (err) {
      console.error("GET /microbiology/distinct/parameters:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des paramètres" });
    }
  }
);

module.exports = router;
