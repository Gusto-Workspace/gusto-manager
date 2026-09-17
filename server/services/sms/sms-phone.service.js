const { parsePhoneNumberFromString } = require("libphonenumber-js/max");

function normalizeSmsPhone(value, defaultCountry = "FR") {
  const phone = parsePhoneNumberFromString(String(value || "").trim(), defaultCountry);
  if (!phone || !phone.isValid()) return null;
  return { e164: phone.number, country: phone.country || "" };
}

module.exports = { normalizeSmsPhone };
