const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fallback = require("../../services/callsense/callsense-fallback.service");
const restaurant = { sipUsername: "gtest", sipDomain: "gusto-test.sip.twilio.com" };
const url = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;

test("TwiML de secours indépendant : réponse et destination strictement vérifiées", async () => {
  const { twiml, uri } = fallback.template(restaurant);
  assert.equal(uri, "sip:gtest@gusto-test.sip.twilio.com");
  assert.equal(fallback.validateResponse(twiml, uri), true);
  assert.equal((await fallback.probe(restaurant, url, { post: async () => twiml })).sipUri, uri);
  assert.equal(fallback.validateResponse(twiml.replace("gtest@", "autre@"), uri), false);
  assert.equal(fallback.validateResponse(twiml.replace("</Response>", "<Say>incorrect</Say></Response>"), uri), false);
  assert.equal(fallback.validateResponse(`<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>${twiml}`, uri), false);
  await assert.rejects(fallback.probe(restaurant, "https://127.0.0.1/twiml/EHfake", { post: async () => twiml }));
  await assert.rejects(fallback.probe(restaurant, url, { post: async () => "<Response><Hangup/></Response>" }));
  await assert.rejects(fallback.probe(restaurant, url, { post: async () => { throw new Error("timeout"); } }));
});

test("Function de secours autonome : TwiML SIP statique sans accès extérieur", () => {
  const source = fallback.functionSource(restaurant), exports = {};
  class Response { appendHeader(name, value) { this.header = [name, value]; } setBody(body) { this.body = body; } }
  vm.runInNewContext(source, { exports, Twilio: { Response } }, { timeout: 1000 });
  let result;
  exports.handler({}, {}, (err, response) => { assert.equal(err, null); result = response; });
  assert.deepEqual(result.header, ["Content-Type", "text/xml; charset=utf-8"]);
  assert.equal(fallback.validateResponse(result.body, fallback.sipUri(restaurant)), true);
  assert.doesNotMatch(source, /require\s*\(|https?:\/\/|fetch\s*\(/);
  assert.throws(() => fallback.functionSource({ sipUsername: "bad\nvalue", sipDomain: restaurant.sipDomain }));
});
