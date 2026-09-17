const express = require("express");
const router = express.Router();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const axios = require("axios");
const crypto = require("crypto");

// CLOUDINARY
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// MIDDLEWARE / MODELS
const authenticateAdmin = require("../../middleware/authenticate-admin");
const authenticateToken = authenticateAdmin;
const DocumentModel = require("../../models/document.model");
const RestaurantModel = require("../../models/restaurant.model");
const {
  buildManualCommercialSnapshot,
  commercialSnapshotToDocumentFields,
  compareCommercialSnapshots,
  loadRestaurantCommercialSnapshot,
} = require("../../services/contract-commercial.service");
const {
  catalogCodeAllowsOffered,
} = require("../../services/stripe-subscription-catalog.service");
const {
  buildContractContentSnapshot,
  buildSignatureProofSnapshot,
  buildSignatureUrl,
  createSignatureToken,
  decodeSignatureDataUrl,
  getRequestState,
  hashContractContent,
  hashSignatureImage,
  hashSignatureToken,
  serializePublicContract,
  signatureRequestExpiresAt,
} = require("../../services/contract-signature.service");
const {
  MAX_CONTRACT_TERM_MONTHS,
  earlyTerminationFromContractState,
  validateEarlyTermination,
} = require("../../services/contract-terms.service");
// PDF RENDERERS
const {
  renderInvoiceLikePdf,
} = require("../../services/pdf/render-invoice-like.service");
const {
  renderContractPdf,
} = require("../../services/pdf/render-contract.service");

router.use("/admin", authenticateAdmin);

function hashPdfBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

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
const uploadPdfFromBuffer = (buffer, publicId, { overwrite = true } = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: CLOUDINARY_DOCS_FOLDER,
        public_id: publicId,
        overwrite,
        invalidate: true,
      },
      (error, result) => (result ? resolve(result) : reject(error)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

async function destroyPdfIfExists(publicId) {
  if (!publicId) return true;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      invalidate: true,
    });
    return true;
  } catch (e) {
    console.error("Cloudinary destroy error:", e?.message || e);
    return false;
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

  const contractLabel =
    doc.contractKind === "AMENDMENT" ? "avenant" : "contrat";
  return `
    <p>Bonjour,</p>
    <p>Votre ${contractLabel} signé est disponible en pièce jointe.</p>
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
  const documentData = doc.toObject();
  if (doc.status === "DRAFT") {
    const commercialSnapshot = buildManualCommercialSnapshot(documentData);
    const snapshot = buildContractContentSnapshot(
      documentData,
      commercialSnapshot,
    );
    return renderContractPdf(snapshot, EMITTER, null);
  }

  // Un document historique sans snapshot/version reste rendu avec son ancien
  // template. Les contrats envoyés ou signés modernes utilisent leur snapshot.
  return renderContractPdf(doc.contractSnapshot || documentData, EMITTER, null);
}

function plain(value) {
  if (value == null) return value;
  if (typeof value.toObject === "function") {
    return value.toObject({ depopulate: true, versionKey: false });
  }
  return JSON.parse(JSON.stringify(value));
}

function adminSignatureHistoryEntry(
  req,
  event,
  method = "SYSTEM",
  at = new Date(),
) {
  const actorName = [req.user?.firstname, req.user?.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    event,
    at,
    actor: "ADMIN",
    actorId: String(
      req.user?.id ||
        req.user?._id ||
        req.user?.userId ||
        req.user?.email ||
        "",
    ),
    actorName: actorName || String(req.user?.email || ""),
    method,
  };
}

function systemSignatureHistoryEntry(event, at = new Date()) {
  return { event, at, actor: "SYSTEM", method: "SYSTEM" };
}

function hasActivePhysicalSignatureLock(document, now = new Date()) {
  const processingAt = document?.signature?.processingAt;
  if (!processingAt) return false;
  return now.getTime() - new Date(processingAt).getTime() < 5 * 60 * 1000;
}

function unchangedDocumentFilter(document) {
  return document?.updatedAt
    ? { updatedAt: document.updatedAt }
    : { updatedAt: { $exists: false } };
}

function formatRestaurantAddress(address = {}) {
  return [
    address.line1,
    [address.zipCode, address.city].filter(Boolean).join(" "),
    address.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function contractPdfName(doc, signed = false) {
  const kind = doc?.contractKind === "AMENDMENT" ? "avenant" : "contrat";
  return `${doc.docNumber}_${kind}${signed ? "_signe" : ""}.pdf`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function logDocumentError(context, error) {
  console.error(
    `[documents] ${context}:`,
    String(error?.message || "Erreur inconnue").slice(0, 500),
    error?.code ? `(${String(error.code).slice(0, 80)})` : "",
  );
}

function buildRemoteSignatureEmailHtml(doc, signatureUrl, expiresAt) {
  const kind = doc?.contractKind === "AMENDMENT" ? "avenant" : "contrat";
  const expiration = new Date(expiresAt).toLocaleDateString("fr-FR");
  const ownerName = escapeHtml(doc.party?.ownerName);
  const safeSignatureUrl = escapeHtml(signatureUrl);
  return `
    <p>Bonjour${ownerName ? ` ${ownerName}` : ""},</p>
    <p>Votre ${kind} Gusto Manager est prêt à être consulté et signé.</p>
    <p><a href="${safeSignatureUrl}" style="display:inline-block;padding:12px 18px;background:#3978ff;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Consulter et signer le document</a></p>
    <p>Ce lien personnel est valable jusqu’au ${expiration}. Ne le transférez pas à un tiers.</p>
    <p>À très bientôt,<br/>L’équipe Gusto Manager</p>
  `;
}

async function prepareDraftContractSnapshot(doc) {
  if (doc.type !== "CONTRACT" || doc.status !== "DRAFT") {
    const error = new Error("Seul un contrat brouillon peut être préparé.");
    error.statusCode = 409;
    throw error;
  }
  if (hasActivePhysicalSignatureLock(doc)) {
    const error = new Error("Une signature sur place est déjà en cours.");
    error.statusCode = 409;
    throw error;
  }

  if (doc.commercialSnapshot?.reviewRequired) {
    const error = new Error(
      "Les prestations Stripe non identifiées doivent être vérifiées et confirmées avant l'envoi.",
    );
    error.statusCode = 409;
    throw error;
  }

  // Le brouillon Mongo est la source contractuelle. Stripe n'est jamais relu
  // ici : il ne sert qu'au préremplissage ou à la détection d'évolutions.
  const commercialSnapshot = buildManualCommercialSnapshot(doc.toObject());

  if (doc.contractKind === "AMENDMENT") {
    const parentDocument = doc.parentDocumentId
      ? await DocumentModel.findById(doc.parentDocumentId)
      : null;
    if (!parentDocument || parentDocument.status !== "SIGNED") {
      const error = new Error(
        "Le document signé précédant cet avenant est introuvable.",
      );
      error.statusCode = 409;
      throw error;
    }
  }

  if (!doc.issueDate) doc.issueDate = new Date();
  doc.commercialSnapshot = commercialSnapshot;

  const snapshot = buildContractContentSnapshot(doc, commercialSnapshot);
  const contentHash = hashContractContent(snapshot);

  return { snapshot, contentHash, commercialSnapshot };
}

async function downloadStoredPdf(url) {
  if (!url) {
    const error = new Error("PDF enregistré introuvable.");
    error.statusCode = 404;
    throw error;
  }

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  return Buffer.from(response.data);
}

async function sendSignedContractCopy(doc, pdfBuffer) {
  await sendDocEmail({
    toEmail: doc.party.email,
    toName: doc.party.ownerName || doc.party.restaurantName,
    subject: `${doc.contractKind === "AMENDMENT" ? "Votre avenant" : "Votre contrat"} signé ${doc.docNumber}`,
    html: buildEmailHtml({ ...plain(doc), type: "CONTRACT" }),
    attachmentBase64: pdfBuffer.toString("base64"),
    attachmentName: contractPdfName(doc, true),
  });
}

function publicIdForContract(doc, contentHash, suffix) {
  return `${doc._id}-${suffix}-${String(contentHash).slice(0, 16)}`;
}

async function findDocumentBySignatureToken(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ""))) return null;
  const tokenHash = hashSignatureToken(token);
  if (!tokenHash) return null;
  return DocumentModel.findOne({ "signatureRequest.tokenHash": tokenHash })
    .select("+signatureRequest.tokenHash")
    .exec();
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
    const { type, party, restaurantId } = req.body;

    if (type === "CONTRACT" && !restaurantId) {
      return res.status(400).json({
        message:
          "Sélectionnez le restaurant concerné pour créer son contrat initial.",
      });
    }

    let restaurant = null;
    if (type === "CONTRACT" && restaurantId) {
      restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname lastname email phoneNumber",
      );
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable" });
      }

      const existingContract = await DocumentModel.findOne({
        type: "CONTRACT",
        contractKind: "INITIAL",
        restaurantId: restaurant._id,
      }).sort({ createdAt: -1 });
      if (existingContract) {
        return res.status(409).json({
          message:
            existingContract.status === "SIGNED"
              ? "Un contrat signé existe déjà pour ce restaurant. Créez un avenant depuis ce contrat."
              : "Un contrat initial existe déjà pour ce restaurant.",
          documentId: existingContract._id,
        });
      }
    }

    const ownerName = restaurant?.owner_id
      ? [restaurant.owner_id.firstname, restaurant.owner_id.lastname]
          .filter(Boolean)
          .join(" ")
      : party?.ownerName || "";
    const resolvedParty = restaurant
      ? {
          restaurantName: restaurant.name,
          address: formatRestaurantAddress(restaurant.address),
          ownerName,
          email: restaurant.owner_id?.email || restaurant.email,
          phone: restaurant.owner_id?.phoneNumber || restaurant.phone || "",
        }
      : party;

    if (!type || !resolvedParty?.restaurantName || !resolvedParty?.email) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const docNumber = getDocNumber(type);

    const created = await DocumentModel.create({
      type,
      docNumber,
      restaurantId: restaurant?._id || null,
      party: {
        restaurantName: resolvedParty.restaurantName,
        address: resolvedParty.address || "",
        ownerName: resolvedParty.ownerName || "",
        email: (resolvedParty.email || "").trim().toLowerCase(),
        phone: resolvedParty.phone || "",
      },
      status: "DRAFT",
      engagementMonths: type === "CONTRACT" ? 24 : undefined,
    });

    let commercialWarning = "";
    if (restaurant) {
      try {
        const commercialSnapshot = await loadRestaurantCommercialSnapshot(
          restaurant._id,
        );
        if (commercialSnapshot) {
          const fields = commercialSnapshotToDocumentFields(commercialSnapshot);
          created.subscription = fields.subscription;
          created.modules = fields.modules;
          created.timeClockTerminalRental = fields.timeClockTerminalRental;
          created.commercialSnapshot = commercialSnapshot;
          created.commercialReviewConfirmedAt =
            commercialSnapshot.reviewRequired ? null : new Date();
          await created.save();
        }
      } catch (error) {
        commercialWarning =
          "Le contrat a été créé, mais les prestations Stripe n'ont pas pu être chargées.";
        console.warn(
          "[contracts] chargement commercial initial impossible:",
          error?.message || error,
        );
      }
    }

    res.status(201).json({ document: created, commercialWarning });
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

    if (doc.status !== "DRAFT") {
      return res
        .status(400)
        .json({ message: "Document non modifiable (déjà envoyé/signé)" });
    }
    if (doc.type === "CONTRACT" && hasActivePhysicalSignatureLock(doc)) {
      return res.status(409).json({
        message: "Une signature sur place est en cours pour ce contrat.",
      });
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
      doc.lines = (body.lines || []).map((l) => {
        const unitPrice = Number(l?.unitPrice ?? 0);
        const offered = Boolean(l?.offered) || unitPrice <= 0;

        return {
          label: l?.label || "",
          qty: Number(l?.qty ?? 1),
          unitPrice: offered ? 0 : unitPrice,
          offered,
          active: l?.active === undefined ? true : Boolean(l.active),
          kind: ["NORMAL", "WEBSITE"].includes(l?.kind) ? l.kind : "NORMAL",
        };
      });
    }

    if (body.totals) doc.totals = body.totals;

    if (body.comments !== undefined) {
      doc.comments = String(body.comments || "");
    }

    // ----- CONTRACT -----
    if (body.website) {
      // ✅ enabled
      const enabled =
        body.website.enabled === undefined
          ? Boolean(doc.website?.enabled)
          : Boolean(body.website.enabled);

      // ✅ line (si fournie) + règle prix 0 => offert
      const incomingLine = body.website.line || null;

      const mappedLine = incomingLine
        ? (() => {
            const unitPrice = Number(incomingLine?.unitPrice ?? 0);
            const offered = Boolean(incomingLine?.offered) || unitPrice <= 0;

            return {
              label: incomingLine?.label || "Site internet",
              qty: Number(incomingLine?.qty ?? 1),
              unitPrice: offered ? 0 : unitPrice,
              offered,
              active:
                incomingLine?.active === undefined
                  ? true
                  : Boolean(incomingLine.active),
              kind: "WEBSITE", // ✅ important (ton enum mongoose line.kind)
            };
          })()
        : null;

      // ✅ offered global : prioritaire si explicitement envoyé, sinon déduit de la ligne (prix 0), sinon garde l’existant
      const offeredGlobal =
        body.website.offered !== undefined
          ? Boolean(body.website.offered)
          : mappedLine
            ? Boolean(mappedLine.offered)
            : Boolean(doc.website?.offered);

      // ✅ paymentSplit : seulement 1/2/3 (et si offert => on force 1)
      const splitCandidate = Number(
        body.website?.paymentSplit ?? doc.website?.paymentSplit ?? 1,
      );
      const paymentSplit = offeredGlobal
        ? 1
        : [1, 2, 3].includes(splitCandidate)
          ? splitCandidate
          : 1;

      // ✅ priceLabel (optionnel)
      const priceLabel =
        body.website.priceLabel !== undefined
          ? String(body.website.priceLabel || "")
          : String(doc.website?.priceLabel || "");

      // ✅ SAVE website object
      doc.website = {
        ...doc.website,
        enabled,
        offered: offeredGlobal,
        priceLabel,
        paymentSplit,
        line: enabled ? mappedLine : null, // si disabled => on vide
      };

      const currentLines = Array.isArray(doc.lines) ? doc.lines : [];

      if (!enabled) {
        doc.lines = currentLines.map((l) =>
          l?.kind === "WEBSITE" ? { ...l, active: false } : l,
        );
      } else {
        // on veut 1 ligne WEBSITE active
        const idx = currentLines.findIndex((l) => l?.kind === "WEBSITE");

        const websiteLineForLines = {
          label: mappedLine?.label || "Site internet",
          qty: mappedLine?.qty ?? 1,
          unitPrice: offeredGlobal ? 0 : Number(mappedLine?.unitPrice ?? 0),
          offered:
            Boolean(offeredGlobal) || Number(mappedLine?.unitPrice ?? 0) <= 0,
          active: true,
          kind: "WEBSITE",
        };

        if (idx === -1) {
          doc.lines = [...currentLines, websiteLineForLines];
        } else {
          doc.lines = currentLines.map((l, i) =>
            i === idx ? { ...l, ...websiteLineForLines } : l,
          );
        }
      }
    }

    if (body.timeClockTerminalRental !== undefined) {
      const currentRental = doc.timeClockTerminalRental || {};
      const nextPrice = Number(
        body.timeClockTerminalRental?.priceMonthly ??
          currentRental.priceMonthly ??
          12,
      );

      doc.timeClockTerminalRental = {
        ...currentRental,
        enabled: Boolean(body.timeClockTerminalRental?.enabled),
        priceMonthly:
          Number.isFinite(nextPrice) && nextPrice > 0 ? nextPrice : 12,
        quantity: Math.max(
          1,
          Number(
            body.timeClockTerminalRental?.quantity ||
              currentRental.quantity ||
              1,
          ),
        ),
        code: String(
          body.timeClockTerminalRental?.code || currentRental.code || "",
        ),
        priceId: String(
          body.timeClockTerminalRental?.priceId || currentRental.priceId || "",
        ),
        productId: String(
          body.timeClockTerminalRental?.productId ||
            currentRental.productId ||
            "",
        ),
        currency: String(
          body.timeClockTerminalRental?.currency ||
            currentRental.currency ||
            "EUR",
        ),
        interval: String(
          body.timeClockTerminalRental?.interval ||
            currentRental.interval ||
            "month",
        ),
        intervalCount: Math.max(
          1,
          Number(
            body.timeClockTerminalRental?.intervalCount ||
              currentRental.intervalCount ||
              1,
          ),
        ),
      };
    }

    // ✅ Subscription object
    if (body.subscription !== undefined) {
      doc.subscription = {
        ...doc.subscription,
        name: String(body.subscription?.name || doc.subscription?.name || ""),
        priceMonthly: Number(body.subscription?.priceMonthly || 0),
        quantity: Math.max(
          1,
          Number(
            body.subscription?.quantity || doc.subscription?.quantity || 1,
          ),
        ),
        code: String(body.subscription?.code || doc.subscription?.code || ""),
        priceId: String(
          body.subscription?.priceId || doc.subscription?.priceId || "",
        ),
        productId: String(
          body.subscription?.productId || doc.subscription?.productId || "",
        ),
        currency: String(
          body.subscription?.currency || doc.subscription?.currency || "EUR",
        ),
        interval: String(
          body.subscription?.interval || doc.subscription?.interval || "month",
        ),
        intervalCount: Math.max(
          1,
          Number(
            body.subscription?.intervalCount ||
              doc.subscription?.intervalCount ||
              1,
          ),
        ),
      };
    }

    if (body.modules) {
      const invalidNonOfferableModule = (body.modules || []).find(
        (module) =>
          !catalogCodeAllowsOffered(module?.code) &&
          Number(module?.priceMonthly || 0) <= 0,
      );
      if (invalidNonOfferableModule) {
        return res.status(400).json({
          message: `${invalidNonOfferableModule.name || "Ce module"} ne peut pas être offert.`,
        });
      }
      doc.modules = (body.modules || []).map((m) => ({
        name: m?.name || "",
        offered:
          catalogCodeAllowsOffered(m?.code) && Boolean(m?.offered),
        priceMonthly: Number(m?.priceMonthly || 0),
        quantity: Math.max(1, Number(m?.quantity || 1)),
        code: String(m?.code || ""),
        priceId: String(m?.priceId || ""),
        productId: String(m?.productId || ""),
        currency: String(m?.currency || "EUR"),
        interval: String(m?.interval || "month"),
        intervalCount: Math.max(1, Number(m?.intervalCount || 1)),
        sourceKind: m?.sourceKind === "OTHER" ? "OTHER" : "ADDON",
        requiresReview: Boolean(m?.requiresReview),
      }));
    }

    if (
      doc.type === "CONTRACT" &&
      body.confirmCommercialReview === true &&
      doc.commercialSnapshot
    ) {
      doc.commercialSnapshot.reviewRequired = false;
      doc.commercialSnapshot.items?.forEach((item) => {
        item.requiresReview = false;
      });
      doc.commercialReviewConfirmedAt = new Date();
    }

    if (body.engagementMonths !== undefined) {
      const engagementMonths = Number(body.engagementMonths);
      if (
        doc.type === "CONTRACT" &&
        (!Number.isInteger(engagementMonths) ||
          engagementMonths <= 0 ||
          engagementMonths > MAX_CONTRACT_TERM_MONTHS)
      ) {
        const error = new Error(
          `La durée d'engagement doit être un entier compris entre 1 et ${MAX_CONTRACT_TERM_MONTHS} mois.`,
        );
        error.statusCode = 400;
        throw error;
      }
      doc.engagementMonths =
        doc.type === "CONTRACT"
          ? engagementMonths
          : Number(body.engagementMonths || 0);
    }

    if (doc.type === "CONTRACT") {
      doc.earlyTermination = validateEarlyTermination(
        body.earlyTermination === undefined
          ? doc.earlyTermination
          : body.earlyTermination,
        doc.engagementMonths,
      );
    }

    // ✅ "Fait à"
    if (body.placeOfSignature !== undefined) {
      doc.placeOfSignature = String(body.placeOfSignature || "");
    }

    // ----- DATES -----
    if (body.issueDate !== undefined) doc.issueDate = body.issueDate;
    if (body.dueDate !== undefined) doc.dueDate = body.dueDate;

    await doc.validate();
    const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
    const updatedDocument = await DocumentModel.findOneAndUpdate(
      {
        _id: doc._id,
        status: "DRAFT",
        ...unchangedDocumentFilter(doc),
        $or: [
          { "signature.processingAt": null },
          { "signature.processingAt": { $exists: false } },
          { "signature.processingAt": { $lt: staleProcessingBefore } },
        ],
      },
      {
        $set: {
          party: plain(doc.party),
          issueDate: doc.issueDate,
          dueDate: doc.dueDate,
          lines: plain(doc.lines),
          totals: plain(doc.totals),
          comments: doc.comments,
          website: plain(doc.website),
          timeClockTerminalRental: plain(doc.timeClockTerminalRental),
          placeOfSignature: doc.placeOfSignature,
          subscription: plain(doc.subscription),
          engagementMonths: doc.engagementMonths,
          earlyTermination: plain(doc.earlyTermination),
          modules: plain(doc.modules),
          commercialSnapshot: plain(doc.commercialSnapshot),
          commercialReviewConfirmedAt: doc.commercialReviewConfirmedAt,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedDocument) {
      return res.status(409).json({
        message:
          "Le document a été modifié ou une signature a démarré simultanément.",
      });
    }

    res.status(200).json({ document: updatedDocument });
  } catch (e) {
    console.error(e);
    res
      .status(e?.statusCode || (e?.name === "ValidationError" ? 400 : 500))
      .json({
        message: e?.message || "Erreur serveur",
      });
  }
});

// ---------- DELETE (✅ Cloudinary + Mongo) ----------
router.delete("/admin/documents/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document introuvable" });

    if (doc.type === "CONTRACT" && doc.status !== "DRAFT") {
      return res.status(409).json({
        message:
          "Un contrat envoyé ou signé doit être conservé. Révoquez d'abord une demande encore en attente.",
      });
    }
    if (doc.type === "CONTRACT" && hasActivePhysicalSignatureLock(doc)) {
      return res.status(409).json({
        message: "Une signature sur place est en cours pour ce contrat.",
      });
    }

    const deletionFilter = {
      _id: doc._id,
      ...unchangedDocumentFilter(doc),
    };
    if (doc.type === "CONTRACT") {
      deletionFilter.status = "DRAFT";
      deletionFilter.$or = [
        { "signature.processingAt": null },
        { "signature.processingAt": { $exists: false } },
        {
          "signature.processingAt": {
            $lt: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
      ];
    }

    const deletedDocument =
      await DocumentModel.findOneAndDelete(deletionFilter);
    if (!deletedDocument) {
      return res.status(409).json({
        message: "Le document a été modifié ou verrouillé simultanément.",
      });
    }

    // ✅ supprime les fichiers seulement après le verrouillage atomique Mongo
    const publicIds = [
      deletedDocument?.pdf?.public_id,
      deletedDocument?.signatureRequest?.previewPdf?.public_id,
    ].filter(Boolean);
    await Promise.all(publicIds.map(destroyPdfIfExists));

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
        const pdfBuffer = await downloadStoredPdf(doc.pdf.url);
        if (doc.pdf.sha256 && hashPdfBuffer(pdfBuffer) !== doc.pdf.sha256) {
          return res.status(409).json({
            message: "L'intégrité du PDF signé ne peut pas être vérifiée.",
          });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${doc.docNumber}_signe.pdf"`,
        );
        return res.status(200).send(pdfBuffer);
      }

      if (
        doc.type === "CONTRACT" &&
        doc.status === "SENT" &&
        doc?.signatureRequest?.previewPdf?.url
      ) {
        const pdfBuffer = await downloadStoredPdf(
          doc.signatureRequest.previewPdf.url,
        );
        if (
          doc.signatureRequest.previewPdf.sha256 &&
          hashPdfBuffer(pdfBuffer) !== doc.signatureRequest.previewPdf.sha256
        ) {
          return res.status(409).json({
            message: "L'intégrité du PDF présenté ne peut pas être vérifiée.",
          });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${contractPdfName(doc)}"`,
        );
        return res.status(200).send(pdfBuffer);
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

async function getContractFamily(document) {
  const rootId = document.rootContractId || document._id;
  return DocumentModel.find({
    type: "CONTRACT",
    $or: [{ _id: rootId }, { rootContractId: rootId }],
  }).sort({ versionNumber: 1, createdAt: 1 });
}

function serializeContractHistoryItem(document) {
  return {
    _id: document._id,
    docNumber: document.docNumber,
    contractKind: document.contractKind || "INITIAL",
    versionNumber: document.versionNumber || 1,
    status: document.status,
    issueDate: document.issueDate,
    sentAt: document.sentAt,
    signedAt: document.signature?.signedAt || null,
    signatureRequestState:
      document.status === "SENT" ? getRequestState(document) : null,
  };
}

router.get(
  "/admin/documents/:id/commercial-status",
  authenticateToken,
  async (req, res) => {
    try {
      const document = await DocumentModel.findById(req.params.id);
      if (!document || document.type !== "CONTRACT") {
        return res.status(404).json({ message: "Contrat introuvable" });
      }

      const family = await getContractFamily(document);
      const pendingAmendment = family
        .filter(
          (item) =>
            item.contractKind === "AMENDMENT" && item.status !== "SIGNED",
        )
        .at(-1);
      const signedDocuments = family.filter((item) => item.status === "SIGNED");
      const latestSigned = signedDocuments.at(-1) || null;
      const previousSnapshot =
        latestSigned?.commercialSnapshot ||
        latestSigned?.contractSnapshot?.commercialSnapshot ||
        null;

      if (!document.restaurantId) {
        return res.status(200).json({
          available: false,
          reason:
            "Ce contrat historique n'est pas relié à un restaurant Gusto.",
          pendingAmendment: pendingAmendment
            ? serializeContractHistoryItem(pendingAmendment)
            : null,
          history: family.map(serializeContractHistoryItem),
        });
      }

      if (!latestSigned || !previousSnapshot?.items?.length) {
        return res.status(200).json({
          available: false,
          reason:
            "Aucun document signé avec snapshot commercial comparable n'est disponible.",
          pendingAmendment: pendingAmendment
            ? serializeContractHistoryItem(pendingAmendment)
            : null,
          history: family.map(serializeContractHistoryItem),
        });
      }

      const currentSnapshot = await loadRestaurantCommercialSnapshot(
        document.restaurantId,
      );
      if (!currentSnapshot) {
        return res.status(200).json({
          available: false,
          reason:
            "Aucun abonnement Stripe actif n'est rattaché à ce restaurant.",
          pendingAmendment: pendingAmendment
            ? serializeContractHistoryItem(pendingAmendment)
            : null,
          history: family.map(serializeContractHistoryItem),
        });
      }

      const comparison = compareCommercialSnapshots(
        previousSnapshot,
        currentSnapshot,
      );
      return res.status(200).json({
        available: true,
        hasChanges: comparison.hasChanges,
        changes: comparison.changes,
        currentSnapshot,
        latestSignedDocumentId: latestSigned._id,
        hasPendingAmendment: Boolean(pendingAmendment),
        pendingAmendment: pendingAmendment
          ? serializeContractHistoryItem(pendingAmendment)
          : null,
        history: family.map(serializeContractHistoryItem),
      });
    } catch (error) {
      logDocumentError("comparaison commerciale", error);
      return res.status(error?.statusCode || 500).json({
        message:
          error?.message ||
          "Impossible de comparer les prestations commerciales.",
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.subscriptionIds
          ? { subscriptionIds: error.subscriptionIds }
          : {}),
      });
    }
  },
);

router.post(
  "/admin/documents/:id/commercial-data/refresh",
  authenticateToken,
  async (req, res) => {
    try {
      const document = await DocumentModel.findById(req.params.id);
      if (!document || document.type !== "CONTRACT") {
        return res.status(404).json({ message: "Contrat introuvable" });
      }
      if (document.status !== "DRAFT") {
        return res.status(409).json({
          message: "Un document envoyé ou signé ne peut plus être actualisé.",
        });
      }
      if (hasActivePhysicalSignatureLock(document)) {
        return res.status(409).json({
          message: "Une signature sur place est en cours pour ce contrat.",
        });
      }
      if (!document.restaurantId) {
        return res.status(409).json({
          message: "Ce contrat n'est pas relié à un restaurant Gusto.",
        });
      }

      const commercialSnapshot = await loadRestaurantCommercialSnapshot(
        document.restaurantId,
      );
      if (!commercialSnapshot) {
        return res.status(404).json({
          message: "Aucun abonnement Stripe actif n'a été trouvé.",
        });
      }

      const fields = commercialSnapshotToDocumentFields(commercialSnapshot);
      const updatedDocument = await DocumentModel.findOneAndUpdate(
        {
          _id: document._id,
          status: "DRAFT",
          ...unchangedDocumentFilter(document),
          $or: [
            { "signature.processingAt": null },
            { "signature.processingAt": { $exists: false } },
            {
              "signature.processingAt": {
                $lt: new Date(Date.now() - 5 * 60 * 1000),
              },
            },
          ],
        },
        {
          $set: {
            subscription: fields.subscription,
            modules: fields.modules,
            timeClockTerminalRental: fields.timeClockTerminalRental,
            commercialSnapshot,
            commercialReviewConfirmedAt: commercialSnapshot.reviewRequired
              ? null
              : new Date(),
          },
        },
        { new: true, runValidators: true },
      );

      if (!updatedDocument) {
        return res.status(409).json({
          message:
            "Le document a été modifié ou une signature a démarré simultanément.",
        });
      }

      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      logDocumentError("actualisation commerciale", error);
      return res.status(error?.statusCode || 500).json({
        message:
          error?.message ||
          "Impossible de charger les prestations du restaurant.",
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.subscriptionIds
          ? { subscriptionIds: error.subscriptionIds }
          : {}),
      });
    }
  },
);

router.post(
  "/admin/documents/:id/amendments",
  authenticateToken,
  async (req, res) => {
    try {
      const sourceDocument = await DocumentModel.findById(req.params.id);
      if (!sourceDocument || sourceDocument.type !== "CONTRACT") {
        return res.status(404).json({ message: "Contrat introuvable" });
      }

      const family = await getContractFamily(sourceDocument);
      const rootContract = family[0];
      const latestSigned = family
        .filter((item) => item.status === "SIGNED")
        .at(-1);

      if (!latestSigned) {
        return res.status(409).json({
          message:
            "Le contrat initial doit être signé avant de créer un avenant.",
        });
      }
      if (
        family.some(
          (item) =>
            item.contractKind === "AMENDMENT" && item.status !== "SIGNED",
        )
      ) {
        return res.status(409).json({
          message: "Un avenant est déjà en attente de finalisation.",
        });
      }
      if (!rootContract.restaurantId) {
        return res.status(409).json({
          message:
            "Ce contrat historique n'est pas relié à un restaurant. L'avenant automatique est indisponible.",
        });
      }

      const previousSnapshot =
        latestSigned.commercialSnapshot ||
        latestSigned.contractSnapshot?.commercialSnapshot;
      if (!previousSnapshot?.items?.length) {
        return res.status(409).json({
          message:
            "Le dernier document signé ne possède pas de snapshot commercial comparable.",
        });
      }

      const currentSnapshot = await loadRestaurantCommercialSnapshot(
        rootContract.restaurantId,
      );
      if (!currentSnapshot) {
        return res.status(409).json({
          message: "Aucun abonnement Stripe actif n'a été trouvé.",
        });
      }

      const comparison = compareCommercialSnapshots(
        previousSnapshot,
        currentSnapshot,
      );
      if (!comparison.hasChanges) {
        return res.status(409).json({
          message:
            "Toutes les prestations actuelles sont déjà contractualisées.",
        });
      }

      const versionNumber =
        Math.max(...family.map((item) => Number(item.versionNumber || 1))) + 1;
      const commercialFields =
        commercialSnapshotToDocumentFields(currentSnapshot);
      const rootSignedAt =
        rootContract.signature?.signedAt || rootContract.issueDate || null;

      const amendment = await DocumentModel.create({
        type: "CONTRACT",
        docNumber: `${rootContract.docNumber}-A${versionNumber - 1}`,
        status: "DRAFT",
        restaurantId: rootContract.restaurantId,
        contractKind: "AMENDMENT",
        rootContractId: rootContract._id,
        parentDocumentId: latestSigned._id,
        versionNumber,
        party: plain(rootContract.party),
        issueDate: new Date(),
        subscription: commercialFields.subscription,
        modules: commercialFields.modules,
        timeClockTerminalRental: commercialFields.timeClockTerminalRental,
        engagementMonths:
          latestSigned.contractSnapshot?.engagementMonths ||
          latestSigned.engagementMonths ||
          12,
        earlyTermination: earlyTerminationFromContractState(latestSigned),
        commercialSnapshot: currentSnapshot,
        commercialReviewConfirmedAt: currentSnapshot.reviewRequired
          ? null
          : new Date(),
        amendment: {
          baseContractNumber: rootContract.docNumber,
          baseContractSignedAt: rootSignedAt,
          changes: comparison.changes,
        },
      });

      return res.status(201).json({ document: amendment });
    } catch (error) {
      logDocumentError("création avenant", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Un avenant avec ce numéro existe déjà.",
        });
      }
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Impossible de créer l'avenant.",
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.subscriptionIds
          ? { subscriptionIds: error.subscriptionIds }
          : {}),
      });
    }
  },
);

router.post(
  "/admin/documents/:id/send-for-signature",
  authenticateToken,
  async (req, res) => {
    let uploadedPdf = null;
    try {
      const document = await DocumentModel.findById(req.params.id).select(
        "+signatureRequest.tokenHash",
      );
      if (!document || document.type !== "CONTRACT") {
        return res.status(404).json({ message: "Contrat introuvable" });
      }
      if (document.status !== "DRAFT") {
        return res.status(409).json({
          message: "Ce contrat a déjà été envoyé ou signé.",
        });
      }
      if (!isValidEmail(document.party?.email)) {
        return res.status(400).json({
          message: "L'adresse email du signataire est invalide.",
        });
      }

      const { snapshot, contentHash, commercialSnapshot } =
        await prepareDraftContractSnapshot(document);
      const previousSignatureRequest = plain(document.signatureRequest);
      const previousContractSnapshot = plain(document.contractSnapshot);
      const previousPresentedPdf = plain(document.presentedPdf);
      const previousContentHash = document.contentHash || "";
      const previousSentAt = document.sentAt || null;
      const previousPreviewPublicId =
        document.signatureRequest?.previewPdf?.public_id || "";
      const pdfBuffer = await renderContractPdf(snapshot, EMITTER, null);
      const presentedPdfHash = hashPdfBuffer(pdfBuffer);
      const token = createSignatureToken();
      const tokenHash = hashSignatureToken(token);
      const now = new Date();
      const expiresAt = signatureRequestExpiresAt(now);
      const signatureUrl = buildSignatureUrl(req, token);
      const previewPublicId = `${publicIdForContract(
        document,
        contentHash,
        "unsigned",
      )}-${createSignatureToken().slice(-10)}`;

      uploadedPdf = await uploadPdfFromBuffer(pdfBuffer, previewPublicId, {
        overwrite: false,
      });
      const previewPdf = {
        url: uploadedPdf.secure_url,
        public_id: uploadedPdf.public_id,
        version: 1,
        generatedAt: now,
        sha256: presentedPdfHash,
        byteLength: pdfBuffer.length,
      };

      const updated = await DocumentModel.findOneAndUpdate(
        {
          _id: document._id,
          status: "DRAFT",
          ...unchangedDocumentFilter(document),
        },
        {
          $set: {
            status: "SENT",
            sentAt: now,
            issueDate: document.issueDate,
            subscription: plain(document.subscription),
            modules: plain(document.modules),
            timeClockTerminalRental: plain(document.timeClockTerminalRental),
            commercialSnapshot: plain(commercialSnapshot),
            contractSnapshot: snapshot,
            contentHash,
            presentedPdf: previewPdf,
            signatureRequest: {
              tokenHash,
              status: "PENDING",
              issuedAt: now,
              expiresAt,
              lastSentAt: now,
              previewPdf,
            },
            "signature.processingAt": null,
            "signature.contentHash": "",
          },
          $push: {
            signatureHistory: adminSignatureHistoryEntry(
              req,
              "SENT_FOR_SIGNATURE",
              "REMOTE",
              now,
            ),
          },
        },
        { new: true, runValidators: true },
      );

      if (!updated) {
        await destroyPdfIfExists(uploadedPdf.public_id);
        return res.status(409).json({
          message: "Le contrat a été modifié ou envoyé simultanément.",
        });
      }

      try {
        await sendDocEmail({
          toEmail: updated.party.email,
          toName: updated.party.ownerName || updated.party.restaurantName,
          subject: `${updated.contractKind === "AMENDMENT" ? "Votre avenant" : "Votre contrat"} à signer ${updated.docNumber}`,
          html: buildRemoteSignatureEmailHtml(updated, signatureUrl, expiresAt),
        });
      } catch (error) {
        const rollback = await DocumentModel.updateOne(
          {
            _id: updated._id,
            status: "SENT",
            "signatureRequest.tokenHash": tokenHash,
          },
          {
            $set: {
              status: "DRAFT",
              sentAt: previousSentAt,
              signatureRequest: previousSignatureRequest,
              contractSnapshot: previousContractSnapshot,
              contentHash: previousContentHash,
              presentedPdf: previousPresentedPdf,
            },
            $pop: { signatureHistory: 1 },
          },
        );
        if (rollback.matchedCount > 0) {
          await destroyPdfIfExists(uploadedPdf.public_id);
          uploadedPdf = null;
        } else {
          uploadedPdf = null;
          error.statusCode = 409;
          error.message =
            "L'envoi email a échoué alors que l'état du contrat avait déjà changé. Vérifiez le document avant toute nouvelle action.";
        }

        if (rollback.matchedCount > 0 && isBrevoInvalidEmailError(error)) {
          return res.status(400).json({
            message:
              "Adresse email invalide ou non délivrable. Merci de la corriger.",
          });
        }
        throw error;
      }

      if (
        previousPreviewPublicId &&
        previousPreviewPublicId !== uploadedPdf.public_id
      ) {
        await destroyPdfIfExists(previousPreviewPublicId);
      }

      return res.status(200).json({
        message: "Contrat envoyé pour signature",
        document: updated,
        status: updated.status,
        signatureUrl,
        expiresAt,
      });
    } catch (error) {
      logDocumentError("envoi pour signature", error);
      if (uploadedPdf?.public_id) {
        await destroyPdfIfExists(uploadedPdf.public_id);
      }
      return res.status(error?.statusCode || 500).json({
        message:
          error?.message || "Impossible d'envoyer le contrat pour signature.",
      });
    }
  },
);

router.post(
  "/admin/documents/:id/signature-request/resend",
  authenticateToken,
  async (req, res) => {
    try {
      const document = await DocumentModel.findById(req.params.id).select(
        "+signatureRequest.tokenHash",
      );
      if (!document || document.type !== "CONTRACT") {
        return res.status(404).json({ message: "Contrat introuvable" });
      }
      if (
        document.status !== "SENT" ||
        !document.contractSnapshot ||
        getRequestState(document) === "SIGNING"
      ) {
        return res.status(409).json({
          message: "Cette demande de signature ne peut pas être renvoyée.",
        });
      }

      const previousRequest = plain(document.signatureRequest);
      const token = createSignatureToken();
      const tokenHash = hashSignatureToken(token);
      const now = new Date();
      const expiresAt = signatureRequestExpiresAt(now);
      const signatureUrl = buildSignatureUrl(req, token);
      const updatedRequest = {
        ...previousRequest,
        tokenHash,
        status: "PENDING",
        issuedAt: now,
        expiresAt,
        lastSentAt: now,
        processingAt: null,
        revokedAt: null,
      };
      const updatedDocument = await DocumentModel.findOneAndUpdate(
        {
          _id: document._id,
          status: "SENT",
          "signatureRequest.tokenHash": previousRequest.tokenHash,
          "signatureRequest.status": {
            $in: ["PENDING", "EXPIRED", "REVOKED"],
          },
        },
        { $set: { signatureRequest: updatedRequest } },
        { new: true, runValidators: true },
      );
      if (!updatedDocument) {
        return res.status(409).json({
          message: "La demande a été modifiée simultanément.",
        });
      }

      try {
        await sendDocEmail({
          toEmail: updatedDocument.party.email,
          toName:
            updatedDocument.party.ownerName ||
            updatedDocument.party.restaurantName,
          subject: `${updatedDocument.contractKind === "AMENDMENT" ? "Votre avenant" : "Votre contrat"} à signer ${updatedDocument.docNumber}`,
          html: buildRemoteSignatureEmailHtml(
            updatedDocument,
            signatureUrl,
            expiresAt,
          ),
        });
      } catch (error) {
        await DocumentModel.updateOne(
          {
            _id: document._id,
            status: "SENT",
            "signatureRequest.tokenHash": tokenHash,
          },
          { $set: { signatureRequest: previousRequest } },
        );
        throw error;
      }

      const finalDocument = await DocumentModel.findOneAndUpdate(
        {
          _id: updatedDocument._id,
          status: "SENT",
          "signatureRequest.tokenHash": tokenHash,
        },
        {
          $push: {
            signatureHistory: adminSignatureHistoryEntry(
              req,
              "LINK_REPLACED",
              "REMOTE",
              now,
            ),
          },
        },
        { new: true },
      );

      return res.status(200).json({
        message: "Lien de signature remplacé et envoyé",
        document: finalDocument || updatedDocument,
        signatureUrl,
        expiresAt,
      });
    } catch (error) {
      logDocumentError("remplacement lien", error);
      return res.status(error?.statusCode || 500).json({
        message:
          error?.message || "Impossible de renvoyer la demande de signature.",
      });
    }
  },
);

router.post(
  "/admin/documents/:id/signature-request/revoke",
  authenticateToken,
  async (req, res) => {
    try {
      const now = new Date();
      const document = await DocumentModel.findOneAndUpdate(
        {
          _id: req.params.id,
          type: "CONTRACT",
          status: "SENT",
          "signatureRequest.status": { $in: ["PENDING", "EXPIRED"] },
        },
        {
          $set: {
            status: "DRAFT",
            "signatureRequest.status": "REVOKED",
            "signatureRequest.revokedAt": now,
          },
          $push: {
            signatureHistory: adminSignatureHistoryEntry(
              req,
              "LINK_REVOKED",
              "REMOTE",
              now,
            ),
          },
        },
        { new: true },
      );

      if (!document) {
        return res.status(409).json({
          message: "Cette demande n'est plus révocable.",
        });
      }
      const revokedPreviewPublicId =
        document.signatureRequest?.previewPdf?.public_id || "";
      const previewWasDeleted = await destroyPdfIfExists(
        revokedPreviewPublicId,
      );
      const sanitizedDocument = previewWasDeleted
        ? await DocumentModel.findOneAndUpdate(
            {
              _id: document._id,
              "signatureRequest.status": "REVOKED",
            },
            {
              $unset: {
                "signatureRequest.previewPdf": 1,
                presentedPdf: 1,
              },
            },
            { new: true },
          )
        : null;
      return res.status(200).json({
        document: sanitizedDocument || document,
      });
    } catch (error) {
      logDocumentError("révocation lien", error);
      return res.status(500).json({
        message: "Impossible de révoquer la demande de signature.",
      });
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

      // Signature en présence du restaurateur. Elle utilise le même snapshot
      // immuable et le même format final que la signature distante.
      const { signatureDataUrl, placeOfSignature } = req.body || {};

      if (!placeOfSignature || !String(placeOfSignature).trim()) {
        return res
          .status(400)
          .json({ message: "Le champ “Fait à” est requis." });
      }

      const isLegacyPhysicalSent =
        doc.status === "SENT" && !doc.signatureRequest?.issuedAt;
      if (doc.status !== "DRAFT" && !isLegacyPhysicalSent) {
        return res.status(409).json({
          message: "Ce contrat a déjà été envoyé ou signé.",
        });
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

      const signatureBuffer = decodeSignatureDataUrl(signatureDataUrl);
      let snapshot;
      let contentHash;
      let commercialSnapshot;
      if (isLegacyPhysicalSent) {
        commercialSnapshot = buildManualCommercialSnapshot(doc.toObject());
        snapshot = buildContractContentSnapshot(doc, commercialSnapshot);
        // Ce document a été présenté avant l'introduction de cette condition.
        // L'absence du champ conserve donc volontairement le renderer legacy.
        delete snapshot.earlyTermination;
        delete snapshot.contractTermsVersion;
        contentHash = hashContractContent(snapshot);
      } else {
        ({ snapshot, contentHash, commercialSnapshot } =
          await prepareDraftContractSnapshot(doc));
      }
      const now = new Date();
      const staleProcessingBefore = new Date(now.getTime() - 5 * 60 * 1000);
      const lockId = createSignatureToken();
      const locked = await DocumentModel.findOneAndUpdate(
        {
          _id: doc._id,
          status: isLegacyPhysicalSent ? "SENT" : "DRAFT",
          ...unchangedDocumentFilter(doc),
          ...(isLegacyPhysicalSent
            ? { "signatureRequest.issuedAt": { $exists: false } }
            : {}),
          $or: [
            { "signature.processingAt": null },
            { "signature.processingAt": { $exists: false } },
            { "signature.processingAt": { $lt: staleProcessingBefore } },
          ],
        },
        {
          $set: {
            "signature.processingAt": now,
            "signature.contentHash": lockId,
          },
        },
        { new: true },
      );
      if (!locked) {
        return res.status(409).json({
          message: "Une signature est déjà en cours pour ce contrat.",
        });
      }

      let uploadedPdf = null;
      let uploadedPresentedPdf = null;
      try {
        const legacyPresentedPdf = isLegacyPhysicalSent
          ? plain(doc.presentedPdf?.url ? doc.presentedPdf : doc.pdf)
          : null;
        const presentedPdfBuffer = legacyPresentedPdf?.url
          ? await downloadStoredPdf(legacyPresentedPdf.url)
          : await renderContractPdf(snapshot, EMITTER, null);
        const presentedPdfHash = hashPdfBuffer(presentedPdfBuffer);
        if (
          legacyPresentedPdf?.sha256 &&
          legacyPresentedPdf.sha256 !== presentedPdfHash
        ) {
          throw Object.assign(
            new Error(
              "L'intégrité du PDF historique ne peut pas être vérifiée.",
            ),
            { statusCode: 409 },
          );
        }
        const signatureImageHash = hashSignatureImage(signatureBuffer);
        const signerName =
          doc.party.ownerName || doc.party.restaurantName || "";
        const signatureSnapshot = buildSignatureProofSnapshot({
          contractContentHash: contentHash,
          presentedPdfHash,
          signerName,
          signerEmail: toEmail,
          placeOfSignature: String(placeOfSignature).trim(),
          signedAt: now,
          acceptedAt: now,
          signatureImageHash,
          method: "IN_PERSON",
        });
        const proofHash = hashContractContent(signatureSnapshot);
        const pdfBuffer = await renderContractPdf(
          {
            ...plain(snapshot),
            placeOfSignature: String(placeOfSignature).trim(),
            signatureDate: now.toISOString(),
          },
          EMITTER,
          signatureBuffer,
        );
        const signedPdfHash = hashPdfBuffer(pdfBuffer);
        let presentedPdf = legacyPresentedPdf
          ? {
              ...legacyPresentedPdf,
              sha256: presentedPdfHash,
              byteLength: presentedPdfBuffer.length,
            }
          : null;
        if (!presentedPdf?.url) {
          uploadedPresentedPdf = await uploadPdfFromBuffer(
            presentedPdfBuffer,
            `${publicIdForContract(doc, contentHash, "presented")}-${createSignatureToken().slice(-10)}`,
            { overwrite: false },
          );
          presentedPdf = {
            url: uploadedPresentedPdf.secure_url,
            public_id: uploadedPresentedPdf.public_id,
            version: 1,
            generatedAt: now,
            sha256: presentedPdfHash,
            byteLength: presentedPdfBuffer.length,
          };
        } else if (!presentedPdf.sha256) {
          presentedPdf.sha256 = presentedPdfHash;
          presentedPdf.byteLength = presentedPdfBuffer.length;
        }
        uploadedPdf = await uploadPdfFromBuffer(
          pdfBuffer,
          `${publicIdForContract(doc, contentHash, "signed")}-${createSignatureToken().slice(-10)}`,
          { overwrite: false },
        );

        const finalPdf = {
          url: uploadedPdf.secure_url,
          public_id: uploadedPdf.public_id,
          version: 1,
          generatedAt: now,
          sha256: signedPdfHash,
          byteLength: pdfBuffer.length,
        };
        const signedDocument = await DocumentModel.findOneAndUpdate(
          {
            _id: doc._id,
            status: isLegacyPhysicalSent ? "SENT" : "DRAFT",
            "signature.contentHash": lockId,
          },
          {
            $set: {
              status: "SIGNED",
              sentAt: now,
              issueDate: doc.issueDate,
              placeOfSignature: String(placeOfSignature).trim(),
              subscription: plain(doc.subscription),
              modules: plain(doc.modules),
              timeClockTerminalRental: plain(doc.timeClockTerminalRental),
              commercialSnapshot: plain(commercialSnapshot),
              contractSnapshot: snapshot,
              contentHash,
              signatureSnapshot,
              presentedPdf,
              pdf: finalPdf,
              signature: {
                signedAt: now,
                acceptedAt: now,
                signerName,
                signerEmail: toEmail,
                signerIp: req.ip || "",
                userAgent: String(req.get("user-agent") || "").slice(0, 500),
                method: "IN_PERSON",
                contentHash: proofHash,
                signatureImageHash,
                presentedPdfHash,
                signedPdfHash,
                proofHash,
                processingAt: null,
                emailStatus: "NOT_SENT",
              },
            },
            $push: {
              signatureHistory: adminSignatureHistoryEntry(
                req,
                "SIGNED",
                "IN_PERSON",
                now,
              ),
            },
          },
          { new: true, runValidators: true },
        );

        if (!signedDocument) {
          await destroyPdfIfExists(uploadedPdf.public_id);
          throw Object.assign(
            new Error("La signature n'a pas pu être finalisée."),
            {
              statusCode: 409,
            },
          );
        }

        let emailWarning = "";
        try {
          await sendSignedContractCopy(signedDocument, pdfBuffer);
          signedDocument.signature.emailStatus = "SENT";
          signedDocument.signature.emailSentAt = new Date();
          await signedDocument.save();
        } catch (emailError) {
          emailWarning =
            "Le document est signé et conservé, mais l'email n'a pas pu être envoyé.";
          await DocumentModel.updateOne(
            { _id: signedDocument._id },
            {
              $set: {
                "signature.emailStatus": "FAILED",
                "signature.emailError": String(
                  emailError?.message || "Erreur email",
                ).slice(0, 500),
              },
            },
          );
        }

        return res.status(200).json({
          message: "Contrat signé et conservé",
          status: signedDocument.status,
          pdf: signedDocument.pdf,
          sentAt: signedDocument.sentAt,
          signedAt: signedDocument.signature.signedAt,
          emailWarning,
        });
      } catch (error) {
        if (uploadedPdf?.public_id) {
          await destroyPdfIfExists(uploadedPdf.public_id);
        }
        if (uploadedPresentedPdf?.public_id) {
          await destroyPdfIfExists(uploadedPresentedPdf.public_id);
        }
        await DocumentModel.updateOne(
          {
            _id: doc._id,
            status: isLegacyPhysicalSent ? "SENT" : "DRAFT",
            "signature.contentHash": lockId,
          },
          {
            $set: {
              "signature.processingAt": null,
              "signature.contentHash": "",
            },
          },
        );
        throw error;
      }
    } catch (e) {
      console.error(e);
      res.status(e?.statusCode || 500).json({
        message: e?.message || "Erreur serveur",
      });
    }
  },
);

router.post(
  "/admin/documents/:id/signed-copy/resend",
  authenticateToken,
  async (req, res) => {
    let document = null;
    try {
      document = await DocumentModel.findById(req.params.id);
      if (
        !document ||
        document.type !== "CONTRACT" ||
        document.status !== "SIGNED" ||
        !document.pdf?.url
      ) {
        return res.status(409).json({
          message: "Aucun contrat signé ne peut être renvoyé.",
        });
      }
      if (!isValidEmail(document.party?.email)) {
        return res.status(400).json({
          message: "L'adresse email du signataire est invalide.",
        });
      }

      const pdfBuffer = await downloadStoredPdf(document.pdf.url);
      if (
        document.pdf.sha256 &&
        hashPdfBuffer(pdfBuffer) !== document.pdf.sha256
      ) {
        return res.status(409).json({
          message: "L'intégrité de la copie signée ne peut pas être vérifiée.",
        });
      }
      await sendSignedContractCopy(document, pdfBuffer);
      document.signature.emailStatus = "SENT";
      document.signature.emailSentAt = new Date();
      document.signature.emailError = "";
      await document.save();

      return res.status(200).json({
        message: "La copie signée a été renvoyée.",
        document,
      });
    } catch (error) {
      logDocumentError("renvoi copie signée", error);
      if (document?._id) {
        await DocumentModel.updateOne(
          { _id: document._id, status: "SIGNED" },
          {
            $set: {
              "signature.emailStatus": "FAILED",
              "signature.emailError": String(
                error?.message || "Erreur email",
              ).slice(0, 500),
            },
          },
        );
      }
      return res.status(500).json({
        message: "Impossible de renvoyer la copie signée.",
      });
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

      if (doc.type === "CONTRACT") {
        return res.status(409).json({
          message:
            "Utilisez le renvoi de demande de signature pour un contrat en attente.",
        });
      }

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

router.get("/public/contract-signatures/:token", async (req, res) => {
  try {
    let document = await findDocumentBySignatureToken(req.params.token);
    if (!document) {
      return res.status(404).json({
        state: "INVALID",
        message: "Ce lien de signature est invalide.",
      });
    }

    const state = getRequestState(document);
    if (
      state === "EXPIRED" &&
      document.signatureRequest?.status !== "EXPIRED"
    ) {
      const expiredAt = new Date();
      const expiredDocument = await DocumentModel.findOneAndUpdate(
        {
          _id: document._id,
          status: "SENT",
          "signatureRequest.status": "PENDING",
          "signatureRequest.expiresAt": { $lte: expiredAt },
        },
        {
          $set: { "signatureRequest.status": "EXPIRED" },
          $push: {
            signatureHistory: systemSignatureHistoryEntry(
              "LINK_EXPIRED",
              expiredAt,
            ),
          },
        },
        { new: true },
      );
      if (expiredDocument) document = expiredDocument;
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(serializePublicContract(document));
  } catch (error) {
    logDocumentError("lecture signature publique", error);
    return res.status(500).json({
      state: "ERROR",
      message: "Impossible de charger le document.",
    });
  }
});

router.get("/public/contract-signatures/:token/pdf", async (req, res) => {
  try {
    const document = await findDocumentBySignatureToken(req.params.token);
    if (!document) {
      return res.status(404).json({ message: "Lien de signature invalide." });
    }

    const state = getRequestState(document);
    if (!["PENDING", "SIGNED"].includes(state)) {
      return res.status(state === "SIGNING" ? 409 : 410).json({
        message:
          state === "EXPIRED"
            ? "Ce lien a expiré."
            : state === "REVOKED"
              ? "Ce lien a été révoqué."
              : "Le document n'est pas disponible.",
      });
    }

    const pdfInfo =
      state === "SIGNED" ? document.pdf : document.signatureRequest?.previewPdf;
    const pdfBuffer = await downloadStoredPdf(pdfInfo?.url);
    const computedPdfHash = hashPdfBuffer(pdfBuffer);
    const presentedHashMismatch =
      state === "PENDING" && document.presentedPdf?.sha256 !== pdfInfo?.sha256;
    if (
      !pdfInfo?.sha256 ||
      computedPdfHash !== pdfInfo.sha256 ||
      presentedHashMismatch
    ) {
      const error = new Error(
        "L'intégrité du PDF enregistré ne peut pas être vérifiée.",
      );
      error.statusCode = 409;
      throw error;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${contractPdfName(document, state === "SIGNED")}"`,
    );
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    logDocumentError("proxy PDF public", error);
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Impossible de charger le PDF.",
    });
  }
});

router.post("/public/contract-signatures/:token/sign", async (req, res) => {
  const tokenHash = hashSignatureToken(req.params.token);
  let lockedDocument = null;
  let uploadedPdf = null;

  try {
    const signerName = String(req.body?.signerName || "").trim();
    const placeOfSignature = String(req.body?.placeOfSignature || "").trim();
    if (req.body?.accepted !== true) {
      return res.status(400).json({
        message: "L'acceptation explicite du contrat est requise.",
      });
    }
    if (!signerName || signerName.length > 160) {
      return res.status(400).json({
        message: "Le nom du signataire est requis.",
      });
    }
    if (!placeOfSignature || placeOfSignature.length > 160) {
      return res.status(400).json({
        message: "Le lieu de signature est requis.",
      });
    }

    const signatureBuffer = decodeSignatureDataUrl(req.body?.signatureDataUrl);
    const now = new Date();
    const staleProcessingBefore = new Date(now.getTime() - 5 * 60 * 1000);

    lockedDocument = await DocumentModel.findOneAndUpdate(
      {
        type: "CONTRACT",
        status: "SENT",
        contractSnapshot: { $ne: null },
        contentHash: { $ne: "" },
        "signatureRequest.tokenHash": tokenHash,
        "signatureRequest.expiresAt": { $gt: now },
        $or: [
          { "signatureRequest.status": "PENDING" },
          {
            "signatureRequest.status": "SIGNING",
            "signatureRequest.processingAt": { $lt: staleProcessingBefore },
          },
        ],
      },
      {
        $set: {
          "signatureRequest.status": "SIGNING",
          "signatureRequest.processingAt": now,
        },
      },
      { new: true },
    );

    if (!lockedDocument) {
      const existing = await findDocumentBySignatureToken(req.params.token);
      if (!existing) {
        return res.status(404).json({
          message: "Ce lien de signature est invalide.",
        });
      }
      const state = getRequestState(existing, now);
      if (state === "EXPIRED") {
        await DocumentModel.updateOne(
          { _id: existing._id, "signatureRequest.status": "PENDING" },
          {
            $set: { "signatureRequest.status": "EXPIRED" },
            $push: {
              signatureHistory: systemSignatureHistoryEntry(
                "LINK_EXPIRED",
                now,
              ),
            },
          },
        );
      }
      return res.status(state === "SIGNED" ? 409 : 410).json({
        state,
        message:
          state === "SIGNED"
            ? "Ce contrat a déjà été signé."
            : state === "SIGNING"
              ? "Une signature est déjà en cours de validation."
              : state === "EXPIRED"
                ? "Ce lien de signature a expiré."
                : "Cette demande de signature n'est plus active.",
      });
    }

    const snapshot = plain(lockedDocument.contractSnapshot);
    const computedHash = hashContractContent(snapshot);
    if (computedHash !== lockedDocument.contentHash) {
      await DocumentModel.updateOne(
        { _id: lockedDocument._id, "signatureRequest.status": "SIGNING" },
        {
          $set: {
            "signatureRequest.status": "REVOKED",
            "signatureRequest.processingAt": null,
            "signatureRequest.revokedAt": now,
          },
        },
      );
      return res.status(409).json({
        message:
          "L'intégrité du document ne peut pas être vérifiée. La demande a été révoquée.",
      });
    }

    const presentedPdfBuffer = await downloadStoredPdf(
      lockedDocument.signatureRequest?.previewPdf?.url,
    );
    const presentedPdfHash = hashPdfBuffer(presentedPdfBuffer);
    if (
      !lockedDocument.signatureRequest?.previewPdf?.sha256 ||
      presentedPdfHash !== lockedDocument.signatureRequest.previewPdf.sha256 ||
      lockedDocument.presentedPdf?.sha256 !==
        lockedDocument.signatureRequest.previewPdf.sha256
    ) {
      await DocumentModel.updateOne(
        {
          _id: lockedDocument._id,
          "signatureRequest.status": "SIGNING",
        },
        {
          $set: {
            "signatureRequest.status": "REVOKED",
            "signatureRequest.processingAt": null,
            "signatureRequest.revokedAt": now,
          },
        },
      );
      lockedDocument = null;
      return res.status(409).json({
        message:
          "Le PDF présenté ne correspond plus à son empreinte d'intégrité. La demande a été révoquée.",
      });
    }

    const signatureImageHash = hashSignatureImage(signatureBuffer);
    const signatureSnapshot = buildSignatureProofSnapshot({
      contractContentHash: computedHash,
      presentedPdfHash,
      signerName,
      signerEmail: lockedDocument.party?.email || "",
      placeOfSignature,
      signedAt: now,
      acceptedAt: now,
      signatureImageHash,
      method: "REMOTE",
    });
    const proofHash = hashContractContent(signatureSnapshot);
    const pdfBuffer = await renderContractPdf(
      {
        ...snapshot,
        placeOfSignature,
        signatureDate: now.toISOString(),
      },
      EMITTER,
      signatureBuffer,
    );
    const signedPdfHash = hashPdfBuffer(pdfBuffer);
    uploadedPdf = await uploadPdfFromBuffer(
      pdfBuffer,
      `${publicIdForContract(lockedDocument, computedHash, "signed")}-${createSignatureToken().slice(-10)}`,
      { overwrite: false },
    );
    const finalPdf = {
      url: uploadedPdf.secure_url,
      public_id: uploadedPdf.public_id,
      version: 1,
      generatedAt: now,
      sha256: signedPdfHash,
      byteLength: pdfBuffer.length,
    };

    const signedDocument = await DocumentModel.findOneAndUpdate(
      {
        _id: lockedDocument._id,
        status: "SENT",
        contentHash: computedHash,
        "signatureRequest.tokenHash": tokenHash,
        "signatureRequest.status": "SIGNING",
      },
      {
        $set: {
          status: "SIGNED",
          placeOfSignature,
          pdf: finalPdf,
          signatureSnapshot,
          "signatureRequest.status": "SIGNED",
          "signatureRequest.usedAt": now,
          "signatureRequest.processingAt": null,
          signature: {
            signedAt: now,
            acceptedAt: now,
            signerName,
            signerEmail: lockedDocument.party?.email || "",
            signerIp: req.ip || "",
            userAgent: String(req.get("user-agent") || "").slice(0, 500),
            method: "REMOTE",
            contentHash: proofHash,
            signatureImageHash,
            presentedPdfHash,
            signedPdfHash,
            proofHash,
            processingAt: null,
            emailStatus: "NOT_SENT",
          },
        },
        $push: {
          signatureHistory: {
            event: "SIGNED",
            at: now,
            actor: "SIGNER",
            actorName: signerName,
            method: "REMOTE",
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!signedDocument) {
      await destroyPdfIfExists(uploadedPdf.public_id);
      uploadedPdf = null;
      throw Object.assign(
        new Error("La signature n'a pas pu être finalisée."),
        {
          statusCode: 409,
        },
      );
    }

    let emailWarning = "";
    try {
      await sendSignedContractCopy(signedDocument, pdfBuffer);
      await DocumentModel.updateOne(
        { _id: signedDocument._id },
        {
          $set: {
            "signature.emailStatus": "SENT",
            "signature.emailSentAt": new Date(),
            "signature.emailError": "",
          },
        },
      );
    } catch (emailError) {
      emailWarning =
        "Votre document est bien signé, mais sa copie n'a pas pu être envoyée par email. Gusto Manager en a conservé l'original.";
      await DocumentModel.updateOne(
        { _id: signedDocument._id },
        {
          $set: {
            "signature.emailStatus": "FAILED",
            "signature.emailError": String(
              emailError?.message || "Erreur email",
            ).slice(0, 500),
          },
        },
      );
    }

    return res.status(200).json({
      state: "SIGNED",
      signedAt: signedDocument.signature.signedAt,
      signerName,
      emailWarning,
    });
  } catch (error) {
    logDocumentError("signature publique", error);
    if (uploadedPdf?.public_id) {
      await destroyPdfIfExists(uploadedPdf.public_id);
    }
    if (lockedDocument?._id) {
      await DocumentModel.updateOne(
        {
          _id: lockedDocument._id,
          status: "SENT",
          "signatureRequest.tokenHash": tokenHash,
          "signatureRequest.status": "SIGNING",
        },
        {
          $set: {
            "signatureRequest.status": "PENDING",
            "signatureRequest.processingAt": null,
          },
        },
      );
    }
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Impossible de valider la signature.",
    });
  }
});

module.exports = router;
