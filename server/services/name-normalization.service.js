function cleanNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeNamePart(value) {
  const cleaned = cleanNamePart(value);
  if (!cleaned) return "";

  const chars = Array.from(cleaned.toLocaleLowerCase("fr-FR"));
  chars[0] = chars[0].toLocaleUpperCase("fr-FR");

  return chars.join("");
}

module.exports = {
  cleanNamePart,
  normalizeNamePart,
};
