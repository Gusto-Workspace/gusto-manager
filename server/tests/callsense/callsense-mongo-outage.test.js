const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const Config = require("../../models/callsense/callsense-config.model");
const pushPath = require.resolve("../../services/shared/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { sendPushToModule: async () => {} } };
const service = require("../../services/callsense/callsense.service");
const fallback = require("../../services/callsense/callsense-fallback.service");

test("panne Mongo : aucun jeton ni routage ; Function Twilio autonome", async t => {
  t.mock.method(Config, "findOne", () => ({ select() { return this; }, maxTimeMS() { return this; }, lean: async () => { throw new Error("indisponible"); } }));
  const restaurant = "507f1f77bcf86cd799439011", sid = `AC${"1".repeat(32)}`;
  assert.equal(await service.webhookAccountToken(sid, { restaurantId: restaurant }), "");
  assert.equal(await service.findRoute(sid, "+33311111111"), null);
  const sandbox = { exports: {}, Twilio: { Response: class { appendHeader() {} setBody(body) { this.body = body; } } } };
  vm.runInNewContext(fallback.functionSource({ sipUsername: "fictif", sipDomain: "restaurant.sip.twilio.com" }), sandbox, { timeout: 500 });
  const result = await new Promise((resolve, reject) => sandbox.exports.handler({}, {}, (err, response) => err ? reject(err) : resolve(response)));
  assert.match(result.body, /sip:fictif@restaurant\.sip\.twilio\.com/);
});
