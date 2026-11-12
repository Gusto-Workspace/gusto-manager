// Synthetic callbacks and temporary Call documents on MongoDB Test only.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const webpush = require.resolve("../services/webpush.service");
require.cache[webpush] = { id: webpush, filename: webpush, loaded: true, exports: { sendPushToModule: async () => {} } };
const service = require("../services/callsense.service");
const Call = require("../models/callsense/callsense-call.model");
async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1") throw new Error("Opt-in Test requis");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw new Error("Base Test requise");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Base inattendue");
  const restaurantId = new mongoose.Types.ObjectId();
  const parent = `CA${new mongoose.Types.ObjectId().toString().padStart(32, "0")}`;
  const config = { restaurantId, accountSid: "ACtest", twilioNumber: "+33100000000" };
  const incoming = { AccountSid: "ACtest", CallSid: parent, From: "+33600000000" };
  try {
    // Terminal callback can be received before the incoming insert after interruption.
    await service.recordCallback("action", { AccountSid: "ACtest", DialCallStatus: "completed", DialCallDuration: "61", DialCallSid: `CA${"b".repeat(32)}` }, String(restaurantId), parent);
    await service.recordIncoming(config, incoming);
    await service.recordIncoming(config, incoming);
    await service.recordCallback("action", { AccountSid: "ACtest", DialCallStatus: "no-answer" }, String(restaurantId), parent);
    const calls = await Call.find({ restaurantId }).lean();
    assert.equal(calls.length, 1); assert.equal(calls[0].incomingReceived, true);
    assert.equal(calls[0].outcome, "completed"); assert.equal(calls[0].duration, 61);
    console.log("MongoDB Test : appel entrant synthétique persistant, reprise après interruption simulée, callbacks tardifs et doublons vérifiés.");
  } finally { await Call.deleteMany({ restaurantId, accountSid: "ACtest" }); }
}
main().catch(() => { console.error("Test de callbacks indisponible ou échoué."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
