#!/usr/bin/env node

require("dotenv").config();
const cron = require("node-cron");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const tar = require("tar");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const {
  createPerfEventLoopRunProbe,
  createPerfRun,
  finishPerfRun,
  getPerfMemorySnapshot,
  perfLog,
  perfNowMs,
} = require("../perf-diagnostics.service");

/**
 * Fonction qui réalise le backup :
 * - export JSON de chaque collection
 * - création d’un .tar.gz
 * - upload sur Cloudinary
 * - purge des backups > 7 jours
 * - nettoyage local
 */
async function runBackup() {
  const perfRun = createPerfRun("backup", "BACKUP");
  const eventLoopProbe = createPerfEventLoopRunProbe();
  const memoryBefore = perfRun.enabled ? getPerfMemorySnapshot() : null;
  const perfMetrics = {
    collectionCount: 0,
    documentCount: 0,
    mongoConnectMs: 0,
    mongoQueryMs: 0,
    stringifyMs: 0,
    writeMs: 0,
    archiveMs: 0,
    uploadMs: 0,
    cloudinaryPurgeMs: 0,
    localCleanupMs: 0,
    cloudinaryCalls: 0,
    deletedRemoteBackups: 0,
    errorCount: 0,
    memoryBefore,
    rssPeakSampleMb: memoryBefore?.rssMb || null,
    heapUsedPeakSampleMb: memoryBefore?.heapUsedMb || null,
  };
  let runFailed = false;

  const captureMemory = () => {
    if (!perfRun.enabled) return null;
    const snapshot = getPerfMemorySnapshot();
    perfMetrics.rssPeakSampleMb = Math.max(
      perfMetrics.rssPeakSampleMb || 0,
      snapshot.rssMb || 0,
    );
    perfMetrics.heapUsedPeakSampleMb = Math.max(
      perfMetrics.heapUsedPeakSampleMb || 0,
      snapshot.heapUsedMb || 0,
    );
    return snapshot;
  };

  console.log(
    `[${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}] Démarrage du backup…`
  );

  try {
    // 1) Connexion Mongo
    const uri = process.env.CONNECTION_STRING;
    const client = new MongoClient(uri);
    const mongoConnectStartedAt = perfRun.enabled ? perfNowMs() : 0;
    await client.connect();
    if (perfRun.enabled) {
      perfMetrics.mongoConnectMs = perfNowMs() - mongoConnectStartedAt;
    }
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
      const collectionMemoryBefore = captureMemory();
      const queryStartedAt = perfRun.enabled ? perfNowMs() : 0;
      const docs = await db.collection(name).find().toArray();
      const queryMs = perfRun.enabled ? perfNowMs() - queryStartedAt : 0;
      const memoryAfterQuery = captureMemory();

      const stringifyStartedAt = perfRun.enabled ? perfNowMs() : 0;
      const serializedDocs = JSON.stringify(docs, null, 2);
      const stringifyMs = perfRun.enabled
        ? perfNowMs() - stringifyStartedAt
        : 0;
      const memoryAfterStringify = captureMemory();

      const writeStartedAt = perfRun.enabled ? perfNowMs() : 0;
      fs.writeFileSync(path.join(baseDir, `${name}.json`), serializedDocs);
      const writeMs = perfRun.enabled ? perfNowMs() - writeStartedAt : 0;
      const memoryAfterWrite = captureMemory();

      if (perfRun.enabled) {
        perfMetrics.collectionCount += 1;
        perfMetrics.documentCount += docs.length;
        perfMetrics.mongoQueryMs += queryMs;
        perfMetrics.stringifyMs += stringifyMs;
        perfMetrics.writeMs += writeMs;
        perfLog("BACKUP", {
          event: "collection",
          job: perfRun.job,
          runId: perfRun.runId,
          collection: name,
          documentCount: docs.length,
          queryMs,
          stringifyMs,
          writeMs,
          memoryBefore: collectionMemoryBefore,
          memoryAfterQuery,
          memoryAfterStringify,
          memoryAfterWrite,
        });
      }
      console.log(`✔ Exported ${name} (${docs.length} docs)`);
    }
    await client.close();

    // 5) Création de l’archive
    const archivePath = `/tmp/backup-${ts}.tar.gz`;
    const archiveStartedAt = perfRun.enabled ? perfNowMs() : 0;
    await tar.c({ gzip: true, file: archivePath, cwd: "/tmp/backups" }, [ts]);
    if (perfRun.enabled) {
      perfMetrics.archiveMs = perfNowMs() - archiveStartedAt;
      captureMemory();
    }
    console.log(`✔ Archive created: ${archivePath}`);

    // 6) Upload sur Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const uploadStartedAt = perfRun.enabled ? perfNowMs() : 0;
    if (perfRun.enabled) perfMetrics.cloudinaryCalls += 1;
    await cloudinary.uploader.upload(archivePath, {
      resource_type: "raw",
      type: "upload",
      folder: "Gusto_Workspace/backups",
      public_id: `backup-${ts}`,
    });
    if (perfRun.enabled) {
      perfMetrics.uploadMs = perfNowMs() - uploadStartedAt;
      captureMemory();
    }
    console.log(`✔ Upload Cloudinary`);

    // 7) Purge des backups > 7 jours
    const cloudinaryPurgeStartedAt = perfRun.enabled ? perfNowMs() : 0;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (perfRun.enabled) perfMetrics.cloudinaryCalls += 1;
      const listResp = await cloudinary.api.resources({
        resource_type: "raw",
        type: "upload",
        prefix: "Gusto_Workspace/backups/",
        max_results: 500,
      });
      for (const res of listResp.resources) {
        const created = new Date(res.created_at);
        if (created < sevenDaysAgo) {
          if (perfRun.enabled) perfMetrics.cloudinaryCalls += 1;
          await cloudinary.api.delete_resources([res.public_id], {
            resource_type: "raw",
            type: "upload",
          });
          if (perfRun.enabled) perfMetrics.deletedRemoteBackups += 1;
          console.log(`✔ Deleted old backup`);
        }
      }
    } catch (err) {
      if (perfRun.enabled) perfMetrics.errorCount += 1;
      console.error("❌ Erreur lors de la purge des anciens backups :", err);
    } finally {
      if (perfRun.enabled) {
        perfMetrics.cloudinaryPurgeMs = perfNowMs() - cloudinaryPurgeStartedAt;
      }
    }

    // 8) Nettoyage local
    const localCleanupStartedAt = perfRun.enabled ? perfNowMs() : 0;
    fs.rmSync(baseDir, { recursive: true, force: true });
    fs.unlinkSync(archivePath);
    if (perfRun.enabled) {
      perfMetrics.localCleanupMs = perfNowMs() - localCleanupStartedAt;
      captureMemory();
    }
    console.log("✔ Local cleanup done");
    console.log("Backup terminé ✅");
  } catch (error) {
    runFailed = true;
    if (perfRun.enabled) perfMetrics.errorCount += 1;
    throw error;
  } finally {
    const memoryAfter = captureMemory();
    const eventLoop = eventLoopProbe.finish();
    finishPerfRun(perfRun, {
      ...perfMetrics,
      failed: runFailed,
      ...eventLoop,
      memoryAfter,
      memory: memoryAfter,
    });
  }
}

// Cron programmé dès l’import du module, toutes les 4 h en heure de Paris
cron.schedule(
  "0 */4 * * *", // à 00h, 04h, 08h, 12h, 16h, 20h
  () => runBackup().catch((err) => console.error("Backup échoué ❌", err)),
  { timezone: "Europe/Paris" }
);
console.log("Backup programmé toutes les 4 heures (Europe/Paris)");

module.exports = runBackup;
