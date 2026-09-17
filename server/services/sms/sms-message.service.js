const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM_EXTENSION = new Set("^{}\\[~]|€".split(""));
const ALLOWED_VARIABLES = new Set([
  "firstName",
  "date",
  "time",
  "guests",
  "restaurantName",
]);
const LEGACY_DEFAULT_SMS_TEMPLATE =
  "Bonjour {firstName}, rappel de votre reservation chez {restaurantName} le {date} a {time} pour {guests} pers.";
const DEFAULT_SMS_TEMPLATE =
  "Bonjour {firstName}, pour rappel, votre table chez {restaurantName} est réservée le {date} à {time} pour {guests} pers. A bientot !";

function normalizeDefaultSmsTemplate(template) {
  const value = String(template || "");
  return value === LEGACY_DEFAULT_SMS_TEMPLATE ? DEFAULT_SMS_TEMPLATE : value;
}

function normalizeSmsTypography(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
}

function analyzeSingleSms(value) {
  const message = normalizeSmsTypography(value);
  let septets = 0;

  for (const character of message) {
    if (GSM_BASIC.has(character)) septets += 1;
    else if (GSM_EXTENSION.has(character)) septets += 2;
    else {
      return {
        message,
        encoding: "unicode",
        units: Array.from(message).length,
        maxUnits: 70,
        segmentCount: Array.from(message).length <= 70 ? 1 : 2,
        valid: false,
        reason: /\p{Extended_Pictographic}/u.test(character)
          ? "emoji_not_allowed"
          : "unicode_not_allowed",
      };
    }
  }

  return {
    message,
    encoding: "gsm7",
    units: septets,
    maxUnits: 160,
    segmentCount: septets <= 160 ? 1 : 2,
    valid: septets <= 160,
    reason: septets <= 160 ? "" : "message_too_long",
  };
}

function validateSmsTemplate(template) {
  const normalized = normalizeSmsTypography(
    normalizeDefaultSmsTemplate(template),
  ).trim();
  if (!normalized) throw new Error("Le modèle SMS est requis.");

  const unknown = Array.from(normalized.matchAll(/\{([^{}]+)\}/g))
    .map((match) => match[1])
    .filter((name) => !ALLOWED_VARIABLES.has(name));
  if (unknown.length) {
    const error = new Error(`Variables SMS non autorisées : ${Array.from(new Set(unknown)).join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const preview = normalized.replace(/\{firstName\}/g, "Alexandre")
    .replace(/\{date\}/g, "31/12/2026")
    .replace(/\{time\}/g, "20:30")
    .replace(/\{guests\}/g, "12")
    .replace(/\{restaurantName\}/g, "Le Restaurant");
  const analysis = analyzeSingleSms(preview);
  if (!analysis.valid) {
    const error = new Error(
      analysis.reason === "message_too_long"
        ? "Le modèle SMS dépasse un segment avec les valeurs d'aperçu."
        : "Le modèle doit utiliser uniquement des caractères GSM-7 et aucun emoji.",
    );
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function renderSmsTemplate(template, values = {}) {
  return normalizeSmsTypography(template).replace(
    /\{(firstName|date|time|guests|restaurantName)\}/g,
    (_, name) => String(values[name] ?? ""),
  );
}

module.exports = {
  ALLOWED_VARIABLES,
  DEFAULT_SMS_TEMPLATE,
  LEGACY_DEFAULT_SMS_TEMPLATE,
  analyzeSingleSms,
  normalizeDefaultSmsTemplate,
  normalizeSmsTypography,
  renderSmsTemplate,
  validateSmsTemplate,
};
