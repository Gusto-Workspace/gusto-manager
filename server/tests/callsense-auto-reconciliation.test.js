const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../models/callsense/callsense-config.model");
const Call = require("../models/callsense/callsense-call.model");
const Consumption = require("../models/callsense/callsense-consumption.model");
const Period = require("../models/callsense/callsense-billing-period.model");
const { encryptToken } = require("../services/callsense-secrets.service");
const { reconcileCalls, runReconciliation, needsRecoveredCommercialVerification } = require("../services/callsense-metering.service");

test("la réconciliation refuse les comptes fermés ou au statut incertain", async t => {
  const previous = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  t.after(() => { if (previous === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = previous; });
  const accountSid = `AC${"1".repeat(32)}`, restaurantId = "507f1f77bcf86cd799439011";
  const config = { _id: "config", restaurantId, enabled: true, accountSid, twilioNumber: "+33300000000", createdAt: new Date(Date.now() - 3600000), encryptedAuthToken: encryptToken("fake", restaurantId, accountSid), reconciliation: {} };
  t.mock.method(Config, "findOneAndUpdate", () => ({ select: () => ({ lean: async () => config }) }));
  t.mock.method(Config, "updateOne", async () => ({ matchedCount: 1 }));
  let calls = 0;
  const twilio = status => () => ({ api: { accounts: sid => ({ fetch: async () => { if (status === "unknown") throw Error("network"); return { sid, status }; } }) }, calls: { list: async () => { calls++; return []; } } });
  await assert.rejects(reconcileCalls(restaurantId, { twilio: twilio("closed") }), /inactif/);
  await assert.rejects(reconcileCalls(restaurantId, { twilio: twilio("unknown") }), /indisponible/);
  assert.equal(calls, 0);
});

test("un appel récupéré après activation commerciale reste à vérifier avant facturation", () => {
  const proof = { outcome: "completed", startedAt: new Date("2026-02-10"), endedAt: new Date("2026-02-10T00:01:01Z") };
  const config = { commercial: { meteringEnabled: true, subscribed: true, meteringFrom: new Date("2026-02-01"), stripeSubscriptionId: "sub_one" } };
  assert.equal(needsRecoveredCommercialVerification(config, proof), true);
  assert.equal(needsRecoveredCommercialVerification({ commercial: { ...config.commercial, meteringFrom: new Date("2026-02-11") } }, proof), false);
  assert.equal(needsRecoveredCommercialVerification(config, { ...proof, outcome: "busy" }), false);
  assert.equal(needsRecoveredCommercialVerification({ commercial: { ...config.commercial, meteringEnabled: false } }, proof), false);
});

test("rattrapage, reprise après erreur, doublons et appel ambigu restent isolés", async () => {
  const restaurantId = "507f1f77bcf86cd799439011", oldKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  const now = new Date(), start = new Date(now.getTime() - 600000), end = new Date(now.getTime() - 540000);
  const parent = { sid: `CA${"a".repeat(32)}`, accountSid: "ACtest", direction: "inbound", to: "+33123456789", status: "completed", startTime: start, from: "+33600000000" };
  const ambiguous = { ...parent, sid: `CA${"c".repeat(32)}` };
  const child = { sid: `CA${"b".repeat(32)}`, parentCallSid: parent.sid, accountSid: "ACtest", direction: "outbound-dial", to: "sip:test@example.test", status: "completed", duration: "60", endTime: end };
  const config = { _id: "config", restaurantId, enabled: true, accountSid: "ACtest", twilioNumber: parent.to, sipUri: child.to,
    encryptedAuthToken: encryptToken("fake", restaurantId, "ACtest"), createdAt: new Date(now.getTime() - 3600000), commercial: {}, reconciliation: {} };
  const originals = { lock: Config.findOneAndUpdate, update: Config.updateOne, findConfig: Config.findOne, list: Call.find, find: Call.findOne, write: Call.findOneAndUpdate, exists: Consumption.exists, period: Period.find };
  const servicePath = require.resolve("../services/callsense.service"), savedService = require.cache[servicePath];
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { publish: () => {} } };
  const records = new Map(); let failList = true, occupied = false, truncated = false;
  Config.findOneAndUpdate = (_filter, update) => ({ select: () => ({ lean: async () => {
    if (occupied) return null; occupied = true; Object.assign(config.reconciliation, { leaseId: update.$set["reconciliation.leaseId"], leaseUntil: update.$set["reconciliation.leaseUntil"] }); return { ...config, reconciliation: { ...config.reconciliation } };
  } }) });
  Config.findOne = () => ({ select: () => ({ lean: async () => config }) });
  Config.updateOne = async (filter, update) => {
    if (filter["reconciliation.leaseId"] !== config.reconciliation.leaseId) return { matchedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) config.reconciliation[key.replace("reconciliation.", "")] = value;
    if (update.$unset) { occupied = false; delete config.reconciliation.leaseId; delete config.reconciliation.leaseUntil; }
    return { matchedCount: 1 };
  };
  Call.find = () => ({ select: () => ({ lean: async () => [...records.values()] }) });
  Call.findOne = ({ callSid }) => ({ lean: async () => records.get(callSid) || null });
  Call.findOneAndUpdate = (filter, update) => ({ lean: async () => { const item = { _id: filter.callSid, ...update.$setOnInsert, ...update.$set }; records.set(filter.callSid, item); return item; } });
  Consumption.exists = async () => false;
  Period.find = () => ({ limit: () => ({ lean: async () => [] }) });
  const calls = (sid) => ({ fetch: async () => sid === parent.sid ? parent : ambiguous });
  calls.list = async (query) => { if (query.parentCallSid) return query.parentCallSid === parent.sid ? [child] : []; if (failList) throw new Error("network"); return truncated ? Array(1001).fill(parent) : [parent, ambiguous]; };
  const twilio = () => ({ api: { accounts: sid => ({ fetch: async () => ({ sid, status: "active" }) }) }, calls });
  try {
    await assert.rejects(reconcileCalls(restaurantId, { twilio, now }), /network/);
    assert.equal(config.reconciliation.cursor, undefined);
    failList = false;
    const result = await reconcileCalls(restaurantId, { twilio, now });
    assert.equal(result.recovered, 1); assert.equal(result.anomalies, 1);
    assert.equal(records.get(parent.sid).billingState, "complete");
    assert.equal(config.reconciliation.anomalies[0].reason, "segments_twilio_ambigus");
    assert.ok(config.reconciliation.cursor);
    occupied = true;
    assert.equal((await reconcileCalls(restaurantId, { twilio, now })).locked, true);
    occupied = false;
    assert.equal((await reconcileCalls(restaurantId, { twilio, now })).caughtUp, true);
    assert.equal(records.size, 1);
    config.reconciliation.cursor = new Date(now.getTime() - 3600000);
    truncated = true;
    await assert.rejects(reconcileCalls(restaurantId, { twilio, now }), /liste_twilio_trop_dense/);
    assert.equal(config.reconciliation.cursor.getTime(), now.getTime() - 3600000);
    truncated = false;
    config.createdAt = new Date(now.getTime() - 48 * 3600000);
    config.reconciliation.cursor = new Date(config.createdAt);
    for (let i = 0; i < 8; i += 1) await reconcileCalls(restaurantId, { twilio, now });
    assert.equal(config.reconciliation.cursor.getTime(), now.getTime() - 5 * 60000);
    assert.equal(records.size, 1);
  } finally {
    Config.findOneAndUpdate = originals.lock; Config.updateOne = originals.update; Config.findOne = originals.findConfig;
    Call.find = originals.list; Call.findOne = originals.find; Call.findOneAndUpdate = originals.write; Consumption.exists = originals.exists; Period.find = originals.period;
    if (savedService) require.cache[servicePath] = savedService; else delete require.cache[servicePath];
    if (oldKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = oldKey;
  }
});
