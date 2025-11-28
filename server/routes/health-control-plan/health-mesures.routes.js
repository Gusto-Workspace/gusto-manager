const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const HealthMeasure = require("../../models/logs/health-measure.model");

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const path = require("path");
const axios = require("axios");

/* ---------- Cloudinary config ---------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------- Multer mémoire ---------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------- helpers généraux ---------- */
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

function normalize(inData = {}) {
  return {
    type: normStr(inData.type) ?? undefined,
    performedAt: normDate(inData.performedAt) ?? undefined,
    notes: normStr(inData.notes) ?? null,
  };
}

/* ---------- Helpers Cloudinary ---------- */
function haccpHealthFolder(restaurantId) {
  return `Gusto_Workspace/restaurants/${restaurantId}/haccp/health-measures`;
}

function safePublicIdFromFilename(originalname) {
  const ext = path.extname(originalname);
  const basename = path.basename(originalname, ext);
  const safeBase = basename
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "");
  const stamp = Date.now();
  return `${safeBase}_${stamp}`;
}

function uploadHealthFile(buffer, originalname, mimetype, restaurantId) {
  const folder = haccpHealthFolder(restaurantId);
  const public_id = safePublicIdFromFilename(originalname);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        public_id,
        overwrite: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          filename: originalname,
          mimetype,
        });
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

async function deleteHealthAttachment(public_id) {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: "raw",
    });
  } catch (err) {
    console.warn(
      `Erreur suppression pièce jointe Cloudinary health-measures (${public_id}):`,
      err
    );
  }
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/health-measures",
  authenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normalize(req.body);

      // Upload éventuels fichiers
      let attachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadHealthFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              restaurantId
            )
          )
        );
        attachments = uploads;
      }

      const doc = new HealthMeasure({
        restaurantId,
        ...body,
        attachments,
        createdBy: currentUser,
      });
      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /health-measures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la mesure" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres: type, date_from/date_to, q (notes/attachments/type), pagination
router.get(
  "/restaurants/:restaurantId/list-health-measures",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, type, date_from, date_to, q } = req.query;

      const query = { restaurantId };

      if (type && String(type).trim().length) query.type = String(type).trim();

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
        if (Object.keys(range).length) query.performedAt = range;
      }

      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        query.$or = [
          { notes: rx },
          { type: rx },
          { "attachments.filename": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        HealthMeasure.find(query)
          .sort({ performedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        HealthMeasure.countDocuments(query),
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
      console.error("GET /list-health-measures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des mesures" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Mesure introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /health-measures/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      // champs protégés
      delete inData.createdBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;
      delete inData.attachments;

      const prev = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!prev) return res.status(404).json({ error: "Mesure introuvable" });

      const patch = normalize(inData);

      // Gestion des pièces jointes
      const prevAttachments = Array.isArray(prev.attachments)
        ? prev.attachments
        : [];

      // Liste des public_id à conserver (depuis le front)
      let keep = req.body.keepAttachments || [];
      if (!Array.isArray(keep)) keep = keep ? [keep] : [];
      keep = keep.map((s) => String(s));

      const attachmentsToKeep = prevAttachments.filter((att) =>
        keep.includes(String(att.public_id))
      );
      const attachmentsToRemove = prevAttachments.filter(
        (att) => !keep.includes(String(att.public_id))
      );

      if (attachmentsToRemove.length) {
        await Promise.all(
          attachmentsToRemove.map((att) =>
            deleteHealthAttachment(att.public_id)
          )
        );
      }

      // Nouveaux fichiers
      let newAttachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadHealthFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              restaurantId
            )
          )
        );
        newAttachments = uploads;
      }

      prev.attachments = [...attachmentsToKeep, ...newAttachments];

      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /health-measures/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la mesure" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/health-measures/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await HealthMeasure.findOne({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Mesure introuvable" });

      if (Array.isArray(doc.attachments) && doc.attachments.length) {
        await Promise.all(
          doc.attachments.map((att) => deleteHealthAttachment(att.public_id))
        );
      }

      await HealthMeasure.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /health-measures/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ---------- DOWNLOAD ATTACHMENT ---------- */
router.get(
  "/haccp/health-measures/:restaurantId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, public_id } = req.params;

      const doc = await HealthMeasure.findOne(
        {
          restaurantId,
          "attachments.public_id": public_id,
        },
        { attachments: 1 }
      ).lean();

      if (!doc) {
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      const att = (doc.attachments || []).find(
        (a) => a.public_id === public_id
      );
      if (!att) {
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      const response = await axios.get(att.url, { responseType: "stream" });

      res.setHeader("Content-Type", response.headers["content-type"]);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${att.filename}"`
      );

      response.data.pipe(res);
    } catch (err) {
      console.error("Error in health-measures download route:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
