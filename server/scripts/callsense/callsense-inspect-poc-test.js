// Read-only comparison. Never prints credentials, customer numbers or call SIDs.
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const twilio = require("twilio");
const { DateTime } = require("luxon");
const Config = require("../../models/callsense/callsense-config.model");
const Call = require("../../models/callsense/callsense-call.model");
const { decryptToken } = require("../../services/callsense/callsense-secrets.service");
const { summarizeCalls } = require("../../services/callsense/callsense-usage.service");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("Configuration Test requise");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw new Error("Base Test requise");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Base inattendue");
  const configs = await Config.find({ twilioNumber: "+33219121829" }).select("+encryptedAuthToken").limit(2).lean();
  if (configs.length !== 1) throw new Error("Configuration POC absente ou ambiguë");
  const config = configs[0];
  let token;
  if (config.encryptedAuthToken) token = decryptToken(config.encryptedAuthToken, String(config.restaurantId), config.accountSid);
  if (!token) throw new Error("Identifiants Twilio indisponibles");
  const client = twilio(config.accountSid, token);
  const start = DateTime.fromISO("2026-11-01", { zone: "Europe/Paris" }).toJSDate();
  const end = DateTime.fromISO("2026-12-01", { zone: "Europe/Paris" }).toJSDate();
  const [calls, remote, numbers] = await Promise.all([
    Call.find({ restaurantId: config.restaurantId, createdAt: { $gte: start, $lt: end } }).select("callSid incomingReceived outcome duration phase answeredAt sipResponseCode").lean(),
    client.calls.list({ to: config.twilioNumber, startTimeAfter: start, startTimeBefore: end, pageSize: 1000, limit: 10001 }),
    client.incomingPhoneNumbers.list({ phoneNumber: config.twilioNumber, limit: 2 }),
  ]);
  const parents = remote.filter((item) => item.accountSid === config.accountSid && item.direction === "inbound" && item.to === config.twilioNumber && new Date(item.startTime || item.dateCreated) >= start && new Date(item.startTime || item.dateCreated) < end);
  const recorded = new Set(calls.filter((item) => item.incomingReceived).map((item) => item.callSid));
  const totals = summarizeCalls(calls);
  console.log(`Novembre 2026 Europe/Paris : MongoDB reçus=${totals.received}, répondus=${totals.answered}, manqués=${totals.missed}, occupés=${totals.busy}, refusés=${totals.refused}, durée=${totals.conversationSeconds}s ; parents Twilio=${parents.length}, absents de MongoDB=${parents.filter((item) => !recorded.has(item.sid)).length}, inventaire ${remote.length >= 10001 ? "tronqué" : "complet"}.`);
  if (numbers.length !== 1 || numbers[0].accountSid !== config.accountSid) return console.log("Numéro Twilio : association non vérifiée.");
  console.log("Numéro Twilio : associé au sous-compte configuré.");
  if (!numbers[0].bundleSid) return console.log("Bundle : aucune référence accessible sur le numéro ; approbation déclarée, vérification API indisponible.");
  try {
    const bundle = await client.numbers.v2.regulatoryCompliance.bundles(numbers[0].bundleSid).fetch();
    console.log(`Bundle : statut API ${bundle.status || "indisponible"}.`);
  } catch (_) { console.log("Bundle : référence présente ; statut API indisponible."); }
}
main().catch((error) => { console.error(`Lecture POC impossible : ${error.message === "Configuration POC absente ou ambiguë" ? error.message : "connexion ou accès indisponible"}.`); process.exitCode = 1; }).finally(() => mongoose.disconnect());
