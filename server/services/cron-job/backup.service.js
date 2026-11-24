#!/usr/bin/env node

require("dotenv").config();
const cron = require("node-cron");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const { retryEmployeeAssetDeletions } = require("../employees/employee-asset-deletion.service");
const { runMongoBackup } = require("./mongo-backup.service");

function runBackup() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return runMongoBackup({ uri: process.env.CONNECTION_STRING, cloudinary });
}

// Cron programmé dès l’import du module, toutes les 4 h en heure de Paris
cron.schedule(
  "0 */4 * * *", // à 00h, 04h, 08h, 12h, 16h, 20h
  () => {
    runBackup().catch((err) => console.error("Backup échoué ❌", err));
    if (mongoose.connection.readyState === 1) {
      retryEmployeeAssetDeletions().catch((error) =>
        console.error("[employee-asset-deletion] Scheduled retry deferred:", error?.code || "unavailable"),
      );
    }
  },
  { timezone: "Europe/Paris" },
);
console.log("Backup programmé toutes les 4 heures (Europe/Paris)");

module.exports = runBackup;
