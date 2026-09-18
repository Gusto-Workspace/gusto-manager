export const SMS_COUNTRY_NAMES_FR = Object.freeze({
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  DE: "Allemagne",
  GB: "Royaume-Uni",
  ES: "Espagne",
  IT: "Italie",
  NL: "Pays-Bas",
  PT: "Portugal",
});

export function getSmsCountryName(country) {
  const code = String(country || "").trim().toUpperCase();
  return SMS_COUNTRY_NAMES_FR[code] || code || "Destination inconnue";
}
