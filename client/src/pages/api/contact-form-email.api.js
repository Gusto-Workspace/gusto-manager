import SibApiV3Sdk from "sib-api-v3-sdk";

const SUCCESS_RESPONSE = {
  status: 200,
  message: "Email envoyé avec succès",
};

const MIN_FORM_FILL_TIME_MS = 2000;
const MIN_NAME_LENGTH = 4;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;
const MIN_MESSAGE_LENGTH = 20;
const MIN_MESSAGE_WORDS = 3;
const MAX_MESSAGE_LENGTH = 2000;

function normalizeSingleLineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMultiLineText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeEmail(value) {
  return normalizeSingleLineText(value).toLowerCase();
}

function normalizePhone(value) {
  const trimmedValue = String(value || "").trim();
  const hasLeadingPlus = trimmedValue.startsWith("+");
  const digits = trimmedValue.replace(/\D/g, "");

  return hasLeadingPlus ? `+${digits}` : digits;
}

function countWords(value) {
  return normalizeSingleLineText(value).split(" ").filter(Boolean).length;
}

function countLetters(value) {
  return (String(value || "").match(/[\p{L}]/gu) || []).length;
}

function hasCredibleFullName(value) {
  const normalizedValue = normalizeSingleLineText(value);
  const nameParts = normalizedValue
    .split(" ")
    .filter((part) => countLetters(part) > 0);

  return (
    normalizedValue.length >= MIN_NAME_LENGTH &&
    normalizedValue.length <= MAX_NAME_LENGTH &&
    countLetters(normalizedValue) >= 4 &&
    nameParts.length >= 2
  );
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function hasValidPhoneLength(value) {
  const digits = String(value || "").replace(/\D/g, "");

  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessageForHtml(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function sendSuccessResponse(res) {
  return res.status(200).json(SUCCESS_RESPONSE);
}

function validateContactPayload(payload = {}) {
  const honeypotValue = normalizeSingleLineText(payload.companyWebsite);

  if (honeypotValue) {
    return { silent: true };
  }

  const formStartedAt = Number(payload.formStartedAt);

  if (
    !Number.isFinite(formStartedAt) ||
    Date.now() - formStartedAt < MIN_FORM_FILL_TIME_MS
  ) {
    return { silent: true };
  }

  const consentGiven =
    payload.recontactConsent === true || payload.recontactConsent === "true";

  if (!consentGiven) {
    return {
      errorMessage:
        "Vous devez accepter d'être recontacté pour envoyer votre demande.",
    };
  }

  const normalizedName = normalizeSingleLineText(payload.name);
  const normalizedEmail = normalizeEmail(payload.email);
  const normalizedPhone = normalizePhone(payload.phone);
  const normalizedMessage = normalizeMultiLineText(payload.message);

  if (!hasCredibleFullName(normalizedName)) {
    return {
      errorMessage: "Merci d’indiquer votre prénom et votre nom.",
    };
  }

  if (
    !normalizedEmail ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    !looksLikeEmail(normalizedEmail)
  ) {
    return {
      errorMessage: "Merci d’indiquer une adresse e-mail valide.",
    };
  }

  if (!hasValidPhoneLength(normalizedPhone)) {
    return {
      errorMessage: "Merci d’indiquer un numéro de téléphone valide.",
    };
  }

  if (
    !normalizedMessage ||
    normalizedMessage.length < MIN_MESSAGE_LENGTH ||
    normalizedMessage.length > MAX_MESSAGE_LENGTH ||
    countWords(normalizedMessage) < MIN_MESSAGE_WORDS
  ) {
    return {
      errorMessage: "Merci de détailler un peu plus votre demande.",
    };
  }

  return {
    values: {
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      message: normalizedMessage,
    },
  };
}

function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];

    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur lors de l'instanciation du client:", err);
    throw err;
  }
}

async function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    if (params.contact) {
      sendSmtpEmail.htmlContent = `<html>
                                      <body>
                                        <p><strong>Nom:</strong> ${escapeHtml(params.name)}</p>
                                        <p><strong>Email:</strong> ${escapeHtml(params.email)}</p>
                                        <p><strong>Téléphone:</strong> ${escapeHtml(params.phone)}</p>
                                        <p><strong>Message:</strong><br />${formatMessageForHtml(params.message)}</p>
                                      </body>
                                     </html>`;
    }

    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Formulaire Contact - Gusto Manager",
    };

    sendSmtpEmail.replyTo = {
      email: params.email,
      name: params.email,
    };

    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;

    // AWAIT ici !
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return response;
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email via Brevo :", err);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const validation = validateContactPayload(req.body);

      if (validation.silent) {
        return sendSuccessResponse(res);
      }

      if (!validation.values) {
        return res.status(400).json({
          status: 400,
          message: validation.errorMessage || "Formulaire invalide",
        });
      }

      const paramsEmail = {
        to: [{ email: "contact@gusto-manager.com", name: "Léo" }],
        contact: true,
        subject: "Nouveau message via le formulaire de contact - Gusto Manager",
        name: validation.values.name,
        email: validation.values.email,
        phone: validation.values.phone,
        message: validation.values.message,
      };

      await sendTransactionalEmail(paramsEmail);

      return sendSuccessResponse(res);
    } catch (err) {
      console.error("Erreur dans l'API contact-form-email :", err);
      return res
        .status(500)
        .json({ status: 500, message: "Erreur lors de l'envoi de l'email" });
    }
  } else {
    return res.status(405).json({ message: "Méthode non autorisée" });
  }
}
