const express = require("express");
const router = express.Router();
const multer = require("multer");
const SibApiV3Sdk = require("sib-api-v3-sdk");

// CLOUDINARY
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// MIDDLEWARE / MODELS
const authenticateToken = require("../../middleware/authentificate-token");
const DocumentModel = require("../../models/document.model");

// PDF RENDERERS
const {
  renderInvoiceLikePdf,
} = require("../../services/pdf/render-invoice-like.service");
const {
  renderContractPdf,
} = require("../../services/pdf/render-contract.service");

// ---------- MULTER ----------
const storage = multer.memoryStorage();
const upload = multer({ storage }); // pas utilisé pour l’instant

// ✅ dossier unique voulu
const CLOUDINARY_DOCS_FOLDER = "Gusto_Workspace/admin/documents";

// ---------- CLOUDINARY CONFIG ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- CLOUDINARY HELPERS ----------
// PDF => resource_type raw
const uploadPdfFromBuffer = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "raw",
        public_id: filename,
        overwrite: true,
      },
      (error, result) => (result ? resolve(result) : reject(error)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ---------- DOC NUMBER (timestamp) ----------
function prefixByType(type) {
  if (type === "QUOTE") return "D";
  if (type === "INVOICE") return "F";
  if (type === "CONTRACT") return "C";
  return "X";
}
function getDocNumber(type) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `WD-${prefixByType(type)}-${datePart}-${timePart}`;
}

// ---------- BREVO ----------
function instantiateClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return defaultClient;
}

async function sendDocEmail({
  toEmail,
  toName,
  subject,
  html,
  attachmentBase64,
  attachmentName,
}) {
  instantiateClient();

  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.sender = {
    email: "no-reply@gusto-manager.com",
    name: "Gusto Manager",
  };
  sendSmtpEmail.to = [{ email: toEmail, name: toName || toEmail }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;

  if (attachmentBase64) {
    sendSmtpEmail.attachment = [
      { content: attachmentBase64, name: attachmentName || "document.pdf" },
    ];
  }

  return apiInstance.sendTransacEmail(sendSmtpEmail);
}

// ---------- EMITTER (config) ----------
const EMITTER = {
  title: "WebDev",
  address: "84 Bd Arago, 75014 Paris",
  email: "contact@gusto-manager.com",
  iban: process.env.EMITTER_IBAN || "IBAN A AJOUTER EN .ENV",
  bic: process.env.EMITTER_BIC || "BIC A AJOUTER EN .ENV",
  logoPath: "assets/logo.png",
};

// ---------- HELPERS ----------
function buildEmailSubject(doc) {
  if (doc.type === "QUOTE") return `Votre devis ${doc.docNumber}`;
  if (doc.type === "INVOICE") return `Votre facture ${doc.docNumber}`;
  return `Votre contrat ${doc.docNumber}`;
}

async function buildPdfBuffer(doc) {
  if (doc.type === "QUOTE" || doc.type === "INVOICE") {
    return renderInvoiceLikePdf(doc.toObject(), EMITTER);
  }
  // contrat (preview ou envoi) sans signature
  return renderContractPdf(doc.toObject(), EMITTER, null);
}

// ---------- LIST ----------
router.get("/admin/documents", authenticateToken, async (req, res) => {
  try {
    const docs = await DocumentModel.find().sort({ createdAt: -1 });
    res.status(200).json({ documents: docs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ---------- GET ONE ----------
router.get("/admin/documents/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document introuvable" });
    res.status(200).json({ document: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ---------- CREATE DRAFT ----------
router.post("/admin/documents", authenticateToken, async (req, res) => {
  try {
    const { type, party } = req.body;

    if (!type || !party?.restaurantName || !party?.email) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const docNumber = getDocNumber(type);

    const created = await DocumentModel.create({
      type,
      docNumber,
      party: {
        restaurantName: party.restaurantName,
        address: party.address || "",
        ownerName: party.ownerName || "",
        email: (party.email || "").trim().toLowerCase(),
        phone: party.phone || "",
      },
      status: "DRAFT",
    });

    res.status(201).json({ document: created });
  } catch (e) {
    console.error(e);
    if (e?.code === 11000) {
      return res.status(409).json({ message: "DocNumber déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ---------- UPDATE ----------
router.patch("/admin/documents/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document introuvable" });

    if (doc.status !== "DRAFT") {
      return res
        .status(400)
        .json({ message: "Document non modifiable (déjà envoyé/signé)" });
    }

    const body = req.body || {};

    if (body.party) {
      doc.party.restaurantName =
        body.party.restaurantName ?? doc.party.restaurantName;
      doc.party.address = body.party.address ?? doc.party.address;
      doc.party.ownerName = body.party.ownerName ?? doc.party.ownerName;
      doc.party.email = body.party.email
        ? body.party.email.trim().toLowerCase()
        : doc.party.email;
      doc.party.phone = body.party.phone ?? doc.party.phone;
    }

    if (body.lines) doc.lines = body.lines;
    if (body.totals) doc.totals = body.totals;

    if (body.website) doc.website = body.website;

    // ✅ subscription object
    if (body.subscription !== undefined) {
      doc.subscription = {
        name: body.subscription?.name || "",
        priceMonthly: Number(body.subscription?.priceMonthly || 0),
      };
    }

    if (body.modules) {
      doc.modules = (body.modules || []).map((m) => ({
        name: m?.name || "",
        offered: Boolean(m?.offered),
        priceMonthly: Number(m?.priceMonthly || 0),
      }));
    }

    if (body.engagementMonths !== undefined)
      doc.engagementMonths = body.engagementMonths;

    if (body.issueDate !== undefined) doc.issueDate = body.issueDate;
    if (body.dueDate !== undefined) doc.dueDate = body.dueDate;

    await doc.save();
    res.status(200).json({ document: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ---------- DELETE ----------
router.delete("/admin/documents/:id", authenticateToken, async (req, res) => {
  try {
    await DocumentModel.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ✅ ---------- PDF PREVIEW (NO CLOUDINARY / NO BDD) ----------
router.get(
  "/admin/documents/:id/pdf/preview",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      const pdfBuffer = await buildPdfBuffer(doc);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.docNumber}.pdf"`,
      );
      res.status(200).send(pdfBuffer);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ✅ ---------- SEND EMAIL (GENERATES + UPLOADS + SAVES PDF DEFINITIVE) ----------
router.post(
  "/admin/documents/:id/send",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      // logique "définitif à l'envoi"
      if (doc.status !== "DRAFT") {
        return res.status(400).json({ message: "Document déjà envoyé/signé" });
      }

      // 1) build PDF from current BDD
      const pdfBuffer = await buildPdfBuffer(doc);

      // 2) upload cloudinary
      const version = (doc.pdf?.version || 0) + 1;
      const folder = CLOUDINARY_DOCS_FOLDER;
      const filename = `${doc._id}_${doc.type.toLowerCase()}_${doc.docNumber}_v${version}`;

      const uploaded = await uploadPdfFromBuffer(pdfBuffer, folder, filename);

      // 3) save pdf info in BDD
      doc.pdf = {
        url: uploaded.secure_url,
        public_id: uploaded.public_id,
        version,
        generatedAt: new Date(),
      };

      // 4) send email with attachment
      await sendDocEmail({
        toEmail: doc.party.email,
        toName: doc.party.ownerName || doc.party.restaurantName,
        subject: buildEmailSubject(doc),
        html: `<p>Bonjour,<br/>Veuillez trouver votre document en pièce jointe.</p>`,
        attachmentBase64: pdfBuffer.toString("base64"),
        attachmentName: `${doc.docNumber}.pdf`,
      });

      // 5) status
      doc.status = "SENT";
      doc.sentAt = new Date();
      await doc.save();

      res
        .status(200)
        .json({ message: "Email envoyé", status: doc.status, pdf: doc.pdf });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ✅ ---------- RESEND EMAIL (SENT ONLY) ----------
router.post(
  "/admin/documents/:id/resend",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      if (doc.status !== "SENT") {
        return res.status(400).json({ message: "Renvoi autorisé uniquement si document envoyé" });
      }

      // rebuild PDF from current BDD (normalement inchangé car non modifiable)
      const pdfBuffer = await buildPdfBuffer(doc);

      // (optionnel) re-upload Cloudinary en nouvelle version
      const version = (doc.pdf?.version || 0) + 1;
      const folder = CLOUDINARY_DOCS_FOLDER;
      const filename = `${doc._id}_${doc.type.toLowerCase()}_${doc.docNumber}_v${version}`;

      const uploaded = await uploadPdfFromBuffer(pdfBuffer, folder, filename);

      doc.pdf = {
        url: uploaded.secure_url,
        public_id: uploaded.public_id,
        version,
        generatedAt: new Date(),
      };

      await sendDocEmail({
        toEmail: doc.party.email,
        toName: doc.party.ownerName || doc.party.restaurantName,
        subject: buildEmailSubject(doc),
        html: `<p>Bonjour,<br/>Veuillez trouver votre document en pièce jointe.</p>`,
        attachmentBase64: pdfBuffer.toString("base64"),
        attachmentName: `${doc.docNumber}.pdf`,
      });

      doc.sentAt = new Date(); // refresh date de renvoi
      await doc.save();

      res.status(200).json({
        message: "Email renvoyé",
        status: doc.status,
        pdf: doc.pdf,
        sentAt: doc.sentAt,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);


// ---------- SIGN CONTRACT (signature canvas -> base64 png) ----------
router.post(
  "/admin/documents/:id/sign",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      if (doc.type !== "CONTRACT") {
        return res
          .status(400)
          .json({ message: "Signature réservée aux contrats" });
      }
      if (doc.status === "SIGNED") {
        return res.status(400).json({ message: "Contrat déjà signé" });
      }

      const { signatureDataUrl } = req.body;
      if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
        return res.status(400).json({ message: "Signature invalide" });
      }

      const base64 = signatureDataUrl.split(",")[1];
      const signatureBuffer = Buffer.from(base64, "base64");

      // PDF signé
      const pdfBuffer = await renderContractPdf(
        doc.toObject(),
        EMITTER,
        signatureBuffer,
      );

      const version = (doc.pdf?.version || 0) + 1;
      const folder = CLOUDINARY_DOCS_FOLDER;
      const filename = `${doc._id}_contract_${doc.docNumber}_signed_v${version}`;

      const uploadedPdf = await uploadPdfFromBuffer(
        pdfBuffer,
        folder,
        filename,
      );

      doc.pdf = {
        url: uploadedPdf.secure_url,
        public_id: uploadedPdf.public_id,
        version,
        generatedAt: new Date(),
      };

      doc.signature = { signedAt: new Date() };
      doc.status = "SIGNED";
      await doc.save();

      await sendDocEmail({
        toEmail: doc.party.email,
        toName: doc.party.ownerName || doc.party.restaurantName,
        subject: `Contrat signé ${doc.docNumber}`,
        html: `<p>Bonjour,<br/>Votre contrat signé est en pièce jointe.</p>`,
        attachmentBase64: pdfBuffer.toString("base64"),
        attachmentName: `${doc.docNumber}_signe.pdf`,
      });

      res.status(200).json({ message: "Contrat signé + envoyé", pdf: doc.pdf });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

module.exports = router;
