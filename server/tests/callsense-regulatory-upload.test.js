const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRegulatoryFile, uploadRegulatoryDocument } = require("../services/callsense-onboarding.service");
const accountSid = `AC${"a".repeat(32)}`, documentSid = `RD${"b".repeat(32)}`;
test("upload réglementaire utilise le point officiel et vérifie le compte et le type", async () => {
  let called = 0;
  const request = async (url, options) => {
    called++; assert.equal(url, "https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments");
    assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.body.get("Type"), "proof"); assert.equal(options.body.get("File").name, "document.pdf");
    return { ok: true, json: async () => ({ sid: documentSid, account_sid: accountSid, type: "proof" }) };
  };
  assert.equal(await uploadRegulatoryDocument({ accountSid, authToken: "faux-jeton", type: "proof", attributes: { name: "fictif" }, buffer: Buffer.from("%PDF-test"), mimeType: "application/pdf" }, { request }), documentSid);
  assert.equal(called, 1);
});
test("pièces non conformes et réponses ambiguës sont bloquées", async () => {
  assert.throws(() => validateRegulatoryFile(Buffer.from("invalide"), "application/pdf"), /invalide/);
  assert.throws(() => validateRegulatoryFile(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), /5 Mo/);
  const input = { accountSid, authToken: "faux-jeton", type: "proof", attributes: {}, buffer: Buffer.from("%PDF-test"), mimeType: "application/pdf" };
  await assert.rejects(uploadRegulatoryDocument(input, { request: async () => ({ ok: true, json: async () => ({ sid: documentSid, account_sid: `AC${"c".repeat(32)}`, type: "proof" }) }) }), /non confirmée/);
});
