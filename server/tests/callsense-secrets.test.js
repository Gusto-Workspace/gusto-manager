const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../models/callsense/callsense-config.model");
const { encryptToken, decryptToken } = require("../services/callsense-secrets.service");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { sendPushToModule: async () => {} } };
const service = require("../services/callsense.service");
const { migrateToken } = require("../scripts/callsense-migrate-token");

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SID = "ACtest";
process.env.CALLSENSE_ENCRYPTION_KEY = "11".repeat(32);

test("chiffrement authentifié lié au restaurant et au compte", () => {
  const encrypted = encryptToken("private-token", A, SID);
  assert.notEqual(encrypted, encryptToken("private-token", A, SID));
  assert.ok(!encrypted.includes("private-token"));
  assert.equal(decryptToken(encrypted, A, SID), "private-token");
  assert.throws(() => decryptToken(encrypted, B, SID));
  assert.throws(() => decryptToken(encrypted, A, "ACother"));
  assert.throws(() => decryptToken(encrypted.replace(/^v1\./, "v2."), A, SID));
  const originalKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "invalid";
  assert.throws(() => encryptToken("private-token", A, SID));
  process.env.CALLSENSE_ENCRYPTION_KEY = originalKey;
});

test("migration simulée puis idempotente sans écrasement d'un secret différent", async () => {
  const doc = { _id: "config", restaurantId: A, accountSid: SID };
  let writes = 0;
  const model = {
    findOne: () => ({ select: () => ({ lean: async () => ({ ...doc }) }) }),
    updateOne: async (_filter, update) => { writes += 1; doc.encryptedAuthToken = update.$set.encryptedAuthToken; return { matchedCount: 1 }; },
  };
  const params = { restaurantId: A, accounts: { [SID]: "legacy-token" }, ConfigModel: model };
  assert.equal(await migrateToken(params), "ready");
  assert.equal(writes, 0);
  assert.equal(await migrateToken({ ...params, apply: true }), "migrated");
  assert.equal(await migrateToken({ ...params, apply: true }), "already-migrated");
  assert.equal(writes, 1);
  await assert.rejects(migrateToken({ ...params, accounts: { [SID]: "different-token" }, apply: true }));
  assert.equal(writes, 1);
});

test("résolution du secret par restaurant ou numéro et secours uniquement approprié", async () => {
  process.env.CALLSENSE_ACCOUNTS = JSON.stringify({ [SID]: "legacy-token" });
  const encryptedAuthToken = encryptToken("new-token", A, SID);
  const original = Config.findOne;
  let observed;
  let result = { restaurantId: A, encryptedAuthToken };
  Config.findOne = (filter) => {
    observed = filter;
    return { select: () => ({ maxTimeMS: () => ({ lean: async () => {
      if (result instanceof Error) throw result;
      return result;
    } }) }) };
  };
  try {
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: A }), "new-token");
    assert.deepEqual(observed, { accountSid: SID, restaurantId: A });
    assert.equal(await service.webhookAccountToken(SID, { to: "+33123456789" }), "new-token");
    assert.equal(observed.twilioNumber, "+33123456789");
    result = null;
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: B }), "");
    result = { restaurantId: A };
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: A }), "legacy-token");
    result = { restaurantId: B, encryptedAuthToken };
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: B }), "");
    result = new Error("offline");
    process.env.CALLSENSE_FALLBACK_ROUTES = JSON.stringify([{ restaurantId: A, enabled: true, accountSid: SID, twilioNumber: "+33123456789", sipUri: "sip:test@example.com" }]);
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: A }), "legacy-token");
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: B }), "");
    assert.equal(await service.webhookAccountToken(SID, { restaurantId: "invalid" }), "");
  } finally { Config.findOne = original; }
});

test("configuration administrateur ne renvoie jamais le jeton fourni", async () => {
  const Restaurant = require("../models/restaurant.model");
  const router = require("../routes/callsense.routes");
  const handlers = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense").route.stack;
  assert.equal(handlers.length, 3); // authentication, admin role, handler
  const originalFind = Config.findOne;
  const originalUpdate = Config.findOneAndUpdate;
  const originalExists = Restaurant.exists;
  let update;
  Config.findOne = () => ({ select: () => ({ lean: async () => ({ restaurantId: A, accountSid: SID }) }) });
  Config.findOneAndUpdate = (_filter, value) => ({ lean: async () => { update = value; return { ...value.$set }; } });
  Restaurant.exists = async () => true;
  const req = { params: { restaurantId: A }, user: { id: "admin-id" }, body: {
    enabled: false, accountSid: SID, twilioNumber: "+33123456789", sipUri: "sip:test@example.com", authToken: "private-token",
  } };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  try {
    await handlers.at(-1).handle(req, res);
    assert.equal(decryptToken(update.$set.encryptedAuthToken, A, SID), "private-token");
    assert.equal(res.value.encryptedAuthToken, undefined);
    assert.ok(!JSON.stringify(res.value).includes("private-token"));
    assert.equal(update.$push.securityEvents.$each[0].actorId, "admin-id");
  } finally { Config.findOne = originalFind; Config.findOneAndUpdate = originalUpdate; Restaurant.exists = originalExists; }
});
