const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const WasteEntry = require("../../models/logs/waste-entry.model");

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const path = require("path");
const axios = require("axios");

// ---------- Cloudinary config ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- Multer mémoire ----------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------- Utils généraux ----------
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
  return Number.isFinite(n) ? n : null;
};

// On ne normalise plus les attachments ici (gérés par Cloudinary + req.files)
function normalizeWaste(inData = {}) {
  return {
    date: normDate(inData.date) ?? undefined,
    wasteType: normStr(inData.wasteType) ?? undefined,
    weightKg: normNum(inData.weightKg) ?? undefined,
    unit: normStr(inData.unit) ?? undefined,
    disposalMethod: normStr(inData.disposalMethod) ?? undefined,
    contractor: normStr(inData.contractor) ?? null,
    manifestNumber: normStr(inData.manifestNumber) ?? null,
    notes: normStr(inData.notes) ?? null,
  };
}

// ---------- Helpers Cloudinary ----------
function haccpWasteFolder(restaurantId) {
  // tu peux adapter le nom du dossier "waste-entries" si tu veux
  return `Gusto_Workspace/restaurants/${restaurantId}/haccp/waste-entries`;
}

function safePublicIdFromFilename(originalname) {
  const ext = path.extname(originalname);
  const basename = path.basename(originalname, ext);
  const safeBase = basename
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "");
  // Optionnel : ajoute un timestamp pour éviter les collisions
  const stamp = Date.now();
  return `${safeBase}_${stamp}`;
}

function uploadWasteFile(buffer, originalname, mimetype, restaurantId) {
  const folder = haccpWasteFolder(restaurantId);
  const public_id = safePublicIdFromFilename(originalname);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw", // supporte PDF + images
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

async function deleteWasteAttachment(public_id) {
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

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/waste-entries",
  authenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const body = normalizeWaste(req.body);
      if (!body.wasteType)
        return res.status(400).json({ error: "wasteType requis" });
      if (body.weightKg == null)
        return res.status(400).json({ error: "weightKg requis" });
      if (!body.date) body.date = new Date();

      // Upload éventuels fichiers
      let attachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadWasteFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              restaurantId
            )
          )
        );
        attachments = uploads;
      }

      const doc = new WasteEntry({
        restaurantId,
        ...body,
        attachments,
        recordedBy: currentUser,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /waste-entries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de l'entrée déchets" });
    }
  }
);

/* ---------- LIST ---------- */
// Filtres : waste_type, method (disposalMethod), date_from/date_to, q (texte)
// Pagination: page/limit
router.get(
  "/restaurants/:restaurantId/list-waste-entries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        waste_type,
        method,
        date_from,
        date_to,
        q,
      } = req.query;

      const query = { restaurantId };

      if (waste_type && String(waste_type).trim().length) {
        query.wasteType = String(waste_type).trim();
      }
      if (method && String(method).trim().length) {
        query.disposalMethod = String(method).trim();
      }

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

      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        query.$or = [
          { contractor: rx },
          { manifestNumber: rx },
          { notes: rx },
          { wasteType: rx },
          { disposalMethod: rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        WasteEntry.find(query)
          .sort({ date: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        WasteEntry.countDocuments(query),
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
      console.error("GET /list-waste-entries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des déchets" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/waste-entries/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Entrée déchets introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /waste-entries/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de l'entrée" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/waste-entries/:id",
  authenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const inData = { ...req.body };

      // champs protégés
      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;
      delete inData.attachments; // on gère nous-mêmes

      const prev = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!prev)
        return res.status(404).json({ error: "Entrée déchets introuvable" });

      const patch = normalizeWaste(inData);

      // ----- Gestion des pièces jointes -----
      const prevAttachments = Array.isArray(prev.attachments)
        ? prev.attachments
        : [];

      // Liste des public_id à conserver (venant du front)
      let keep = req.body.keepAttachments || [];
      if (!Array.isArray(keep)) keep = keep ? [keep] : [];
      keep = keep.map((s) => String(s));

      const attachmentsToKeep = prevAttachments.filter((att) =>
        keep.includes(String(att.public_id))
      );
      const attachmentsToRemove = prevAttachments.filter(
        (att) => !keep.includes(String(att.public_id))
      );

      // Suppression Cloudinary des pièces retirées
      if (attachmentsToRemove.length) {
        await Promise.all(
          attachmentsToRemove.map((att) => deleteWasteAttachment(att.public_id))
        );
      }

      // Upload nouveaux fichiers
      let newAttachments = [];
      if (Array.isArray(req.files) && req.files.length) {
        const uploads = await Promise.all(
          req.files.map((file) =>
            uploadWasteFile(
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

      // Application du patch de base
      Object.assign(prev, patch, { updatedAt: new Date() });
      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /waste-entries/:id:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de l'entrée" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/waste-entries/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await WasteEntry.findOne({ _id: id, restaurantId });
      if (!doc)
        return res.status(404).json({ error: "Entrée déchets introuvable" });

      if (Array.isArray(doc.attachments) && doc.attachments.length) {
        await Promise.all(
          doc.attachments.map((att) => deleteWasteAttachment(att.public_id))
        );
      }

      await WasteEntry.deleteOne({ _id: id, restaurantId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /waste-entries/:id:", err);
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  }
);

// ---------- DOWNLOAD ATTACHMENT ----------
router.get(
  "/haccp/waste-entries/:restaurantId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, public_id } = req.params;

      // On cherche UNE entrée déchets de ce resto qui contient cette pièce jointe
      const doc = await WasteEntry.findOne(
        {
          restaurantId,
          "attachments.public_id": public_id,
        },
        { attachments: 1 } // on ne récupère que les attachments
      ).lean();

      if (!doc) {
        console.log(
          "[HACCP DOWNLOAD] Aucune entrée contenant cette pièce jointe"
        );
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      const att = (doc.attachments || []).find(
        (a) => a.public_id === public_id
      );
      if (!att) {
        console.log("[HACCP DOWNLOAD] Attachment non trouvé dans le doc");
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
      console.error("Error in HACCP waste download route:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
