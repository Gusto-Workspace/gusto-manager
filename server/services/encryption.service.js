const crypto = require("crypto");

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

// Chiffrement
function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(IV_LENGTH); // Génère un IV aléatoire
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_SECRET),
    iv
  );

  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`; // Retourne l'IV et la donnée chiffrée
}

// Déchiffrement
function decryptApiKey(encryptedApiKey) {
  const [iv, encrypted] = encryptedApiKey.split(":"); // Sépare l'IV et la donnée chiffrée
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_SECRET),
    Buffer.from(iv, "hex")
  );

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted; // Retourne la clé API originale
}

module.exports = { encryptApiKey, decryptApiKey };
