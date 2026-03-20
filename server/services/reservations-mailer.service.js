const SibApiV3Sdk = require("sib-api-v3-sdk");

const COMMON_TEMPLATE_VARIABLES = [
  "customerName",
  "restaurantName",
  "reservationDate",
  "reservationTime",
  "guestCountLabel",
  "commentary",
];

const BANK_HOLD_TEMPLATE_VARIABLES = [
  ...COMMON_TEMPLATE_VARIABLES,
  "bankHoldAmountTotal",
  "actionUrl",
];

const RESERVATION_EMAIL_TEMPLATE_DEFINITIONS = [
  {
    key: "pending",
    type: "pending",
    label: "Réservation en attente",
    allowedVariables: COMMON_TEMPLATE_VARIABLES,
    defaultSubject: "Votre demande de réservation est en attente",
    defaultBody: `Bonjour {{customerName}},

Nous avons bien reçu votre demande de réservation pour {{guestCountLabel}} le {{reservationDate}} à {{reservationTime}}.

Votre demande est actuellement en attente de validation. Nous revenons vers vous dès que possible.

Cordialement,
L'équipe de {{restaurantName}}`,
  },
  {
    key: "confirmed",
    type: "confirmed",
    label: "Réservation confirmée",
    allowedVariables: COMMON_TEMPLATE_VARIABLES,
    defaultSubject: "Confirmation de votre réservation",
    defaultBody: `Bonjour {{customerName}},

Nous vous confirmons que votre réservation pour {{guestCountLabel}} a bien été enregistrée pour le {{reservationDate}} à {{reservationTime}}.

Nous vous remercions de votre confiance et nous nous réjouissons de vous accueillir chez {{restaurantName}}.

Pour toute question ou modification, n'hésitez pas à nous contacter.

Cordialement,
L'équipe de {{restaurantName}}`,
  },
  {
    key: "canceled",
    type: "canceled",
    label: "Réservation annulée",
    allowedVariables: COMMON_TEMPLATE_VARIABLES,
    defaultSubject: "Annulation de votre réservation",
    defaultBody: `Bonjour {{customerName}},

Nous vous informons que votre réservation pour {{guestCountLabel}} le {{reservationDate}} à {{reservationTime}} a été annulée.

Si vous souhaitez reprogrammer une réservation, n’hésitez pas à nous recontacter.

Cordialement,
L'équipe de {{restaurantName}}`,
  },
  {
    key: "bank_hold_action_required",
    type: "bankHoldActionRequired",
    label: "Validation de l’empreinte bancaire",
    allowedVariables: BANK_HOLD_TEMPLATE_VARIABLES,
    defaultSubject: "Validation requise pour confirmer votre réservation",
    defaultBody: `Bonjour {{customerName}},

Votre réservation a été enregistrée chez {{restaurantName}} pour {{guestCountLabel}}, le {{reservationDate}} à {{reservationTime}}.

Afin de confirmer définitivement cette réservation, nous vous invitons à valider l’empreinte bancaire demandée.

Montant de l’empreinte bancaire : {{bankHoldAmountTotal}}

Ce lien est valable 1 heure.

Sans validation dans le délai imparti, la réservation sera automatiquement annulée.

Cordialement,
L'équipe de {{restaurantName}}`,
  },
];

const NON_EDITABLE_TEMPLATE_DEFINITIONS = {
  rejected: {
    subject: "Votre demande de réservation a été refusée",
    body: `Bonjour {{customerName}},

Nous sommes désolés, mais nous ne pouvons pas accepter votre demande de réservation pour {{guestCountLabel}} le {{reservationDate}} à {{reservationTime}}.

N’hésitez pas à réserver un nouveau créneau sur notre site internet.

Cordialement,
L'équipe de {{restaurantName}}`,
  },
  reminder24h: {
    subject: "Rappel de votre réservation demain",
    body: `Bonjour {{customerName}},

Nous avons le plaisir de vous rappeler votre réservation chez {{restaurantName}} pour {{guestCountLabel}}, prévue le {{reservationDate}} à {{reservationTime}}.

Toute l’équipe se réjouit de vous accueillir.

En cas d’empêchement ou de modification, nous vous remercions de bien vouloir nous prévenir dès que possible.

À très bientôt,
L'équipe de {{restaurantName}}`,
  },
};

const EDITABLE_TEMPLATE_BY_KEY = Object.fromEntries(
  RESERVATION_EMAIL_TEMPLATE_DEFINITIONS.map((definition) => [
    definition.key,
    definition,
  ]),
);

const EDITABLE_TEMPLATE_BY_TYPE = Object.fromEntries(
  RESERVATION_EMAIL_TEMPLATE_DEFINITIONS.map((definition) => [
    definition.type,
    definition,
  ]),
);

const TEMPLATE_TOKEN_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function normalizeLegacyReservationEmailTokens(value) {
  return String(value || "")
    .replace(
      /{{\s*customerFirstName\s*}}\s+{{\s*customerLastName\s*}}/g,
      "{{customerName}}",
    )
    .replace(
      /{{\s*customerLastName\s*}}\s+{{\s*customerFirstName\s*}}/g,
      "{{customerName}}",
    )
    .replace(/{{\s*customerFirstName\s*}}/g, "{{customerName}}")
    .replace(/{{\s*customerLastName\s*}}/g, "{{customerName}}");
}

function normalizeReservationEmailTemplateText(value) {
  return normalizeLegacyReservationEmailTokens(value)
    .replace(
      /{{\s*numberOfGuests\s*}}\s+{{\s*guestLabel\s*}}/g,
      "{{guestCountLabel}}",
    )
    .replace(
      /{{\s*guestLabel\s*}}\s+{{\s*numberOfGuests\s*}}/g,
      "{{guestCountLabel}}",
    )
    .replace(/{{\s*numberOfGuests\s*}}/g, "{{guestCountLabel}}")
    .replace(/{{\s*guestLabel\s*}}/g, "{{guestCountLabel}}")
    .replace(/\r\n/g, "\n");
}

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function fmtDateFR(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR");
}

function fmtCurrencyEUR(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGuestLabel(numberOfGuests) {
  return Number(numberOfGuests || 0) > 1 ? "personnes" : "personne";
}

function buildGuestCountLabel(numberOfGuests) {
  const count = Number(numberOfGuests || 0);
  return `${count || 0} ${buildGuestLabel(count)}`.trim();
}

function getReservationCustomerName(reservation) {
  const customerName = String(reservation?.customerName || "").trim();
  if (customerName) return customerName;

  const firstName = String(reservation?.customerFirstName || "").trim();
  const lastName = String(reservation?.customerLastName || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function brevoClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendEmail({
  subject,
  htmlContent,
  toEmail,
  toName,
  restaurantName,
}) {
  if (!looksLikeEmail(toEmail))
    return { skipped: true, reason: "invalid_email" };
  if (!process.env.BREVO_API_KEY)
    return { skipped: true, reason: "missing_brevo_key" };

  const apiInstance = brevoClient();

  const mainEmail = {
    sender: {
      email: "no-reply@gusto-manager.com",
      name: restaurantName || "Gusto Manager",
    },
    to: [{ email: String(toEmail).trim(), name: toName || "" }],
    subject,
    htmlContent,
  };

  return apiInstance.sendTransacEmail(mainEmail);
}

function extractTemplateTokens(template) {
  const tokens = new Set();
  const source = normalizeReservationEmailTemplateText(template);
  let match = TEMPLATE_TOKEN_REGEX.exec(source);

  while (match) {
    tokens.add(String(match[1] || "").trim());
    match = TEMPLATE_TOKEN_REGEX.exec(source);
  }

  TEMPLATE_TOKEN_REGEX.lastIndex = 0;
  return Array.from(tokens);
}

function getUnknownTemplateTokens(template, allowedVariables = []) {
  const allowed = new Set(
    (Array.isArray(allowedVariables) ? allowedVariables : []).map((variable) =>
      String(variable || "").trim(),
    ),
  );

  return extractTemplateTokens(template).filter((token) => !allowed.has(token));
}

function sanitizeReservationEmailTemplatesInput(emailTemplates = {}) {
  const source =
    emailTemplates && typeof emailTemplates === "object" ? emailTemplates : {};
  const nextTemplates = {};

  for (const definition of RESERVATION_EMAIL_TEMPLATE_DEFINITIONS) {
    const current = source?.[definition.key];
    const subject = normalizeReservationEmailTemplateText(
      current?.subject ?? definition.defaultSubject ?? "",
    ).trim();
    const body = normalizeReservationEmailTemplateText(
      current?.body ?? definition.defaultBody ?? "",
    ).trim();

    const invalidTokens = Array.from(
      new Set([
        ...getUnknownTemplateTokens(subject, definition.allowedVariables),
        ...getUnknownTemplateTokens(body, definition.allowedVariables),
      ]),
    );

    if (invalidTokens.length) {
      const error = new Error(
        `Variables inconnues pour le template "${definition.key}".`,
      );
      error.statusCode = 400;
      error.details = {
        templateKey: definition.key,
        invalidTokens,
      };
      throw error;
    }

    nextTemplates[definition.key] = {
      subject: subject || definition.defaultSubject,
      body: body || definition.defaultBody,
    };
  }

  return nextTemplates;
}

function getRestaurantEmailTemplates(restaurant) {
  return restaurant?.reservations?.parameters?.email_templates || {};
}

function buildTemplateVariables({
  reservation,
  restaurantName,
  actionUrl,
  bankHoldAmountTotal,
}) {
  const customerName = getReservationCustomerName(reservation) || "Client";
  const numberOfGuests = Number(reservation?.numberOfGuests || 0);

  return {
    customerName,
    restaurantName: String(restaurantName || "Restaurant").trim(),
    reservationDate: fmtDateFR(reservation?.reservationDate),
    reservationTime: String(reservation?.reservationTime || "").trim(),
    guestCountLabel: buildGuestCountLabel(numberOfGuests),
    commentary: String(reservation?.commentary || "").trim(),
    bankHoldAmountTotal: fmtCurrencyEUR(bankHoldAmountTotal),
    actionUrl: String(actionUrl || "").trim(),
  };
}

function interpolateTemplate(template, variables = {}) {
  return String(template || "").replace(TEMPLATE_TOKEN_REGEX, (_, tokenName) =>
    String(variables?.[tokenName] ?? "").trim(),
  );
}

function renderBodyHtml(text) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtml(paragraph).replace(/\n/g, "<br />"))
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px; line-height:1.6;">${paragraph}</p>`,
    )
    .join("");
}

function buildEmailHtml({ bodyHtml, restaurantName, actionUrl, actionLabel }) {
  const safeRestaurantName = escapeHtml(restaurantName || "Restaurant");
  const safeActionUrl = String(actionUrl || "").trim();

  return `
  <html>
    <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
        <div style="padding:24px 24px 8px;">
          ${bodyHtml}
          ${
            safeActionUrl && actionLabel
              ? `
                <div style="margin:24px 0;">
                  <a
                    href="${escapeHtml(safeActionUrl)}"
                    style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;"
                  >
                    ${escapeHtml(actionLabel)}
                  </a>
                </div>
              `
              : ""
          }
        </div>
      </div>
    </body>
  </html>`;
}

function getTemplateForEmailType(type, restaurant) {
  const editableDefinition = EDITABLE_TEMPLATE_BY_TYPE[type];
  if (editableDefinition) {
    const storedTemplates = getRestaurantEmailTemplates(restaurant);
    const storedTemplate = storedTemplates?.[editableDefinition.key] || {};

    return {
      subject:
        normalizeReservationEmailTemplateText(
          storedTemplate?.subject || "",
        ).trim() || editableDefinition.defaultSubject,
      body:
        normalizeReservationEmailTemplateText(
          storedTemplate?.body || "",
        ).trim() || editableDefinition.defaultBody,
    };
  }

  return NON_EDITABLE_TEMPLATE_DEFINITIONS[type] || null;
}

async function sendReservationEmail(
  type,
  { reservation, restaurantName, restaurant, actionUrl, bankHoldAmountTotal },
) {
  if (!reservation) return { skipped: true, reason: "no_reservation" };

  const email = reservation.customerEmail;
  const resolvedRestaurantName = String(
    restaurantName || restaurant?.name || "Restaurant",
  ).trim();
  const template = getTemplateForEmailType(type, restaurant);

  if (!template) {
    return { skipped: true, reason: "unknown_type" };
  }

  const variables = buildTemplateVariables({
    reservation,
    restaurantName: resolvedRestaurantName,
    actionUrl,
    bankHoldAmountTotal,
  });

  const renderedSubject =
    interpolateTemplate(template.subject, variables).trim() || template.subject;
  const renderedBody =
    interpolateTemplate(template.body, variables).trim() || template.body;

  return sendEmail({
    subject: renderedSubject,
    htmlContent: buildEmailHtml({
      bodyHtml: renderBodyHtml(renderedBody),
      restaurantName: resolvedRestaurantName,
      actionUrl: type === "bankHoldActionRequired" ? variables.actionUrl : "",
      actionLabel:
        type === "bankHoldActionRequired"
          ? "Valider mon empreinte bancaire"
          : "",
    }),
    toEmail: email,
    toName: variables.customerName,
    restaurantName: resolvedRestaurantName,
  });
}

module.exports = {
  RESERVATION_EMAIL_TEMPLATE_DEFINITIONS,
  sendReservationEmail,
  sanitizeReservationEmailTemplatesInput,
};
