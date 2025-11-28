const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const ReceptionDelivery = require("../../models/logs/reception-delivery.model");

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

// ---------- Normalisation lignes ----------
const ALLOWED_PACKAGING = new Set(["compliant", "non-compliant"]);

function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0;
  return 3;
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// lines peut arriver soit comme tableau JSON, soit comme string JSON (FormData)
function parseLinesInput(linesField) {
  if (!linesField) return [];
  if (typeof linesField === "string") {
    try {
      const parsed = JSON.parse(linesField);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn("parseLinesInput: JSON.parse failed");
      return [];
    }
  }
  return Array.isArray(linesField) ? linesField : [];
}

function normalizeLine(l = {}) {
  const productName = normStr(l.productName);
  const supplierProductId = normStr(l.supplierProductId);
  const lotNumber = normStr(l.lotNumber);
  const dlc = normDate(l.dlc);
  const ddm = normDate(l.ddm);
  const qty = normNum(l.qty);
  const unit = normStr(l.unit);
  const tempOnArrival = normNum(l.tempOnArrival);

  let allergens = Array.isArray(l.allergens)
    ? l.allergens
    : typeof l.allergens === "string"
      ? l.allergens
          .split(/[;,]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  allergens = allergens.map((a) => normStr(a)).filter((a) => a && a.length);

  const packagingCondition = ALLOWED_PACKAGING.has(l.packagingCondition)
    ? l.packagingCondition
    : "compliant";

  let qtyRemaining = normNum(l.qtyRemaining);
  if (qty != null) {
    const qrRaw = qtyRemaining == null ? qty : qtyRemaining;
    const roundedQty = roundByUnit(qty, unit);
    const roundedRemaining = roundByUnit(qrRaw, unit);
    qtyRemaining = Math.max(0, Math.min(roundedRemaining, roundedQty));
  } else {
    qtyRemaining = undefined;
  }

  return {
    productName: productName ?? undefined,
    supplierProductId: supplierProductId ?? undefined,
    lotNumber: lotNumber ?? undefined,
    dlc: dlc ?? undefined,
    ddm: ddm ?? undefined,
    qty: qty != null ? roundByUnit(qty, unit) : undefined,
    unit: unit ?? undefined,
    tempOnArrival: tempOnArrival ?? undefined,
    allergens,
    packagingCondition,
    qtyRemaining,
  };
}

function isMeaningfulLine(x = {}) {
  return Boolean(
    x.productName ||
      x.supplierProductId ||
      x.lotNumber ||
      x.dlc ||
      x.ddm ||
      x.qty != null ||
      x.unit ||
      x.tempOnArrival != null ||
      (Array.isArray(x.allergens) && x.allergens.length > 0)
  );
}

// ---------- Helpers Cloudinary ----------
function haccpReceptionFolder(restaurantId) {
  return `Gusto_Workspace/restaurants/${restaurantId}/haccp/reception-deliveries`;
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

function uploadReceptionFile(buffer, originalname, mimetype, restaurantId) {
  const folder = haccpReceptionFolder(restaurantId);
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

async function deleteReceptionAttachment(public_id) {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: "raw",
    });
  } catch (err) {
    console.warn(
      `Erreur suppression pièce jointe réception Cloudinary (${public_id}):`,
      err
    );
  }
}

// Regroupe les fichiers par index de ligne (lineAttachments_0, lineAttachments_1, …)
function collectFilesByIndex(filesArray) {
  const byIndex = new Map();
  (filesArray || []).forEach((file) => {
    const m = /^lineAttachments_(\d+)$/.exec(file.fieldname || "");
    if (!m) return;
    const idx = Number(m[1]);
    if (!byIndex.has(idx)) byIndex.set(idx, []);
    byIndex.get(idx).push(file);
  });
  return byIndex;
}

// Récupère les public_id à garder pour une ligne donnée (keepLineAttachment_0)
function getKeepPublicIds(body, index) {
  const key = `keepLineAttachment_${index}`;
  const raw = body[key];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  return [String(raw)];
}

/* ---------- CREATE ---------- */
router.post(
  "/restaurants/:restaurantId/reception-deliveries",
  authenticateToken,
  upload.any(),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const supplier = normStr(inData.supplier);
      if (!supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const receivedAt = normDate(inData.receivedAt) || new Date();
      const note = normStr(inData.note);
      const billUrl = normStr(inData.billUrl);

      const rawLines = parseLinesInput(inData.lines);
      const filesByIndex = collectFilesByIndex(req.files);

      const lines = [];
      for (let i = 0; i < rawLines.length; i += 1) {
        const baseNorm = normalizeLine(rawLines[i]);
        if (!isMeaningfulLine(baseNorm)) continue;

        const filesForLine = filesByIndex.get(i) || [];
        let attachments = [];
        if (filesForLine.length) {
          const uploads = await Promise.all(
            filesForLine.map((f) =>
              uploadReceptionFile(
                f.buffer,
                f.originalname,
                f.mimetype,
                restaurantId
              )
            )
          );
          attachments = uploads;
        }

        lines.push({
          ...baseNorm,
          attachments,
        });
      }

      const doc = new ReceptionDelivery({
        restaurantId,
        supplier,
        receivedAt,
        lines,
        recordedBy: currentUser,
        note: note ?? undefined,
        billUrl: billUrl ?? undefined,
      });

      await doc.save();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /reception-deliveries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de la réception" });
    }
  }
);

/* ---------- LIST ---------- */
router.get(
  "/restaurants/:restaurantId/list-reception-deliveries",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q } = req.query;

      const query = { restaurantId };

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
        if (Object.keys(range).length) query.receivedAt = range;
      }

      const trimmedQ = String(q || "").trim();
      if (trimmedQ) {
        const safe = escapeRegExp(trimmedQ);
        const rx = new RegExp(safe, "i");

        query.$or = [
          { supplier: rx },
          { note: rx },
          { billUrl: rx },
          { "lines.productName": rx },
          { "lines.supplierProductId": rx },
          { "lines.lotNumber": rx },
          { "lines.unit": rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [items, total] = await Promise.all([
        ReceptionDelivery.find(query)
          .sort({ receivedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        ReceptionDelivery.countDocuments(query),
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
      console.error("GET /reception-deliveries:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des réceptions" });
    }
  }
);

/* ---------- READ ONE ---------- */
router.get(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const doc = await ReceptionDelivery.findOne({
        _id: receptionId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Réception introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération de la réception" });
    }
  }
);

/* ---------- UPDATE ---------- */
router.put(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  upload.any(),
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const inData = { ...req.body };

      // champs protégés
      delete inData.recordedBy;
      delete inData.restaurantId;
      delete inData.createdAt;
      delete inData.updatedAt;
      delete inData.attachments;

      const prev = await ReceptionDelivery.findOne({
        _id: receptionId,
        restaurantId,
      });
      if (!prev)
        return res.status(404).json({ error: "Réception introuvable" });

      const supplier =
        inData.supplier !== undefined
          ? normStr(inData.supplier)
          : prev.supplier;
      if (!supplier)
        return res.status(400).json({ error: "supplier est requis" });

      const receivedAt =
        inData.receivedAt !== undefined
          ? normDate(inData.receivedAt) || prev.receivedAt
          : prev.receivedAt;

      const note = inData.note !== undefined ? normStr(inData.note) : prev.note;

      const billUrl =
        inData.billUrl !== undefined ? normStr(inData.billUrl) : prev.billUrl;

      const rawLines =
        inData.lines !== undefined
          ? parseLinesInput(inData.lines)
          : prev.lines || [];

      // Map des anciennes pièces jointes par public_id
      const prevAttachmentsById = new Map();
      (prev.lines || []).forEach((line) => {
        (line.attachments || []).forEach((att) => {
          if (att?.public_id) {
            prevAttachmentsById.set(
              String(att.public_id),
              att.toObject ? att.toObject() : att
            );
          }
        });
      });

      const filesByIndex = collectFilesByIndex(req.files);
      const newLines = [];
      const newPublicIds = new Set();

      // On reconstitue entièrement les lignes avec leurs attachments
      for (let i = 0; i < rawLines.length; i += 1) {
        const baseNorm = normalizeLine(rawLines[i]);
        if (!isMeaningfulLine(baseNorm)) continue;

        const keepIds = getKeepPublicIds(inData, i);
        const attachments = [];

        // Pièces à garder (anciennes)
        keepIds.forEach((idStr) => {
          const att = prevAttachmentsById.get(String(idStr));
          if (att) {
            attachments.push(att);
            newPublicIds.add(String(att.public_id));
          }
        });

        // Nouveaux fichiers
        const filesForLine = filesByIndex.get(i) || [];
        if (filesForLine.length) {
          const uploaded = await Promise.all(
            filesForLine.map((f) =>
              uploadReceptionFile(
                f.buffer,
                f.originalname,
                f.mimetype,
                restaurantId
              )
            )
          );
          uploaded.forEach((att) => {
            attachments.push(att);
            if (att.public_id) newPublicIds.add(String(att.public_id));
          });
        }

        newLines.push({
          ...baseNorm,
          attachments,
        });
      }

      // Calcul des anciens IDs vs nouveaux pour suppression Cloudinary
      const prevPublicIds = new Set();
      (prev.lines || []).forEach((line) => {
        (line.attachments || []).forEach((att) => {
          if (att?.public_id) prevPublicIds.add(String(att.public_id));
        });
      });

      const toDelete = [];
      prevPublicIds.forEach((id) => {
        if (!newPublicIds.has(id)) toDelete.push(id);
      });

      if (toDelete.length) {
        await Promise.all(toDelete.map((id) => deleteReceptionAttachment(id)));
      }

      prev.supplier = supplier;
      prev.receivedAt = receivedAt;
      prev.note = note ?? undefined;
      prev.billUrl = billUrl ?? undefined;
      prev.lines = newLines;

      await prev.save();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la réception" });
    }
  }
);

/* ---------- DELETE ---------- */
router.delete(
  "/restaurants/:restaurantId/reception-deliveries/:receptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, receptionId } = req.params;
      const doc = await ReceptionDelivery.findOneAndDelete({
        _id: receptionId,
        restaurantId,
      });

      if (!doc) return res.status(404).json({ error: "Réception introuvable" });

      // Suppression des pièces jointes Cloudinary liées
      const toDelete = [];
      (doc.lines || []).forEach((line) => {
        (line.attachments || []).forEach((att) => {
          if (att?.public_id) toDelete.push(String(att.public_id));
        });
      });

      if (toDelete.length) {
        await Promise.all(toDelete.map((id) => deleteReceptionAttachment(id)));
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /reception-deliveries/:receptionId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression de la réception" });
    }
  }
);

// ---------- DOWNLOAD ATTACHMENT ----------
router.get(
  "/haccp/reception-deliveries/:restaurantId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, public_id } = req.params;

      // On cherche UNE réception de ce resto qui contient cette pièce jointe dans une ligne
      const doc = await ReceptionDelivery.findOne(
        {
          restaurantId,
          "lines.attachments.public_id": public_id,
        },
        { lines: 1 }
      ).lean();

      if (!doc) {
        console.log(
          "[HACCP RECEPTION DOWNLOAD] Aucun document contenant cette pièce jointe"
        );
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      let att = null;
      for (const line of doc.lines || []) {
        const cand = (line.attachments || []).find(
          (a) => a.public_id === public_id
        );
        if (cand) {
          att = cand;
          break;
        }
      }

      if (!att) {
        console.log(
          "[HACCP RECEPTION DOWNLOAD] Attachment non trouvé dans les lignes"
        );
        return res.status(404).json({ message: "Pièce jointe introuvable" });
      }

      const response = await axios.get(att.url, { responseType: "stream" });

      res.setHeader("Content-Type", response.headers["content-type"]);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${att.filename || "document"}"`
      );

      response.data.pipe(res);
    } catch (err) {
      console.error("Error in HACCP reception download route:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
