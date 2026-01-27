const express = require("express");
const router = express.Router();
const multer = require("multer");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const axios = require("axios");

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

// ✅ 1 document = 1 fichier : public_id stable (basé sur doc._id)
function getDocCloudinaryPublicId(docId) {
  return String(docId);
}

// PDF => resource_type raw
const uploadPdfFromBuffer = (buffer, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: CLOUDINARY_DOCS_FOLDER,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
      },
      (error, result) => (result ? resolve(result) : reject(error)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

async function destroyPdfIfExists(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      invalidate: true,
    });
  } catch (e) {
    console.error("Cloudinary destroy error:", e?.message || e);
  }
}

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

  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(
    now.getSeconds(),
  )}`;

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || "").trim());
}

function isBrevoInvalidEmailError(e) {
  const msg = e?.response?.body?.message || e?.message || "";
  const code = e?.response?.body?.code || "";
  return (
    code === "invalid_parameter" &&
    String(msg).toLowerCase().includes("email is not valid")
  );
}

// ---------- EMITTER (config) ----------
const EMITTER = {
  title: "Gusto Manager - WebDev",
  address: "84 Bd Arago, 75014 Paris",
  email: "contact@gusto-manager.com",
  iban: process.env.EMITTER_IBAN || "IBAN A AJOUTER EN .ENV",
  bic: process.env.EMITTER_BIC || "BIC A AJOUTER EN .ENV",
  logoPath: "assets/logo.png",
  signaturePath: "assets/signature.png",
};

// ---------- HELPERS ----------
function buildEmailSubject(doc) {
  if (doc.type === "QUOTE") return `Votre devis ${doc.docNumber}`;
  if (doc.type === "INVOICE") return `Votre facture ${doc.docNumber}`;
  return `Votre contrat ${doc.docNumber}`;
}

// ✅ Nouveau: HTML "tone of voice" Gusto Manager (sans docNumber dans le texte)
function buildEmailHtml(doc) {
  if (doc.type === "QUOTE") {
    return `
      <p>Bonjour,</p>
      <p>Vous trouverez en pièce jointe votre devis.</p>
      <p>
        Il détaille la solution que nous avons préparée pour vous.<br/>
        Si vous avez la moindre question ou souhaitez ajuster certains points, nous sommes là pour vous accompagner.
      </p>
      <p>À très vite,<br/>L’équipe Gusto Manager</p>
    `;
  }

  if (doc.type === "INVOICE") {
    return `
      <p>Bonjour,</p>
      <p>Votre facture est disponible en pièce jointe.</p>
      <p>
        Merci pour votre confiance 🤝<br/>
        Si quelque chose n’est pas clair ou si vous avez besoin d’un complément d’information, nous restons à votre écoute.
      </p>
      <p>Bien cordialement,<br/>L’équipe Gusto Manager</p>
    `;
  }

  // CONTRACT (signed)
  return `
    <p>Bonjour,</p>
    <p>Votre contrat signé est disponible en pièce jointe.</p>
    <p>
      Ce document officialise le début de notre collaboration, et nous sommes ravis de vous accompagner dans la suite de votre projet.
    </p>
    <p>À très bientôt,<br/>L’équipe Gusto Manager</p>
  `;
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

    const body = req.body || {};

    // ✅ Autoriser une MAJ minimale sur contrat non-DRAFT :
    // - placeOfSignature uniquement (ex: avant signature, ou même après, si besoin)
    const isContractSignatureMetaUpdate =
      doc.type === "CONTRACT" &&
      doc.status !== "DRAFT" &&
      Object.keys(body).every((k) => ["placeOfSignature"].includes(k));

    // ⛔️ Règle générale : modifiable uniquement en DRAFT
    // ✅ Exception : contrat => uniquement placeOfSignature si non-DRAFT
    if (doc.status !== "DRAFT" && !isContractSignatureMetaUpdate) {
      return res
        .status(400)
        .json({ message: "Document non modifiable (déjà envoyé/signé)" });
    }

    // ----- PARTY -----
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

    // ----- LINES / TOTALS -----
    if (body.lines) {
      doc.lines = (body.lines || []).map((l) => ({
        label: l?.label || "",
        qty: Number(l?.qty ?? 1),
        unitPrice: Number(l?.unitPrice ?? 0),
        offered: Boolean(l?.offered),
      }));
    }
    if (body.totals) doc.totals = body.totals;

    if (body.comments !== undefined) {
      doc.comments = String(body.comments || "");
    }

    // ----- CONTRACT -----
    if (body.website) doc.website = body.website;

    // ✅ Subscription object
    if (body.subscription !== undefined) {
      doc.subscription = {
        ...doc.subscription,
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
      doc.engagementMonths = Number(body.engagementMonths || 0);

    // ✅ "Fait à"
    if (body.placeOfSignature !== undefined) {
      doc.placeOfSignature = String(body.placeOfSignature || "");
    }

    // ----- DATES -----
    if (body.issueDate !== undefined) doc.issueDate = body.issueDate;
    if (body.dueDate !== undefined) doc.dueDate = body.dueDate;

    await doc.save();
    res.status(200).json({ document: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ---------- DELETE (✅ Cloudinary + Mongo) ----------
router.delete("/admin/documents/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document introuvable" });

    // ✅ supprime le PDF Cloudinary (si existant)
    const publicId = doc?.pdf?.public_id;
    if (publicId) {
      await destroyPdfIfExists(publicId);
    }

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

      // ✅ CONTRAT SIGNÉ => renvoyer le PDF signé enregistré (Cloudinary)
      if (doc.type === "CONTRACT" && doc.status === "SIGNED" && doc?.pdf?.url) {
        const pdfRes = await axios.get(doc.pdf.url, {
          responseType: "arraybuffer",
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${doc.docNumber}_signe.pdf"`,
        );
        return res.status(200).send(Buffer.from(pdfRes.data));
      }

      // sinon => preview généré à la volée (sans save)
      const pdfBuffer = await buildPdfBuffer(doc);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.docNumber}.pdf"`,
      );
      return res.status(200).send(pdfBuffer);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ---------- SEND EMAIL (GENERATES + UPLOADS (overwrite) + SAVES PDF DEFINITIVE) ----------
router.post(
  "/admin/documents/:id/send",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      // =========================================================
      // ✅ QUOTE / INVOICE
      // =========================================================
      if (doc.type !== "CONTRACT") {
        // envoi autorisé uniquement en DRAFT
        if (doc.status !== "DRAFT") {
          return res
            .status(400)
            .json({ message: "Document déjà envoyé/signé" });
        }

        // 1) build PDF from current BDD
        const pdfBuffer = await buildPdfBuffer(doc);

        // 2) upload cloudinary (✅ public_id stable)
        const stablePublicId = getDocCloudinaryPublicId(doc._id);

        // migration: si ancien public_id différent, on le supprime
        if (doc.pdf?.public_id && doc.pdf.public_id !== stablePublicId) {
          await destroyPdfIfExists(doc.pdf.public_id);
        }

        const uploaded = await uploadPdfFromBuffer(pdfBuffer, stablePublicId);

        // 3) save pdf info in BDD
        doc.pdf = {
          url: uploaded.secure_url,
          public_id: uploaded.public_id, // == stablePublicId
          version: (doc.pdf?.version || 0) + 1,
          generatedAt: new Date(),
        };

        // 4) send email with attachment (✅ HTML selon type QUOTE/INVOICE)
        await sendDocEmail({
          toEmail: doc.party.email,
          toName: doc.party.ownerName || doc.party.restaurantName,
          subject: buildEmailSubject(doc),
          html: buildEmailHtml(doc),
          attachmentBase64: pdfBuffer.toString("base64"),
          attachmentName: `${doc.docNumber}.pdf`,
        });

        // 5) status
        doc.status = "SENT";
        doc.sentAt = new Date();
        await doc.save();

        return res.status(200).json({
          message: "Email envoyé",
          status: doc.status,
          pdf: doc.pdf,
          sentAt: doc.sentAt,
        });
      }

      // =========================================================
      // ✅ CONTRACT : email OK => seulement là on passe SIGNED
      // =========================================================
      const { signatureDataUrl, placeOfSignature } = req.body || {};

      if (!placeOfSignature || !String(placeOfSignature).trim()) {
        return res
          .status(400)
          .json({ message: "Le champ “Fait à” est requis." });
      }

      if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
        return res.status(400).json({
          message:
            "Signature requise (valider “Fait à” + signature) avant l’envoi.",
        });
      }

      // ✅ si déjà signé -> stop
      if (doc.status === "SIGNED") {
        return res.status(400).json({ message: "Contrat déjà signé/envoyé." });
      }

      // ✅ vérif email avant tout
      const toEmail = String(doc?.party?.email || "")
        .trim()
        .toLowerCase();
      if (!toEmail || !isValidEmail(toEmail)) {
        return res.status(400).json({
          message:
            "Adresse email invalide ou non délivrable. Merci de la corriger.",
        });
      }

      // 1) buffer signature
      const base64 = signatureDataUrl.split(",")[1];
      const signatureBuffer = Buffer.from(base64, "base64");

      // 2) build pdf signé SANS toucher la BDD (on injecte placeOfSignature dans le rendu)
      const pdfBuffer = await renderContractPdf(
        {
          ...doc.toObject(),
          placeOfSignature: String(placeOfSignature).trim(),
        },
        EMITTER,
        signatureBuffer,
      );

      // 3) upload Cloudinary (on garde le résultat en mémoire)
      const stablePublicId = getDocCloudinaryPublicId(doc._id);

      // migration: si ancien public_id différent, on le supprime
      if (doc.pdf?.public_id && doc.pdf.public_id !== stablePublicId) {
        await destroyPdfIfExists(doc.pdf.public_id);
      }

      let uploadedPdf = null;

      try {
        uploadedPdf = await uploadPdfFromBuffer(pdfBuffer, stablePublicId);

        // 4) email AVANT de signer en BDD (✅ HTML "contrat signé")
        await sendDocEmail({
          toEmail,
          toName: doc.party.ownerName || doc.party.restaurantName,
          subject: `Votre contrat signé ${doc.docNumber}`,
          html: buildEmailHtml({ ...doc.toObject(), type: "CONTRACT" }),
          attachmentBase64: pdfBuffer.toString("base64"),
          attachmentName: `${doc.docNumber}_signe.pdf`,
        });
      } catch (e) {
        // ✅ email KO => on ne signe pas + on supprime le pdf uploadé
        if (uploadedPdf?.public_id) {
          await destroyPdfIfExists(uploadedPdf.public_id);
        }

        // cas Brevo: email invalide
        if (isBrevoInvalidEmailError(e)) {
          return res.status(400).json({
            message:
              "Adresse email invalide ou non délivrable. Merci de la corriger.",
          });
        }

        console.error(e);
        return res
          .status(500)
          .json({ message: "Erreur lors de l'envoi de l'email." });
      }

      // 5) ✅ COMMIT BDD UNIQUEMENT si email OK
      doc.placeOfSignature = String(placeOfSignature).trim();

      doc.pdf = {
        url: uploadedPdf.secure_url,
        public_id: uploadedPdf.public_id,
        version: (doc.pdf?.version || 0) + 1,
        generatedAt: new Date(),
      };

      doc.signature = { signedAt: new Date() };
      doc.status = "SIGNED";
      doc.sentAt = new Date();
      await doc.save();

      return res.status(200).json({
        message: "Contrat signé envoyé",
        status: doc.status, // SIGNED
        pdf: doc.pdf,
        sentAt: doc.sentAt,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ---------- RESEND EMAIL (SENT ONLY) : renvoie EXACTEMENT le même PDF (sans upload) ----------
router.post(
  "/admin/documents/:id/resend",
  authenticateToken,
  async (req, res) => {
    try {
      const doc = await DocumentModel.findById(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Document introuvable" });

      if (doc.status !== "SENT") {
        return res.status(400).json({
          message: "Renvoi autorisé uniquement si document envoyé",
        });
      }

      if (!doc?.pdf?.url) {
        return res.status(400).json({
          message:
            "Aucun PDF enregistré pour ce document. Ré-envoyez via /send.",
        });
      }

      // ✅ on retélécharge depuis Cloudinary => même binaire que le premier envoi
      const pdfRes = await axios.get(doc.pdf.url, {
        responseType: "arraybuffer",
      });
      const attachmentBase64 = Buffer.from(pdfRes.data).toString("base64");

      await sendDocEmail({
        toEmail: doc.party.email,
        toName: doc.party.ownerName || doc.party.restaurantName,
        subject: buildEmailSubject(doc),
        html: buildEmailHtml(doc), // ✅ HTML selon QUOTE/INVOICE
        attachmentBase64,
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

module.exports = router;
