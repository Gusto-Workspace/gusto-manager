const assert = require("node:assert/strict");
const { readFile, readdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const { BSON, MongoClient } = require("mongodb");
const { v2: cloudinarySdk } = require("cloudinary");
const mongoose = require("mongoose");
const tar = require("tar");
const { runMongoBackup, manifestFile } = require("../../services/cron-job/mongo-backup.service");
const { restoreMongoBackup } = require("../../scripts/restore-mongo-backup");

const folder = "Gusto_Workspace/backups";
const now = new Date("2026-11-23T11:00:00Z");
const logger = { log() {}, error() {} };
const legacy = ["admins", "menus", "owners", "restaurants", "employees", "reservations", "visitcounters"];
const omit = ["reservationdaylocks", "takeawayslotlocks", "timeclockwriteguards"];
const archiveAsset = (date, name, type = "authenticated", resourceType = "raw") => ({
  public_id: `${folder}/${name}`,
  type,
  resource_type: resourceType,
  created_at: date,
});

function mockCloudinary({ changeUpload, download, listError, deleteError } = {}) {
  const calls = { uploads: [], signedUrls: [], downloads: [], lists: [], deletes: [] };
  const signedUrl = "https://cloudinary.example.test/raw/download?signature=fixture-secret";
  const cloudinary = {
    uploader: {
      upload_chunked_stream(options, callback) {
        const chunks = [];
        const write = (chunk, _encoding, done) => { chunks.push(Buffer.from(chunk)); done(); };
        const stream = new Writable({ write });
        stream.once("finish", () => {
          const archive = Buffer.concat(chunks);
          calls.uploads.push({ options, archive });
          const asset = {
            type: options.type,
            resource_type: options.resource_type,
            public_id: `${options.folder}/${options.public_id}`,
            bytes: archive.length,
            created_at: now.toISOString(),
          };
          if (changeUpload instanceof Error) callback(changeUpload);
          else callback(null, { ...asset, ...changeUpload });
        });
        return stream;
      },
    },
    utils: {
      private_download_url(...args) {
        calls.signedUrls.push(args);
        return signedUrl;
      },
    },
    api: {
      async resources(options) {
        calls.lists.push(options);
        assert.equal(calls.downloads.length, 1, "la lecture signée doit précéder le listing");
        if (options.type === listError) throw new Error(`fixture error ${signedUrl}`);
        if (options.type === "upload") {
          if (options.next_cursor) {
            return { resources: [
              archiveAsset("2026-11-12T11:00:00Z", "backup-12-11-2026-12h00.gz", "upload"),
              archiveAsset("2026-11-13T11:00:00Z", "backup-13-11-2026-12h00.tar.gz", "upload"),
            ] };
          }
          return { resources: [
            archiveAsset("2026-11-16T10:59:59Z", "backup-16-11-2026-11h59", "upload"),
            archiveAsset("2026-11-21T11:00:00Z", "backup-01-11-2026-11h00", "upload"),
            archiveAsset("2026-11-01T10:00:00Z", "backup-01-11-2026-11h00.pdf", "upload"),
            archiveAsset("2026-11-01T10:00:00Z", "backup-01-11-2026-11h00", "upload", "image"),
            { ...archiveAsset("2026-11-01T10:00:00Z", "backup-01-11-2026-11h00", "upload"),
              public_id: "Another_Project/backups/backup-01-11-2026-11h00" },
          ], next_cursor: "public-second-page" };
        }
        if (options.next_cursor) {
          return { resources: [archiveAsset("2026-11-15T11:00:00Z", "backup-full-15-11-2026-12h00.tar.gz")] };
        }
        return {
          resources: [
            archiveAsset("2026-11-16T10:59:59Z", "backup-full-16-11-2026-11h59.tar.gz"),
            archiveAsset("2026-11-16T11:00:00Z", "backup-full-16-11-2026-12h00.tar.gz"),
            archiveAsset("2026-11-01T10:00:00Z", "backup-full-01-11-2026-11h00.tar.gz", "upload"),
            archiveAsset("2026-11-01T10:00:00Z", "backup-01-11-2026-11h00"),
            archiveAsset("2026-11-01T10:00:00Z", calls.uploads[0].options.public_id),
            archiveAsset("2026-11-01T10:00:00Z", "archive-salarie.tar.gz"),
            archiveAsset(null, "backup-full-12-11-2026-11h00.tar.gz"),
          ],
          next_cursor: "private-second-page",
        };
      },
      async delete_resources(ids, options) {
        calls.deletes.push({ ids, options });
        if (options.type === deleteError) throw new Error(`fixture error ${signedUrl}`);
        return { deleted: Object.fromEntries(ids.map((id) => [id, "deleted"])) };
      },
    },
  };
  async function fetchArchive(url) {
    assert.equal(url, signedUrl);
    const { archive } = calls.uploads[0];
    calls.downloads.push(archive);
    return download ? download(archive) : new Response(archive);
  }
  return { calls, cloudinary, fetchArchive };
}

async function modelCollections(directory) {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) names.push(...await modelCollections(file));
    else if (entry.name.endsWith(".model.js")) {
      const source = await readFile(file, "utf8");
      const collection = source.match(/\bcollection:\s*"([^"]+)"/)?.[1];
      for (const [, model] of source.matchAll(/mongoose\.model\("([^"]+)"/g)) {
        names.push(collection || mongoose.pluralize()(model));
      }
    }
  }
  return names;
}

test("cron schedule, timezone, MongoDB variable and RH retry are preserved", async () => {
  const source = await readFile(path.join(__dirname, "../../services/cron-job/backup.service.js"), "utf8");
  let schedule;
  let usedUri;
  let retries = 0;
  const ready = { readyState: 1 };
  const cloudinary = { config() {} };
  const dependencies = {
    dotenv: { config() {} },
    "node-cron": { schedule(...args) { schedule = args; } },
    cloudinary: { v2: cloudinary },
    mongoose: { connection: ready },
    "../employees/employee-asset-deletion.service": {
      async retryEmployeeAssetDeletions() { retries += 1; },
    },
    "./mongo-backup.service": {
      async runMongoBackup(options) { usedUri = options.uri; assert.equal(options.cloudinary, cloudinary); },
    },
  };
  runInNewContext(source, {
    require: (name) => dependencies[name],
    console: logger,
    module: {},
    process: { env: { CONNECTION_STRING: "fixture-backup-uri", CONNECTION_STRING_TEST: "fixture-app-uri" } },
  });
  assert.equal(schedule[0], "0 */4 * * *");
  assert.equal(schedule[2].timezone, "Europe/Paris");
  schedule[1]();
  ready.readyState = 0;
  schedule[1]();
  assert.equal(usedUri, "fixture-backup-uri");
  assert.equal(retries, 1);
});

test("the Cloudinary SDK signs a temporary raw authenticated download without network access", () => {
  const publicId = `${folder}/backup-full-23-11-2026-12h00.tar.gz`;
  const expiresAt = Math.floor(now.getTime() / 1000) + 900;
  const url = new URL(cloudinarySdk.utils.private_download_url(publicId, undefined, {
    cloud_name: "fixture",
    api_key: "fixture-key",
    api_secret: "fixture-secret",
    resource_type: "raw",
    type: "authenticated",
    expires_at: expiresAt,
  }));
  assert.equal(url.pathname, "/v1_1/fixture/raw/download");
  assert.equal(url.searchParams.get("public_id"), publicId);
  assert.equal(url.searchParams.get("type"), "authenticated");
  assert.equal(url.searchParams.get("expires_at"), String(expiresAt));
  assert.ok(url.searchParams.get("signature"));
  assert.equal(url.searchParams.has("format"), false);
});

const fixtureUri = process.env.GUSTO_BACKUP_TEST_MONGO_URI;
test("backup and restoration on an isolated local replica set", {
  skip: !fixtureUri && "Set GUSTO_BACKUP_TEST_MONGO_URI to a dedicated loopback test instance",
}, async (t) => {
  const uri = new URL(fixtureUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.ok(uri.port);
  assert.equal(uri.pathname, "/");
  assert.equal(uri.username + uri.password, "");
  const prefix = `backup_fixture_${new BSON.ObjectId()}`;
  const client = await MongoClient.connect(fixtureUri);
  const source = client.db(`${prefix}_source`);
  const target = client.db(`${prefix}_restored`);
  const incomplete = client.db(`${prefix}_incomplete`);
  const extraction = await mkdtemp(path.join(tmpdir(), "gusto-restore-test-"));
  t.after(async () => {
    try {
      for (const database of [source, target, incomplete]) await database.dropDatabase();
    } finally {
      await client.close();
      await rm(extraction, { recursive: true, force: true });
    }
  });
  uri.pathname = `/${source.databaseName}`;

  const names = await modelCollections(path.join(__dirname, "../../models"));
  names.push("timeclockwriteguards", "gustomigrationreceipts", "future_module", "Future.Module");
  const collectionNames = [...new Set(names)];
  for (const name of collectionNames) {
    if (name === "visitcounters") continue;
    const options = name === "planningpublications" ? { validator: { synthetic: { $type: "string" } } } : {};
    const collection = await source.createCollection(name, options);
    if (name !== "employees" && name !== "planningpublications") await collection.insertOne({ synthetic: name });
  }
  await source.createCollection("snapshotview", { viewOn: "restaurants", pipeline: [] });
  const restaurant = (await source.collection("restaurants").findOne())._id;
  const employee = new BSON.ObjectId();
  await source.collection("employees").insertOne({
    _id: employee,
    restaurantProfiles: [{ restaurant, shifts: [{ start: now }], documents: [
      { public_id: "fixture/private/contract.pdf", delivery_type: "authenticated" },
    ] }],
    externalKey: "unique-fixture",
    number: BSON.Long.fromString("9223372036854775807"),
    counter: new BSON.Int32(5),
    ratio: new BSON.Double(2),
    amount: BSON.Decimal128.fromString("42.17"),
    file: new BSON.Binary(Buffer.from([1, 2, 3]), 128),
    regex: new BSON.BSONRegExp("fixture", "ix"),
    payload: "x".repeat(1024 * 1024),
  });
  await source.collection("employees").createIndex({ externalKey: 1 }, {
    name: "unique_fixture_key",
    unique: true,
    partialFilterExpression: { externalKey: { $type: "string" } },
  });
  await source.collection("notifications").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
  const future = source.collection("future_module");
  for (let batch = 0; batch < 5; batch += 1) {
    await future.insertMany(Array.from({ length: 4 }, (_, i) => ({ n: batch * 4 + i, value: "y".repeat(1024 * 1024) })));
  }

  const expected = collectionNames.filter((name) => !omit.includes(name)).sort();
  const useMock = ({ cloudinary, fetchArchive }, backupLogger = logger) =>
    runMongoBackup({ uri: uri.href, cloudinary, fetchArchive, now, logger: backupLogger });
  const successful = mockCloudinary();
  const { calls } = successful;
  const messages = [];
  const errors = [];
  const backupLogger = { log: (message) => messages.push(message), error: (...args) => errors.push(args) };
  assert.equal(await useMock(successful, backupLogger), expected.length);
  assert.equal(calls.uploads.length, 1);
  const [{ options }] = calls.uploads;
  assert.deepEqual(options, {
    resource_type: "raw", type: "authenticated", folder,
    public_id: "backup-full-23-11-2026-12h00.tar.gz",
    filename: "backup-full-23-11-2026-12h00.tar.gz", overwrite: false, disable_promises: true,
  });
  assert.equal(calls.signedUrls.length, 1);
  const [[publicId, format, signedOptions]] = calls.signedUrls;
  assert.equal(publicId, `${folder}/${options.public_id}`);
  assert.equal(format, undefined);
  assert.equal(signedOptions.resource_type, "raw");
  assert.equal(signedOptions.type, "authenticated");
  assert.ok(signedOptions.expires_at > Math.floor(Date.now() / 1000));
  assert.deepEqual(calls.lists.map(({ type, prefix, next_cursor }) => [type, prefix, next_cursor]), [
    ["upload", `${folder}/backup-`, undefined], ["upload", `${folder}/backup-`, "public-second-page"],
    ["authenticated", `${folder}/backup-full-`, undefined],
    ["authenticated", `${folder}/backup-full-`, "private-second-page"],
  ]);
  assert.deepEqual(calls.deletes, [
    { ids: ["backup-16-11-2026-11h59", "backup-12-11-2026-12h00.gz", "backup-13-11-2026-12h00.tar.gz"]
      .map((name) => `${folder}/${name}`), options: { resource_type: "raw", type: "upload" } },
    { ids: ["backup-full-16-11-2026-11h59.tar.gz", "backup-full-15-11-2026-12h00.tar.gz"]
      .map((name) => `${folder}/${name}`), options: { resource_type: "raw", type: "authenticated" } },
  ]);
  assert.ok(messages.some((message) => /5 archives supprimées/.test(message)));
  assert.deepEqual(errors, []);

  const archiveFile = path.join(extraction, "fixture.tar.gz");
  await writeFile(archiveFile, calls.downloads[0]);
  await tar.x({ cwd: extraction, file: archiveFile, strict: true });
  const directory = path.join(extraction, "23-11-2026-12h00");
  const manifest = BSON.EJSON.parse(await readFile(path.join(directory, manifestFile), "utf8"));
  assert.deepEqual(manifest.collections.map(({ name }) => name).sort(), expected);
  for (const name of legacy) assert.ok(manifest.collections.find((entry) => entry.name === name));
  for (const name of ["planningpublications", "visitcounters"]) {
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, `${name}.json`), "utf8")), []);
  }
  assert.equal(await restoreMongoBackup(target, directory), expected.length);
  const employees = target.collection("employees");
  const restored = await employees.findOne({ _id: employee }, { promoteValues: false, bsonRegExp: true });
  const original = await source.collection("employees").findOne({ _id: employee }, { promoteValues: false, bsonRegExp: true });
  const canonical = (document) => BSON.EJSON.stringify(document, { relaxed: false });
  assert.equal(canonical(restored), canonical(original));
  assert.ok(await target.collection("restaurants").findOne({ _id: restored.restaurantProfiles[0].restaurant }));
  assert.equal(await target.collection("future_module").countDocuments(), 21);
  assert.equal((await target.collection("future_module").findOne({ n: 19 })).value.length, 1024 * 1024);
  assert.equal(await target.collection("visitcounters").countDocuments(), 0);
  assert.deepEqual(await employees.indexes(), await source.collection("employees").indexes());
  assert.deepEqual(await target.collection("notifications").indexes(), await source.collection("notifications").indexes());
  await assert.rejects(employees.insertOne({ externalKey: "unique-fixture" }), { code: 11000 });
  await assert.rejects(target.collection("planningpublications").insertOne({ synthetic: 123 }), { code: 121 });
  await assert.rejects(restoreMongoBackup(target, directory), /doit être vide/);

  await t.test("a truncated collection stops restoration", async () => {
    const filename = path.join(directory, "admins.json");
    const content = await readFile(filename, "utf8");
    await writeFile(filename, content.slice(0, -2));
    await assert.rejects(restoreMongoBackup(incomplete, directory), /tronqué/);
  });

  await t.test("a MongoDB export failure neither uploads nor purges", async () => {
    await client.db("admin").command({
      configureFailPoint: "failCommand", mode: { times: 1 },
      data: { failCommands: ["find"], errorCode: 2 },
    });
    const failed = mockCloudinary();
    await assert.rejects(useMock(failed), /Échec de l’export/);
    assert.ok(Object.values(failed.calls).every((events) => events.length === 0));
  });

  await t.test("a failed upload or inconsistent confirmation does not purge", async () => {
    const failures = [
      [new Error("fixture upload"), /fixture upload/],
      [{ bytes: 1 }, /archive authentifiée complète/],
      [{ type: "upload" }, /archive authentifiée complète/],
    ];
    for (const [changeUpload, message] of failures) {
      const failed = mockCloudinary({ changeUpload });
      await assert.rejects(useMock(failed), message);
      assert.deepEqual(failed.calls.lists, []);
      assert.deepEqual(failed.calls.deletes, []);
    }
  });

  await t.test("an unavailable, stale, truncated or corrupt replacement preserves existing backups", async () => {
    const failures = [
      { changeUpload: { created_at: "2026-11-15T11:00:00Z" } },
      { download: () => new Response("forbidden", { status: 403 }) },
      { download: (archive) => new Response(archive.subarray(0, -1)) },
      { download: (archive) => new Response(Buffer.alloc(archive.length)) },
      { download: () => { throw new Error("fixture-secret from a signed URL"); } },
    ];
    for (const failure of failures) {
      const failed = mockCloudinary(failure);
      await assert.rejects(useMock(failed), (error) => {
        assert.match(error.message, /Purge Cloudinary ignorée/);
        assert.doesNotMatch(error.message, /fixture-secret/);
        return true;
      });
      assert.deepEqual(failed.calls.lists, []);
      assert.deepEqual(failed.calls.deletes, []);
    }
  });

  await t.test("Cloudinary listing and deletion errors are logged safely and a future backup retries", async () => {
    errors.length = 0;
    const failed = mockCloudinary({ listError: "upload", deleteError: "authenticated" });
    assert.equal(await useMock(failed, backupLogger), expected.length);
    assert.deepEqual(failed.calls.deletes.map(({ options }) => options.type), ["authenticated"]);
    assert.equal(errors.length, 2);
    assert.match(errors[0][0], /incomplète pour raw\/upload/);
    assert.match(errors[1][0], /incomplète pour raw\/authenticated/);
    assert.doesNotMatch(JSON.stringify(errors), /fixture-secret|https:\/\//);
    const next = mockCloudinary();
    assert.equal(await useMock(next), expected.length);
    assert.deepEqual(next.calls.deletes.map(({ options }) => options.type), ["upload", "authenticated"]);
  });
});
