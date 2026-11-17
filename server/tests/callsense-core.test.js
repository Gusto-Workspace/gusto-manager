const test = require("node:test");
const assert = require("node:assert/strict");
const twilio = require("twilio");
const { normalizePhone, validateWebhook, reduceCallState } = require("../services/callsense-core.service");

test("normalise les numéros valides sans inventer de numéro privé", () => {
  assert.equal(normalizePhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("+33 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("anonymous"), null);
});

test("valide signature et compte en utilisant uniquement l'origine publique configurée", () => {
  const body = { AccountSid: "ACtest", CallSid: "CAtest" };
  const url = "https://api.example.test/api/callsense/voice?x=1";
  const signature = twilio.getExpectedTwilioSignature("secret", url, body);
  const input = { authToken: "secret", accountSid: "ACtest", expectedAccountSid: "ACtest", signature, publicOrigin: "https://api.example.test", originalUrl: "/api/callsense/voice?x=1", body };
  assert.equal(validateWebhook(input), true);
  assert.equal(validateWebhook({ ...input, accountSid: "ACother" }), false);
  assert.equal(validateWebhook({ ...input, body: { ...body, CallSid: "CAfake" } }), false);
  assert.equal(validateWebhook({ ...input, publicOrigin: "http://api.example.test" }), false);
});

test("les callbacks tardifs et répétés ne rouvrent pas un appel terminé", () => {
  let call = reduceCallState({ state: "incoming" }, { kind: "sip", status: "answered" });
  call = reduceCallState(call, { kind: "sip", status: "ringing" });
  assert.equal(call.state, "answered");
  call = reduceCallState(call, { kind: "sip", status: "completed" });
  assert.equal(call.state, "answered");
  call = reduceCallState(call, { kind: "dial-action", status: "completed", duration: 42 });
  assert.deepEqual(reduceCallState(call, { kind: "sip", status: "ringing" }), call);
  assert.deepEqual(reduceCallState(call, { kind: "dial-action", status: "completed", duration: 42 }), call);
  assert.equal(call.duration, 42);
  assert.equal(reduceCallState({}, { kind: "dial-action", status: "no-answer" }).state, "missed");
});
