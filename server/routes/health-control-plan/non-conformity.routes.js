const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const NonConformity = require("../../models/logs/non-conformity.model");

// ---------- Cloudinary & upload (comme waste-entries) ----------
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const path = require("path");
const axios = require("axios");

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer mémoire
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------- Helpers généraux ----------
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

const normObjId = (v) => {
  if (!v) return null;
  const s = String(v);
  return Types.ObjectId.isValid(s) ? s : null;
};

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// ---------- Helpers Cloudinary (catégorie = non-conformities) ----------
function haccpNonConformitiesFolder(restaurantId) {
  return `Gusto_Workspace/restaurants/${restaurantId}/haccp/non-conformities`;
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

function uploadNonConformityFile(buffer, originalname, mimetype, restaurantId) {
  const folder = haccpNonConformitiesFolder(restaurantId);
  const public_id = safePublicIdFromFilename(originalname);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw", // PDF + images
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

async function deleteNonConformityAttachment(public_id) {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: "raw",
    });
  } catch (err) {
    console.warn(
      `Erreur suppression pièce jointe Cloudinary (${public_id}):`,
      err
    );
  }
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/non-conformities",
  authenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      // On supporte un champ "payload" JSON (envoyé par le front) ou un body simple
      let inData = {};
      if (req.body && req.body.payload) {
        try {
          inData = JSON.parse(req.body.payload);
        } catch (e) {
          console.error("Erreur parse payload JSON non-conformité:", e);
          return res
            .status(400)
            .json({ error: "Payload JSON invalide pour non-conformité" });
        }
      } else {
        inData = { ...req.body };
      }

      const type = ALLOWED_TYPES.includes(String(inData.type))
        ? String(inData.type)
        : "other";
      const severity = ALLOWED_SEVERITY.includes(String(inData.severity))
        ? String(inData.severity)
        : "medium";
      const status = ALLOWED_STATUS.includes(String(inData.status))
        ? String(inData.status)
        : "open";

      let correctiveActions = [];
      if (Array.isArray(inData.correctiveActions)) {
        correctiveActions = inData.correctiveActions
          .map(normCorrectiveAction)
          .filter(Boolean);
      }

      // Upload éventuels fichiers (Cloudinary)
      let attachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadNonConformityFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              restaurantId
            )
          )
        );
        attachments = uploads;
      }

      const doc = new NonConformity({
        restaurantId,
        type,
        referenceId: normStr(inData.referenceId) ?? undefined,
        description: normStr(inData.description) ?? undefined,
        severity,
        reportedAt: normDate(inData.reportedAt) ?? new Date(),
        status,
        attachments,
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

      // Recherche texte sécurisée
      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
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

      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await Promise.all([
        NonConformity.find(query)
          .sort(listSortExpr())
          .skip(skip)
          .limit(limitNum),
        NonConformity.countDocuments(query),
      ]);

      return res.json({
        items,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum)),
        },
      });
    } catch (err) {
      console.error("GET /list-non-conformities:", err);
      return res.status(500).json({
        error: "Erreur lors de la récupération des non-conformités",
      });
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
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId, ncId } = req.params;

      // Body brut (peut contenir payload JSON)
      let inData = {};
      if (req.body && req.body.payload) {
        try {
          inData = JSON.parse(req.body.payload);
        } catch (e) {
          console.error("Erreur parse payload JSON non-conformité (PUT):", e);
          return res
            .status(400)
            .json({ error: "Payload JSON invalide pour non-conformité" });
        }
      } else {
        inData = { ...req.body };
      }

      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;
      delete inData.attachments;

      const prev = await NonConformity.findOne({ _id: ncId, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Non-conformité introuvable" });

      // Normalisation des champs simples
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
      };

      // Actions correctives
      if (Array.isArray(inData.correctiveActions)) {
        patch.correctiveActions = inData.correctiveActions
          .map(normCorrectiveAction)
          .filter(Boolean);
      } else {
        patch.correctiveActions = prev.correctiveActions || [];
      }

      // ----- Gestion des pièces jointes (comme waste-entries) -----
      const prevAttachments = Array.isArray(prev.attachments)
        ? prev.attachments
        : [];

      // On sépare "legacy" (strings) & objets Cloudinary
      const legacyAttachments = prevAttachments.filter(
        (att) => !att || typeof att === "string" || !att.public_id
      );
      const cloudAttachments = prevAttachments.filter(
        (att) => att && typeof att === "object" && att.public_id
      );

      // Liste des public_id à conserver (venant du front)
      let keep = req.body.keepAttachments || [];
      if (!Array.isArray(keep)) keep = keep ? [keep] : [];
      keep = keep.map((s) => String(s));

      const attachmentsToKeep = cloudAttachments.filter((att) =>
        keep.includes(String(att.public_id))
      );
      const attachmentsToRemove = cloudAttachments.filter(
        (att) => !keep.includes(String(att.public_id))
      );

      // Suppression Cloudinary des pièces retirées
      if (attachmentsToRemove.length) {
        await Promise.all(
          attachmentsToRemove.map((att) =>
            deleteNonConformityAttachment(att.public_id)
          )
        );
      }

      // Upload nouveaux fichiers
      let newAttachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadNonConformityFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              restaurantId
            )
          )
        );
        newAttachments = uploads;
      }

      // On conserve les éventuels anciens liens "legacy" + keep + nouveaux
      prev.attachments = [
        ...legacyAttachments,
        ...attachmentsToKeep,
        ...newAttachments,
      ];

      Object.assign(prev, patch, { updatedAt: new Date() });
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
      const doc = await NonConformity.findOne({
        _id: ncId,
        restaurantId,
      });
      if (!doc)
        return res.status(404).json({ error: "Non-conformité introuvable" });

      // Suppression des pièces Cloudinary éventuelles
      if (Array.isArray(doc.attachments) && doc.attachments.length) {
        const cloudAttachments = doc.attachments.filter(
          (att) => att && typeof att === "object" && att.public_id
        );
        if (cloudAttachments.length) {
          await Promise.all(
            cloudAttachments.map((att) =>
              deleteNonConformityAttachment(att.public_id)
            )
          );
        }
      }

      await NonConformity.deleteOne({ _id: ncId, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /non-conformities/:ncId:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

/* ---------- DOWNLOAD ATTACHMENT (non-conformities) ---------- */
router.get(
  "/haccp/non-conformities/:restaurantId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, public_id } = req.params;

      const doc = await NonConformity.findOne(
        {
          restaurantId,
          "attachments.public_id": public_id,
        },
        { attachments: 1 }
      ).lean();

      if (!doc) {
        console.log(
          "[HACCP NON-CONF] Aucune non-conformité contenant cette pièce jointe"
        );
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      const att = (doc.attachments || []).find(
        (a) => a.public_id === public_id
      );
      if (!att) {
        console.log("[HACCP NON-CONF] Attachment non trouvé dans le document");
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
      console.error("Error in HACCP non-conformities download route:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
