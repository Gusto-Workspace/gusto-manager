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
  console.log(
    `[${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}] Démarrage du backup…`
  );

  // 1) Connexion Mongo
  const uri = process.env.CONNECTION_STRING;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // 2) Préparation du timestamp en heure de Paris
  const now = new Date();
  const parisDateTime = now.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  // ex. "23/05/2025 20:00"
  const [datePart, timePart] = parisDateTime.split(" ");
  const [dd, MM, yyyy] = datePart.split("/");
  const [HH, mm] = timePart.split(":");
  const ts = `${dd}-${MM}-${yyyy}-${HH}h${mm}`; // ex. "23-05-2025-20h00"

  // 3) Préparation du dossier temporaire
  const baseDir = `/tmp/backups/${ts}`;
  fs.mkdirSync(baseDir, { recursive: true });

  // 4) Export JSON
  const collections = [
    "admins",
    "menus",
    "owners",
    "restaurants",
    "employees",
    "reservations",
    "visitcounters",
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

  // 5) Création de l’archive
  const archivePath = `/tmp/backup-${ts}.tar.gz`;
  await tar.c({ gzip: true, file: archivePath, cwd: "/tmp/backups" }, [ts]);
  console.log(`✔ Archive created: ${archivePath}`);

  // 6) Upload sur Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  await cloudinary.uploader.upload(archivePath, {
    resource_type: "raw",
    type: "upload",
    folder: "Gusto_Workspace/backups",
    public_id: `backup-${ts}`,
  });
  console.log(`✔ Upload Cloudinary`);

  // 7) Purge des backups > 7 jours
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

  // 8) Nettoyage local
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.unlinkSync(archivePath);
  console.log("✔ Local cleanup done");
  console.log("Backup terminé ✅");
}

// Cron programmé dès l’import du module, toutes les 4 h en heure de Paris
cron.schedule(
  "0 */4 * * *", // à 00h, 04h, 08h, 12h, 16h, 20h
  () => runBackup().catch((err) => console.error("Backup échoué ❌", err)),
  { timezone: "Europe/Paris" }
);
console.log("Backup programmé toutes les 4 heures (Europe/Paris)");

module.exports = runBackup;
