const test = require("node:test");
const assert = require("node:assert/strict");
const twilio = require("twilio");

const pushPath = require.resolve("../services/webpush.service");
const pushes = [];
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {
  sendPushToModule: async (input) => { pushes.push(input); },
} };
const Call = require("../models/callsense-call.model");
const Config = require("../models/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const Customer = require("../models/customer.model");
const service = require("../services/callsense.service");
const sse = require("../services/sse-bus.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const owner = "111111111111111111111111";
const employee = "222222222222222222222222";
const outsider = "333333333333333333333333";
const sid = "ACtest";
const route = { restaurantId: A, enabled: true, accountSid: sid, twilioNumber: "+33219121829", sipUri: "sip:test@example.test" };

test("webhooks signés, TwiML et appels simultanés isolés", async () => {
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.test";
  process.env.CALLSENSE_ACCOUNTS = JSON.stringify({ [sid]: "test-secret" });
  const seen = [];
  service.findRoute = async (account, number) => account === sid && number === route.twilioNumber ? route : null;
  service.recordIncoming = async (config, body) => { seen.push([String(config.restaurantId), body.CallSid]); };
  service.recordCallback = async (kind, body, restaurant, parent) => { seen.push([kind, restaurant, parent, body.CallStatus || body.DialCallStatus]); };
  const router = require("../routes/callsense.routes");
  async function post(path, body, invalid = false) {
    const signedUrl = `https://api.example.test${path}`;
    const signature = twilio.getExpectedTwilioSignature("test-secret", signedUrl, body);
    const url = new URL(signedUrl);
    const entry = router.stack.find((layer) => layer.route?.path === url.pathname.replace(/^\/api/, ""));
    const handlers = entry.route.stack.map((layer) => layer.handle);
    const req = { body, originalUrl: url.pathname + url.search, query: Object.fromEntries(url.searchParams), get: () => invalid ? "invalid" : signature };
    const res = { status: 200, content: "", sendStatus(code) { this.status = code; return this; }, type() { return this; }, send(value) { this.content = value; return this; }, text: async function () { return this.content; } };
    // Body parsing is performed by Express before these route handlers.
    let accepted = false;
    handlers[1](req, res, () => { accepted = true; });
    if (accepted) await handlers[2](req, res);
    return res;
  }
  {
    const one = { AccountSid: sid, CallSid: "CAone", From: "+33612345678", To: route.twilioNumber };
    const two = { ...one, CallSid: "CAtwo" };
    assert.equal((await post("/api/callsense/voice", one, true)).status, 403);
    assert.equal((await post("/api/callsense/voice", { ...one, AccountSid: "ACother" })).status, 403);
    const responses = await Promise.all([post("/api/callsense/voice", one), post("/api/callsense/voice", two)]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const xml = await responses[0].text();
    assert.match(xml, /<Sip[^>]*statusCallbackEvent="initiated ringing answered completed"/);
    assert.match(xml, /sip:test@example.test/);
    assert.match(xml, /dial-action/);
    const params = `?restaurantId=${A}&parent=CAone`;
    assert.equal((await post(`/api/callsense/sip-status${params}`, { AccountSid: sid, CallSid: "CAchild", ParentCallSid: "CAwrong", CallStatus: "ringing" })).status, 400);
    assert.equal((await post(`/api/callsense/sip-status${params}`, { AccountSid: sid, CallSid: "CAchild", ParentCallSid: "CAone", CallStatus: "ringing" })).status, 200);
    const action = await post(`/api/callsense/dial-action${params}`, { AccountSid: sid, CallSid: "CAone", DialCallStatus: "no-answer" });
    assert.match(await action.text(), /<Response\s*\/>/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(seen.some((event) => event[1] === "CAone"));
    assert.ok(seen.some((event) => event[1] === "CAtwo"));
    assert.ok(seen.some((event) => event[0] === "action" && event[1] === A));
  }
});

test("SSE CallSense ne parvient qu’aux connexions autorisées du restaurant", () => {
  const events = [[], [], []];
  const make = (list, allowed) => ({ locals: { gustoEventModules: { callsense: allowed } }, write: (value) => list.push(value) });
  const allowed = make(events[0], true), denied = make(events[1], false), other = make(events[2], true);
  sse._addClient(A, allowed); sse._addClient(A, denied); sse._addClient(B, other);
  sse.broadcastToRestaurant(A, { type: "callsense_updated", call: { id: "1" } });
  assert.equal(events[0].length, 1); assert.equal(events[1].length, 0); assert.equal(events[2].length, 0);
  sse._removeClient(A, allowed); sse._removeClient(A, denied); sse._removeClient(B, other);
});

test("routage de secours seulement si Mongo est indisponible", async () => {
  process.env.CALLSENSE_FALLBACK_ROUTES = JSON.stringify([route]);
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => { throw new Error("offline"); } }) });
  // Restore the real method replaced by the HTTP test in its own module instance.
  delete require.cache[require.resolve("../services/callsense.service")];
  const real = require("../services/callsense.service");
  assert.equal((await real.findRoute(sid, route.twilioNumber)).sipUri, route.sipUri);
  assert.equal(await real.findRoute("ACother", route.twilioNumber), null);
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => ({ ...route, enabled: false }) }) });
  assert.equal(await real.findRoute(sid, route.twilioNumber), null);
});

test("push existant limité aux abonnés ayant accès au restaurant et aux clients", async () => {
  const real = require("../services/callsense.service");
  Call.findOneAndUpdate = () => ({ lean: async () => ({ _id: "call" }) });
  Restaurant.findById = () => ({ select: () => ({ populate: async () => ({ _id: A, owner_id: owner,
    options: { customers: true }, employees: [{ _id: employee, restaurantProfiles: [{ restaurant: A, options: { customers: true } }] }] }) }) });
  await real.notify({ _id: "call", restaurantId: A, from: "+33612345678", customerName: "Marie" });
  assert.equal(pushes.length, 3);
  const candidates = [{ userId: owner }, { userId: employee }, { userId: outsider }, {}];
  const allowed = await pushes[0].filterSubscriptions(candidates);
  assert.deepEqual(allowed.map((entry) => entry.userId), [owner, employee]);
  assert.match(pushes[0].link, /callId=call/);
});

test("callbacks répétés ou désordonnés : résultat final immuable et appels distincts", async () => {
  const real = require("../services/callsense.service");
  const docs = new Map();
  Call.findOneAndUpdate = (filter, update, options = {}) => ({ lean: async () => {
    let doc = docs.get(filter.callSid);
    const matches = doc && String(doc.restaurantId) === String(filter.restaurantId) && doc.accountSid === filter.accountSid &&
      (!filter.outcome || doc.outcome === undefined);
    if (!matches) {
      if (!options.upsert) return null;
      if (doc) throw Object.assign(new Error("duplicate"), { code: 11000 });
      doc = { _id: filter.callSid, ...update.$setOnInsert, createdAt: new Date(), updatedAt: new Date() };
      docs.set(filter.callSid, doc);
    }
    Object.assign(doc, update.$set || {});
    for (const [key, value] of Object.entries(update.$max || {})) doc[key] = Math.max(doc[key] ?? 0, value);
    for (const [key, value] of Object.entries(update.$min || {})) if (!doc[key] || value < doc[key]) doc[key] = value;
    return { ...doc };
  } });
  await Promise.all([
    real.recordCallback("sip", { AccountSid: sid, CallSid: "CAchild1", CallStatus: "in-progress" }, A, "CAparent1"),
    real.recordCallback("sip", { AccountSid: sid, CallSid: "CAchild2", CallStatus: "ringing" }, B, "CAparent2"),
  ]);
  await real.recordCallback("sip", { AccountSid: sid, CallSid: "CAchild1", CallStatus: "ringing" }, A, "CAparent1");
  assert.equal(docs.get("CAparent1").phase, 3);
  await real.recordCallback("action", { AccountSid: sid, DialCallStatus: "completed", DialCallDuration: "35" }, A, "CAparent1");
  await real.recordCallback("action", { AccountSid: sid, DialCallStatus: "no-answer" }, A, "CAparent1");
  await real.recordCallback("sip", { AccountSid: sid, CallStatus: "completed" }, A, "CAparent1");
  assert.equal(docs.get("CAparent1").outcome, "completed");
  assert.equal(docs.get("CAparent1").duration, 35);
  assert.equal(real.serialize(docs.get("CAparent1")).status, "completed");
  assert.equal(real.serialize(docs.get("CAparent2")).status, "ringing");
  await real.recordCallback("action", { AccountSid: sid, DialCallStatus: "failed" }, B, "CAparent1");
  assert.equal(docs.get("CAparent1").outcome, "completed");
});

test("identification client limitée au restaurant et sans attribution ambiguë", async () => {
  const real = require("../services/callsense.service");
  let selectedRestaurant;
  let candidates = [{ _id: "1", firstName: "Marie", lastName: "Dupont", phoneNorm: "0612345678" }];
  Customer.find = (filter) => {
    selectedRestaurant = filter.restaurant_id;
    return { select: () => ({ lean: async () => candidates }) };
  };
  const found = await real.findCustomer(A, "+33612345678");
  assert.equal(selectedRestaurant, A);
  assert.equal(found.customerName, "Marie Dupont");
  candidates = [...candidates, { _id: "2", phoneNorm: "+33612345678" }];
  assert.deepEqual(await real.findCustomer(A, "+33612345678"), { match: "ambiguous" });
  assert.deepEqual(await real.findCustomer(B, null), { match: "unknown" });
});
