#!/usr/bin/env node

require("dotenv").config();
const cron = require("node-cron");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const tar = require("tar");
const path = require("path");
const cloudinary = require("cloudinary").v2;

/**
 * Fonction qui réalise le backup :
 * - export JSON de chaque collection
 * - création d’un .tar.gz
 * - upload sur Cloudinary
 * - purge des backups > 7 jours
 * - nettoyage local
 */
async function runBackup() {
  console.log(`[${new Date().toLocaleString()}] Démarrage du backup…`);

  // 1) Connexion Mongo
  const uri = process.env.CONNECTION_STRING;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // 2) Préparation du dossier temporaire
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ts = `${dd}-${MM}-${yyyy}-${HH}h${mm}`; // ex. "22-05-2025-12h03"

  const baseDir = `/tmp/backups/${ts}`;
  fs.mkdirSync(baseDir, { recursive: true });

  // 3) Export JSON
  const collections = [
    "admins",
    "menus",
    "owners",
    "restaurants",
    "employees",
    "reservations",
  ];
  for (const name of collections) {
    const docs = await db.collection(name).find().toArray();
    fs.writeFileSync(
      path.join(baseDir, `${name}.json`),
      JSON.stringify(docs, null, 2)
    );
    console.log(`✔ Exported ${name} (${docs.length} docs)`);
  }
  await client.close();

  // 4) Création de l’archive
  const archivePath = `/tmp/backup-${ts}.tar.gz`;
  await tar.c({ gzip: true, file: archivePath, cwd: "/tmp/backups" }, [ts]);
  console.log(`✔ Archive created: ${archivePath}`);

  // 5) Upload Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const uploadResp = await cloudinary.uploader.upload(archivePath, {
    resource_type: "raw",
    type: "upload",
    folder: "Gusto_Workspace/backups",
    public_id: `backup-${ts}`,
  });
  console.log(`✔ Upload Cloudinary`);

  // 6) Purge des sauvegardes Cloudinary > 7 jours
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const listResp = await cloudinary.api.resources({
      resource_type: "raw",
      type: "upload",
      prefix: "Gusto_Workspace/backups/",
      max_results: 500,
    });
    for (const res of listResp.resources) {
      const created = new Date(res.created_at);
      if (created < sevenDaysAgo) {
        await cloudinary.api.delete_resources([res.public_id], {
          resource_type: "raw",
          type: "upload",
        });
        console.log(`✔ Deleted old backup`);
      }
    }
  } catch (err) {
    console.error("❌ Erreur lors de la purge des anciens backups :", err);
  }

  // 7) Nettoyage local
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.unlinkSync(archivePath);
  console.log("✔ Local cleanup done");
  console.log("Backup terminé ✅");
}

// Cron programmé dès l’import du module
cron.schedule(
  "0 */4 * * *", // à 00 h, 04 h, 08 h, 12 h, 16 h, 20 h
  () => runBackup().catch((err) => console.error("Backup échoué ❌", err)),
  { timezone: "Europe/Paris" }
);
console.log("Backup programmé toutes les 4 heures (Europe/Paris)");

module.exports = runBackup;
