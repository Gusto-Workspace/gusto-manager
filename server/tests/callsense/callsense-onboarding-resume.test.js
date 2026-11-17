const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const { run } = require("../../services/callsense/cron/callsense-onboarding.service");
const { startTechnical } = require("../../services/callsense/callsense-provisioning.service");

test("la reprise automatique réclame un dossier autorisé et ne transmet pas un nouveau consentement", async t => {
  const date = new Date("2026-01-01T00:00:00Z");
  const item = { _id: "draft", restaurantId: "restaurant", automation: { status: "running", resumeMode: "technical", actorId: "admin", nextAttemptAt: date, functionAccepted: true } };
  let query, claimed = 0, resumed = 0;
  t.mock.method(Draft, "find", q => { query = q; return { select: () => ({ limit: () => ({ lean: async () => [item] }) }) }; });
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => { assert.equal(filter["automation.nextAttemptAt"], date); assert.ok(update.$set["automation.nextAttemptAt"] > date); return ++claimed === 1 ? item : null; });
  const options = { now: () => date, startTechnical: async (id, actor, opts) => { resumed++; assert.equal(id, "restaurant"); assert.equal(actor, "admin"); assert.equal(opts.functionConfirm, undefined); } };
  await run(options); await run(options);
  assert.equal(resumed, 1); assert.equal(query["automation.status"], "running"); assert.deepEqual(query["automation.resumeMode"].$in, ["onboarding", "technical"]); assert.ok(query["automation.actorId"]);
  assert.equal(query.$or[1]["regulatoryApproval.status"], "twilio-approved");
  assert.ok(query.$or[1].$expr.$and.some(condition => condition.$eq?.includes("$automation.manualApprovalBundleSid")));
});
test("une finalisation reprend uniquement les droits Function effectivement enregistrés", async t => {
  let record = { automation: { functionAccepted: false } }, updates = [];
  t.mock.method(Config, "findOne", () => ({ lean: async () => null }));
  t.mock.method(Draft, "findOneAndUpdate", async (_q, change) => { if (change.$set["automation.functionAccepted"]) record.automation.functionAccepted = true; return record; });
  t.mock.method(Draft, "updateOne", async (_q, change) => { updates.push(change); });
  const seen = [];
  const finalize = async (_id, _actor, opts) => { seen.push(opts.deployFunction); return { status: "waiting" }; };
  assert.equal((await startTechnical("id", "admin", { confirm: true, finalize })).status, "running");
  await startTechnical("id", "admin", { confirm: true, functionConfirm: true, finalize });
  await startTechnical("id", "admin", { confirm: true, finalize });
  assert.deepEqual(seen, [false, true, true]);
  assert.equal(updates[0].$set["automation.status"], "running"); assert.ok(updates[0].$set["automation.nextAttemptAt"] instanceof Date);
  await assert.rejects(startTechnical("id", "admin", { confirm: false, functionConfirm: true, finalize }), /Confirmation/);
});
test("une approbation vérifiée reprend après redémarrage avec le plafond initial", async t => {
  const date = new Date("2026-01-01T00:00:00Z");
  const item = { _id: "draft", restaurantId: "restaurant", automation: { status: "running", phase: "compliance", resumeMode: "onboarding", actorId: "admin", maxAmount: "2.00", currency: "EUR", nextAttemptAt: date, manualApprovalBundleSid: "BUtest", manualApprovalAccountSid: "ACtest" } };
  let calls = 0;
  t.mock.method(Draft, "find", filter => { assert.equal(filter.$or[1]["regulatoryApproval.status"], "twilio-approved"); return { select: () => ({ limit: () => ({ lean: async () => [item] }) }) }; });
  t.mock.method(Draft, "findOneAndUpdate", async filter => { assert.ok(filter.$or[1].$expr); return calls ? null : item; });
  await run({ now: () => date, runOnboarding: async (restaurant, actor, options) => { calls++; assert.equal(restaurant, "restaurant"); assert.equal(actor, "admin"); assert.equal(options.maxAmount, "2.00"); assert.equal(options.currency, "EUR"); assert.equal(options.functionConsent, undefined); } });
  assert.equal(calls, 1);
});
