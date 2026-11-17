// Uses only disposable documents and a Stripe stub in the explicitly named Test database.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Consumption = require("../models/callsense/callsense-consumption.model");
const { sendEntry, stageCall, sendUsageAlerts, saveBillingPeriod } = require("../services/callsense-metering.service");
const { encryptToken } = require("../services/callsense-secrets.service");
const SubscriptionOperation = require("../models/callsense/callsense-subscription-operation.model");
const { getCurrentUsage } = require("../services/callsense-usage.service");
const Alert = require("../models/callsense/callsense-quota-alert.model");
const Notification = require("../models/notification.model");
const BillingPeriod = require("../models/callsense/callsense-billing-period.model");
const pushPath = require.resolve("../services/webpush.service");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { sendPushToModule: async () => {} } };

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("Test uniquement");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (!/(^|[-_])test($|[-_])/i.test(mongoose.connection.db.databaseName)) throw new Error("Base Test requise");
  const restaurantId = new mongoose.Types.ObjectId();
  const callId = new mongoose.Types.ObjectId();
  const now = new Date();
  const identifier = `callsense_test_${callId}`;
  try {
    await Consumption.createIndexes();
    const locks = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => SubscriptionOperation.create({ _id: String(restaurantId), attemptId: `test-${index}`, kind: "create", startedAt: now })));
    assert.equal(locks.filter((result) => result.status === "fulfilled").length, 1);
    process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32); // disposable test key, never a deployed secret
    const stageId = new mongoose.Types.ObjectId();
    const config = { restaurantId, accountSid: "ACtest", encryptedAuthToken: encryptToken("test-token", String(restaurantId), "ACtest"), commercial: { meteringFrom: new Date(now.getTime() - 120000) } };
    const call = { _id: stageId, restaurantId, incomingReceived: true, callSid: "CAparent", childCallSid: "CAchild", outcome: "completed", duration: 61 };
    const context = { stripeCustomerId: "cus_fake", subscription: { id: "sub_fake" }, period: { start: new Date(now.getTime() - 120000), end: new Date(now.getTime() + 120000) } };
    const twilio = () => ({ calls: () => ({ fetch: async () => ({ sid: "CAchild", parentCallSid: "CAparent", accountSid: "ACtest", status: "completed", duration: "61", endTime: now }) }) });
    const stages = await Promise.allSettled(Array.from({ length: 8 }, () => stageCall(call, config, context, twilio)));
    assert.ok(stages.some((result) => result.status === "fulfilled"));
    assert.equal(await Consumption.countDocuments({ callId: stageId }), 1);
    assert.equal((await Consumption.findOne({ callId: stageId }).lean()).minutes, 2);
    const entry = await Consumption.create({ restaurantId, callId, parentSid: "CAtestparent", childSid: "CAtestchild",
      stripeCustomerId: "cus_fake", subscriptionId: "sub_fake", periodStart: new Date(now.getTime() - 10000),
      periodEnd: new Date(now.getTime() + 100000), occurredAt: new Date(now.getTime() - 5000), seconds: 61, minutes: 2, identifier });
    await assert.rejects(Consumption.create({ ...entry.toObject(), _id: new mongoose.Types.ObjectId(), identifier: `${identifier}_other` }), (error) => error.code === 11000);
    let requests = 0;
    const stripe = { billing: { meterEvents: { create: async (payload) => { requests += 1; return { identifier: payload.identifier }; } } } };
    const results = await Promise.all(Array.from({ length: 12 }, () => sendEntry(entry.toObject(), stripe, now)));
    assert.equal(results.filter((value) => value === "sent").length, 1);
    assert.equal(requests, 1);
    const stored = await Consumption.findOne({ callId }).lean();
    assert.equal(stored.state, "sent");
    assert.equal(stored.minutes, 2);
    const previousKey = process.env.STRIPE_API_SECRET_KEY;
    process.env.STRIPE_API_SECRET_KEY = "";
    try {
      await saveBillingPeriod(restaurantId, "sub_fake", { start: new Date(now.getTime() - 5000000), end: new Date(now.getTime() - 4000000) });
      const history = await getCurrentUsage(String(restaurantId));
      assert.equal(history.available, false);
      assert.equal(history.history.reduce((sum, period) => sum + period.verifiedMinutes, 0), 4);
      assert.ok(history.history.some((period) => period.verifiedMinutes === 0));
      assert.equal((await getCurrentUsage(String(new mongoose.Types.ObjectId()))).history.length, 0);
    } finally { process.env.STRIPE_API_SECRET_KEY = previousKey; }
    const alertPeriod = { start: new Date(now.getTime() - 500000), end: new Date(now.getTime() + 500000), subscriptionId: "sub_fake" };
    await Consumption.create({ restaurantId, callId: new mongoose.Types.ObjectId(), parentSid: "CAtestalert", childSid: "CAchildalert",
      stripeCustomerId: "cus_fake", subscriptionId: "sub_fake", periodStart: alertPeriod.start, periodEnd: alertPeriod.end,
      occurredAt: new Date(now.getTime() - 1000), seconds: 60000, minutes: 1000, identifier: `${identifier}_alert` });
    await Promise.all([sendUsageAlerts(restaurantId, alertPeriod), sendUsageAlerts(restaurantId, alertPeriod)]);
    await sendUsageAlerts(restaurantId, alertPeriod);
    assert.equal(await Alert.countDocuments({ restaurantId }), 2);
    assert.equal(await Notification.countDocuments({ restaurantId, type: "callsense_quota" }), 2);
    console.log("Registre Test : vérification Twilio simulée, index uniques, concurrence et idempotence locale vérifiés avec Stripe simulé.");
  } finally {
    await Consumption.deleteMany({ restaurantId, stripeCustomerId: "cus_fake" });
    await SubscriptionOperation.deleteOne({ _id: String(restaurantId), attemptId: /^test-/ });
    await Alert.deleteMany({ restaurantId });
    await BillingPeriod.deleteMany({ restaurantId, subscriptionId: "sub_fake" });
    await Notification.deleteMany({ restaurantId, type: "callsense_quota" });
  }
}
main().catch((error) => { console.error("Vérification du registre Test échouée :", error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
