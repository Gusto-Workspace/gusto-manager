const { createHash } = require("node:crypto");
const { createReadStream, createWriteStream } = require("node:fs");
const { mkdir, mkdtemp, rm, stat, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { BSON, MongoClient } = require("mongodb");
const tar = require("tar");

const legacyCollections = ["admins", "menus", "owners", "restaurants", "employees", "reservations", "visitcounters"];
const transientCollections = new Set(["reservationdaylocks", "takeawayslotlocks", "timeclockwriteguards"]);
const folder = "Gusto_Workspace/backups";
const assetPrefix = "backup-full-";
const deliveryType = "authenticated";
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const verificationTimeoutMs = 15 * 60 * 1000;
const purgeScopes = [
  { type: "upload", prefix: `${folder}/backup-`, suffix: /^\d{2}-\d{2}-\d{4}-\d{2}h\d{2}(?:\.tar\.gz|\.gz)?$/ },
  { type: deliveryType, prefix: `${folder}/${assetPrefix}`, suffix: /^\d{2}-\d{2}-\d{4}-\d{2}h\d{2}\.tar\.gz$/ },
];
const manifestFile = "_backup/manifest.json";
const backupFormat = "gusto-mongo-ejson-v1";
const parisTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function backupCollections(catalog) {
  const collections = new Map(legacyCollections.map((name) => [name, { name, exists: false }]));
  for (const { name, type, options } of catalog) {
    if (type === "view" || name.startsWith("system.") || transientCollections.has(name)) continue;
    collections.set(name, { name, options, exists: true });
  }
  return collections.values();
}

function collectionFilename(name) {
  if (/^[a-z0-9_]{1,200}$/.test(name)) return `${name}.json`;
  return `${createHash("sha256").update(name).digest("hex")}.collection.json`;
}

async function exportCollection(db, session, directory, { name, options = {}, exists }) {
  const collection = db.collection(name);
  const file = collectionFilename(name);
  const indexes = exists ? await collection.listIndexes().toArray() : [];
  let count = 0;

  async function* exportDocuments() {
    yield "[\n";
    if (exists) {
      const cursor = collection.find({}, { session, promoteValues: false, bsonRegExp: true });
      for await (const document of cursor) {
        if (count > 0) yield ",\n";
        yield BSON.EJSON.stringify(document, { relaxed: false });
        count += 1;
      }
      if (count > 0) yield "\n";
    }
    yield "]\n";
  }

  await pipeline(Readable.from(exportDocuments()), createWriteStream(path.join(directory, file), { mode: 0o600 }));
  return { name, file, options, indexes, count };
}

async function exportDatabase(client, directory, now) {
  const db = client.db();
  const collections = backupCollections(await db.listCollections().toArray());
  const manifest = { format: backupFormat, database: db.databaseName, exportedAt: now, collections: [] };

  await client.withSession({ snapshot: true }, async (session) => {
    for (const collection of collections) {
      try {
        manifest.collections.push(await exportCollection(db, session, directory, collection));
      } catch (cause) {
        throw new Error(`Échec de l’export MongoDB de ${collection.name}`, { cause });
      }
    }
  });
  const destination = path.join(directory, manifestFile);
  await mkdir(path.dirname(destination));
  await writeFile(destination, BSON.EJSON.stringify(manifest, { relaxed: false }), { mode: 0o600 });
  return manifest.collections.length;
}

async function uploadArchive(cloudinary, archivePath, filename) {
  const { size } = await stat(archivePath);
  let stream;
  const response = new Promise((resolve, reject) => {
    stream = cloudinary.uploader.upload_chunked_stream({
      resource_type: "raw",
      type: deliveryType,
      folder,
      public_id: filename,
      filename,
      overwrite: false,
      disable_promises: true,
    }, (error, asset) => error ? reject(error) : resolve(asset));
  });
  try {
    const [asset] = await Promise.all([response, stream && pipeline(createReadStream(archivePath), stream)]);
    if (asset?.resource_type !== "raw" || asset.type !== deliveryType || asset.existing ||
        asset.public_id !== `${folder}/${filename}` || asset.bytes !== size) {
      throw new Error("Cloudinary n’a pas confirmé l’archive authentifiée complète");
    }
    return asset;
  } finally {
    stream?.destroy();
  }
}

async function archiveChecksum(stream, expectedBytes) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    if (bytes > expectedBytes) throw new Error("Archive plus grande que prévu");
    hash.update(chunk);
  }
  if (bytes !== expectedBytes) throw new Error("Archive incomplète");
  return hash.digest("hex");
}

async function verifyPrivateArchive(cloudinary, asset, archivePath, cutoff, fetchArchive) {
  try {
    if (!(Date.parse(asset.created_at) >= cutoff)) throw new Error("Date de création invalide");
    const checksum = await archiveChecksum(createReadStream(archivePath), asset.bytes);
    const url = cloudinary.utils.private_download_url(asset.public_id, undefined, {
      resource_type: "raw",
      type: deliveryType,
      expires_at: Math.floor((Date.now() + verificationTimeoutMs) / 1000),
    });
    const response = await fetchArchive(url, {
      headers: { "accept-encoding": "identity" },
      signal: AbortSignal.timeout(verificationTimeoutMs),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Téléchargement indisponible");
    }
    if (await archiveChecksum(response.body, asset.bytes) !== checksum) throw new Error("Empreinte différente");
  } catch {
    // Les erreurs de transport peuvent contenir l’URL de téléchargement signée.
    throw new Error("Purge Cloudinary ignorée. La nouvelle sauvegarde privée n’a pas pu être vérifiée.");
  }
}

async function listExpiredBackups(cloudinary, { type, prefix, suffix }, cutoff, protectedId) {
  const expired = new Set();
  const cursors = new Set();
  let nextCursor;
  do {
    const page = await cloudinary.api.resources({ resource_type: "raw", type, prefix, max_results: 500, next_cursor: nextCursor });
    for (const asset of page.resources) {
      const id = asset.public_id;
      if (asset.resource_type === "raw" && asset.type === type && typeof id === "string" && id !== protectedId &&
          id.startsWith(prefix) && suffix.test(id.slice(prefix.length)) &&
          Date.parse(asset.created_at) < cutoff) expired.add(id);
    }
    nextCursor = page.next_cursor;
    if (cursors.has(nextCursor)) throw new Error("Curseur Cloudinary répété");
    if (nextCursor) cursors.add(nextCursor);
  } while (nextCursor);
  return [...expired];
}

async function purgeExpiredBackups(cloudinary, cutoff, protectedId, logger) {
  let deleted = 0;
  for (const scope of purgeScopes) {
    try {
      const expired = await listExpiredBackups(cloudinary, scope, cutoff, protectedId);
      for (let offset = 0; offset < expired.length; offset += 100) {
        const ids = expired.slice(offset, offset + 100);
        const result = await cloudinary.api.delete_resources(ids, { resource_type: "raw", type: scope.type });
        const statuses = ids.map((id) => result.deleted?.[id]);
        deleted += statuses.filter((status) => status === "deleted").length;
        if (statuses.some((status) => status !== "deleted" && status !== "not_found")) {
          throw new Error("Suppression partiellement confirmée");
        }
      }
    } catch {
      logger.error(`Purge Cloudinary incomplète pour raw/${scope.type}. Nouvelle tentative au prochain passage.`);
    }
  }
  logger.log(`Purge Cloudinary terminée (${deleted} archives supprimées)`);
}

async function runMongoBackup({ uri, cloudinary, now = new Date(), logger = console, fetchArchive = fetch }) {
  const parts = Object.fromEntries(parisTime.formatToParts(now).map(({ type, value }) => [type, value]));
  const timestamp = `${parts.day}-${parts.month}-${parts.year}-${parts.hour}h${parts.minute}`;
  const workspace = await mkdtemp(path.join(tmpdir(), "gusto-backup-"));
  const directory = path.join(workspace, timestamp);
  const filename = `${assetPrefix}${timestamp}.tar.gz`;
  const archivePath = path.join(workspace, filename);

  try {
    await mkdir(directory, { mode: 0o700 });
    const client = new MongoClient(uri);
    let count;
    try {
      await client.connect();
      count = await exportDatabase(client, directory, now);
    } finally {
      await client.close();
    }
    await tar.c({ gzip: true, file: archivePath, cwd: workspace, mode: 0o600 }, [timestamp]);
    const asset = await uploadArchive(cloudinary, archivePath, filename);
    const cutoff = now.getTime() - retentionMs;
    await verifyPrivateArchive(cloudinary, asset, archivePath, cutoff, fetchArchive);
    logger.log(`Sauvegarde Cloudinary vérifiée (${count} collections)`);
    await purgeExpiredBackups(cloudinary, cutoff, asset.public_id, logger);
    return count;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

module.exports = { runMongoBackup, manifestFile, backupFormat };
