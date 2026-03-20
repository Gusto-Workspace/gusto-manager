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

export const RESERVATION_EMAIL_TEMPLATE_DEFINITIONS = [
  {
    key: "pending",
    title: "Réservation en attente",
    description:
      "Envoyé quand une réservation est créée mais attend encore validation.",
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
    title: "Réservation confirmée",
    description:
      "Envoyé quand une réservation est confirmée automatiquement ou manuellement.",
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
    title: "Réservation annulée",
    description:
      "Envoyé quand la réservation est annulée par le restaurant ou automatiquement.",
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
    title: "Validation de l’empreinte bancaire",
    description:
      "Envoyé quand le client doit valider son empreinte bancaire pour finaliser la réservation.",
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

export const RESERVATION_EMAIL_VARIABLE_LABELS = {
  customerName: "Nom complet du client",
  restaurantName: "Nom du restaurant",
  reservationDate: "Date de réservation",
  reservationTime: "Heure de réservation",
  guestCountLabel: "Nombre de personnes",
  commentary: "Commentaire de réservation",
  bankHoldAmountTotal: "Montant de l’empreinte bancaire",
  actionUrl: "Lien d’action",
};

const VARIABLE_DISPLAY_TOKEN_BY_KEY = Object.fromEntries(
  Object.entries(RESERVATION_EMAIL_VARIABLE_LABELS).map(([key, label]) => [
    key,
    `[${label}]`,
  ]),
);

const TEMPLATE_BY_KEY = Object.fromEntries(
  RESERVATION_EMAIL_TEMPLATE_DEFINITIONS.map((definition) => [
    definition.key,
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

export function buildReservationEmailTemplatesState(rawTemplates = {}) {
  const source =
    rawTemplates && typeof rawTemplates === "object" ? rawTemplates : {};
  const nextTemplates = {};

  for (const definition of RESERVATION_EMAIL_TEMPLATE_DEFINITIONS) {
    const current = source?.[definition.key] || {};
    const hasCustomSubject = Object.prototype.hasOwnProperty.call(
      current,
      "subject",
    );
    const hasCustomBody = Object.prototype.hasOwnProperty.call(current, "body");

    nextTemplates[definition.key] = {
      subject: normalizeReservationEmailTemplateText(
        hasCustomSubject ? current?.subject : definition.defaultSubject,
      ),
      body: normalizeReservationEmailTemplateText(
        hasCustomBody ? current?.body : definition.defaultBody,
      ),
    };
  }

  return nextTemplates;
}

export function buildReservationEmailTemplatesPayload(rawTemplates = {}) {
  const source = buildReservationEmailTemplatesState(rawTemplates);
  const nextTemplates = {};

  for (const definition of RESERVATION_EMAIL_TEMPLATE_DEFINITIONS) {
    const current = source?.[definition.key] || {};
    nextTemplates[definition.key] = {
      subject:
        normalizeReservationEmailTemplateText(current?.subject || "").trim() ||
        definition.defaultSubject,
      body:
        normalizeReservationEmailTemplateText(current?.body || "").trim() ||
        definition.defaultBody,
    };
  }

  return nextTemplates;
}

export function areReservationEmailTemplatesEqual(left, right) {
  return (
    JSON.stringify(buildReservationEmailTemplatesState(left)) ===
    JSON.stringify(buildReservationEmailTemplatesState(right))
  );
}

export function isReservationEmailTemplateDefault(templateKey, templates) {
  const definition = TEMPLATE_BY_KEY[templateKey];
  if (!definition) return false;

  const current =
    buildReservationEmailTemplatesPayload(templates)?.[templateKey];
  return (
    String(current?.subject || "").trim() === definition.defaultSubject &&
    String(current?.body || "").trim() === definition.defaultBody
  );
}

export function getReservationEmailTemplateDefinition(templateKey) {
  return TEMPLATE_BY_KEY[templateKey] || null;
}

export function extractReservationEmailTemplateTokens(value) {
  const tokens = new Set();
  const source = normalizeReservationEmailTemplateText(value);
  let match = TEMPLATE_TOKEN_REGEX.exec(source);

  while (match) {
    tokens.add(String(match[1] || "").trim());
    match = TEMPLATE_TOKEN_REGEX.exec(source);
  }

  TEMPLATE_TOKEN_REGEX.lastIndex = 0;
  return Array.from(tokens);
}

export function getInvalidReservationEmailTemplateTokens(
  templateKey,
  fieldValue,
) {
  const definition = getReservationEmailTemplateDefinition(templateKey);
  if (!definition) return [];

  const allowed = new Set(definition.allowedVariables || []);
  return extractReservationEmailTemplateTokens(fieldValue).filter(
    (token) => !allowed.has(token),
  );
}

export function getReservationEmailVariableDisplayToken(variableKey) {
  return (
    VARIABLE_DISPLAY_TOKEN_BY_KEY[variableKey] ||
    `[${RESERVATION_EMAIL_VARIABLE_LABELS[variableKey] || variableKey}]`
  );
}

export function formatReservationEmailTemplateForDisplay(value) {
  let nextValue = normalizeReservationEmailTemplateText(value);

  for (const variableKey of Object.keys(RESERVATION_EMAIL_VARIABLE_LABELS)) {
    nextValue = nextValue
      .split(`{{${variableKey}}}`)
      .join(getReservationEmailVariableDisplayToken(variableKey));
  }

  return nextValue;
}

export function parseReservationEmailTemplateDisplayValue(value) {
  let nextValue = String(value || "");

  const replacements = Object.entries(VARIABLE_DISPLAY_TOKEN_BY_KEY).sort(
    (left, right) => right[1].length - left[1].length,
  );

  for (const [variableKey, displayToken] of replacements) {
    nextValue = nextValue.split(displayToken).join(`{{${variableKey}}}`);
  }

  return nextValue;
}

function buildPreviewVariables(restaurantName = "Maison Gusto") {
  return {
    customerName: "Paul Bocuse",
    restaurantName: String(restaurantName || "Maison Gusto").trim(),
    reservationDate: "12/04/2026",
    reservationTime: "19:45",
    guestCountLabel: "4 personnes",
    commentary: "Anniversaire",
    bankHoldAmountTotal: "40,00 €",
    actionUrl: "https://example.com/reservations/bank-hold",
  };
}

export function interpolateReservationEmailTemplate(template, variables = {}) {
  return String(template || "").replace(TEMPLATE_TOKEN_REGEX, (_, tokenName) =>
    String(variables?.[tokenName] ?? "").trim(),
  );
}

export function buildReservationEmailPreview(
  templateKey,
  templates,
  restaurantName,
) {
  const currentTemplates = buildReservationEmailTemplatesState(templates);
  const currentTemplate = currentTemplates?.[templateKey];
  const variables = buildPreviewVariables(restaurantName);

  return {
    subject: interpolateReservationEmailTemplate(
      currentTemplate?.subject || "",
      variables,
    ),
    body: interpolateReservationEmailTemplate(currentTemplate?.body || "", {
      ...variables,
      commentary:
        variables.commentary ||
        RESERVATION_EMAIL_VARIABLE_LABELS.commentary ||
        "",
    }),
    actionUrl: variables.actionUrl,
  };
}
