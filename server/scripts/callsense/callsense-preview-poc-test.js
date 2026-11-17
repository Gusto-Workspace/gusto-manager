// Read-only preview: no MongoDB or Twilio writes and no Stripe calls.
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const twilio = require("twilio");
const { DateTime } = require("luxon");
const Config = require("../../models/callsense/callsense-config.model");
const Call = require("../../models/callsense/callsense-call.model");
const Consumption = require("../../models/callsense/callsense-consumption.model");
const { decryptToken } = require("../../services/callsense/callsense-secrets.service");
const { validateRecovery } = require("../../services/callsense/callsense-metering.service");

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
  const remote = await client.calls.list({ to: config.twilioNumber, startTimeAfter: start, startTimeBefore: end, pageSize: 1000, limit: 10001 });
  if (remote.length >= 10001) throw new Error("Inventaire Twilio tronqué");
  const parents = remote.filter((call) => call.accountSid === config.accountSid && call.direction === "inbound" && call.to === config.twilioNumber && new Date(call.startTime || call.dateCreated) >= start && new Date(call.startTime || call.dateCreated) < end);
  const recorded = await Call.find({ callSid: { $in: parents.map((call) => call.sid) } }).select("callSid restaurantId accountSid childCallSid outcome duration incomingReceived billingState").lean();
  const bySid = new Map(recorded.map((call) => [call.callSid, call]));
  const entries = await Consumption.find({ callId: { $in: recorded.map((call) => call._id) } }).select("callId").lean();
  const billingCalls = new Set(entries.map((entry) => String(entry.callId)));
  const missing = parents.filter((call) => !bySid.get(call.sid)?.incomingReceived);
  let eligible = 0;
  for (const [index, parent] of missing.entries()) {
    const existing = bySid.get(parent.sid);
    const children = await client.calls.list({ parentCallSid: parent.sid, limit: 2 });
    let result = "à vérifier";
    try {
      const proof = validateRecovery(parent, children, config);
      const child = children[0];
      if (existing && (String(existing.restaurantId) !== String(config.restaurantId) || existing.accountSid !== config.accountSid || existing.billingState || billingCalls.has(String(existing._id)) ||
        (existing.childCallSid && existing.childCallSid !== child.sid) || (existing.outcome && existing.outcome !== proof.outcome) ||
        (existing.duration != null && (Math.abs(existing.duration - proof.duration) > 1 || Math.ceil(existing.duration / 60) !== Math.ceil(proof.duration / 60))))) throw new Error("historique_non_concordant");
      result = "récupérable après confirmation"; eligible += 1;
    } catch (error) { result = error.message; }
    const date = DateTime.fromJSDate(new Date(parent.startTime || parent.dateCreated)).setZone("Europe/Paris").toFormat("dd/MM/yyyy HH:mm:ss");
    console.log(`${index + 1}. ${date} · parent ${parent.status} · segments ${children.length} · SIP ${children.map((item) => `${item.status}/${item.duration ?? "?"}s`).join(", ") || "aucun"} · ${existing ? "trace partielle MongoDB" : "absent MongoDB"} · ${result}`);
  }
  console.log(`Prévisualisation lecture seule : ${parents.length} parents, ${missing.length} absents ou incomplets, ${eligible} récupérables selon les contrôles actuels. Aucun appel Stripe et aucune écriture.`);
}
main().catch(() => { console.error("Prévisualisation indisponible : vérifiez les accès et la base Test."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
