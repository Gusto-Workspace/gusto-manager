const test = require("node:test");
const assert = require("node:assert/strict");
const twilio = require("twilio");

const pushPath = require.resolve("../../services/shared/webpush.service");
const pushes = [];
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {
  sendPushToModule: async (input) => { pushes.push(input); },
} };
const Call = require("../../models/callsense/callsense-call.model");
const Config = require("../../models/callsense/callsense-config.model");
const Restaurant = require("../../models/restaurant.model");
const Customer = require("../../models/customer.model");
const service = require("../../services/callsense/callsense.service");
const sse = require("../../services/shared/sse-bus.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const owner = "111111111111111111111111";
const employee = "222222222222222222222222";
const outsider = "333333333333333333333333";
const sid = "ACtest";
const route = { restaurantId: A, enabled: true, accountSid: sid, twilioNumber: "+33219121829", sipUri: "sip:test@example.test" };

test("webhooks signés, TwiML et appels simultanés isolés", async () => {
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://api.example.test";
  const seen = [];
  service.webhookAccountToken = async (account) => account === sid ? "test-secret" : "";
  service.findRoute = async (account, number) => account === sid && number === route.twilioNumber ? route : null;
  service.recordIncoming = async (config, body) => { seen.push([String(config.restaurantId), body.CallSid]); };
  service.recordCallback = async (kind, body, restaurant, parent) => { seen.push([kind, restaurant, parent, body.CallStatus || body.DialCallStatus]); };
  const router = require("../../routes/callsense.routes");
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
    await handlers[1](req, res, () => { accepted = true; });
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

test("aucun routage si Mongo est indisponible, isolation et mode test", async () => {
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => { throw new Error("offline"); } }) });
  // Restore the real method replaced by the HTTP test in its own module instance.
  delete require.cache[require.resolve("../../services/callsense/callsense.service")];
  const real = require("../../services/callsense/callsense.service");
  assert.equal(await real.findRoute(sid, route.twilioNumber), null);
  assert.equal(await real.findRoute("ACother", route.twilioNumber), null);
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => ({ ...route, enabled: false }) }) });
  assert.equal(await real.findRoute(sid, route.twilioNumber), null);
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => ({ ...route, enabled: false, managedByOnboarding: true, provisioningStatus: "ready_for_test" }) }) });
  assert.equal((await real.findRoute(sid, route.twilioNumber)).sipUri, route.sipUri);
  assert.equal(await real.findRoute("ACother", route.twilioNumber), null);
  Config.findOne = () => ({ maxTimeMS: () => ({ lean: async () => ({ ...route, enabled: false, managedByOnboarding: true, provisioningStatus: "suspended" }) }) });
  assert.equal(await real.findRoute(sid, route.twilioNumber), null);
});

test("push existant limité aux abonnés ayant accès au restaurant et aux clients", async () => {
  const real = require("../../services/callsense/callsense.service");
  Call.findOneAndUpdate = () => ({ lean: async () => ({ _id: "call" }) });
  Restaurant.findById = () => ({ select: async () => ({ _id: A, owner_id: owner, options: { reservations: true } }) });
  await real.notify({ _id: "call", restaurantId: A, from: "+33612345678", customerName: "Marie" });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].module, "reservations");
  const candidates = [{ userId: owner }, { userId: employee }, { userId: outsider }, {}];
  const allowed = await pushes[0].filterSubscriptions(candidates);
  assert.deepEqual(allowed.map((entry) => entry.userId), [owner]);
  assert.equal(pushes[0].data.tag, "callsense:call");
  assert.match(pushes[0].link, /callId=call/);
});

test("callbacks répétés ou désordonnés : résultat final immuable et appels distincts", async () => {
  const real = require("../../services/callsense/callsense.service");
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
  await real.recordCallback("sip", { AccountSid: sid, CallStatus: "completed" }, A, "CAparent3");
  await real.recordCallback("action", { AccountSid: sid, DialCallStatus: "no-answer" }, A, "CAparent3");
  await real.recordCallback("sip", { AccountSid: sid, CallStatus: "no-answer" }, A, "CAparent3");
  assert.equal(real.serialize(docs.get("CAparent3")).status, "completed");
});

test("identification client limitée au restaurant et sans attribution ambiguë", async () => {
  const real = require("../../services/callsense/callsense.service");
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

test("identités rétroactives groupées, changement, suppression et ambiguïté isolés par restaurant", async () => {
  const real = require("../../services/callsense/callsense.service"), original = Customer.find;
  let reads = 0, candidates = [], lastFilter;
  Customer.find = filter => { reads++; lastFilter = filter; return { select: () => ({ lean: async () => candidates.filter(customer => customer.restaurant_id === filter.restaurant_id && filter.phoneNorm.$in.includes(customer.phoneNorm)) }) }; };
  const phone = "+33612345678", calls = Array.from({ length: 6 }, () => phone);
  try {
    assert.equal((await real.resolveCustomerIdentities(A, calls))[phone].match, "unknown"); assert.equal(reads, 1);
    assert.equal(lastFilter.restaurant_id, A); assert.ok(Array.isArray(lastFilter.phoneNorm.$in)); assert.ok(!JSON.stringify(lastFilter).includes("$regex"));
    candidates = [{ _id: "one", restaurant_id: A, phoneNorm: "0612345678", firstName: "Léo", lastName: "Test" }, { _id: "other", restaurant_id: B, phoneNorm: phone, firstName: "Autre" }];
    let result = await real.resolveCustomerIdentities(A, calls); assert.equal(result[phone].customerId, "one"); assert.equal(result[phone].customerName, "Léo Test"); assert.equal(reads, 2);
    candidates[0].phoneNorm = "0611111111"; result = await real.resolveCustomerIdentities(A, calls); assert.equal(result[phone].match, "unknown");
    candidates[0].phoneNorm = "0033612345678"; candidates.push({ _id: "two", restaurant_id: A, phoneNorm: phone, firstName: "Autre" });
    result = await real.resolveCustomerIdentities(A, calls); assert.equal(result[phone].match, "ambiguous"); assert.equal(result[phone].customerId, null);
    candidates = candidates.filter(customer => customer._id !== "one" && customer._id !== "two"); result = await real.resolveCustomerIdentities(A, calls); assert.equal(result[phone].match, "unknown");
    const before = reads; assert.deepEqual(await real.resolveCustomerIdentities(A, ["", "invalid"]), {}); assert.equal(reads, before);
  } finally { Customer.find = original; }
});

test("création de réservation : fiche créée puis six appels retrouvent le client", async () => {
  const customers = require("../../services/customers/customers.service"), real = require("../../services/callsense/callsense.service");
  const old = { upsert: Customer.findOneAndUpdate, find: Customer.find, broadcast: sse.broadcastToRestaurant };
  let document, event, finds = 0;
  Customer.findOneAndUpdate = async (query, update) => { document = { _id: "new-client", ...query, ...update.$setOnInsert, phone: "0612345678", phoneNorm: "0612345678" }; return document; };
  Customer.find = query => { finds++; return { select: () => ({ lean: async () => query.restaurant_id === A && query.phoneNorm.$in.includes(document.phoneNorm) ? [document] : [] }) }; };
  sse.broadcastToRestaurant = (_restaurant, payload) => { event = payload; };
  try {
    const created = await customers.upsertCustomer({ restaurantId: A, firstName: "Leo", lastName: "Test", phone: "0612345678" });
    assert.equal(created._id, "new-client"); assert.equal(event.type, "callsense_customer_changed");
    const results = await real.resolveCustomerIdentities(A, Array(6).fill("+33612345678"));
    assert.equal(results["+33612345678"].customerId, "new-client"); assert.equal(finds, 1);
  } finally { Customer.findOneAndUpdate = old.upsert; Customer.find = old.find; sse.broadcastToRestaurant = old.broadcast; }
});

test("mode test : appel entrant, client, SSE, push et appel manqué sans facturation", async () => {
  const real = require("../../services/callsense/callsense.service");
  const old = { update: Call.findOneAndUpdate, customer: Customer.find, restaurant: Restaurant.findById };
  const events = [], listener = { locals: { gustoEventModules: { callsense: true } }, write: value => events.push(value) };
  const docs = new Map(), before = pushes.length;
  Call.findOneAndUpdate = (filter, update, options = {}) => ({ lean: async () => {
    let doc = filter._id ? [...docs.values()].find(item => item._id === filter._id) : docs.get(filter.callSid);
    if (!doc && options.upsert) { doc = { _id: "test-call", ...update.$setOnInsert, createdAt: new Date(), updatedAt: new Date() }; docs.set(filter.callSid, doc); }
    if (!doc || filter.outcome?.$exists === false && doc.outcome !== undefined || filter.pushClaimed && doc.pushClaimed || filter.missedPushClaimed && doc.missedPushClaimed || filter.sipFinalStatus && filter.sipFinalStatus !== doc.sipFinalStatus || filter.outcome === "no-answer" && doc.outcome !== "no-answer") return null;
    Object.assign(doc, update.$set || {});
    for (const [key, value] of Object.entries(update.$max || {})) doc[key] = Math.max(doc[key] || 0, value);
    return { ...doc };
  } });
  Customer.find = () => ({ select: () => ({ lean: async () => [{ _id: "client", firstName: "Marie", lastName: "Test", phoneNorm: "0612345678" }] }) });
  Restaurant.findById = () => ({ select: async () => ({ _id: A, owner_id: owner, options: { reservations: true } }) });
  sse._addClient(A, listener);
  try {
    await real.recordIncoming({ ...route, enabled: false, managedByOnboarding: true, provisioningStatus: "ready_for_test" }, { CallSid: "CAtest", From: "+33612345678" });
    const call = docs.get("CAtest");
    assert.equal(call.billingState, "complete"); assert.equal(call.customerName, "Marie Test"); assert.equal(call.incomingReceived, true);
    await real.recordCallback("sip", { AccountSid: sid, CallSid: "CAchild", CallStatus: "no-answer" }, A, "CAtest");
    await real.recordCallback("action", { AccountSid: sid, DialCallStatus: "no-answer" }, A, "CAtest");
    assert.equal(real.serialize(call).status, "missed");
    assert.ok(events.some(value => value.includes("callsense_updated")));
    assert.deepEqual(pushes.slice(before).map(push => push.type), ["callsense_incoming", "callsense_missed"]);
  } finally { sse._removeClient(A, listener); Call.findOneAndUpdate = old.update; Customer.find = old.customer; Restaurant.findById = old.restaurant; }
});

test("push entrant et manqué dédupliqués et aucune alerte manquée après décrochage", async () => {
  const real = require("../../services/callsense/callsense.service");
  const records = new Map([
    ["a", { _id: "a", restaurantId: A, phase: 0 }],
    ["b", { _id: "b", restaurantId: A, phase: 3, outcome: "no-answer", sipFinalStatus: "no-answer" }],
    ["c", { _id: "c", restaurantId: A, phase: 2, outcome: "no-answer", sipFinalStatus: "no-answer" }],
    ["d", { _id: "d", restaurantId: A, phase: 2, outcome: "no-answer", sipFinalStatus: "no-answer", sipResponseCode: "603" }],
    ["e", { _id: "e", restaurantId: A, phase: 2, outcome: "no-answer", sipFinalStatus: "completed" }],
  ]);
  Call.findOneAndUpdate = (filter, update) => ({ lean: async () => {
    const doc = records.get(filter._id);
    if (!doc || doc.phase >= 3 || (filter.outcome?.$exists === false && doc.outcome !== undefined) ||
      (filter.outcome === "no-answer" && doc.outcome !== "no-answer") ||
      (filter.sipFinalStatus && doc.sipFinalStatus !== filter.sipFinalStatus) ||
      (filter.sipResponseCode && doc.sipResponseCode === "603") ||
      (filter.pushClaimed && doc.pushClaimed) || (filter.missedPushClaimed && doc.missedPushClaimed)) return null;
    Object.assign(doc, update.$set);
    return doc;
  } });
  const before = pushes.length;
  await real.notify(records.get("a"));
  await real.notify(records.get("a"));
  await real.notify(records.get("b"), "missed");
  await real.notify(records.get("c"), "missed");
  await real.notify(records.get("c"), "missed");
  await real.notify(records.get("d"), "missed");
  await real.notify(records.get("e"), "missed");
  const sent = pushes.slice(before);
  assert.deepEqual(sent.map((entry) => entry.type), ["callsense_incoming", "callsense_missed"]);
  assert.ok(sent.every((entry) => entry.module === "reservations"));
  assert.equal(sent[1].title, "Appel manqué — Gusto CallSense");
});

test("pagination par curseur limitée au restaurant et sans doublon", async () => {
  const router = require("../../routes/callsense.routes");
  const route = router.stack.find((layer) => layer.route?.path === "/restaurants/:restaurantId/callsense/calls");
  const handler = route.route.stack.at(-1).handle;
  const docs = Array.from({ length: 14 }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, "0"), restaurantId: A, callSid: `CA${i}`, createdAt: new Date(1700000000000 - i * 1000), updatedAt: new Date() }));
  const filters = [];
  Call.find = (filter) => {
    filters.push(filter);
    let count;
    return { sort: () => ({ limit: (limit) => { count = limit; return { lean: async () => docs.filter((doc) => !filter.$or || doc.createdAt < filter.$or[0].createdAt.$lt).slice(0, count) }; } }) };
  };
  Config.exists = async () => true;
  async function request(cursor) {
    const req = { user: { role: "owner" }, authorizedRestaurant: {}, params: { restaurantId: A }, query: cursor ? { cursor } : {} };
    const res = { json(data) { this.data = data; return this; }, sendStatus(code) { this.status = code; return this; } };
    await handler(req, res);
    return res.data;
  }
  const first = await request();
  const second = await request(first.nextCursor);
  assert.equal(first.calls.length, 10);
  assert.equal(second.calls.length, 4);
  assert.equal(new Set([...first.calls, ...second.calls].map((call) => call.id)).size, 14);
  assert.ok(filters.every((filter) => filter.restaurantId === A));
});

test("l'API expose séparément le mode test et l'activation commerciale", async () => {
  const router = require("../../routes/callsense.routes");
  const handler = router.stack.find(layer => layer.route?.path === "/restaurants/:restaurantId/callsense/calls").route.stack.at(-1).handle;
  const old = { find: Call.find, exists: Config.exists };
  Call.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  const filters = [];
  Config.exists = async filter => { filters.push(filter); return filter.enabled === false && filter.managedByOnboarding === true && filter.provisioningStatus === "ready_for_test"; };
  const res = { json(value) { this.value = value; return this; }, sendStatus(code) { this.code = code; return this; } };
  try {
    await handler({ params: { restaurantId: A }, query: {} }, res);
    assert.equal(res.value.enabled, false); assert.equal(res.value.testMode, true);
    assert.ok(filters.every(filter => filter.restaurantId === A));
  } finally { Call.find = old.find; Config.exists = old.exists; }
});

test("lecture des appels manqués ou occupés isolée par restaurant", async () => {
  const router = require("../../routes/callsense.routes");
  const get = router.stack.find((layer) => layer.route?.path === "/restaurants/:restaurantId/callsense/unread-missed-count").route.stack;
  const post = router.stack.find((layer) => layer.route?.path === "/restaurants/:restaurantId/callsense/read-missed").route.stack;
  const docs = [
    { _id: "000000000000000000000001", restaurantId: A, outcome: "no-answer", phase: 2, missedReadAt: null },
    { _id: "000000000000000000000002", restaurantId: A, outcome: "busy", phase: 2, missedReadAt: null },
    { _id: "000000000000000000000003", restaurantId: A, outcome: "no-answer", phase: 3, missedReadAt: null },
    { _id: "000000000000000000000004", restaurantId: A, outcome: "completed", phase: 3, missedReadAt: null },
    { _id: "000000000000000000000005", restaurantId: A, outcome: "no-answer", phase: 2, missedReadAt: new Date() },
    { _id: "000000000000000000000006", restaurantId: B, outcome: "busy", phase: 2, missedReadAt: null },
    { _id: "000000000000000000000007", restaurantId: A, outcome: "busy", phase: 2, missedReadAt: null, updatedAt: new Date(Date.now() + 60000) },
  ];
  const matches = (doc, filter) => String(doc.restaurantId) === String(filter.restaurantId) && filter.outcome.$in.includes(doc.outcome) &&
    !(doc.phase >= filter.phase.$not.$gte) && (!("missedReadAt" in filter) || doc.missedReadAt == null) &&
    (!filter._id || String(doc._id) === String(filter._id)) &&
    (!filter.$or || !doc.updatedAt || doc.updatedAt <= filter.$or[0].updatedAt.$lte);
  Call.countDocuments = async (filter) => docs.filter((doc) => matches(doc, filter)).length;
  Call.updateMany = async (filter, update, options) => {
    assert.equal(options.timestamps, false);
    const found = docs.filter((item) => matches(item, filter));
    for (const doc of found) doc.missedReadAt = update.$set.missedReadAt;
    return { modifiedCount: found.length };
  };
  const eventsA = [], eventsB = [];
  const clientA = { locals: { gustoEventModules: { callsense: true } }, write: (data) => eventsA.push(data) };
  const clientB = { locals: { gustoEventModules: { callsense: true } }, write: (data) => eventsB.push(data) };
  sse._addClient(A, clientA); sse._addClient(B, clientB);
  const response = () => ({ json(value) { this.value = value; return this; }, sendStatus(code) { this.status = code; return this; } });
  const req = { params: { restaurantId: A }, user: { role: "owner" }, authorizedRestaurant: {} };
  try {
    let res = response(); await get.at(-1).handle(req, res); assert.equal(res.value.count, 3);
    res = response(); await post.at(-1).handle(req, res); assert.equal(res.value.ok, true); assert.equal(res.value.modifiedCount, 2);
    res = response(); await get.at(-1).handle(req, res); assert.equal(res.value.count, 1);
    assert.equal(docs[5].missedReadAt, null);
    assert.equal(docs[6].missedReadAt, null);
    assert.equal(eventsA.length, 1); assert.equal(eventsB.length, 0);
    let passed = false;
    res = response();
    await get.at(-2).handle({ user: { role: "employee" }, authorizedRestaurant: { options: { customers: false } } }, res, () => { passed = true; });
    assert.equal(res.status, 403); assert.equal(passed, false);
  } finally { sse._removeClient(A, clientA); sse._removeClient(B, clientB); }
});

test("consommation accessible uniquement pour une configuration active du restaurant", async () => {
  const router = require("../../routes/callsense.routes");
  const handlers = router.stack.find((layer) => layer.route?.path === "/restaurants/:restaurantId/callsense/usage").route.stack;
  assert.equal(handlers.length, 4);
  const usagePath = require.resolve("../../services/callsense/callsense-usage.service");
  const original = require.cache[usagePath];
  const oldFind = Config.findOne;
  let selected;
  require.cache[usagePath] = { id: usagePath, filename: usagePath, loaded: true, exports: { getTelephoneStats: async () => ({ received: 1 }), getCurrentUsage: async (id) => { selected = id; return { available: false }; } } };
  Config.findOne = (filter) => ({ select: () => ({ lean: async () => filter.restaurantId === A ? { enabled: true, twilioNumber: "+33123456789" } : null }) });
  const res = () => ({ json(value) { this.value = value; return this; }, status(code) { this.code = code; return this; } });
  try {
    let response = res(); await handlers.at(-1).handle({ params: { restaurantId: A } }, response);
    assert.equal(response.value.enabled, true); assert.equal(response.value.telephone.received, 1); assert.equal(selected, A);
    response = res(); await handlers.at(-1).handle({ params: { restaurantId: B } }, response);
    assert.equal(response.value.enabled, false); assert.equal(selected, A);
    require.cache[usagePath].exports.getCurrentUsage = async () => { throw new Error("Stripe unavailable"); };
    response = res(); await handlers.at(-1).handle({ params: { restaurantId: A } }, response);
    assert.equal(response.value.enabled, true); assert.equal(response.value.usage.available, false);
  } finally { Config.findOne = oldFind; if (original) require.cache[usagePath] = original; else delete require.cache[usagePath]; }
});

test("classement d'une anomalie limité au restaurant et interdit sans confirmation", async () => {
  const router = require("../../routes/callsense.routes");
  const route = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense/reconciliation/anomalies/:callSid/dismiss").route.stack;
  assert.equal(route.length, 3);
  const original = Config.updateOne; let filter;
  Config.updateOne = async (query) => { filter = query; return { modifiedCount: 1 }; };
  const response = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const req = { params: { restaurantId: A, callSid: `CA${"a".repeat(32)}` }, body: {}, user: { id: "admin" } };
  try {
    let res = response(); await route.at(-1).handle(req, res); assert.equal(res.code, 400); assert.equal(filter, undefined);
    res = response(); await route.at(-1).handle({ ...req, body: { acknowledgement: "JE CONFIRME LA VERIFICATION" } }, res);
    assert.equal(res.value.ok, true); assert.equal(filter.restaurantId, A); assert.equal(filter["reconciliation.anomalies.callSid"], req.params.callSid);
  } finally { Config.updateOne = original; }
});

test("confirmation d'un envoi expiré seulement après rapprochement isolant l'événement", async () => {
  const router = require("../../routes/callsense.routes");
  const handlers = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense/metering/:callId/confirm-reported").route.stack;
  assert.equal(handlers.length, 3);
  const Consumption = require("../../models/callsense/callsense-consumption.model");
  const servicePath = require.resolve("../../services/callsense/callsense-metering.service");
  const original = require.cache[servicePath];
  const oldFind = Consumption.findOne; const oldUpdate = Consumption.updateOne;
  const oldConfigUpdate = Config.updateOne; const oldCallUpdate = Call.updateOne;
  const id = "cccccccccccccccccccccccc";
  const entry = { _id: id, state: "review", lastError: "delai_idempotence_depasse", occurredAt: new Date("2026-01-01T12:00:00Z"), minutes: 3 };
  let writes = 0;
  let stripeMinutes = 13;
  process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { reconcilePeriod: async () => ({ available: true, pending: 1, from: new Date("2026-01-01"), until: new Date("2026-02-01"), stripeMinutes, reportedMinutes: 10 }) } };
  Consumption.findOne = (query) => ({ lean: async () => query.restaurantId === A && query.callId === id ? entry : null });
  Consumption.updateOne = async () => { writes += 1; return { modifiedCount: 1 }; };
  Config.updateOne = async () => {}; Call.updateOne = async () => {};
  const res = () => ({ sendStatus(code) { this.code = code; return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const req = { params: { restaurantId: A, callId: id }, body: { acknowledgement: "JE CONFIRME EVENEMENT STRIPE" }, user: { role: "admin" } };
  try {
    let response = res(); await handlers.at(-1).handle(req, response);
    assert.equal(response.value.ok, true); assert.equal(writes, 1);
    stripeMinutes = 14; response = res(); await handlers.at(-1).handle(req, response);
    assert.equal(response.code, 409); assert.equal(writes, 1);
    response = res(); await handlers.at(-1).handle({ ...req, params: { restaurantId: B, callId: id } }, response);
    assert.equal(response.code, 409); assert.equal(writes, 1);
  } finally {
    Consumption.findOne = oldFind; Consumption.updateOne = oldUpdate; Config.updateOne = oldConfigUpdate; Call.updateOne = oldCallUpdate;
    if (original) require.cache[servicePath] = original; else delete require.cache[servicePath];
  }
});
