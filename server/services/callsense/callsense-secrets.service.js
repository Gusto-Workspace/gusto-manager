const crypto = require("crypto");

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
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(restaurantId, accountSid));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptToken(value, restaurantId, accountSid) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid encrypted token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64url"));
  decipher.setAAD(aad(restaurantId, accountSid));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}
module.exports = { encryptToken, decryptToken };
