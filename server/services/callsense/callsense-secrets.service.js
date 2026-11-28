const { seal, unseal } = require("../shared/authenticated-encryption.service");

// A key must be generated independently for each environment and retained in
// the secret manager. Binding the ciphertext to both IDs prevents moving it to
// another restaurant or account.
function key() {
  const raw = process.env.CALLSENSE_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("CALLSENSE_ENCRYPTION_KEY must be 32 bytes in hexadecimal");
  return Buffer.from(raw, "hex");
}
function aad(restaurantId, accountSid) {
  if (!restaurantId || !accountSid) throw new Error("Missing secret context");
  return Buffer.from(`callsense:v1:${restaurantId}:${accountSid}`);
}
function encryptToken(token, restaurantId, accountSid) {
  if (typeof token !== "string" || !token.trim()) throw new Error("Missing auth token");
  return seal(token, key(), aad(restaurantId, accountSid));
}
function decryptToken(value, restaurantId, accountSid) {
  return unseal(value, key(), aad(restaurantId, accountSid));
}
module.exports = { encryptToken, decryptToken };
