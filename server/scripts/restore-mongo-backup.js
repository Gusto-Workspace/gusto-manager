const { createReadStream } = require("node:fs");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { createInterface } = require("node:readline");
const { BSON, MongoClient } = require("mongodb");
const { backupFormat, manifestFile } = require("../services/cron-job/mongo-backup.service");

async function restoreDocuments(collection, filename, expectedCount) {
  const input = createReadStream(filename);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const batch = [];
  let batchBytes = 0;
  let count = 0;
  let opened = false;
  let closed = false;
  let comma = false;
  const invalid = () => new Error(`Export tronqué ou invalide pour ${collection.collectionName}`);

  try {
    for await (const line of lines) {
      if (!opened && line === "[") {
        opened = true;
      } else if (opened && !closed && line === "]" && !comma) {
        closed = true;
      } else {
        if (!opened || closed || (count > 0 && !comma) || count >= expectedCount) throw invalid();
        comma = line.endsWith(",");
        batch.push(BSON.EJSON.parse(comma ? line.slice(0, -1) : line, { relaxed: false }));
        batchBytes += Buffer.byteLength(line);
        count += 1;
        if (batch.length >= 100 || batchBytes >= 8 * 1024 * 1024) {
          await collection.insertMany(batch.splice(0));
          batchBytes = 0;
        }
      }
    }
    if (!closed || count !== expectedCount) throw invalid();
    if (batch.length) await collection.insertMany(batch);
  } finally {
    lines.close();
    input.destroy();
  }
}

async function restoreMongoBackup(db, directory) {
  const manifest = BSON.EJSON.parse(await readFile(path.join(directory, manifestFile), "utf8"));
  if (manifest.format !== backupFormat || !manifest.collections?.length) {
    throw new Error("Format de sauvegarde MongoDB non reconnu");
  }
  const names = new Set();
  const files = new Set();
  for (const { name, file, count, indexes, options } of manifest.collections) {
    if (typeof name !== "string" || names.has(name) || typeof file !== "string" || files.has(file) ||
        !/^[a-z0-9_]+(?:\.collection)?\.json$/.test(file) || !Number.isSafeInteger(count) || count < 0 ||
        !Array.isArray(indexes) || !options || typeof options !== "object") {
      throw new Error("Manifeste de sauvegarde MongoDB invalide");
    }
    names.add(name);
    files.add(file);
  }
  if (await db.listCollections({}, { nameOnly: true }).hasNext()) {
    throw new Error("La base de restauration doit être vide");
  }

  for (const { name, file, options, indexes, count } of manifest.collections) {
    const collection = await db.createCollection(name, options);
    await restoreDocuments(collection, path.join(directory, file), count);
    const secondaryIndexes = indexes.filter(({ name }) => name !== "_id_");
    if (secondaryIndexes.length) await collection.createIndexes(secondaryIndexes);
  }
  return names.size;
}

async function main() {
  const [directory, database] = process.argv.slice(2);
  const uri = process.env.GUSTO_RESTORE_MONGO_URI;
  if (!directory || !database || !uri) {
    throw new Error("Indiquer le dossier extrait, le nom de la base cible et GUSTO_RESTORE_MONGO_URI");
  }
  const client = new MongoClient(uri);
  try {
    const count = await restoreMongoBackup(client.db(database), directory);
    console.log(`Restauration terminée (${count} collections)`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Échec de la restauration MongoDB", error.message);
    process.exitCode = 1;
  });
}

module.exports = { restoreMongoBackup };
