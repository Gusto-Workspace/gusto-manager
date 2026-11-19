const assert = require("node:assert/strict");
const { createHmac, generateKeyPairSync, privateDecrypt, randomUUID, sign } = require("node:crypto");
const { test } = require("node:test");
const { inflateSync } = require("node:zlib");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "clock-synthetic-test-dashboard-secret";
process.env.TIME_CLOCK_SECRET = "clock-synthetic-test-private-secret";

const { TimeClockPin, TimeClockDevice, TimeClockPinAudit } = require("../../models/time-clock-device.model");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const Owner = require("../../models/owner.model");
const Session = require("../../models/time-clock-session.model");
const Absence = require("../../models/time-clock-absence.model");
const router = require("../../routes/time-clock.routes");
const { buildRegisterRows, buildRegisterHistory } = require("../../services/employees/time-clock-register.service");
const { payrollDays } = require("../../services/employees/time-clock-payroll.service");
const { getRangeBounds, toLocalDateKey } = require("../../services/employees/time-clock.service");
const { provisionInitialClockPin, withClockPinTransaction } = require("../../services/employees/time-clock-pin.service");
const { runPinBackfill } = require("../../services/employees/time-clock-pin-backfill.service");
const {
  isPersonalPin, issuePunchGrant, lookupPin, offlinePinTag, readPunchGrant,
  sealPin, validDevicePublicKeys, verifyPunchProof, wrapDevicePinKey,
} = require("../../services/employees/time-clock-device.service");

function tabletKeys() {
  const signing = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const wrapping = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    signing, wrapping,
    signingKey: signing.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    wrappingKey: wrapping.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
  };
}

function signedPunch(restaurant, privateKey, employeeId, grant, action, occurredAt) {
  const payload = {
    employeeId, grant, action, occurredAt: occurredAt.toISOString(), businessDate: toLocalDateKey(occurredAt),
    clientMutationId: randomUUID(),
    signature: { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }] }] },
  };
  const fields = JSON.stringify([
    String(restaurant), payload.employeeId, payload.action, payload.businessDate,
    payload.occurredAt, payload.clientMutationId, payload.grant, payload.signature.strokes,
  ]);
  payload.proof = sign("sha256", Buffer.from(fields), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return payload;
}

test("four-digit PINs, tenant blind indexes, randomized encryption and device-bound offline verifiers", () => {
  assert.ok(isPersonalPin("0123"));
  for (const invalid of [1234, "123", "12345", "１２３４", " 1234", "123\n"]) assert.equal(isPersonalPin(invalid), false);
  const values = { restaurant: "restaurant-1", employee: "employee-1", pin: "0123", profile: "profile-1", changedBy: "manager" };
  const first = sealPin(values);
  assert.equal(first.lookup, sealPin(values).lookup);
  assert.notEqual(first.sealedPin, sealPin(values).sealedPin);
  assert.notEqual(first.revision, sealPin(values).revision);
  assert.notEqual(first.lookup, lookupPin("restaurant-2", values.pin));
  const keys = tabletKeys();
  assert.ok(validDevicePublicKeys(keys.signingKey, keys.wrappingKey));
  assert.equal(validDevicePublicKeys(keys.wrappingKey, keys.signingKey), false);
  const device = { _id: "tablet-a", wrappingKey: keys.wrappingKey };
  const rawKey = privateDecrypt({ key: keys.wrapping.privateKey, oaepHash: "sha256" }, Buffer.from(wrapDevicePinKey(device), "base64url"));
  const stored = { ...first, restaurant: values.restaurant, employee: values.employee };
  assert.equal(offlinePinTag(device, stored), createHmac("sha256", rawKey).update("0123").digest("base64url"));
  assert.notEqual(offlinePinTag(device, stored), offlinePinTag({ ...device, _id: "tablet-b" }, stored));
  assert.throws(() => offlinePinTag(device, { ...stored, employee: "other" }));
});

test("punch authorization binds the restaurant, employee, device, validity interval and signed payload", () => {
  const keys = tabletKeys();
  const device = { _id: "device", restaurant: "restaurant", signingKey: keys.signingKey };
  const now = new Date("2026-11-19T09:00:00.000Z");
  const credential = { employee: "employee", revision: randomUUID() };
  const grant = issuePunchGrant(device, credential, now, true);
  const punch = signedPunch(device.restaurant, keys.signing.privateKey, credential.employee, grant, "clock_in", now);
  assert.ok(verifyPunchProof(device, punch));
  assert.equal(verifyPunchProof(device, { ...punch, action: "clock_out" }), false);
  assert.equal(verifyPunchProof(device, { ...punch, signature: { strokes: [] } }), false);
  assert.equal(readPunchGrant(device, punch, now).revision, credential.revision);
  assert.equal(readPunchGrant({ ...device, restaurant: "different" }, punch, now), null);
  assert.equal(readPunchGrant({ ...device, _id: "another" }, punch, now), null);
  assert.equal(readPunchGrant(device, { ...punch, employeeId: "different" }, now), null);
  assert.equal(readPunchGrant(device, punch, new Date(+now + 15 * 86_400_000)), null);
  const onlineGrant = issuePunchGrant(device, credential, now, false);
  assert.equal(readPunchGrant(device, { ...punch, grant: onlineGrant, occurredAt: new Date(+now + 121_000).toISOString() }, new Date(+now + 121_000)), null);
});

test("register keeps planning, measured pauses, overnight hours and history distinct", () => {
  const restaurantId = "restaurant";
  const startDate = "2026-10-24";
  const endDate = "2026-10-25";
  const clockInAt = new Date("2026-10-24T20:00:00.000Z");
  const clockOutAt = new Date("2026-10-25T03:00:00.000Z");
  const edits = new Date("2026-10-25T10:00:00.000Z");
  const employees = [{ _id: "staff", firstname: "A", restaurantProfiles: [
    { restaurant: "other", shifts: [{ _id: "other", start: clockInAt, end: clockOutAt }] },
    { restaurant: restaurantId, shifts: [
      { _id: "planned", start: clockInAt, end: clockOutAt, breakMinutes: 45, notes: "Note du planning fictive" },
      { _id: "legacy-leave", title: "Congés", start: new Date("2026-10-23T22:00Z"), end: new Date("2026-10-25T23:00Z") },
    ] },
  ] }];
  const sessions = [{
    _id: "session", employee: "staff", status: "closed", clockInAt, clockOutAt, businessDate: startDate,
    breaks: [{ _id: "break", startAt: new Date("2026-10-25T01:00:00.000Z"), endAt: new Date("2026-10-25T01:30:00.000Z") }],
    adjustments: [{ _id: "adjustment", editedAt: edits, editedById: "manager", reason: "Motif fictif" }],
    events: [{ _id: "event", type: "clock_in", at: clockInAt, signature: { hasSignature: true, strokes: [] } }],
    reviews: [{ _id: "review", type: "validated", at: edits, actorId: "manager" }],
  }];
  const [row] = buildRegisterRows({ employees, sessions, restaurantId, startDate, endDate });
  assert.deepEqual(row.days.map((day) => day.plannedMinutes), [375, 0]);
  assert.deepEqual(row.days.map((day) => day.workedMinutes), [120, 270]);
  assert.deepEqual(row.days.map((day) => day.breakMinutes), [0, 30]);
  assert.deepEqual(row.days.map((day) => day.payroll[0].timings.workedMinutes), [120, 270]);
  assert.ok(row.days.every((day) => !day.payroll[0].manual));
  assert.equal(row.days[0].shifts.find((shift) => shift.id === "planned").note.text, "Note du planning fictive");
  assert.equal(row.days[0].sessions[0].note.text, "Motif fictif");
  assert.deepEqual(row.days[1].payroll[0].note, row.days[0].sessions[0].note);
  assert.deepEqual(row.days.map((day) => day.shifts.filter((shift) => shift.absence).length), [1, 1]);
  assert.equal(getRangeBounds(endDate, endDate).endExclusive - getRangeBounds(endDate, endDate).start, 25 * 3_600_000);
  const history = buildRegisterHistory({ employees, sessions, restaurantId, ...getRangeBounds(startDate, endDate) });
  assert.deepEqual(history.map((entry) => entry.type), ["validated", "adjustment", "clock_in"]);
  assert.ok(history.every((entry) => !("signature" in entry)));
  assert.ok(history.every((entry) => entry.sessionDate === startDate));

  const manual = {
    clockInAt: new Date("2026-10-24T21:30Z"), clockOutAt,
    breaks: [{ startAt: new Date("2026-10-24T21:45Z"), endAt: new Date("2026-10-24T22:15Z") }],
  };
  const [corrected] = buildRegisterRows({
    employees, restaurantId, startDate, endDate, sessions: [
      { ...sessions[0], payroll: manual },
      { _id: "second", employee: "staff", status: "closed", clockInAt: new Date("2026-10-25T09:00Z"), clockOutAt: new Date("2026-10-25T10:00Z") },
      { _id: "open", employee: "staff", status: "open", clockInAt: new Date("2026-10-25T11:00Z") },
    ],
  });
  assert.deepEqual(corrected.days.map((day) => day.payroll.map(({ id, manual: edited, timings }) =>
    [id, edited, timings.workedMinutes, timings.breakMinutes])), [
    [["session", true, 15, 15]],
    [["session", true, 285, 15], ["second", false, 60, 0]],
  ]);
});

test("a paid break entered in the grid is deducted without a corresponding punch", () => {
  const date = "2026-11-19";
  const clockInAt = new Date(`${date}T08:00+01:00`);
  const clockOutAt = new Date(`${date}T12:00+01:00`);
  const session = { _id: "session", status: "closed", clockInAt, clockOutAt, breaks: [] };
  assert.equal(payrollDays([session], date, date).get(date)[0].timings.workedMinutes, 240);
  const corrected = {
    ...session,
    payroll: { clockInAt, clockOutAt, breaks: [], pauseMinutesByDay: [{ date, minutes: 30 }] },
  };
  const [item] = payrollDays([corrected], date, date).get(date);
  assert.equal(item.timings.breakMinutes, 30);
  assert.equal(item.timings.workedMinutes, 210);
  assert.deepEqual(corrected.breaks, []);
});

test("payroll uses the planned break as a fallback and deducts it once across midnight", () => {
  const from = "2026-11-19";
  const to = "2026-11-20";
  const clockInAt = new Date(`${from}T23:50+01:00`);
  const clockOutAt = new Date(`${to}T01:00+01:00`);
  const overnight = { _id: "overnight", status: "closed", clockInAt, clockOutAt, breaks: [], plannedBreakMinutes: 30 };
  const calculated = payrollDays([overnight], from, to);
  assert.deepEqual([...calculated.values()].map(([item]) => [item.timings.breakMinutes, item.timings.workedMinutes]), [[10, 0], [20, 40]]);
  const withPunch = {
    ...overnight,
    breaks: [{ startAt: new Date(`${to}T00:30+01:00`), endAt: new Date(`${to}T00:45+01:00`) }],
  };
  assert.deepEqual([...payrollDays([withPunch], from, to).values()].map(([item]) => item.timings.breakMinutes), [0, 15]);
  const withLegacyOverride = { ...overnight, payroll: { clockInAt, clockOutAt, breaks: [] } };
  assert.deepEqual([...payrollDays([withLegacyOverride], from, to).values()].map(([item]) => item.timings.breakMinutes), [0, 0]);
});

test("the register exposes meal counts per planned and recorded service", () => {
  const restaurantId = "restaurant";
  const date = "2026-11-19";
  const at = (time) => new Date(`${date}T${time}+01:00`);
  const openingHours = Array.from({ length: 7 }, (_, index) => ({
    hours: index === 3 ? [{ open: "11:00", close: "14:30" }] : [],
  }));
  const [row] = buildRegisterRows({
    restaurantId, startDate: date, endDate: date, openingHours,
    employees: [{ _id: "staff", restaurantProfiles: [{ restaurant: restaurantId, shifts: [
      { _id: "morning", start: at("08:00"), end: at("10:00") },
      { _id: "lunch", start: at("11:05"), end: at("11:55") },
      { _id: "saved", start: at("18:00"), end: at("23:00"), mealCount: 2, mealPeriods: ["lunch", "dinner"] },
      { _id: "leave", start: at("19:00"), end: at("22:00"), isLeave: true },
    ] }] }],
    sessions: [
      { _id: "early", employee: "staff", businessDate: date, status: "closed", clockInAt: at("08:05"), clockOutAt: at("10:10") },
      { _id: "recorded", employee: "staff", businessDate: date, status: "closed", clockInAt: at("11:15"), clockOutAt: at("11:55") },
    ],
  });
  assert.deepEqual(row.days[0].shifts.map(({ mealCount }) => mealCount), [0, 1, 2, undefined]);
  assert.deepEqual(row.days[0].sessions.map(({ mealCount }) => mealCount), [0, 1]);
  assert.equal(row.days[0].mealCount, 1);
});

function readPdfText(buffer) {
  return [...buffer.toString("latin1").matchAll(/stream\r?\n(.*?)\r?\nendstream/gs)].flatMap((match) => {
    let stream;
    try { stream = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"); } catch { return []; }
    return [...stream.matchAll(/\[(.*?)\]\s*TJ/g)].map((line) =>
      [...line[1].matchAll(/<([0-9a-f]+)>/gi)].map((part) => Buffer.from(part[1], "hex").toString("latin1")).join(""),
    );
  }).join("\n");
}

const testUri = process.env.GUSTO_CLOCK_TEST_MONGO_URI;
test("Pointeuse endpoints on an isolated loopback MongoDB database", {
  skip: testUri ? false : "Set GUSTO_CLOCK_TEST_MONGO_URI to a dedicated loopback replica set",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.username, "");
  assert.equal(uri.password, "");
  assert.equal(uri.pathname, "/");
  const { ObjectId } = mongoose.Types;
  const dbName = `gusto_pointeuse9_${new ObjectId()}`;
  await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 4000 });
  t.after(async () => {
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  await Promise.all([TimeClockDevice.init(), TimeClockPin.init(), TimeClockPinAudit.init(), Session.init(), Absence.init()]);

  const [restaurant, other, owner, alice, bob, outside, accountant] = Array.from({ length: 7 }, () => new ObjectId());
  const member = (id, firstname, restaurants, accountType = "employee") => ({
    _id: id, firstname, lastname: "Fictif", accountType, restaurants,
    restaurantProfiles: restaurants.map((restaurantId) => ({ _id: new ObjectId(), restaurant: restaurantId })),
  });
  await Promise.all([
    Owner.collection.insertOne({ _id: owner, firstname: "Gérant" }),
    Restaurant.collection.insertMany([
      { _id: restaurant, owner_id: owner, name: "Restaurant fictif", employees: [alice, bob, accountant], options: { employees: true } },
      { _id: other, owner_id: owner, name: "Autre site fictif", employees: [alice, outside], options: { employees: true } },
    ]),
    Employee.collection.insertMany([
      member(alice, "Alice", [restaurant, other]), member(bob, "Bob", [restaurant]),
      member(outside, "Charlie", [other]), member(accountant, "Comptable", [restaurant], "accountant"),
    ]),
  ]);
  const auth = (id, role, at = restaurant) => "Bearer " + jwt.sign({ id: String(id), role, restaurantId: String(at) }, process.env.JWT_SECRET);
  const manager = auth(owner, "owner");
  const base = "/restaurants/:restaurantId/time-clock";
  const deviceBase = "/time-clock/device";
  async function call(method, path, { body, query = {}, authorization = manager, restaurantId = restaurant, ...ids } = {}) {
    const handlers = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack;
    const result = { status: 200, headers: {} };
    const request = { body, query, params: { restaurantId: String(restaurantId), ...ids }, headers: { authorization },
      get(name) { return this.headers[name.toLowerCase()]; } };
    const response = {
      status(value) { result.status = value; return this; },
      set(key, value) { result.headers[key] = value; return this; },
      setHeader(key, value) { result.headers[key] = value; return this; },
      json(value) { result.data = value; return this; },
      send(value) { result.data = value; return this; },
      end() { return this; },
    };
    let index = 0;
    const next = (error) => { if (error) throw error; return handlers[index++].handle(request, response, next); };
    await next();
    return result;
  }
  const pinPath = base + "/me/pin";
  const reveal = (employee, restaurantId = restaurant) => call("get", pinPath, {
    authorization: auth(employee, "employee", restaurantId), query: { reveal: "true" }, restaurantId,
  });
  const regenerate = (employee, body) => call("post", pinPath + "/regenerate", {
    authorization: auth(employee, "employee"), body,
  });
  const initialProfile = (await Employee.findById(alice).lean()).restaurantProfiles[0];
  await TimeClockPin.create({
    restaurant, employee: alice, ...sealPin({
      restaurant, employee: alice, profile: String(initialProfile._id), pin: "0042", changedBy: String(owner),
    }),
  });
  const storedPin = await TimeClockPin.findOne({ restaurant, employee: alice }).lean();
  assert.equal(storedPin.lastRotatedAt, undefined);
  const statusPath = base + "/employees/:employeeId/pin";
  const pinStatus = await call("get", statusPath, { employeeId: String(alice), query: { reveal: "true" } });
  assert.deepEqual(pinStatus.data, { configured: true });
  assert.equal(pinStatus.headers["Cache-Control"], "private, no-store");
  assert.deepEqual((await call("get", statusPath, { employeeId: String(alice), restaurantId: other })).data, { configured: false });
  assert.equal((await call("get", statusPath, { employeeId: String(outside) })).status, 404);
  assert.equal((await call("get", statusPath, { employeeId: String(accountant) })).status, 404);
  assert.equal((await call("get", statusPath, { employeeId: String(alice), authorization: auth(alice, "employee") })).status, 403);
  assert.equal((await call("get", statusPath, { employeeId: String(alice), authorization: auth(accountant, "accountant") })).status, 403);
  const ownerPinPath = statusPath + "/reveal";
  const revealAsOwner = (employee, options) => call("get", ownerPinPath, { employeeId: String(employee), ...options });
  const ownerView = await revealAsOwner(alice);
  assert.deepEqual(ownerView.data, { configured: true, pin: "0042" });
  assert.equal(ownerView.headers["Cache-Control"], "private, no-store");
  assert.deepEqual((await revealAsOwner(bob)).data, { configured: false });
  assert.equal((await revealAsOwner(alice, { authorization: auth(alice, "employee") })).status, 403);
  assert.equal((await revealAsOwner(alice, { authorization: auth(accountant, "accountant") })).status, 403);
  const support = "Bearer " + jwt.sign({
    id: String(owner), role: "owner", superAdmin: true, authMethod: "super_admin", superAdminSessionId: randomUUID(),
  }, process.env.JWT_SECRET);
  assert.equal((await revealAsOwner(alice, { authorization: support })).status, 403);
  assert.equal((await revealAsOwner(outside)).status, 404);
  assert.deepEqual((await revealAsOwner(alice, { restaurantId: other })).data, { configured: false });
  const unrelatedOwner = await Owner.collection.insertOne({ firstname: "Autre propriétaire fictif" });
  assert.equal((await revealAsOwner(alice, { authorization: auth(unrelatedOwner.insertedId, "owner") })).status, 403);
  const viewed = await TimeClockPinAudit.find({ action: "viewed" }).lean();
  assert.equal(viewed.length, 1);
  assert.equal(String(viewed[0].actor), String(owner));
  assert.equal(String(viewed[0].employee), String(alice));
  assert.doesNotMatch(JSON.stringify(viewed), /"0042"|sealedPin|lookup|revision/);
  const self = await call("get", pinPath, { authorization: auth(alice, "employee") });
  assert.deepEqual(self.data, { configured: true });
  const revealed = await reveal(alice);
  const alicePin = revealed.data.pin;
  assert.match(alicePin, /^\d{4}$/);
  assert.notEqual(storedPin.sealedPin, alicePin);
  assert.equal(revealed.headers["Cache-Control"], "private, no-store");
  // A PIN provisioned by the previous version can already be used and revealed.
  await TimeClockPin.collection.updateOne({ _id: storedPin._id }, { $set: { initial: true } });
  assert.equal((await reveal(alice)).data.pin, alicePin);
  assert.equal((await call("get", pinPath, { query: { reveal: "true" } })).status, 403);
  assert.equal((await call("get", pinPath, {
    authorization: auth(alice, "employee"), restaurantId: other, query: { reveal: "true" },
  })).status, 403);
  assert.equal((await regenerate(alice, { pin: "0123" })).status, 400);
  assert.equal((await regenerate(outside)).status, 403);
  assert.equal((await regenerate(accountant)).status, 403);
  assert.deepEqual((await reveal(bob)).data, { configured: false });
  const bobProfile = (await Employee.findById(bob).lean()).restaurantProfiles[0]._id;
  await assert.rejects(TimeClockPin.create({
    restaurant, employee: bob, ...sealPin({ restaurant, employee: bob, profile: String(bobProfile), pin: alicePin, changedBy: String(owner) }),
  }), { code: 11000 });
  const otherProfile = (await Employee.findById(alice).lean()).restaurantProfiles[1]._id;
  await TimeClockPin.create({
    restaurant: other, employee: alice,
    ...sealPin({ restaurant: other, employee: alice, profile: String(otherProfile), pin: alicePin, changedBy: String(owner) }),
  });
  assert.equal((await reveal(alice, other)).data.pin, alicePin);
  assert.deepEqual((await regenerate(bob)).data, { configured: true });
  const bobPin = (await reveal(bob)).data.pin;
  assert.notEqual(bobPin, alicePin);
  const listing = await call("get", base + "/devices");
  assert.deepEqual(listing.data, { devices: [] });
  assert.equal((await call("get", base + "/devices", { authorization: auth(bob, "employee") })).status, 403);
  assert.equal((await call("get", base + "/devices", { authorization: auth(accountant, "accountant") })).status, 403);

  const keys = tabletKeys();
  const { data: { code } } = await call("post", base + "/devices", { body: { name: "Tablette fictive" } });
  const pair = { body: { code, signingKey: keys.signingKey, wrappingKey: keys.wrappingKey } };
  const { status, data: paired } = await call("post", deviceBase + "/pair", pair);
  assert.equal(status, 201);
  assert.equal((await call("post", deviceBase + "/pair", pair)).status, 404);
  const authorization = `Device ${paired.id}.${paired.token}`;
  const vault = await call("post", deviceBase + "/vault", { authorization });
  assert.equal(vault.data.entries.length, 2);
  assert.equal(vault.headers["Cache-Control"], "no-store");
  assert.ok(vault.data.entries.every((entry) => Object.keys(entry).sort().join(",") === "grant,kiosk,tag" &&
    !("email" in entry.kiosk.employee)));
  const online = await call("post", deviceBase + "/identify", { authorization, body: { pin: alicePin } });
  assert.equal(online.data.kiosk.employee.id, String(alice));
  const offline = vault.data.entries.find((entry) => entry.kiosk.employee.id === String(alice));
  const punch = (payload, restaurantId = restaurant) => call("post", base + "/punch", { body: payload, authorization, restaurantId });
  const anchor = Date.now() - 45_000;
  const actions = ["clock_in", "break_start", "break_end", "clock_out"].map((action, index) =>
    signedPunch(restaurant, keys.signing.privateKey, String(alice), offline.grant, action, new Date(anchor + index * 10_000)));
  assert.equal((await punch(actions[0], other)).status, 401);
  assert.equal((await punch({ ...actions[0], employeeId: String(bob) })).status, 422);
  const duplicate = await Promise.all([punch(actions[0]), punch(actions[0])]);
  assert.ok(duplicate.some((response) => response.status === 201));
  assert.ok(duplicate.every((response) => [200, 201, 503].includes(response.status)));
  assert.equal((await punch(actions[0])).data.idempotentReplay, true);
  for (const action of actions.slice(1)) assert.equal((await punch(action)).status, 200);
  const stored = await Session.findOne({ restaurant, employee: alice }).lean();
  assert.equal(stored.events.length, 4);
  assert.equal(stored.breaks.length, 1);
  assert.equal(stored.status, "closed");
  assert.ok(stored.events.every((event) => event.signature.hasSignature && event.receivedAt));
  const day = toLocalDateKey(new Date());
  const register = await call("get", base + "/register", { query: { from: day, to: day } });
  const row = register.data.rows.find((item) => item.employee.id === String(alice));
  assert.equal(register.data.roster.length, 2);
  assert.equal(row.days[0].sessions[0].breaks.length, 1);
  const reportSession = row.days[0].sessions[0];
  const sessionId = reportSession.id;
  const sessionEvents = base + "/sessions/:sessionId/events";
  const events = await call("get", sessionEvents, { sessionId });
  assert.equal(events.headers["Cache-Control"], "no-store");
  assert.equal(events.data.events.length, 4);
  assert.ok(events.data.events.every((event) => event.signature?.strokes.length && !("deviceProof" in event)));
  assert.equal((await call("get", sessionEvents, { sessionId, restaurantId: other })).status, 404);
  assert.equal((await call("get", sessionEvents, { sessionId, authorization: auth(bob, "employee") })).status, 403);
  assert.equal((await call("put", base + "/sessions/:sessionId/review", {
    sessionId, body: { validated: true, expectedUpdatedAt: new Date(reportSession.updatedAt).toISOString() },
  })).status, 200);
  const reviewed = await Session.findById(sessionId).lean();
  assert.equal((await call("patch", base + "/sessions/:sessionId", {
    sessionId, body: {
      clockInAt: stored.clockInAt, clockOutAt: stored.clockOutAt,
      expectedUpdatedAt: reviewed.updatedAt.toISOString(), reason: "Motif fictif",
    },
  })).status, 200);
  const history = await call("get", base + "/register", { query: { from: day, to: day, view: "history" } });
  assert.deepEqual(new Set(history.data.history.map((event) => event.type)), new Set([
    "clock_in", "break_start", "break_end", "clock_out", "adjustment", "validated", "reopened",
  ]));
  assert.equal(history.data.history.find((event) => event.type === "adjustment").actorName, "Gérant");
  assert.equal(await Session.countDocuments({ restaurant, employee: alice }), 1);

  const afterActualEdit = await Session.findById(sessionId).lean();
  const revisionOf = (item) => ({ expectedRevision: item.__v, expectedUpdatedAt: item.updatedAt.toISOString() });
  await call("put", base + "/sessions/:sessionId/review", {
    sessionId, body: { validated: true, expectedUpdatedAt: afterActualEdit.updatedAt.toISOString() },
  });
  const validated = await Session.findById(sessionId).lean();
  const payrollPath = base + "/sessions/:sessionId/payroll";
  const plannedShift = { _id: new ObjectId(), start: new Date(anchor - 7_200_000), end: stored.clockOutAt, breakMinutes: 20 };
  await Employee.collection.updateOne({ _id: alice, "restaurantProfiles.restaurant": restaurant }, {
    $push: { "restaurantProfiles.$.shifts": plannedShift },
  });
  const correction = {
    clockInAt: new Date(anchor - 3_600_000).toISOString(),
    clockOutAt: stored.clockOutAt.toISOString(),
    breaks: [{ startAt: new Date(anchor - 1_800_000).toISOString(), endAt: new Date(anchor - 1_200_000).toISOString() }],
    reason: "Ajustement fictif",
    ...revisionOf(validated),
  };
  const edit = (body, params = {}) => call("put", payrollPath, { sessionId, body, ...params });
  assert.equal((await edit(correction, { authorization: auth(alice, "employee") })).status, 403);
  assert.equal((await edit(correction, { authorization: auth(accountant, "accountant") })).status, 403);
  assert.equal((await edit(correction, { restaurantId: other })).status, 404);
  assert.equal((await edit({ ...correction, reason: "" })).status, 400);
  assert.equal((await edit({ ...correction, clockOutAt: correction.clockInAt })).status, 400);
  assert.equal((await edit({ ...correction, breaks: [...correction.breaks, ...correction.breaks] })).status, 400);
  assert.equal((await edit({ ...correction, breaks: [{ startAt: correction.clockOutAt, endAt: correction.clockOutAt }] })).status, 400);
  const concurrent = await Promise.all([edit(correction), edit(correction)]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);
  assert.deepEqual(concurrent.find(({ status }) => status === 200).data, { changed: true, manual: true, reopened: true });

  const corrected = await Session.findById(sessionId).lean();
  for (const field of ["clockInAt", "clockOutAt", "breaks", "events", "adjustments", "totals", "lastActionAt"]) {
    assert.deepEqual(corrected[field], validated[field]);
  }
  assert.equal(corrected.reviews.at(-1).type, "reopened");
  assert.equal(corrected.payrollAdjustments.length, 1);
  assert.deepEqual(corrected.payroll.clockInAt, new Date(correction.clockInAt));
  const oneDay = await call("get", base + "/register", { query: { from: day, to: day } });
  const from = toLocalDateKey(new Date(Date.now() - 86_400_000));
  const byEmployee = await call("get", base + "/register", { query: { from, to: day, employeeId: String(alice) } });
  const paidDay = oneDay.data.rows.find(({ employee }) => employee.id === String(alice)).days[0];
  assert.deepEqual(paidDay, byEmployee.data.rows[0].days.at(-1));
  assert.ok(paidDay.payroll[0].manual);
  assert.equal(paidDay.sessions[0].clockInAt.toISOString(), stored.clockInAt.toISOString());
  assert.equal(paidDay.sessions[0].note.text, correction.reason);
  const clockEmployee = await Employee.collection.findOne({ _id: alice });
  assert.deepEqual(clockEmployee.restaurantProfiles[0].shifts[0], plannedShift);

  const exportBody = { from, to: day, employeeIds: [String(alice)] };
  const accountantAuth = auth(accountant, "accountant");
  const pdf = await call("post", base + "/export/pdf", { body: exportBody, authorization: accountantAuth });
  const excel = await call("post", base + "/export/excel", { body: exportBody, authorization: accountantAuth });
  assert.equal(pdf.status, 200);
  assert.equal(excel.status, 200);
  assert.match(readPdfText(pdf.data), /Heures rémunérées nettes: 0h51/);
  assert.match(readPdfText(pdf.data), /Horaires pointés/);
  assert.match(excel.data.toString(), /Horaires rémunérés/);
  assert.match(excel.data.toString(), /Net pointé \(h\)/);
  assert.match(excel.data.toString(), /<v>0\.85<\/v>/);
  assert.equal((await call("post", base + "/export/excel", { body: exportBody, authorization: auth(alice, "employee") })).status, 403);

  assert.equal((await edit({ pause: { date: day, minutes: 65 }, reason: "Pause invalide", ...revisionOf(corrected) })).status, 400);
  assert.equal((await edit({ pause: { date: day, minutes: 25 }, reason: "Pause fictive de la grille", ...revisionOf(corrected) })).status, 200);
  const withPause = await Session.findById(sessionId).lean();
  assert.deepEqual(withPause.payroll.pauseMinutesByDay, [{ date: day, minutes: 25 }]);
  assert.equal((await edit({ absent: true, reason: "Absence fictive", ...revisionOf(withPause) })).status, 200);
  const marked = await Session.findById(sessionId).lean();
  const markedReport = await call("get", base + "/register", { query: { from: day, to: day, employeeId: String(alice) } });
  assert.equal(markedReport.data.rows[0].days[0].payroll[0].timings.workedMinutes, 0);
  assert.equal(markedReport.data.rows[0].days[0].payroll[0].absent, true);
  assert.deepEqual(marked.events, stored.events);
  assert.equal((await edit({ absent: false, reason: "Présence confirmée", ...revisionOf(marked) })).status, 200);
  const present = await Session.findById(sessionId).lean();
  assert.deepEqual(present.payroll.pauseMinutesByDay, withPause.payroll.pauseMinutesByDay);

  const reset = { reset: true, reason: "Retour fictif", ...revisionOf(present) };
  assert.deepEqual((await edit(reset)).data, { changed: true, manual: false, reopened: false });
  const restored = await Session.findById(sessionId).lean();
  assert.equal(restored.payroll, undefined);
  assert.equal(restored.payrollAdjustments.length, 5);
  assert.equal(restored.payrollAdjustments.at(-1).reset, true);
  assert.equal((await edit({ ...reset, ...revisionOf(restored) })).data.changed, false);
  const afterReset = await call("get", base + "/register", { query: { from: day, to: day, view: "history" } });
  const historyEdit = afterReset.data.history.find((entry) => entry.reason === correction.reason);
  assert.equal(historyEdit.actorName, "Gérant");
  assert.equal(historyEdit.reason, correction.reason);
  assert.deepEqual(historyEdit.before.in, stored.clockInAt);
  assert.equal(historyEdit.after.breaks[0].durationMinutes, 10);
  const historyReset = afterReset.data.history.find(({ type }) => type === "payroll_reset");
  assert.deepEqual(historyReset.before.in, historyEdit.after.in);
  assert.deepEqual(historyReset.after.in, historyEdit.before.in);
  assert.equal(afterReset.data.history.find(({ type }) => type === "absence_marked").after.absent, true);
  assert.equal(afterReset.data.history.find(({ type }) => type === "absence_removed").before.absent, true);
  const pauseChange = afterReset.data.history.find((item) => item.reason === "Pause fictive de la grille");
  assert.deepEqual(pauseChange.after.pauseMinutesByDay, [{ date: day, minutes: 25 }]);

  const missingShift = { _id: new ObjectId(), start: new Date("2024-04-12T10:00Z"), end: new Date("2024-04-12T11:30Z") };
  const shiftDate = toLocalDateKey(missingShift.start);
  await Employee.collection.updateOne({ _id: bob, "restaurantProfiles.restaurant": restaurant }, {
    $push: { "restaurantProfiles.$.shifts": missingShift },
  });
  const markPath = base + "/employees/:employeeId/shifts/:shiftId/absence";
  const markShift = (body, params = {}) => call("put", markPath, {
    body: { shiftDate, ...body }, employeeId: String(bob), shiftId: String(missingShift._id), ...params,
  });
  const markRequest = { absent: true, expectedRevision: 0, reason: "Service fictif sans pointage" };
  assert.equal((await markShift(markRequest, { authorization: auth(bob, "employee") })).status, 403);
  assert.equal((await markShift(markRequest, { restaurantId: other })).status, 404);
  const competingMarks = await Promise.all([markShift(markRequest), markShift(markRequest)]);
  assert.deepEqual(competingMarks.map(({ status }) => status).sort(), [200, 409]);
  const plannedMarked = await call("get", base + "/register", { query: { from: shiftDate, to: shiftDate, employeeId: String(bob) } });
  assert.equal(plannedMarked.data.rows[0].days[0].shifts[0].reportedAbsent, true);
  assert.equal(plannedMarked.data.rows[0].days[0].sessions.length, 0);
  assert.deepEqual((await Employee.collection.findOne({ _id: bob })).restaurantProfiles[0].shifts[0], missingShift);
  const absenceExport = await call("post", base + "/export/excel", {
    body: { from: shiftDate, to: shiftDate, employeeIds: [String(bob)] },
  });
  assert.equal(absenceExport.status, 200);
  assert.match(absenceExport.data.toString(), /Absence constatée/);
  assert.match(absenceExport.data.toString(), />12:00</);
  assert.equal((await markShift({ ...markRequest, absent: false, expectedRevision: 1 })).status, 200);
  const plannedHistory = await call("get", base + "/register", { query: { from: day, to: day, view: "history", employeeId: String(bob) } });
  assert.deepEqual(new Set(plannedHistory.data.history.map(({ type }) => type)), new Set(["absence_marked", "absence_removed"]));

  const attendancePath = base + "/employees/:employeeId/shifts/:shiftId/attendance";
  const mealPlan = { shiftDate, expectedRevision: 2, mealCount: 2, reason: "Repas de service fictifs" };
  const savePlanMeals = (body) => call("put", attendancePath, {
    body, employeeId: String(bob), shiftId: String(missingShift._id),
  });
  assert.equal((await savePlanMeals({ ...mealPlan, mealCount: -1 })).status, 400);
  assert.equal((await savePlanMeals({ ...mealPlan, mealCount: 1.5 })).status, 400);
  assert.equal((await savePlanMeals(mealPlan)).status, 200);
  assert.equal((await savePlanMeals(mealPlan)).status, 409);
  const verifyMeals = () => call("get", base + "/register", {
    query: { from: shiftDate, to: shiftDate, employeeId: String(bob) },
  });
  assert.equal((await verifyMeals()).data.rows[0].days[0].shifts[0].mealCount, 2);
  const mealSession = await Session.create({
    restaurant, employee: bob, businessDate: shiftDate, status: "closed",
    clockInAt: new Date("2024-04-12T10:05Z"), clockOutAt: new Date("2024-04-12T11:35Z"),
    reviews: [{ actorId: String(owner), actorRole: "owner", type: "validated", at: new Date() }],
  });
  const inherited = (await verifyMeals()).data.rows[0].days[0];
  assert.equal(inherited.mealCount, 2);
  assert.equal(inherited.sessions[0].mealCount, 2);
  assert.equal(inherited.sessions[0].shiftId, String(missingShift._id));
  const exportMeals = () => call("post", base + "/export/pdf", {
    body: { from: shiftDate, to: shiftDate, employeeIds: [String(bob)] },
  });
  assert.match(readPdfText((await exportMeals()).data), /Repas: 2/);
  const manualMeals = { mealCount: 0, reason: "Aucun repas pour ce service", ...revisionOf(mealSession) };
  assert.equal((await edit(manualMeals, { sessionId: String(mealSession._id), authorization: auth(bob, "employee") })).status, 403);
  assert.deepEqual((await edit(manualMeals, { sessionId: String(mealSession._id) })).data,
    { changed: true, manual: false, reopened: true });
  assert.equal((await edit(manualMeals, { sessionId: String(mealSession._id) })).status, 409);
  const overridden = (await verifyMeals()).data.rows[0].days[0];
  assert.equal(overridden.mealCount, 0);
  assert.equal(overridden.sessions[0].mealCount, 0);
  assert.deepEqual(overridden.sessions[0].clockInAt, mealSession.clockInAt);
  assert.match(readPdfText((await exportMeals()).data), /Repas: 0/);
  const mealHistory = await call("get", base + "/register", {
    query: { from: day, to: day, view: "history", employeeId: String(bob) },
  });
  const mealEdit = mealHistory.data.history.find((entry) => entry.type === "meal_adjustment" && entry.sessionId);
  assert.deepEqual([mealEdit.before.mealCount, mealEdit.after.mealCount], [2, 0]);

  const mealSessionId = String(mealSession._id);
  const beforeReview = await Session.findById(mealSessionId).lean();
  assert.equal((await call("put", base + "/sessions/:sessionId/review", {
    sessionId: mealSessionId, body: { validated: true, ...revisionOf(beforeReview) },
  })).status, 200);
  const beforeNote = await Session.findById(mealSessionId).lean();
  const addNote = (body, params = {}) => call("post", base + "/sessions/:sessionId/notes", {
    sessionId: mealSessionId, body, ...params,
  });
  const noteRequest = { note: "  Note fictive du service  ", ...revisionOf(beforeNote) };
  assert.equal((await addNote({ ...noteRequest, note: "  " })).status, 400);
  assert.equal((await addNote(noteRequest, { authorization: auth(bob, "employee") })).status, 403);
  assert.equal((await addNote(noteRequest, { restaurantId: other })).status, 404);
  assert.equal((await addNote(noteRequest)).status, 201);
  assert.equal((await addNote(noteRequest)).status, 409);
  const sessionAfterNote = (await verifyMeals()).data.rows[0].days[0].sessions[0];
  assert.equal(sessionAfterNote.note.text, "Note fictive du service");
  assert.equal(sessionAfterNote.note.source, "note");
  assert.ok(sessionAfterNote.review);
  assert.equal(sessionAfterNote.mealCount, 0);

  const now = Date.now();
  const ongoingShift = { _id: new ObjectId(), start: new Date(now - 300_000), end: new Date(now + 300_000) };
  const upcomingShift = { _id: new ObjectId(), start: new Date(now + 600_000), end: new Date(now + 900_000) };
  await Employee.collection.updateOne({ _id: bob, "restaurantProfiles.restaurant": restaurant }, {
    $push: { "restaurantProfiles.$.shifts": { $each: [ongoingShift, upcomingShift] } },
  });
  const setShiftAbsence = (shift, absent, expectedRevision = 0) => markShift({
    shiftDate: toLocalDateKey(shift.start), absent, reason: "Absence sur un service fictif sans pointage", expectedRevision,
  }, { shiftId: String(shift._id) });
  assert.equal((await setShiftAbsence(upcomingShift, true)).status, 409);
  assert.equal((await setShiftAbsence(ongoingShift, true)).status, 200);
  const ongoingDate = toLocalDateKey(ongoingShift.start);
  const readOngoingService = () => call("get", base + "/register", {
    query: { from: ongoingDate, to: ongoingDate, employeeId: String(bob) },
  });
  const ongoingProjection = (response) => response.data.rows[0].days[0].shifts.find(({ id }) => id === String(ongoingShift._id));
  const duringService = await readOngoingService();
  assert.equal(ongoingProjection(duringService).reportedAbsent, true);
  assert.equal(ongoingProjection(duringService).note.text, "Absence sur un service fictif sans pointage");
  assert.equal(duringService.data.rows[0].days[0].sessions.length, 0);
  const reviewPlanned = (body, params = {}) => call("put", attendancePath, {
    body: { shiftDate: ongoingDate, ...body }, employeeId: String(bob), shiftId: String(ongoingShift._id), ...params,
  });
  assert.equal((await reviewPlanned({ validated: true, expectedRevision: 1 })).status, 200);
  const reviewedAbsence = ongoingProjection(await readOngoingService());
  assert.equal(reviewedAbsence.absenceValidated, true);
  assert.equal(reviewedAbsence.note.text, ongoingProjection(duringService).note.text);
  assert.equal((await reviewPlanned({ validated: false, expectedRevision: 1 })).status, 409);
  assert.equal((await reviewPlanned({ note: "Note fictive sur l’absence", expectedRevision: 2 })).status, 200);
  const notedAbsence = ongoingProjection(await readOngoingService());
  assert.equal(notedAbsence.absenceValidated, true);
  assert.equal(notedAbsence.note.text, "Note fictive sur l’absence");
  assert.deepEqual((await reviewPlanned({ mealCount: 1, reason: "Correction fictive après validation", expectedRevision: 3 })).data,
    { changed: true, mealCount: 1, validated: false, reopened: true });
  const reopenedAbsence = ongoingProjection(await readOngoingService());
  assert.equal(reopenedAbsence.absenceValidated, false);
  assert.equal(reopenedAbsence.note.text, "Correction fictive après validation");
  assert.equal((await setShiftAbsence(ongoingShift, false, 4)).status, 200);
  assert.equal((await reviewPlanned({ validated: true, expectedRevision: 5 })).status, 409);
  const reviewHistory = await call("get", base + "/register", {
    query: { from: day, to: day, view: "history", employeeId: String(bob) },
  });
  assert.ok(reviewHistory.data.history.some((entry) => entry.type === "validated" && entry.sessionId === undefined && entry.sessionDate === ongoingDate));
  assert.ok(reviewHistory.data.history.some((entry) => entry.type === "reopened" && entry.sessionId === undefined && entry.sessionDate === ongoingDate));
  const notesHistory = reviewHistory.data.history.filter((entry) => entry.type === "note_added");
  assert.deepEqual(new Set(notesHistory.map((entry) => entry.reason)), new Set(["Note fictive du service", "Note fictive sur l’absence"]));
  assert.ok(notesHistory.every((entry) => !entry.before && !entry.after && entry.actorName === "Gérant"));

  const overnight = await Session.create({
    restaurant, employee: bob, businessDate: shiftDate, status: "closed",
    clockInAt: new Date("2024-04-12T20:00Z"), clockOutAt: new Date("2024-04-12T21:55Z"),
  });
  const payrollDate = "2024-04-13";
  assert.equal((await edit({
    clockOutAt: "2024-04-13T00:30", wallTimeZone: "Europe/Paris", pause: { date: payrollDate, minutes: 10 },
    reason: "Nuit fictive", ...revisionOf(overnight),
  }, { sessionId: String(overnight._id) })).status, 200);
  const secondDay = await call("get", base + "/register", { query: { from: payrollDate, to: payrollDate, employeeId: String(bob) } });
  assert.equal(secondDay.data.rows[0].days[0].sessions.length, 0);
  assert.equal(secondDay.data.rows[0].days[0].payroll[0].timings.workedMinutes, 20);

  const pauseDate = "2024-04-15";
  const pauseDayAfter = "2024-04-16";
  const planWithPause = { _id: new ObjectId(), start: new Date("2024-04-15T21:45Z"), end: new Date("2024-04-15T23:10Z"), breakMinutes: 30 };
  await Employee.collection.updateOne({ _id: bob, "restaurantProfiles.restaurant": restaurant }, {
    $push: { "restaurantProfiles.$.shifts": planWithPause },
  });
  const unbadgedPause = await Session.create({
    restaurant, employee: bob, businessDate: pauseDate, status: "closed",
    clockInAt: new Date("2024-04-15T21:50Z"), clockOutAt: new Date("2024-04-15T23:00Z"),
  });
  const readPauseDays = (from, to) => call("get", base + "/register", {
    query: { from, to, employeeId: String(bob) },
  });
  const pauseReports = (await readPauseDays(pauseDate, pauseDayAfter)).data.rows[0].days;
  const pauseOnlyNextDay = (await readPauseDays(pauseDayAfter, pauseDayAfter)).data.rows[0].days[0];
  assert.equal(pauseReports[0].sessions[0].timings.breakMinutes, 0);
  assert.deepEqual(pauseReports.map((item) => item.payroll[0].timings.breakMinutes), [10, 20]);
  assert.deepEqual(pauseOnlyNextDay.payroll, pauseReports[1].payroll);
  const pauseParams = { sessionId: String(unbadgedPause._id) };
  assert.equal((await edit({
    pause: { date: pauseDayAfter, minutes: 0 }, reason: "Pause fictive régularisée", ...revisionOf(unbadgedPause),
  }, pauseParams)).status, 200);
  const paidWithoutPause = (await readPauseDays(pauseDayAfter, pauseDayAfter)).data.rows[0].days[0];
  assert.equal(paidWithoutPause.payroll[0].timings.breakMinutes, 0);
  assert.equal(paidWithoutPause.payroll[0].timings.workedMinutes, 60);
  const savedPause = await Session.findById(unbadgedPause._id).lean();
  assert.deepEqual(savedPause.breaks, []);
  assert.equal(savedPause.payrollAdjustments[0].previousPauseMinutesByDay.at(-1).minutes, 20);
  const pdfPause = await call("post", base + "/export/pdf", {
    body: { from: pauseDayAfter, to: pauseDayAfter, employeeIds: [String(bob)] },
  });
  assert.match(readPdfText(pdfPause.data), /Heures rémunérées nettes: 1h00/);
  assert.equal((await edit({ reset: true, reason: "Retour à la pause prévue", ...revisionOf(savedPause) }, pauseParams)).status, 200);
  const restoredPause = (await readPauseDays(pauseDayAfter, pauseDayAfter)).data.rows[0].days[0];
  assert.equal(restoredPause.payroll[0].timings.breakMinutes, 20);

  const incomplete = await Session.create({
    restaurant, employee: bob, businessDate: day, status: "open", clockInAt: new Date(anchor),
  });
  assert.equal((await edit({ ...correction, ...revisionOf(incomplete) }, { sessionId: String(incomplete._id) })).status, 409);
  assert.equal((await edit({ mealCount: 1, reason: "Repas en cours de service", ...revisionOf(incomplete) },
    { sessionId: String(incomplete._id) })).status, 200);
  assert.equal((await Session.findById(incomplete._id).lean()).mealCountOverride, 1);

  const batchFrom = "2024-05-06";
  const batchTo = "2024-05-12";
  const makeBatchSession = (employee, restaurant, businessDate, status = "closed") => ({
    restaurant, employee, businessDate, status,
    clockInAt: new Date(`${businessDate}T08:00Z`),
    ...(status === "closed" && { clockOutAt: new Date(`${businessDate}T12:00Z`) }),
  });
  const [aliceMonday, aliceFriday, bobMonday, bobOpen, otherRestaurant] = await Session.insertMany([
    makeBatchSession(alice, restaurant, batchFrom),
    makeBatchSession(alice, restaurant, "2024-05-10"),
    makeBatchSession(bob, restaurant, batchFrom),
    makeBatchSession(bob, restaurant, batchFrom, "open"),
    makeBatchSession(alice, other, batchFrom),
  ]);
  const batchShift = { _id: new ObjectId(), start: new Date(`${batchFrom}T13:00Z`), end: new Date(`${batchFrom}T16:00Z`) };
  await Employee.collection.updateOne({ _id: bob, "restaurantProfiles.restaurant": restaurant }, {
    $push: { "restaurantProfiles.$.shifts": batchShift },
  });
  assert.equal((await markShift({
    shiftDate: batchFrom, absent: true, reason: "Absence fictive pour la validation groupée", expectedRevision: 0,
  }, { shiftId: String(batchShift._id) })).status, 200);
  const batchReview = (body, params = {}) => call("post", base + "/register/review", { body, ...params });
  assert.equal((await batchReview({ from: batchFrom, to: batchTo })).status, 400);
  assert.equal((await batchReview({ from: batchFrom, to: batchFrom }, { authorization: auth(bob, "employee") })).status, 403);
  assert.deepEqual((await batchReview({ from: batchFrom, to: batchTo, employeeId: String(alice) })).data, { validatedCount: 2 });
  assert.equal((await Session.findById(bobMonday._id).lean()).reviews.length, 0);
  assert.deepEqual((await batchReview({ from: batchFrom, to: batchFrom })).data, { validatedCount: 2 });
  assert.deepEqual((await batchReview({ from: batchFrom, to: batchFrom })).data, { validatedCount: 0 });
  for (const item of [aliceMonday, aliceFriday, bobMonday]) {
    const [review] = (await Session.findById(item._id).lean()).reviews;
    assert.equal(review.type, "validated");
    assert.equal(review.actorId, String(owner));
  }
  for (const item of [bobOpen, otherRestaurant]) assert.equal((await Session.findById(item._id).lean()).reviews.length, 0);
  const batchAbsence = await Absence.findOne({ restaurant, employee: bob, shift: batchShift._id }).lean();
  assert.equal(batchAbsence.validated, true);
  assert.equal(batchAbsence.changes.at(-1).validated, true);

  const rotations = await Promise.all([regenerate(alice), regenerate(alice)]);
  assert.deepEqual(rotations.map(({ status }) => status).sort(), [200, 429]);
  assert.deepEqual(rotations.find(({ status }) => status === 200).data, { configured: true });
  const newPin = (await reveal(alice)).data.pin;
  assert.notEqual(newPin, alicePin);
  assert.equal((await reveal(alice, other)).data.pin, alicePin);
  assert.equal((await call("post", deviceBase + "/identify", { authorization, body: { pin: alicePin } })).status, 401);
  const nextVault = await call("post", deviceBase + "/vault", { authorization });
  assert.notEqual(nextVault.data.entries.find((entry) => entry.kiosk.employee.id === String(alice)).tag, offline.tag);
  const stale = signedPunch(restaurant, keys.signing.privateKey, String(alice), offline.grant, "clock_in", new Date());
  assert.equal((await punch(stale)).status, 422);
  assert.equal((await punch(actions[0])).data.idempotentReplay, true);
  const refreshed = await call("post", deviceBase + "/identify", { authorization, body: { pin: newPin } });
  await Promise.all([
    Employee.updateOne({ _id: alice }, { $pull: { restaurants: restaurant, restaurantProfiles: { restaurant } } }),
    Restaurant.updateOne({ _id: restaurant }, { $pull: { employees: alice } }),
  ]);
  const removed = signedPunch(restaurant, keys.signing.privateKey, String(alice), refreshed.data.grant, "clock_in", new Date());
  assert.equal((await punch(removed)).status, 422);
  const invalidPin = ["9999", "9998", "9997"].find((value) => value !== newPin && value !== bobPin);
  const rejected = await Promise.all(Array.from({ length: 12 }, () =>
    call("post", deviceBase + "/identify", { authorization, body: { pin: invalidPin } })));
  assert.equal(rejected.filter((result) => result.status === 401).length, 7);
  assert.equal(rejected.filter((result) => result.status === 429).length, 5);
  assert.equal((await call("delete", base + "/devices/:deviceId", { deviceId: paired.id })).status, 204);
  assert.equal((await call("post", deviceBase + "/vault", { authorization })).status, 401);

  const newMembers = [member(new ObjectId(), "Deuxième", [other]), member(new ObjectId(), "Troisième", [other])];
  await Promise.all([
    Employee.collection.insertMany(newMembers),
    Restaurant.collection.updateOne({ _id: other }, { $push: { employees: { $each: newMembers.map(({ _id }) => _id) } } }),
  ]);
  await Promise.all(newMembers.map((employee) => withClockPinTransaction((session) => provisionInitialClockPin({
    restaurant: other, employee: employee._id, profile: String(employee.restaurantProfiles[0]._id),
    changedBy: String(owner), session,
  }))));
  const initialCodes = await Promise.all(newMembers.map(async ({ _id }) => (await reveal(_id, other)).data.pin));
  assert.ok(initialCodes.every((pin) => /^\d{4}$/.test(pin)));
  assert.equal(new Set([...initialCodes, alicePin]).size, 3);
  const managerPin = await call("post", base + "/employees/:employeeId/pin/regenerate", {
    restaurantId: other, employeeId: String(newMembers[0]._id),
  });
  assert.deepEqual(managerPin.data, { configured: true });
  assert.notEqual((await reveal(newMembers[0]._id, other)).data.pin, initialCodes[0]);

  // This historical member predates both per-restaurant profiles and PINs.
  await Employee.collection.updateOne({ _id: outside }, { $set: { restaurantProfiles: [] } });
  const statusOptions = { restaurantId: other, employeeId: String(outside), query: { reveal: "true" } };
  assert.deepEqual((await call("get", statusPath, statusOptions)).data, { configured: false });
  const backfill = await runPinBackfill({ apply: true });
  assert.equal(backfill.totals.assigned, 1);
  assert.equal(backfill.totals.errors, 0);
  assert.deepEqual((await call("get", statusPath, statusOptions)).data, { configured: true });
  const migratedPin = (await reveal(outside, other)).data.pin;
  assert.match(migratedPin, /^\d{4}$/);
  assert.deepEqual((await revealAsOwner(outside, { restaurantId: other })).data, { configured: true, pin: migratedPin });
  assert.equal((await call("get", statusPath, { employeeId: String(outside) })).status, 404);

  const newLink = await call("post", base + "/devices", { restaurantId: other, body: { name: "Tablette recette historique" } });
  const newTablet = await call("post", deviceBase + "/pair", {
    body: { code: newLink.data.code, signingKey: keys.signingKey, wrappingKey: keys.wrappingKey },
  });
  assert.equal(newTablet.status, 201);
  const tabletAuth = `Device ${newTablet.data.id}.${newTablet.data.token}`;
  const identified = await call("post", deviceBase + "/identify", { restaurantId: other, authorization: tabletAuth, body: { pin: migratedPin } });
  assert.equal(identified.status, 200);
  assert.equal(identified.data.kiosk.employee.id, String(outside));
  const migratedVault = await call("post", deviceBase + "/vault", { restaurantId: other, authorization: tabletAuth });
  const offlineEntry = migratedVault.data.entries.find((entry) => entry.kiosk.employee.id === String(outside));
  assert.ok(offlineEntry);
  assert.equal(migratedVault.data.expiresAt - migratedVault.data.asOf, 12 * 60 * 60 * 1000);
  const lookupKey = privateDecrypt({ key: keys.wrapping.privateKey, oaepHash: "sha256" }, Buffer.from(newTablet.data.pinKey, "base64url"));
  assert.equal(offlineEntry.tag, createHmac("sha256", lookupKey).update(migratedPin).digest("base64url"));
  assert.equal((await call("post", deviceBase + "/vault", { restaurantId: other, authorization: manager })).status, 401);
  assert.equal((await runPinBackfill({ apply: true })).totals.assigned, 0);

  const resetPath = statusPath + "/regenerate";
  const resetOptions = { employeeId: String(outside), restaurantId: other };
  const rejectedChoice = await call("post", resetPath, { ...resetOptions, body: { pin: "0042" } });
  assert.equal(rejectedChoice.status, 400);
  const resetRuns = await Promise.all([call("post", resetPath, resetOptions), call("post", resetPath, resetOptions)]);
  assert.deepEqual(resetRuns.map(({ status }) => status).sort(), [200, 429]);
  assert.deepEqual(resetRuns.find(({ status }) => status === 200).data, { configured: true });
  const resetPin = (await revealAsOwner(outside, { restaurantId: other })).data.pin;
  assert.notEqual(resetPin, migratedPin);
  assert.equal((await revealAsOwner(alice, { restaurantId: other })).data.pin, alicePin);
  const audit = await TimeClockPinAudit.find({ employee: outside, restaurant: other, action: "reset" }).lean();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorRole, "owner");
  assert.deepEqual(Object.keys(audit[0]).filter((key) => !["_id", "__v"].includes(key)).sort(),
    ["action", "actor", "actorRole", "at", "employee", "restaurant"]);
  const identifyPin = (pin) => call("post", deviceBase + "/identify", { restaurantId: other, authorization: tabletAuth, body: { pin } });
  assert.equal((await identifyPin(migratedPin)).status, 401);
  assert.equal((await identifyPin(resetPin)).data.kiosk.employee.id, String(outside));
});
