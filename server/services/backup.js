#!/usr/bin/env node

const { MongoClient } = require("mongodb");
const fs = require("fs");
const tar = require("tar");
const path = require("path");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

async function run() {
  // 1) Connexion Mongo
  const uri = process.env.CONNECTION_STRING;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // 2) Préparation du dossier temporaire
  const now  = new Date();  
  const dd   = String(now.getDate()).padStart(2, "0");
  const MM   = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const HH   = String(now.getHours()).padStart(2, "0");
  const mm   = String(now.getMinutes()).padStart(2, "0");
  // ex. "22-05-2025-12h03"
  const ts = `${dd}-${MM}-${yyyy}-${HH}h${mm}`;

  const baseDir = `/tmp/backups/${ts}`;
  fs.mkdirSync(baseDir, { recursive: true });

  // 3) Export JSON
  const collections = ["admins", "menus", "owners", "restaurants", "employees", "reservations"];
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
  await tar.c(
    { gzip: true, file: archivePath, cwd: "/tmp/backups" },
    [ts]
  );
  console.log(`✔ Archive created: ${archivePath}`);

  // 5) Upload Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  await cloudinary.uploader.upload(archivePath, {
    resource_type: "raw",
    folder:        "Gusto_Workspace/backups",
    public_id:     `backup-${ts}`,
  });
  console.log("✔ Upload Cloudinary");

  // 6) Nettoyage local
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.unlinkSync(archivePath);
  console.log("✔ Local cleanup done");
}

run()
  .then(() => console.log("Backup terminé ✅"))
  .catch((err) => {
    console.error("Backup échoué ❌", err);
    process.exit(1);
  });
