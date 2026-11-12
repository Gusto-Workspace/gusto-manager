// Isolated persistence check: only creates and deletes its own random drafts.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Call = require("../models/callsense/callsense-call.model");
const { summarizeCalls } = require("../services/callsense-usage.service");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("CALLSENSE_TEST_INTEGRATION=1 et CONNECTION_STRING_TEST sont requis");
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (!/(^|[-_])test($|[-_])/i.test(mongoose.connection.db.databaseName)) throw new Error("Le nom de la base doit identifier explicitement un environnement test");
  let inserted = false;
  try {
    inserted = true;
    await Draft.insertMany(ids.map((restaurantId) => ({ restaurantId, wizardStep: 0, operator: "CallSense integration test" })));
    await Draft.updateOne({ restaurantId: ids[0] }, { $set: { wizardStep: 4, "checklist.incomingTest": true } });
    const records = await Draft.find({ restaurantId: { $in: ids } }).lean();
    const first = records.find((row) => String(row.restaurantId) === String(ids[0]));
    const second = records.find((row) => String(row.restaurantId) === String(ids[1]));
    assert.equal(first?.wizardStep, 4); assert.equal(first?.checklist?.incomingTest, true); assert.equal(second?.wizardStep, 0);
    await Call.insertMany([
      { restaurantId: ids[0], accountSid: "ACtest", callSid: `CA${new mongoose.Types.ObjectId()}`, incomingReceived: true, outcome: "completed", duration: 61 },
      { restaurantId: ids[0], accountSid: "ACtest", callSid: `CA${new mongoose.Types.ObjectId()}`, incomingReceived: true, outcome: "no-answer", phase: 2 },
      { restaurantId: ids[1], accountSid: "ACtest", callSid: `CA${new mongoose.Types.ObjectId()}`, incomingReceived: true, outcome: "completed", duration: 500 },
    ]);
    const calls = await Call.find({ restaurantId: ids[0] }).select("incomingReceived outcome duration phase").lean();
    assert.deepEqual(summarizeCalls(calls), { received: 2, answered: 1, missed: 1, busy: 0, refused: 0, conversationSeconds: 61, minutes: 2 });
    const indexRows = await Promise.all([Draft.collection.indexes(), Config.collection.indexes(), Call.collection.indexes()]);
    const indexed = indexRows.map((indexes) => indexes.some((index) => index.key.restaurantId === 1));
    console.log(`Persistance et isolation de deux dossiers : OK. Index restaurantId : préparation=${indexed[0]}, configuration=${indexed[1]}, historique=${indexed[2]}.`);
    if (process.env.CALLSENSE_TEST_RESTAURANT_ID) {
      const id = process.env.CALLSENSE_TEST_RESTAURANT_ID;
      if (!mongoose.isValidObjectId(id)) throw new Error("CALLSENSE_TEST_RESTAURANT_ID invalide");
      const [config, calls] = await Promise.all([Config.findOne({ restaurantId: id }).select("enabled accountSid twilioNumber sipDomain sipUri terminalType provisioningStatus").lean(), Call.countDocuments({ restaurantId: id })]);
      console.log(`Configuration historique : ${config ? "présente" : "absente"} ; service ${config?.enabled ? "activé" : "désactivé ou absent"} ; ${calls} appel(s) dans l'historique. Lecture seule.`);
    }
    if (indexed.some((value) => !value)) throw new Error("Index restaurantId manquant : vérifier les index avant utilisation");
  } finally {
    if (inserted) {
      await Call.deleteMany({ restaurantId: { $in: ids }, accountSid: "ACtest" });
      await Draft.deleteMany({ restaurantId: { $in: ids }, operator: "CallSense integration test" });
    }
  }
}
main().catch(() => { console.error("Vérification CallSense échouée ; vérifier la connexion, le nom de base et les index. Aucun détail sensible n'est affiché."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
