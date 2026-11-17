const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const { correctRejectedResource, replaceRejectedDocument, createRegulatoryAddress } = require("../../services/callsense/callsense-onboarding.service");
const { encryptToken } = require("../../services/callsense/callsense-secrets.service");
const restaurantId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const accountSid = `AC${"a".repeat(32)}`, bundleSid = `BU${"b".repeat(32)}`, regulationSid = `RN${"c".repeat(32)}`, userSid = `IT${"d".repeat(32)}`, documentSid = `RD${"e".repeat(32)}`, addressSid = `AD${"f".repeat(32)}`;

function fixture(t) {
  const oldKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);
  t.after(() => { if (oldKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = oldKey; });
  const draft = { _id: "draft", accountSid, encryptedAuthToken: encryptToken("fictif", restaurantId, accountSid), regulatoryBundleSid: bundleSid, regulatorySubmission: { bundleSid, regulationSid, endUserSid: userSid, documentSids: [documentSid], assignedSids: [userSid, documentSid] } };
  const user = { sid: userSid, accountSid, type: "business", attributes: { business_name: "Ancien" } };
  const doc = { sid: documentSid, accountSid, type: "proof", status: "rejected", attributes: { address_sids: [addressSid], business_name: "Ancien" } };
  const address = { sid: addressSid, accountSid, isoCountry: "FR", validated: true, city: "Ancienne" };
  let writes = 0, lose = false, loseAssignment = false, uploads = 0;
  const replacementSid = `RD${"1".repeat(32)}`;
  const replacement = { sid: replacementSid, accountSid, type: "proof", status: "draft", attributes: {} };
  let assignments = [userSid, documentSid].map((objectSid, i) => ({ sid: `BV${String(i + 1).repeat(32)}`, objectSid, accountSid, bundleSid }));
  const assign = fields => { for (const [key, value] of Object.entries(fields || {})) { const parts = key.split("."); let target = draft; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts.at(-1)] = value; } };
  t.mock.method(Config, "exists", async () => false);
  t.mock.method(Draft, "exists", async () => true);
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => {
    if (filter["regulatoryCorrection.state"]?.$nin?.includes(draft.regulatoryCorrection?.state)) return null;
    if (typeof filter["regulatoryCorrection.state"] === "string" && filter["regulatoryCorrection.state"] !== draft.regulatoryCorrection?.state) return null;
    assign(update.$set); return draft;
  });
  t.mock.method(Draft, "updateOne", async (_filter, update) => { assign(update.$set); return { matchedCount: 1 }; });
  const resource = item => ({ fetch: async () => structuredClone(item), update: async values => { writes++; Object.assign(item, values); if (lose) throw Error("response lost"); return structuredClone(item); } });
  const requirements = { end_user: [{ type: "business", fields: ["business_name"] }], supporting_document: [[{ accepted_documents: [{ type: "proof", fields: ["business_name", "address_sids"] }] }]] };
  const itemAssignments = Object.assign(id => ({ remove: async () => { assignments = assignments.filter(row => row.sid !== id); if (loseAssignment) { loseAssignment = false; throw Error("response lost"); } } }), {
    list: async () => structuredClone(assignments), create: async ({ objectSid }) => { const row = { sid: `BV${"3".repeat(32)}`, objectSid, accountSid, bundleSid }; assignments.push(row); return row; },
  });
  const api = { bundles: () => ({ fetch: async () => ({ sid: bundleSid, accountSid, regulationSid, status: "twilio-rejected" }), itemAssignments }),
    endUsers: () => resource(user), supportingDocuments: id => resource(id === replacementSid ? replacement : doc), regulations: { list: async () => [{ sid: regulationSid, isoCountry: "FR", numberType: "local", endUserType: "business", requirements }] },
    endUserTypes: { list: async () => [{ machineName: "business" }] }, supportingDocumentTypes: { list: async () => [{ machineName: "proof" }] } };
  const createdAddress = { sid: `AD${"1".repeat(32)}`, accountSid, isoCountry: "FR", validated: true };
  let addressCreates = 0;
  const addresses = Object.assign(id => resource(id === createdAddress.sid ? createdAddress : address), { list: async () => [], create: async values => { addressCreates++; Object.assign(createdAddress, values); return createdAddress; } });
  const client = { numbers: { v2: { regulatoryCompliance: api } }, addresses };
  const request = async (_url, options) => { uploads++; replacement.attributes = JSON.parse(options.body.get("Attributes")); return { ok: true, json: async () => ({ sid: replacementSid, account_sid: accountSid, type: "proof" }) }; };
  return { draft, user, doc, address, replacementSid, request, getDraftClient: async () => ({ draft, client }), writes: () => writes, uploads: () => uploads, addressCreates: () => addressCreates, assignments: () => assignments, lose: value => { lose = value; }, loseAssignment: () => { loseAssignment = true; } };
}

test("correction de l'utilisateur final, des métadonnées et de l'adresse sans recréation", async t => {
  const f = fixture(t), common = { confirm: true, getDraftClient: f.getDraftClient };
  assert.equal((await correctRejectedResource(restaurantId, "admin", { ...common, kind: "end-user", sid: userSid, values: { business_name: "Nouveau" } })).status, "completed");
  assert.equal((await correctRejectedResource(restaurantId, "admin", { ...common, kind: "document", sid: documentSid, values: { business_name: "Nouveau" } })).status, "completed");
  assert.equal((await correctRejectedResource(restaurantId, "admin", { ...common, kind: "address", sid: addressSid, values: { city: "Nouvelle" } })).validated, true);
  assert.equal(f.writes(), 3); assert.deepEqual(f.draft.regulatorySubmission.documentSids, [documentSid]);
});

test("une adresse liée peut être remplacée sans supprimer l'ancienne ni recréer le Bundle", async t => {
  const f = fixture(t);
  f.draft.regulatoryAddress = { state: "completed", sid: addressSid, fingerprint: "ancien" };
  const input = { confirm: true, customerName: "Société fictive", street: "1 rue Test", city: "Paris", postalCode: "75001", region: "", isoCountry: "FR", getDraftClient: f.getDraftClient };
  const created = await createRegulatoryAddress(restaurantId, "admin", input);
  assert.equal(created.sid, `AD${"1".repeat(32)}`); assert.equal(f.addressCreates(), 1);
  assert.equal(f.draft.regulatorySubmission.bundleSid, bundleSid);
  assert.deepEqual(f.doc.attributes.address_sids, [addressSid]);
  assert.equal((await createRegulatoryAddress(restaurantId, "admin", input)).sid, created.sid);
  assert.equal(f.addressCreates(), 1);
});

test("remplacement : upload unique, réaffectation et reprise après réponse perdue", async t => {
  const f = fixture(t);
  const input = { confirm: true, sid: documentSid, attributes: { business_name: "Nouveau", address_sids: [addressSid] }, buffer: Buffer.from("%PDF-fictif"), mimeType: "application/pdf", getDraftClient: f.getDraftClient, request: f.request };
  f.loseAssignment();
  await assert.rejects(replaceRejectedDocument(restaurantId, "admin", input), /incertain/);
  assert.equal(f.uploads(), 1); assert.equal(f.draft.regulatoryCorrection.state, "uncertain");
  const result = await replaceRejectedDocument(restaurantId, "admin", { confirm: true, sid: documentSid, verify: true, getDraftClient: f.getDraftClient });
  assert.equal(result.sid, f.replacementSid); assert.equal(f.uploads(), 1);
  assert.deepEqual(f.draft.regulatorySubmission.documentSids, [f.replacementSid]);
  assert.deepEqual(f.assignments().map(row => row.objectSid).sort(), [userSid, f.replacementSid].sort());
});

test("upload sans réponse : verrou maintenu et aucun second fichier créé", async t => {
  const f = fixture(t); let uploads = 0;
  const input = { confirm: true, sid: documentSid, attributes: { business_name: "Nouveau", address_sids: [addressSid] }, buffer: Buffer.from("%PDF-fictif"), mimeType: "application/pdf", getDraftClient: f.getDraftClient, request: async () => { uploads++; throw Error("connection lost"); } };
  await assert.rejects(replaceRejectedDocument(restaurantId, "admin", input), /incertain/);
  await assert.rejects(replaceRejectedDocument(restaurantId, "admin", input), /incertaine/);
  await assert.rejects(replaceRejectedDocument(restaurantId, "admin", { confirm: true, sid: documentSid, verify: true, getDraftClient: f.getDraftClient }), /sans identifiant/);
  assert.equal(uploads, 1); assert.equal(f.draft.regulatoryCorrection.state, "uncertain");
  assert.deepEqual(f.draft.regulatorySubmission.documentSids, [documentSid]);
});

test("un justificatif déjà approuvé n'est pas remplacé", async t => {
  const f = fixture(t); f.doc.status = "approved";
  await assert.rejects(replaceRejectedDocument(restaurantId, "admin", { confirm: true, sid: documentSid, attributes: {}, buffer: Buffer.from("%PDF-fictif"), mimeType: "application/pdf", getDraftClient: f.getDraftClient, request: f.request }), /refusé ou expiré/);
  assert.equal(f.uploads(), 0);
});

test("réponse perdue : aucune répétition, vérification par lecture avec mêmes données", async t => {
  const f = fixture(t), input = { confirm: true, getDraftClient: f.getDraftClient, kind: "end-user", sid: userSid, values: { business_name: "Nouveau" } };
  f.lose(true);
  await assert.rejects(correctRejectedResource(restaurantId, "admin", input), /incertaine/);
  await assert.rejects(correctRejectedResource(restaurantId, "admin", input), /incertaine/);
  assert.equal(f.writes(), 1);
  await assert.rejects(correctRejectedResource(restaurantId, "admin", { ...input, verify: true, values: { business_name: "Autre" } }), /non concordante/);
  assert.equal((await correctRejectedResource(restaurantId, "admin", { ...input, verify: true })).status, "completed");
  assert.equal(f.writes(), 1);
});

test("champs hors exigences, documents approuvés et ressources étrangères sont refusés", async t => {
  const f = fixture(t), common = { confirm: true, getDraftClient: f.getDraftClient };
  await assert.rejects(correctRejectedResource(restaurantId, "admin", { ...common, kind: "end-user", sid: userSid, values: { admin: "x" } }), /invalides/);
  f.doc.status = "approved";
  await assert.rejects(correctRejectedResource(restaurantId, "admin", { ...common, kind: "document", sid: documentSid, values: { business_name: "Nouveau" } }), /approuvé/);
  await assert.rejects(correctRejectedResource(restaurantId, "admin", { ...common, kind: "address", sid: `AD${"1".repeat(32)}`, values: { city: "A" } }), /non associée/);
  assert.equal(f.writes(), 0);
});

test("les routes administrateur transmettent la correction et le fichier au service", async t => {
  const service = require("../../services/callsense/callsense-onboarding.service");
  const router = require("../../routes/callsense-onboarding.routes");
  const base = "/admin/restaurants/:restaurantId/callsense-onboarding";
  const route = path => router.stack.find(layer => layer.route?.path === `${base}${path}`).route.stack.at(-1).handle;
  let received;
  t.mock.method(service, "correctRejectedResource", async (_id, _actor, options) => { received = options; return { status: "completed" }; });
  t.mock.method(service, "replaceRejectedDocument", async (_id, _actor, options) => { received = options; return { status: "completed" }; });
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await route("/regulatory-correction")({ params: { restaurantId }, user: { id: "admin" }, body: { confirm: true, kind: "end-user", sid: userSid, values: { business_name: "Fictif" } } }, res);
  assert.equal(received.kind, "end-user"); assert.equal(res.value.status, "completed");
  await route("/regulatory-document-replacement")({ params: { restaurantId }, user: { id: "admin" }, body: { payload: JSON.stringify({ confirm: true, sid: documentSid, attributes: {} }) }, files: [{ buffer: Buffer.from("%PDF-fictif"), mimetype: "application/pdf" }] }, res);
  assert.equal(received.buffer.toString(), "%PDF-fictif"); assert.equal(received.sid, documentSid);
});
