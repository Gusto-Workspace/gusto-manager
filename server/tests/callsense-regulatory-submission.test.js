const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const { encryptToken } = require("../services/callsense-secrets.service");
const { submitIndividualBundle } = require("../services/callsense-onboarding.service");
const restaurantId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const accountSid = `AC${"a".repeat(32)}`, regulationSid = `RN${"b".repeat(32)}`;
const userSid = `IT${"c".repeat(32)}`, documentSid = `RD${"d".repeat(32)}`, bundleSid = `BU${"e".repeat(32)}`;

function fixture(t, { failUpload = false, noncompliant = false } = {}) {
  t.mock.method(Config, "exists", async () => null);
  const originalKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);
  t.after(() => { if (originalKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = originalKey; });
  const draft = { _id: "draft", accountSid, regulatoryBundleSid: "", encryptedAuthToken: encryptToken("fake", restaurantId, accountSid) };
  const calls = [];
  function set(fields) { for (const [path, value] of Object.entries(fields)) { const keys = path.split("."); let target = draft; for (const key of keys.slice(0, -1)) target = target[key] ||= {}; target[keys.at(-1)] = value; } }
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => {
    if (draft.regulatorySubmission?.state && draft.regulatorySubmission.state !== "waiting") return null;
    if (draft.regulatorySubmission?.state === "waiting" && draft.regulatorySubmission.fingerprint !== filter.$and[0].$or[1]["regulatorySubmission.fingerprint"]) return null;
    set(update.$set); return draft;
  });
  t.mock.method(Draft, "updateOne", async (filter, update) => {
    if (draft.regulatorySubmission?.state !== "running" || draft.regulatorySubmission.attemptId !== filter["regulatorySubmission.attemptId"]) return { matchedCount: 0 };
    set(update.$set); return { matchedCount: 1 };
  });
  const bundle = { sid: bundleSid, accountSid, regulationSid, status: "draft" };
  const regulation = { end_user: [{ type: "business", fields: ["business_name"] }], supporting_document: [[{ accepted_documents: [{ type: "proof", fields: [] }, { type: "address", fields: ["address_sids"] }] }]] };
  const api = {
    regulations: Object.assign(() => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }), { list: async () => [{ sid: regulationSid, isoCountry: "FR", numberType: "local", endUserType: "business", requirements: regulation }] }),
    endUserTypes: { list: async () => [{ machineName: "business" }] },
    supportingDocumentTypes: { list: async () => [{ machineName: "proof" }, { machineName: "address" }] },
    supportingDocuments: { create: async data => { calls.push("metadata"); assert.deepEqual(data.attributes.address_sids, [`AD${"f".repeat(32)}`]); return { sid: documentSid, accountSid, type: data.type }; } },
    endUsers: { create: async data => { calls.push("end-user"); assert.equal(data.type, "business"); return { sid: userSid, accountSid, type: data.type }; } },
    bundles: Object.assign(() => ({
      fetch: async () => ({ ...bundle }),
      itemAssignments: { create: async ({ objectSid }) => { calls.push(`assign:${objectSid}`); return { sid: `BV${"f".repeat(32)}`, accountSid, bundleSid, objectSid }; } },
      evaluations: { create: async () => { calls.push("evaluate"); return { accountSid, bundleSid, regulationSid, status: noncompliant ? "noncompliant" : "compliant", results: [] }; } },
      update: async data => { calls.push("submit"); bundle.status = data.status; return { ...bundle }; },
    }), { create: async data => { calls.push("bundle"); assert.equal(data.regulationSid, regulationSid); return { ...bundle }; } }),
  };
  const getDraftClient = async () => ({ draft: structuredClone(draft), client: { numbers: { v2: { regulatoryCompliance: api } }, addresses: sid => ({ fetch: async () => ({ sid, accountSid, validated: true, isoCountry: "FR" }) }) } });
  const request = async () => { calls.push("upload"); if (failUpload) throw new Error("connection lost"); return { ok: true, json: async () => ({ sid: documentSid, account_sid: accountSid, type: "proof" }) }; };
  const input = { confirm: true, endUserType: "business", endUserAttributes: { business_name: "Restaurant" }, email: "test@example.com", documents: [{ type: "proof", attributes: {}, buffer: Buffer.from("%PDF-test"), mimeType: "application/pdf" }], getDraftClient, request };
  return { draft, calls, input, regulation, api };
}

test("soumission complète du bundle individuel avec Twilio simulé et persistance", async t => {
  const f = fixture(t);
  const result = await submitIndividualBundle(restaurantId, "admin", f.input);
  assert.deepEqual(result, { status: "pending-review", bundleSid });
  assert.deepEqual(f.calls, ["end-user", "upload", "bundle", `assign:${userSid}`, `assign:${documentSid}`, "evaluate", "submit"]);
  assert.equal(f.draft.regulatoryBundleSid, bundleSid);
  assert.deepEqual(f.draft.regulatorySubmission.documentSids, [documentSid]);
  assert.deepEqual(f.draft.regulatorySubmission.assignedSids, [userSid, documentSid]);
  assert.equal(f.draft.regulatorySubmission.state, "submitted");
  await submitIndividualBundle(restaurantId, "admin", f.input);
  assert.equal(f.calls.filter(call => call === "submit").length, 1);
});

test("réponse d'upload incertaine bloque la reprise et ne crée pas de doublon", async t => {
  const f = fixture(t, { failUpload: true });
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /incertain/);
  assert.equal(f.draft.regulatorySubmission.state, "uncertain");
  assert.equal(f.draft.regulatorySubmission.endUserSid, userSid);
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /incertain/);
  assert.deepEqual(f.calls, ["end-user", "upload"]);
});

test("justificatif d'adresse composé de métadonnées créé sans téléversement", async t => {
  const f = fixture(t);
  f.input.documents = [{ type: "address", attributes: { address_sids: [`AD${"f".repeat(32)}`] } }];
  const result = await submitIndividualBundle(restaurantId, "admin", f.input);
  assert.equal(result.status, "pending-review");
  assert.ok(f.calls.includes("metadata")); assert.ok(!f.calls.includes("upload"));
});

test("un extrait Kbis répondant à deux exigences est créé et affecté une seule fois", async t => {
  const f = fixture(t); const address = `AD${"f".repeat(32)}`;
  f.api.supportingDocumentTypes.list = async () => [{ machineName: "commercial_registrar_excerpt" }];
  f.regulation.supporting_document = [[{ accepted_documents: [{ type: "commercial_registrar_excerpt", fields: ["business_name"], detailed_fields: [{ machine_name: "business_name", constraint: "commercial_registrar_excerpt['business_name'] == business['business_name']" }] }] }, { accepted_documents: [{ type: "commercial_registrar_excerpt", fields: ["address_sids"] }] }]];
  f.input.documents = [{ type: "commercial_registrar_excerpt", attributes: { business_name: "Restaurant" }, buffer: Buffer.from("%PDF-test"), mimeType: "application/pdf" }, { type: "commercial_registrar_excerpt", attributes: { address_sids: [address] } }];
  f.input.request = async (_url, options) => { f.calls.push("upload"); assert.deepEqual(JSON.parse(options.body.get("Attributes")), { business_name: "Restaurant", address_sids: [address] }); return { ok: true, json: async () => ({ sid: documentSid, account_sid: accountSid, type: "commercial_registrar_excerpt" }) }; };
  assert.equal((await submitIndividualBundle(restaurantId, "admin", f.input)).status, "pending-review");
  assert.equal(f.calls.filter(call => call === "upload").length, 1); assert.equal(f.calls.filter(call => call === `assign:${documentSid}`).length, 1);
});

test("types non admis, champs manquants et documents contradictoires sont refusés avant écriture", async t => {
  const f = fixture(t);
  f.input.endUserAttributes = {}; await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /requis/); assert.deepEqual(f.calls, []);
  f.input.endUserAttributes = { business_name: "Restaurant" }; f.input.documents[0].type = "forbidden";
  f.api.supportingDocumentTypes.list = async () => [{ machineName: "proof" }, { machineName: "forbidden" }];
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /exigences/); assert.deepEqual(f.calls, []);
  f.input.documents = [{ type: "proof", attributes: { name: "A" }, buffer: Buffer.from("%PDF-A"), mimeType: "application/pdf" }, { type: "proof", attributes: { name: "B" }, buffer: Buffer.from("%PDF-A"), mimeType: "application/pdf" }];
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /contradictoires/); assert.deepEqual(f.calls, []);
  f.input.documents[1].attributes.name = "A"; f.input.documents[1].buffer = Buffer.from("%PDF-B");
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /un seul fichier/); assert.deepEqual(f.calls, []);
});

test("un justificatif supplémentaire sélectionné doit aussi satisfaire ses champs propres", async t => {
  const f = fixture(t);
  f.api.supportingDocumentTypes.list = async () => [{ machineName: "proof" }, { machineName: "address" }];
  f.regulation.supporting_document = [[{ accepted_documents: [{ type: "proof", fields: [] }] }, { accepted_documents: [{ type: "proof", fields: [] }, { type: "address", fields: ["address_sids"] }] }]];
  f.input.documents = [f.input.documents[0], { type: "address", attributes: {} }];
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /address_sids/); assert.deepEqual(f.calls, []);
});
test("l'adresse e-mail réglementaire est vérifiée avant création", async t => {
  const f = fixture(t);
  f.regulation.end_user[0] = { type: "business", fields: ["business_name", "email"], detailed_fields: [{ machine_name: "email", constraint: "business['email'] =~ '^\\S+@\\S+\\.\\S+$'" }] };
  f.input.endUserAttributes.email = "incorrect";
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /Format réglementaire invalide/); assert.deepEqual(f.calls, []);
});
test("un champ du justificatif incohérent avec l'utilisateur final est refusé avant création", async t => {
  const f = fixture(t);
  f.regulation.supporting_document = [[{ accepted_documents: [{ type: "proof", fields: ["business_name"], detailed_fields: [{ machine_name: "business_name", constraint: "proof['business_name'] != null && proof['business_name'] == business['business_name']" }] }] }]];
  f.input.documents[0].attributes = { business_name: "Autre société" };
  await assert.rejects(submitIndividualBundle(restaurantId, "admin", f.input), /correspondre/); assert.deepEqual(f.calls, []);
});

test("une évaluation non conforme ne soumet jamais le bundle", async t => {
  const f = fixture(t, { noncompliant: true });
  const result = await submitIndividualBundle(restaurantId, "admin", f.input);
  assert.equal(result.status, "noncompliant");
  assert.equal(f.draft.regulatorySubmission.state, "waiting");
  assert.ok(!f.calls.includes("submit"));
  await submitIndividualBundle(restaurantId, "admin", f.input);
  assert.equal(f.calls.filter(call => call === "upload").length, 1);
  assert.equal(f.calls.filter(call => call === "evaluate").length, 2);
});

test("la route administrateur transmet les justificatifs au moteur et renvoie la soumission", async t => {
  const f = fixture(t);
  const service = require("../services/callsense-onboarding.service");
  const router = require("../routes/callsense-onboarding.routes");
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/regulatory-submission").route.stack.at(-1).handle;
  t.mock.method(service, "submitIndividualBundle", (id, actor, options) => submitIndividualBundle(id, actor, { ...options, getDraftClient: f.input.getDraftClient, request: f.input.request }));
  const payload = { confirm: true, endUserType: "business", endUserAttributes: { business_name: "Restaurant" }, email: "test@example.com", documents: [{ type: "proof", attributes: {} }] };
  const req = { params: { restaurantId }, user: { id: "admin" }, body: { payload: JSON.stringify(payload) }, files: [{ buffer: Buffer.from("%PDF-test"), mimetype: "application/pdf" }] };
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await handler(req, res);
  assert.deepEqual(res.value, { status: "pending-review", bundleSid });
  assert.equal(f.calls.at(-1), "submit");
});

test("la route accepte une adresse sans fichier et un fichier distinct", async t => {
  const service = require("../services/callsense-onboarding.service");
  const router = require("../routes/callsense-onboarding.routes");
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/regulatory-submission").route.stack.at(-1).handle;
  let received;
  t.mock.method(service, "submitIndividualBundle", async (_id, _actor, options) => { received = options.documents; return { status: "pending-review" }; });
  const req = { params: { restaurantId }, user: { id: "admin" }, body: { payload: JSON.stringify({ documents: [{ type: "address", attributes: { address_sids: ["AD-fictif"] }, fileIndex: null }, { type: "proof", attributes: {}, fileIndex: 0 }] }) }, files: [{ buffer: Buffer.from("%PDF-fictif"), mimetype: "application/pdf" }] };
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await handler(req, res);
  assert.equal(res.value.status, "pending-review"); assert.equal(received[0].buffer, undefined); assert.equal(received[1].buffer.toString(), "%PDF-fictif");
  req.body.payload = JSON.stringify({ documents: [{ fileIndex: 0 }, { fileIndex: 0 }] });
  await handler(req, res); assert.equal(res.code, 400);
});
