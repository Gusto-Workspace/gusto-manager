const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM_EXTENSION = new Set("^{}\\[~]|€".split(""));

export const SMS_TEMPLATE_VARIABLES = [
  { backend: "{firstName}", display: "{Prénom}" },
  { backend: "{date}", display: "{Date}" },
  { backend: "{time}", display: "{Heure}" },
  { backend: "{guests}", display: "{Nombre de personnes}" },
  { backend: "{restaurantName}", display: "{Nom du restaurant}" },
];

function replaceExactPlaceholders(value, sourceKey, targetKey) {
  return SMS_TEMPLATE_VARIABLES.reduce(
    (template, variable) =>
      template.split(variable[sourceKey]).join(variable[targetKey]),
    String(value || ""),
  );
}

export function smsTemplateToDisplay(value) {
  return replaceExactPlaceholders(value, "backend", "display");
}

export function smsTemplateToBackend(value) {
  return replaceExactPlaceholders(value, "display", "backend");
}

export function insertSmsTemplateVariable(value, variable, start, end) {
  const template = String(value || "");
  const selectionStart = Math.min(
    template.length,
    Math.max(0, Number.isInteger(start) ? start : template.length),
  );
  const selectionEnd = Math.min(
    template.length,
    Math.max(selectionStart, Number.isInteger(end) ? end : selectionStart),
  );
  return {
    value: `${template.slice(0, selectionStart)}${variable}${template.slice(selectionEnd)}`,
    cursor: selectionStart + variable.length,
  };
}

export function splitSmsTemplateTokens(value) {
  const template = smsTemplateToDisplay(value);
  const tokensByDisplay = new Map(
    SMS_TEMPLATE_VARIABLES.map((variable) => [variable.display, variable]),
  );
  const tokenPattern = new RegExp(
    `(${SMS_TEMPLATE_VARIABLES.map((variable) =>
      variable.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|")})`,
    "g",
  );

  return template
    .split(tokenPattern)
    .filter(Boolean)
    .map((part) => {
      const variable = tokensByDisplay.get(part);
      return variable
        ? { type: "token", value: variable.display, variable }
        : { type: "text", value: part };
    });
}

function isGsm7Text(value) {
  return Array.from(value).every(
    (character) =>
      GSM_BASIC.has(character) || GSM_EXTENSION.has(character),
  );
}

export function normalizeToGsm7(value) {
  const original = String(value || "");
  const source = normalizeSmsTypography(original);
  let adapted = source !== original;
  const incompatibleCharacters = new Set();
  const normalized = Array.from(source)
    .map((character) => {
      if (isGsm7Text(character)) return character;

      const ascii = character
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (
        ascii !== character &&
        /^[\x20-\x7E]+$/.test(ascii) &&
        isGsm7Text(ascii)
      ) {
        adapted = true;
        return ascii;
      }

      incompatibleCharacters.add(character);
      return character;
    })
    .join("");

  return {
    value: normalized,
    adapted,
    incompatibleCharacters: Array.from(incompatibleCharacters),
  };
}

export function normalizeSmsTemplateToGsm7(value) {
  let adapted = false;
  const incompatibleCharacters = new Set();
  const normalized = splitSmsTemplateTokens(value)
    .map((part) => {
      if (part.type === "token") return part.value;
      const result = normalizeToGsm7(part.value);
      if (result.adapted) adapted = true;
      result.incompatibleCharacters.forEach((character) =>
        incompatibleCharacters.add(character),
      );
      return result.value;
    })
    .join("");

  return {
    value: normalized,
    adapted,
    incompatibleCharacters: Array.from(incompatibleCharacters),
  };
}

export function normalizeSmsTemplateSelectionToGsm7(value, start, end) {
  const template = String(value || "");
  const selectionStart = Math.min(
    template.length,
    Math.max(0, Number.isInteger(start) ? start : template.length),
  );
  const selectionEnd = Math.min(
    template.length,
    Math.max(selectionStart, Number.isInteger(end) ? end : selectionStart),
  );
  const normalized = normalizeSmsTemplateToGsm7(template);

  return {
    ...normalized,
    start: normalizeSmsTemplateToGsm7(
      template.slice(0, selectionStart),
    ).value.length,
    end: normalizeSmsTemplateToGsm7(template.slice(0, selectionEnd)).value
      .length,
  };
}

export function deleteSmsTemplateSelection(
  value,
  start,
  end,
  direction,
) {
  const template = smsTemplateToDisplay(value);
  let selectionStart = Math.min(Math.max(0, start), template.length);
  let selectionEnd = Math.min(
    template.length,
    Math.max(selectionStart, end),
  );
  let offset = 0;
  const tokenRanges = splitSmsTemplateTokens(template)
    .map((part) => {
      const range = {
        type: part.type,
        start: offset,
        end: offset + part.value.length,
      };
      offset = range.end;
      return range;
    })
    .filter((range) => range.type === "token");

  if (selectionStart === selectionEnd) {
    const adjacentToken = tokenRanges.find((range) =>
      direction === "backward"
        ? selectionStart > range.start && selectionStart <= range.end
        : selectionStart >= range.start && selectionStart < range.end,
    );
    if (!adjacentToken) return null;
    selectionStart = adjacentToken.start;
    selectionEnd = adjacentToken.end;
  } else {
    const touchedTokens = tokenRanges.filter(
      (range) => selectionStart < range.end && selectionEnd > range.start,
    );
    if (!touchedTokens.length) return null;
    selectionStart = Math.min(selectionStart, touchedTokens[0].start);
    selectionEnd = Math.max(
      selectionEnd,
      touchedTokens[touchedTokens.length - 1].end,
    );
  }

  return {
    value: `${template.slice(0, selectionStart)}${template.slice(selectionEnd)}`,
    cursor: selectionStart,
  };
}

export function getSmsQuotaPresentation(usage = {}) {
  const rawIncluded = Number(usage.includedCredits);
  const rawIncludedUsed = Number(usage.includedCreditsConsumed);
  const rawOverageCredits = Number(usage.overageCredits);
  const rawOverageAmount = Number(usage.overageAmount);
  const included =
    Number.isFinite(rawIncluded) && rawIncluded > 0 ? rawIncluded : 100;
  const includedUsed =
    Number.isFinite(rawIncludedUsed) && rawIncludedUsed > 0
      ? rawIncludedUsed
      : 0;

  return {
    included,
    includedUsed,
    remaining: Math.max(0, included - includedUsed),
    percentage: Math.min(
      100,
      Math.max(0, Math.round((includedUsed / included) * 100)),
    ),
    overageCredits:
      Number.isFinite(rawOverageCredits) && rawOverageCredits > 0
        ? rawOverageCredits
        : 0,
    overageAmount:
      Number.isFinite(rawOverageAmount) && rawOverageAmount > 0
        ? rawOverageAmount
        : 0,
  };
}

export function formatSmsEuro(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function getGsm7SmsSegmentCount(units) {
  const normalizedUnits = Math.max(0, Number(units) || 0);
  return normalizedUnits <= 160 ? 1 : Math.ceil(normalizedUnits / 153);
}

export function normalizeSmsTypography(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
}

export function analyzeSingleSms(value) {
  const message = normalizeSmsTypography(value);
  let units = 0;
  for (const character of message) {
    if (GSM_BASIC.has(character)) units += 1;
    else if (GSM_EXTENSION.has(character)) units += 2;
    else return { message, units: Array.from(message).length, maxUnits: 70, segmentCount: 0, valid: false, encoding: "unicode" };
  }
  return {
    message,
    units,
    maxUnits: 160,
    segmentCount: getGsm7SmsSegmentCount(units),
    valid: true,
    encoding: "gsm7",
  };
}

export function renderSmsPreview(template, values) {
  return normalizeSmsTypography(template).replace(
    /\{(firstName|date|time|guests|restaurantName)\}/g,
    (_, key) => String(values[key] ?? ""),
  );
}
