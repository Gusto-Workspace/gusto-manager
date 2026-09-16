const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM_EXTENSION = new Set("^{}\\[~]|€".split(""));

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
    else return { message, units: Array.from(message).length, maxUnits: 70, valid: false, encoding: "unicode" };
  }
  return { message, units, maxUnits: 160, valid: units <= 160, encoding: "gsm7" };
}

export function renderSmsPreview(template, values) {
  return normalizeSmsTypography(template).replace(
    /\{(firstName|date|time|guests|restaurantName)\}/g,
    (_, key) => String(values[key] ?? ""),
  );
}
