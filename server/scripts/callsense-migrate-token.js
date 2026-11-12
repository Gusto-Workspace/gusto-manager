// Dry-run by default; no Twilio API calls or purchases. Run one restaurant at a time.
const mongoose = require("mongoose");
const Config = require("../models/callsense/callsense-config.model");
const { encryptToken, decryptToken } = require("../services/callsense-secrets.service");

async function migrateToken({ restaurantId, accounts, apply = false, ConfigModel = Config }) {
  if (!mongoose.isValidObjectId(restaurantId)) throw new Error("Invalid restaurant ID");
  const config = await ConfigModel.findOne({ restaurantId }).select("+encryptedAuthToken").lean();
  if (!config) throw new Error("CallSense configuration not found");
  const token = accounts?.[config.accountSid];
  if (typeof token !== "string" || !token.trim()) throw new Error("Legacy account token not found");
  if (config.encryptedAuthToken) {
    if (decryptToken(config.encryptedAuthToken, restaurantId, config.accountSid) !== token) throw new Error("Existing token differs; refusing to overwrite");
    return "already-migrated";
  }
  const encryptedAuthToken = encryptToken(token, restaurantId, config.accountSid);
  if (!apply) return "ready";
  const result = await ConfigModel.updateOne({ _id: config._id, accountSid: config.accountSid, encryptedAuthToken: null }, {
    $set: { encryptedAuthToken },
    $push: { securityEvents: { $each: [{ action: "legacy_token_migrated", actorId: "migration-script", at: new Date() }], $slice: -100 } },
  });
  if (!result.matchedCount) throw new Error("Configuration changed; retry the dry run");
  return "migrated";
}

async function main() {
  const restaurantId = process.argv[2];
  const apply = process.argv[3] === "--apply";
  if (!process.env.CALLSENSE_MIGRATION_MONGO_URI) throw new Error("CALLSENSE_MIGRATION_MONGO_URI is required");
  const accounts = JSON.parse(process.env.CALLSENSE_ACCOUNTS || "{}");
  await mongoose.connect(process.env.CALLSENSE_MIGRATION_MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  try { console.log(await migrateToken({ restaurantId, accounts, apply })); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(() => { console.error("CallSense migration failed; verify the configuration and retry."); process.exitCode = 1; });
module.exports = { migrateToken };
