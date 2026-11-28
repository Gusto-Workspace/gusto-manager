const { mongoUri, files } = require("./isolated-environment.cjs");
const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const Admin = require("../../models/admin.model");
const Account = require("../../models/commercial-account.model");
const Resource = require("../../models/commercial-resource.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const { signCommercialToken } = require("../../middleware/authenticate-commercial");

const adminPath = "/admin/commerciaux/library/resources";
const sellerPath = "/commercial/resources";
let listener;
let base;
let account;
let tokens;
let fileResource;

async function request(path, token, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body && !multipart && { "Content-Type": "application/json" }) },
    ...(body && { body: multipart ? body : JSON.stringify(body) }),
  });
  const contentType = response.headers.get("content-type") || "";
  return { status: response.status, headers: response.headers, body: contentType.includes("application/json") ? await response.json() : await response.text() };
}
const fixture = (data, name = "ressource.pdf") => {
  const body = new FormData();
  body.set("file", new Blob([data], { type: "application/pdf" }), name);
  return body;
};

before(async () => {
  await mongoose.connect(mongoUri, { dbName: `gusto_commercial_resources_${new mongoose.Types.ObjectId()}`, serverSelectionTimeoutMS: 5000 });
  await Resource.init();
  const admin = await Admin.create({ role: "admin", email: "admin@recette.invalid" });
  account = await Account.create({ status: "ACTIVE", firstName: "Alice", lastName: "Recette", email: "alice@recette.invalid" });
  tokens = { admin: signAdminToken(admin), seller: signCommercialToken(account) };
  const app = express();
  app.use(express.json());
  app.use("/api", require("../../routes/commercial-resources.routes"));
  listener = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  base = `http://127.0.0.1:${listener.address().port}/api`;
});

after(async () => {
  if (listener) await new Promise((resolve) => listener.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("le brouillon, l’upload et son format sont contrôlés avant publication", async () => {
  const created = await request(adminPath, tokens.admin, "POST", { title: "Plaquette fictive", category: "Ressources de recette", kind: "FILE" });
  assert.equal(created.status, 201);
  fileResource = created.body.resource;
  const path = `${adminPath}/${fileResource._id}`;
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "publish" })).status, 409);
  assert.equal((await request(`${path}/file`, tokens.seller, "POST", fixture("%PDF-fictif"))).status, 403);
  assert.equal((await request(`${path}/file`, tokens.admin, "POST", fixture("Non PDF"))).status, 400);
  assert.equal((await request(`${path}/file`, tokens.admin, "POST", fixture(Buffer.alloc(10 * 1024 * 1024 + 1)))).status, 413);
  const attached = await request(`${path}/file`, tokens.admin, "POST", fixture("%PDF-première version fictive"));
  assert.equal(attached.status, 200);
  assert.equal(attached.body.resource.filename, "ressource.pdf");
  assert.equal((await request(`${sellerPath}/${fileResource._id}/download`, tokens.seller)).status, 404);
  assert.equal((await request(sellerPath, tokens.seller)).body.total, 0);
  assert.equal([...files.values()].at(-1).type, "authenticated");
});

test("publication, fichier privé, remplacement et retrait", async () => {
  const path = `${adminPath}/${fileResource._id}`;
  const download = `${sellerPath}/${fileResource._id}/download`;
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "publish" })).status, 200);
  const list = await request(sellerPath, tokens.seller);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.resources[0].file, undefined);
  assert.equal(list.body.resources[0].link, undefined);
  assert.equal(list.body.resources[0].public_id, undefined);
  const first = await request(download, tokens.seller);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control"), /no-store/);
  assert.equal(first.body, "%PDF-première version fictive");
  const replacement = await request(`${path}/file`, tokens.admin, "POST", fixture("%PDF-deuxième version fictive"));
  assert.equal(replacement.body.resource.fileVersion, 2);
  assert.equal((await request(download, tokens.seller)).body, "%PDF-deuxième version fictive");
  assert.equal(files.size, 1);
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "withdraw" })).status, 200);
  assert.equal((await request(download, tokens.seller)).status, 404);
  assert.equal((await request(`${path}/download`, tokens.admin)).status, 200);
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "archive" })).status, 200);
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "publish" })).status, 409);
});

test("les ressources expirées ou les comptes désactivés cessent d’être servis", async () => {
  const created = await request(adminPath, tokens.admin, "POST", {
    title: "Lien fictif", category: "Promotion", kind: "LINK", link: "https://guide.fixture.invalid/",
    endsAt: new Date(Date.now() + 60000).toISOString(),
  });
  const path = `${adminPath}/${created.body.resource._id}`;
  assert.equal((await request(`${path}/status`, tokens.admin, "POST", { action: "publish" })).status, 200);
  assert.equal((await request(sellerPath, tokens.seller)).body.total, 1);
  await Resource.updateOne({ _id: created.body.resource._id }, { $set: { endsAt: new Date(0) } });
  assert.equal((await request(sellerPath, tokens.seller)).body.total, 0);
  await Account.updateOne({ _id: account._id }, { $set: { status: "DISABLED" }, $inc: { sessionVersion: 1 } });
  assert.equal((await request(sellerPath, tokens.seller)).status, 401);
  assert.equal((await request(`${sellerPath}/${fileResource._id}/download`, tokens.seller)).status, 401);
});
