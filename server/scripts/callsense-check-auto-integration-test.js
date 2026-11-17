// Scoped integration recipe: MongoDB Test only; all Twilio and Stripe calls are mocked.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Config = require("../models/callsense/callsense-config.model");
const Call = require("../models/callsense/callsense-call.model");
const Consumption = require("../models/callsense/callsense-consumption.model");
const Period = require("../models/callsense/callsense-billing-period.model");
const { encryptToken } = require("../services/callsense-secrets.service");
const { offerIds, getTelephoneStats, getCurrentUsage } = require("../services/callsense-usage.service");
const { reconcileCalls, processRestaurant } = require("../services/callsense-metering.service");
const bus = require("../services/sse-bus.service");
const push = require.resolve("../services/webpush.service");
require.cache[push] = { id: push, filename: push, loaded: true, exports: { sendPushToModule: async () => {} } };

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("Configuration Test requise");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw new Error("Nom de base Test requis");
  process.env.CALLSENSE_METER_REPORTING_ENABLED = "false";
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.STRIPE_API_SECRET_KEY = "sk_test_callsense_isolated_mock";
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Base inattendue");
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const nonce = crypto.randomBytes(4).toString("hex"), now = new Date();
  const account = (n) => `AC${crypto.createHash("sha256").update(`${nonce}:account:${n}`).digest("hex").slice(0, 32)}`;
  const sid = (n) => `CA${crypto.createHash("sha256").update(`${nonce}:call:${n}`).digest("hex").slice(0, 32)}`;
  const phone = (n) => `+339${String(parseInt(nonce, 16) % 10000000).padStart(7, "0")}${n}`;
  const at = (minutes) => new Date(now.getTime() - minutes * 60000);
  const sip = (n) => `sip:integration${n}@example.test`;
  const cfg = (n) => ({ restaurantId: ids[n], accountSid: account(n), twilioNumber: phone(n), sipUri: sip(n), enabled: true,
    activatedAt: at(240), encryptedAuthToken: encryptToken("temporary-test-token", String(ids[n]), account(n)),
    reconciliation: { cursor: at(180) }, commercial: n === 0 ? { meteringEnabled: true, subscribed: true, meteringFrom: at(90), stripeSubscriptionId: "sub_mock" } : {} });
  function pair(n, tag, minutes, status, duration) {
    const parent = { sid: sid(tag), accountSid: account(n), direction: "inbound", to: phone(n), from: "+33600000000", status: "completed", startTime: at(minutes) };
    const child = { sid: sid(`${tag}:child`), accountSid: account(n), parentCallSid: parent.sid, direction: "outbound-dial", to: sip(n), status, duration: String(duration), endTime: new Date(parent.startTime.getTime() + (duration || 20) * 1000) };
    return { parent, child };
  }
  const historical = pair(0, "historical", 150, "completed", 61), partial = pair(0, "partial", 60, "no-answer", 0), recent = pair(0, "recent", 30, "completed", 61), second = pair(1, "other", 40, "busy", 0);
  const datasets = new Map([[account(0), [historical, partial, recent]], [account(1), [second]]]);
  let mode = "interrupt", gate, releaseGate, entered;
  const gateEntered = new Promise((resolve) => { entered = resolve; });
  const twilio = (accountSid) => {
    const pairs = datasets.get(accountSid) || [];
    const calls = (callSid) => ({ fetch: async () => {
      if (mode === "interrupt" && callSid === partial.parent.sid) throw new Error("simulated interruption");
      const item = pairs.find((pair) => pair.parent.sid === callSid || pair.child.sid === callSid);
      if (!item) throw new Error("unexpected call");
      return item.parent.sid === callSid ? item.parent : item.child;
    } });
    calls.list = async (query) => {
      if (query.parentCallSid) return pairs.filter((pair) => pair.parent.sid === query.parentCallSid).map((pair) => pair.child);
      if (mode === "offline") throw new Error("simulated Twilio failure");
      if (mode === "truncated") return Array(1001).fill(historical.parent);
      if (mode === "lock") { entered(); await gate; }
      return pairs.map((pair) => pair.parent).filter((parent) => parent.startTime >= query.startTimeAfter && parent.startTime < query.startTimeBefore);
    };
    return { calls };
  };
  const idsOffer = offerIds(); let sends = 0;
  const fixed = { id: idsOffer.fixed, active: true, livemode: false, product: "prod_mock", currency: "eur", unit_amount: 4500, recurring: { interval: "month", usage_type: "licensed" } };
  const metered = { id: idsOffer.metered, active: true, livemode: false, product: "prod_mock", currency: "eur", recurring: { interval: "month", usage_type: "metered", meter: idsOffer.meter }, billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: 1000, unit_amount: 0 }, { up_to: null, unit_amount: 5 }] };
  const meter = { id: idsOffer.meter, event_name: "gusto_callsense_minutes", status: "active", default_aggregation: { formula: "sum" } };
  const periodStart = Math.floor(at(200).getTime() / 1000), periodEnd = Math.floor(now.getTime() / 1000) + 7200;
  const subscription = { id: "sub_mock", status: "active", items: { data: [{ price: { id: idsOffer.fixed } }, { price: { id: idsOffer.metered }, current_period_start: periodStart, current_period_end: periodEnd }] } };
  const stripe = { prices: { retrieve: async (id) => id === idsOffer.fixed ? fixed : metered }, billing: { meters: { retrieve: async () => meter }, meterEvents: { create: async () => { sends++; throw new Error("unexpected Stripe event"); } } }, subscriptions: { list: async () => ({ data: [subscription] }) } };
  const stripePath = require.resolve("stripe"), billingPath = require.resolve("../services/stripe-billing.service");
  const stripeSaved = require.cache[stripePath], billingSaved = require.cache[billingPath];
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => stripe };
  require.cache[billingPath] = { id: billingPath, filename: billingPath, loaded: true, exports: { findRestaurantSubscription: async () => ({ subscription, stripeCustomerId: "cus_mock" }), isStripeCustomerDedicatedToRestaurant: async () => true } };
  const events = [[], []];
  const connections = events.map((target) => ({ locals: { gustoEventModules: { callsense: true } }, write: (value) => target.push(value) }));
  try {
    if (await Config.exists({ $or: [{ restaurantId: { $in: ids } }, { twilioNumber: { $in: [phone(0), phone(1)] } }] })) throw new Error("Collision de données temporaires");
    await Config.create([cfg(0), cfg(1)]);
    const createdAt = partial.parent.startTime;
    await Call.create({ restaurantId: ids[0], accountSid: account(0), callSid: partial.parent.sid, incomingReceived: true, outcome: "no-answer", customerName: "integration-marker", createdAt });
    bus._addClient(ids[0], connections[0]); bus._addClient(ids[1], connections[1]);
    await assert.rejects(reconcileCalls(ids[0], { twilio, now }), /simulated interruption/);
    let saved = await Config.findOne({ restaurantId: ids[0] }).lean();
    assert.equal(+saved.reconciliation.cursor, +at(180));
    assert.equal(await Call.countDocuments({ restaurantId: ids[0], callSid: historical.parent.sid }), 1);
    assert.equal(saved.reconciliation.leaseId, undefined);
    mode = "lock"; gate = new Promise((resolve) => { releaseGate = resolve; });
    const first = reconcileCalls(ids[0], { twilio, now }); await gateEntered;
    saved = await Config.findOne({ restaurantId: ids[0] }).lean(); assert.ok(saved.reconciliation.leaseId && saved.reconciliation.leaseUntil > new Date());
    assert.equal((await reconcileCalls(ids[0], { twilio, now })).locked, true);
    releaseGate(); await first;
    saved = await Config.findOne({ restaurantId: ids[0] }).lean(); assert.equal(saved.reconciliation.leaseId, undefined); assert.ok(saved.reconciliation.cursor > at(180));
    const restored = await Call.findOne({ restaurantId: ids[0], callSid: partial.parent.sid }).lean();
    assert.equal(restored.customerName, "integration-marker"); assert.equal(+restored.createdAt, +createdAt); assert.equal(restored.outcome, "no-answer"); assert.equal(restored.childCallSid, partial.child.sid);
    const recoveredHistorical = await Call.findOne({ restaurantId: ids[0], callSid: historical.parent.sid }).lean();
    const recoveredRecent = await Call.findOne({ restaurantId: ids[0], callSid: recent.parent.sid }).lean();
    assert.equal(recoveredHistorical.billingState, "complete"); assert.equal(recoveredRecent.billingState, null);
    assert.equal(await Call.countDocuments({ restaurantId: ids[0] }), 3);
    assert.equal(await Consumption.countDocuments({ restaurantId: ids[0] }), 0);
    assert.equal(events[0].length, 3); assert.equal(events[1].length, 0);
    const stats = await getTelephoneStats(String(ids[0]), undefined, now); assert.equal(stats.received, 3); assert.equal(stats.answered, 2); assert.equal(stats.missed, 1);
    mode = "ok"; await reconcileCalls(ids[1], { twilio, now });
    assert.equal(await Call.countDocuments({ restaurantId: ids[1] }), 1); assert.equal(events[1].length, 1);
    assert.equal(await Call.countDocuments({ restaurantId: ids[1], callSid: { $in: [historical.parent.sid, partial.parent.sid, recent.parent.sid] } }), 0);
    const current = await Config.findOne({ restaurantId: ids[0] }).select("+encryptedAuthToken").lean();
    await processRestaurant(current, { stripe, twilio, now });
    const ledger = await Consumption.find({ restaurantId: ids[0] }).lean();
    assert.equal(ledger.length, 1); assert.equal(String(ledger[0].callId), String(recoveredRecent._id)); assert.equal(ledger[0].minutes, 2); assert.equal(ledger[0].state, "verified"); assert.equal(sends, 0);
    const usage = await getCurrentUsage(String(ids[0])); assert.equal(usage.available, true); assert.equal(usage.verifiedMinutes, 2); assert.equal(usage.reportedMinutes, 0); assert.equal(usage.usageIncomplete, true);
    for (const modeName of ["offline", "truncated"]) {
      await Config.updateOne({ restaurantId: ids[0] }, { $set: { "reconciliation.cursor": at(180) } });
      mode = modeName; await assert.rejects(reconcileCalls(ids[0], { twilio, now }));
      assert.equal(+(await Config.findOne({ restaurantId: ids[0] }).lean()).reconciliation.cursor, +at(180));
    }
    console.log("MongoDB Test : récupération, traces partielles, interruption et reprise, verrou concurrent, pagination tronquée, panne Twilio, isolation, SSE et quota local sans émission Stripe vérifiés.");
  } finally {
    connections.forEach((connection, index) => bus._removeClient(ids[index], connection));
    await Consumption.deleteMany({ restaurantId: { $in: ids } }); await Period.deleteMany({ restaurantId: { $in: ids } });
    await Call.deleteMany({ restaurantId: { $in: ids }, accountSid: { $in: [account(0), account(1)] } });
    await Config.deleteMany({ restaurantId: { $in: ids }, accountSid: { $in: [account(0), account(1)] } });
    assert.equal(await Config.countDocuments({ restaurantId: { $in: ids } }), 0);
    assert.equal(await Call.countDocuments({ restaurantId: { $in: ids } }), 0);
    assert.equal(await Consumption.countDocuments({ restaurantId: { $in: ids } }), 0);
    assert.equal(await Period.countDocuments({ restaurantId: { $in: ids } }), 0);
    if (stripeSaved) require.cache[stripePath] = stripeSaved; else delete require.cache[stripePath];
    if (billingSaved) require.cache[billingPath] = billingSaved; else delete require.cache[billingPath];
    console.log("Nettoyage des données temporaires vérifié.");
  }
}
main().catch((error) => { console.error(`Recette d'intégration échouée : ${error.name} ${error.message}`); if (error.name === "AssertionError") console.error((error.stack || "").split("\n").find((line) => line.includes("callsense-check-auto-integration-test.js")) || ""); process.exitCode = 1; }).finally(() => mongoose.disconnect());
