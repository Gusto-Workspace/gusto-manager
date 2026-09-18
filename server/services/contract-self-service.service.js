const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const DocumentModel = require("../models/document.model");
const { prepareSubscriptionAmendment } = require("./contract-amendment.service");
const {
  buildContractContentSnapshot,
  hashContractContent,
} = require("./contract-signature.service");
const { renderContractPdf } = require("./pdf/render-contract.service");

const EMITTER = {
  title: "Gusto Manager - WebDev",
  address: "84 Bd Arago, 75014 Paris",
  email: "contact@gusto-manager.com",
  logoPath: "assets/logo.png",
  signaturePath: "assets/signature.png",
};

function uploadPdf(buffer, publicId) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "Gusto_Workspace/admin/documents",
        public_id: publicId,
        overwrite: true,
        invalidate: true,
      },
      (error, result) => (result ? resolve(result) : reject(error)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function buildSelfServiceEmailHtml(document) {
  const isDeactivation =
    document.selfServiceAcceptance.actionType === "SMS_DEACTIVATION_SCHEDULED";
  const isCancellation =
    document.selfServiceAcceptance.actionType === "SMS_DEACTIVATION_CANCELLED";
  return `<p>Bonjour,</p><p>${isDeactivation
    ? `Votre demande de résiliation du module Rappels SMS est enregistrée. Le module reste actif jusqu'au ${new Date(document.selfServiceAcceptance.effectiveAt).toLocaleDateString("fr-FR")}.`
    : isCancellation
      ? "La résiliation programmée du module Rappels SMS a été annulée. Le module reste actif."
      : "La modification du module Rappels SMS est confirmée."}</p><p>Cette modification a été acceptée depuis votre espace Gusto Manager. Votre avenant est joint à cet email.</p><p>L’équipe Gusto Manager</p>`;
}

async function sendAcceptanceEmail(document, pdfBuffer) {
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
  const api = new SibApiV3Sdk.TransactionalEmailsApi();
  const email = new SibApiV3Sdk.SendSmtpEmail();
  email.sender = { email: "no-reply@gusto-manager.com", name: "Gusto Manager" };
  email.to = [{
    email: document.party.email,
    name: document.party.ownerName || document.party.restaurantName,
  }];
  email.subject = "Confirmation de modification de votre abonnement Gusto Manager";
  email.htmlContent = buildSelfServiceEmailHtml(document);
  email.attachment = [{
    content: pdfBuffer.toString("base64"),
    name: `${document.docNumber}_avenant_accepte.pdf`,
  }];
  return api.sendTransacEmail(email);
}

async function finalizeSelfServiceAmendment({
  restaurantId,
  stripeSnapshot,
  acceptance,
  dependencies = {},
}) {
  const existing = await DocumentModel.findOne({
    "selfServiceAcceptance.idempotencyKey": acceptance.idempotencyKey,
  });
  if (existing?.status === "ACCEPTED") return existing;

  const prepared = await prepareSubscriptionAmendment({
    restaurantId,
    stripeSnapshot,
    // Une action explicite (notamment l'annulation d'une fin future) doit
    // toujours laisser une nouvelle preuve, même si Stripe reste actif.
    createWhenUnchanged: true,
  });
  const document = prepared.document;
  if (!document) {
    const error = new Error("Impossible de préparer l’avenant contractuel.");
    error.code = prepared.reason;
    throw error;
  }
  if (document.status !== "DRAFT") return document;

  document.acceptanceMode = "SELF_SERVICE";
  document.selfServiceAcceptance = acceptance;
  document.issueDate = acceptance.acceptedAt;
  document.contractSnapshot = buildContractContentSnapshot(
    document,
    document.commercialSnapshot,
  );
  document.contentHash = hashContractContent(document.contractSnapshot);
  // Persist the recoverable draft before external PDF storage. A retry can
  // resume document finalization without replaying the Stripe mutation.
  await document.save();

  const render = dependencies.renderContractPdf || renderContractPdf;
  const pdfBuffer = await render(document.contractSnapshot, EMITTER, null);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const upload = dependencies.uploadPdf || uploadPdf;
  const uploaded = await upload(
    pdfBuffer,
    `${document._id}-accepted-${document.contentHash.slice(0, 16)}`,
  );

  document.status = "ACCEPTED";
  document.pdf = {
    url: uploaded.secure_url,
    public_id: uploaded.public_id,
    version: Number(uploaded.version || 0),
    generatedAt: new Date(),
    sha256: pdfHash,
    byteLength: pdfBuffer.length,
  };
  await document.save();

  try {
    const sendEmail = dependencies.sendEmail || sendAcceptanceEmail;
    await sendEmail(document, pdfBuffer);
    document.selfServiceAcceptance.emailStatus = "SENT";
    document.selfServiceAcceptance.emailSentAt = new Date();
  } catch (error) {
    document.selfServiceAcceptance.emailStatus = "FAILED";
    document.selfServiceAcceptance.emailError = String(error?.message || error).slice(0, 500);
  }
  await document.save();
  return document;
}

module.exports = {
  buildSelfServiceEmailHtml,
  finalizeSelfServiceAmendment,
  sendAcceptanceEmail,
};
