const { randomBytes, createCipheriv, createDecipheriv } = require("node:crypto");

function seal(value, key, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(context);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", ...[iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url"))].join(".");
}

function unseal(value, key, context) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid encrypted token");
  const [iv, tag, data] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(context);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = { seal, unseal };
