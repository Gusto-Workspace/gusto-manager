// Two separate Node processes against disposable MongoDB Test data; Twilio is mocked.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");
const Config = require("../../models/callsense/callsense-config.model");
const Call = require("../../models/callsense/callsense-call.model");
const { encryptToken } = require("../../services/callsense/callsense-secrets.service");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("Test uniquement");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw new Error("Base Test requise");
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.CALLSENSE_METER_REPORTING_ENABLED = "false";
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Base inattendue");
  if (process.argv[2] === "child") {
    const [restaurantId, accountSid, callSid, phone, startIso, nowIso] = process.argv.slice(3);
    const start = new Date(startIso), now = new Date(nowIso);
    const parent = { sid: callSid, accountSid, direction: "inbound", to: phone, from: "+33600000000", status: "completed", startTime: new Date(start.getTime() + 7 * 3600000) };
    const child = { sid: `CA${"b".repeat(32)}`, accountSid, parentCallSid: callSid, direction: "outbound-dial", to: "sip:restart@example.test", status: "completed", duration: "61", endTime: new Date(parent.startTime.getTime() + 61000) };
    const calls = (sid) => ({ fetch: async () => { if (sid !== callSid) throw new Error("unexpected call"); return parent; } });
    calls.list = async (query) => query.parentCallSid ? [child] : parent.startTime >= query.startTimeAfter && parent.startTime < query.startTimeBefore ? [parent] : [];
    const { reconcileCalls } = require("../../services/callsense/callsense-metering.service");
    await reconcileCalls(restaurantId, { twilio: () => ({ calls }), now });
    return;
  }
  const restaurantId = new mongoose.Types.ObjectId(), nonce = crypto.randomBytes(4).toString("hex");
  const accountSid = `AC${crypto.randomBytes(16).toString("hex")}`, callSid = `CA${crypto.randomBytes(16).toString("hex")}`;
  const phone = `+339${String(parseInt(nonce, 16) % 100000000).padStart(8, "0")}`;
  const now = new Date(), start = new Date(now.getTime() - 48 * 3600000);
  try {
    if (await Config.exists({ $or: [{ restaurantId }, { twilioNumber: phone }] })) throw new Error("Collision temporaire");
    await Config.create({ restaurantId, accountSid, twilioNumber: phone, sipUri: "sip:restart@example.test", enabled: true,
      activatedAt: start, reconciliation: { cursor: start }, encryptedAuthToken: encryptToken("temporary-token", String(restaurantId), accountSid) });
    const args = [__filename, "child", String(restaurantId), accountSid, callSid, phone, start.toISOString(), now.toISOString()];
    for (let index = 1; index <= 2; index += 1) {
      const child = spawnSync(process.execPath, args, { cwd: require("path").resolve(__dirname, ".."), env: process.env, encoding: "utf8", timeout: 60000 });
      if (child.status !== 0) throw new Error(`Sous-processus de test ${index} échoué`);
      const config = await Config.findOne({ restaurantId }).lean();
      assert.equal(+config.reconciliation.cursor, +start + index * 6 * 3600000);
      assert.equal(await Call.countDocuments({ restaurantId, callSid }), index === 1 ? 0 : 1);
    }
    assert.equal((await Call.findOne({ restaurantId, callSid }).lean()).billingState, "complete");
    console.log("MongoDB Test : curseur repris entre deux processus Node distincts ; appel récupéré une fois, sans facturation.");
  } finally {
    await Call.deleteMany({ restaurantId, accountSid }); await Config.deleteMany({ restaurantId, accountSid });
    assert.equal(await Call.countDocuments({ restaurantId, accountSid }), 0);
    assert.equal(await Config.countDocuments({ restaurantId, accountSid }), 0);
    console.log("Nettoyage des données temporaires vérifié.");
  }
}
main().catch(() => { console.error("Test de redémarrage indisponible ou échoué."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
