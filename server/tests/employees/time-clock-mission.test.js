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
const PersonnelReportInput = require("../../models/personnel-report-input.model");
const router = require("../../routes/time-clock.routes");
const { parseXlsxSheets } = require("../../services/dish-card-import.service");
const { buildRegisterRows, buildRegisterHistory } = require("../../services/employees/time-clock-register.service");
const { payrollDays } = require("../../services/employees/time-clock-payroll.service");
const { getRangeBounds, toLocalDateKey } = require("../../services/employees/time-clock.service");
const { provisionInitialClockPin, withClockPinTransaction } = require("../../services/employees/time-clock-pin.service");
const { runPinBackfill } = require("../../services/employees/time-clock-pin-backfill.service");
const {
  isPersonalPin, issuePunchGrant, lookupPin, offlinePinTag, readPunchGrant,
  sealPin, validDevicePublicKeys, verifyPunchProof, wrapDevicePinKey,
} = require("../../services/employees/time-clock-device.service");

test("les règles datées conservent le brut et ventilent la paie selon le restaurant", () => {
  const { suggestedPayroll, payrollSchedule, payrollDayShares, needsClockRuleReview } = require("../../services/employees/time-clock-payroll.service");
  const session = { status: "closed", clockInAt: "2027-03-01T07:09:00Z", clockOutAt: "2027-03-01T10:45:00Z",
    plannedStart: "2027-03-01T07:00:00Z", plannedEnd: "2027-03-01T10:30:00Z", plannedBreakMinutes: 15, breaks: [] };
  const rule = { enabled: true, earlyIn: "planned", lateIn: "planned", earlyOut: "clocked", lateOut: "clocked",
    roundMinutes: 0, pause: "plannedFallback" };
  function total(s, r) {
    return payrollDayShares(payrollSchedule({ ...s, automaticPayroll: suggestedPayroll(s, r) }))
      .reduce((sum, day) => sum + day.workedMinutes, 0);
  }
  assert.equal(total(session, rule), 210);
  assert.equal(session.clockInAt, "2027-03-01T07:09:00Z");
  const actual = { ...session, breaks: [{ startAt: "2027-03-01T08:00:00Z", endAt: "2027-03-01T08:06:00Z" }] };
  assert.equal(total(actual, rule), 219);
  assert.equal(total(actual, { ...rule, pause: "plannedMinimum" }), 210);
  assert.equal(total(session, { ...rule, lateIn: "clocked", roundMinutes: 5, pause: "clocked" }), 215);
  assert.equal(total(session, { ...rule, lateOut: "planned" }), 195);
  assert.equal(suggestedPayroll({ ...session, plannedStart: null }, rule), null);
  assert.ok(needsClockRuleReview({ ...session, clockRule: rule }));
  assert.equal(needsClockRuleReview({ ...session, clockRule: rule, payroll: session }), false);
  assert.equal(suggestedPayroll(session, { enabled: false }), null);
  const overnight = { ...session, clockInAt: "2027-04-04T20:55:00Z", clockOutAt: "2027-04-04T22:17:00Z",
    plannedStart: "2027-04-04T21:00:00Z", plannedEnd: "2027-04-04T22:00:00Z" };
  const schedule = suggestedPayroll(overnight, { ...rule, roundMinutes: 5 });
  assert.deepEqual(payrollDayShares(schedule).map(d => d.workedMinutes), [45, 15]);
});

test("une pause de durée nulle n’écarte pas la pause prévue en mode de remplacement", () => {
  const { suggestedPayroll, payrollSchedule, payrollDayShares } = require("../../services/employees/time-clock-payroll.service");
  const at = "2027-03-03T12:00:00Z";
  const session = { status: "closed", clockInAt: "2027-03-03T08:00:00Z", clockOutAt: at,
    plannedBreakMinutes: 25, breaks: [{ startAt: at, endAt: at }] };
  const rule = { enabled: true, earlyIn: "clocked", lateIn: "clocked", earlyOut: "clocked", lateOut: "clocked",
    roundMinutes: 0, pause: "plannedFallback" };
  const paid = (input, override) => payrollDayShares(payrollSchedule(input, override))[0];
  assert.equal(paid(session).workedMinutes, 215);
  assert.equal(paid(session, suggestedPayroll(session, rule)).workedMinutes, 215);
  assert.equal(paid(session, suggestedPayroll(session, { ...rule, pause: "clocked" })).workedMinutes, 240);
  assert.equal(session.breaks.length, 1);
  assert.equal(session.breaks[0].endAt, at);

  const measured = { ...session, breaks: [{ startAt: "2027-03-03T10:00:00Z", endAt: "2027-03-03T10:08:00Z" }] };
  assert.equal(paid(measured).breakMinutes, 8);
  assert.equal(paid(measured, suggestedPayroll(measured, rule)).breakMinutes, 8);
  const shortened = { ...measured, plannedEnd: new Date("2027-03-03T09:30:00Z") };
  assert.equal(paid(shortened, suggestedPayroll(shortened, { ...rule, lateOut: "planned" })).breakMinutes, 0);
});

test("la pause prévue de 30 minutes ne remplace que les pauses absentes ou nulles", () => {
  const { suggestedPayroll, payrollDayShares } = require("../../services/employees/time-clock-payroll.service");
  const startAt = "2027-03-03T12:00:00Z";
  const session = {
    status: "closed", clockInAt: "2027-03-03T08:00:00Z", clockOutAt: "2027-03-03T16:00:00Z",
  };
  const rule = {
    enabled: true, earlyIn: "clocked", lateIn: "clocked", earlyOut: "clocked", lateOut: "clocked",
    roundMinutes: 0, pause: "plannedFallback",
  };
  const cases = [
    { planned: 30, breaks: [{ startAt, endAt: "2027-03-03T12:17:00Z" }], expected: 17 },
    { planned: 30, breaks: [], expected: 30 },
    { planned: 30, breaks: [{ startAt, endAt: startAt }], expected: 30 },
    { planned: 0, breaks: [], expected: 0 },
  ];
  for (const { planned, breaks, expected } of cases) {
    const schedule = suggestedPayroll({ ...session, plannedBreakMinutes: planned, breaks }, rule);
    const [day] = payrollDayShares(schedule);
    assert.equal(day.breakMinutes, expected);
    assert.equal(day.workedMinutes, 480 - expected);
  }
});

function tabletKeys() {
  const signing = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const wrapping = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    signing, wrapping,
    signingKey: signing.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    wrappingKey: wrapping.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
  };
}

test("les horaires rémunérés chevauchants respectent la nuit, les pauses et les bornes contiguës", () => {
  const { payrollConflicts } = require("../../services/employees/time-clock-payroll.service");
  const shift = (_id, clockInAt, clockOutAt, options = {}) =>
    ({ _id, employee: "staff", restaurant: "bistro", status: "closed", clockInAt, clockOutAt, ...options });
  const night = shift("night", "2026-11-10T22:00:00+01:00", "2026-11-11T02:00:00+01:00");
  const adjacent = shift("adjacent", night.clockOutAt, "2026-11-11T04:00:00+01:00");
  const early = { ...adjacent, clockInAt: "2026-11-11T01:30:00+01:00" };
  assert.equal(payrollConflicts([night, adjacent]).size, 0);
  assert.deepEqual([...payrollConflicts([night, early]).keys()].sort(), ["adjacent", "night"]);
  assert.equal(payrollConflicts([night, early], "2026-11-10", "2026-11-10").size, 0);
  assert.equal(payrollConflicts([night, { ...early, restaurant: "other" }]).size, 0);
  assert.equal(payrollConflicts([night, { ...early, employee: "other" }]).size, 0);
  const knownBreak = { ...night, breaks: [{ startAt: early.clockInAt, endAt: night.clockOutAt }] };
  assert.equal(payrollConflicts([knownBreak, early]).size, 0);
  const override = { ...knownBreak, payroll: { ...knownBreak, pauseMinutesByDay: [{ date: "2026-11-11", minutes: 0 }] } };
  assert.equal(payrollConflicts([override, early]).size, 2);
});

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
    const handlers = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack
      .filter((layer) => !layer.method || layer.method === method);
    const result = { status: 200, headers: {} };
    const request = { method: method.toUpperCase(), body, query, params: { restaurantId: String(restaurantId), ...ids }, headers: { authorization },
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
  async function checkRetainedHours(scenario) {
    const restaurantId = new ObjectId();
    const reportPath = "/restaurants/:restaurantId/employees/reports";
    const authorization = auth(owner, "owner", restaurantId);
    const request = (method, path, options) => call(method, path, { restaurantId, authorization, ...options });
    const settings = reportPath + "/inputs/:kind/:date";
    const revision = (session) => ({ expectedRevision: session.__v, expectedUpdatedAt: session.updatedAt.toISOString() });
    const signature = { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] }] };
    const stamp = (d, time) => `${d}T${time}:00+01:00`;
    const localTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    const minutesOfDay = (value) => {
      const [hours, minutes] = localTime.format(new Date(value)).split(":").map(Number);
      return hours * 60 + minutes;
    };
    const day = "2026-11-05";
    const punches = (date, start, end, pause) => [
      ["clock_in", stamp(date, start)],
      ...(pause ? [["break_start", stamp(date, pause[0])], ["break_end", stamp(date, pause[1])]] : []),
      ...(end ? [["clock_out", stamp(date, end)]] : []),
    ];
    const service = (date, start = stamp(date, "09:00"), end = stamp(date, "17:00"), breakMinutes = 30) => ({
      date, start: new Date(start), end: new Date(end), breakMinutes,
    });
    const single = (name, start, end, paid, extra = {}) => ({ name, shifts: [service(day)],
      events: start ? punches(day, start, end, extra.pause) : [], paid,
      retainedIn: end ? stamp(day, "09:00") : null, retainedOut: end ? stamp(day, end) : null, ...extra });
    const workWeek = (name, hours, weekly, premiums) => ({ name, weekly, premiums,
      paid: hours * 5 * 60, shifts: Array.from({ length: 5 }, (_, i) => {
        const date = `2026-11-0${2 + i}`;
        return service(date, stamp(date, "09:00"), stamp(date, i === 0 ? `${8 + hours}:47` : `${9 + hours}:00`), 0);
      }) });
    const special = (name, start, end, paid, premiums) => ({ name, paid, premiums, retainedIn: start, retainedOut: end,
      shifts: [service(start.slice(0, 10), start, end, 0)], events: [["clock_in", start], ["clock_out", end]] });
    const cases = [
      single("Normal", "09:00", "17:00", 480, { shifts: [service(day, undefined, undefined, 0)] }),
      single("Avance", "08:43", "17:00", 480),
      single("Retard", "09:13", "17:00", 480, { late: 13 }),
      single("Sortie anticipée", "09:00", "16:47", 467),
      single("Sortie tardive", "09:00", "17:13", 493),
      single("Pause mesurée", "09:00", "17:00", 463, { pause: ["12:04", "12:21"], paidBreak: 17 }),
      single("Pause non badgée", "09:00", "17:00", 480),
      single("Pause nulle", "09:00", "17:00", 480, { pause: ["12:04", "12:04"] }),
      single("Sortie manquante", "09:00", null, null),
      single("Sans badge", null, null, null),
      single("Correction", "08:52", "17:13", 453, { manual: true, paidBreak: 20, retainedOut: stamp(day, "16:53") }),
      single("Validation de journée", "09:01", "17:01", 481, { bulk: true }),
      workWeek("Heures supplémentaires", 8, 35, { extra10: 240, extra20: 60, extra50: 0 }),
      workWeek("Temps partiel", 5, 20, { complement10: 120, complement25: 180 }),
      special("Nuit", "2026-11-06T20:00:00+01:00", "2026-11-06T23:43:00+01:00", 223, { night0: 103 }),
      special("Dimanche", "2026-11-08T10:00:00+01:00", "2026-11-08T13:07:00+01:00", 187, { sunday50: 187 }),
      special("Férié", "2026-11-11T10:00:00+01:00", "2026-11-11T13:11:00+01:00", 191, { holidays: 191 }),
      special("Minuit samedi–dimanche", "2026-11-07T22:00:00+01:00", "2026-11-08T01:17:00+01:00", 197, { night0: 197, sunday50: 77 }),
      special("Changement d’heure", "2026-10-24T23:00:00+02:00", "2026-10-25T04:00:00+01:00", 360, { night0: 360, sunday50: 300 }),
    ].map((example) => ({ ...example, employeeId: new ObjectId() }));

    await Restaurant.collection.insertOne({ _id: restaurantId, owner_id: owner, name: "Mission 16 fictive",
      options: { employees: true }, employees: cases.map(({ employeeId }) => employeeId) });
    await Employee.collection.insertMany(cases.map(({ name, employeeId, shifts, weekly }) => ({
      ...member(employeeId, name, [restaurantId]), restaurantProfiles: [{ _id: new ObjectId(), restaurant: restaurantId,
        shifts: shifts.map(({ start, end, breakMinutes }) => ({ _id: new ObjectId(), title: "Service fictif", start, end, breakMinutes })),
        snapshot: { dateOnPost: new Date("2026-01-01T08:00:00Z") },
        employment: { contractualUnit: "week", contractualValue: weekly || 35, contractType: "CDI" } }],
    })));

    const configure = async (kind, values, date = "2026-10-19") => {
      const saved = await request("put", settings, { kind, date, body: { revision: 0, values } });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      const { data } = await request("get", settings, { kind, date });
      assert.equal(data.revision, 1);
      for (const [key, value] of Object.entries(values)) assert.deepEqual(data.values[key], value);
    };
    const clockRule = { enabled: true, earlyIn: "planned", lateIn: "planned", earlyOut: "clocked", lateOut: "clocked",
      roundMinutes: 0, pause: "clocked" };
    await configure("clockRules", clockRule);
    await configure("overtime", { enabled: true, source: "validated", ordinary: 35, firstEnd: 39, secondEnd: 43,
      firstRate: 10, secondRate: 20, lastRate: 50, complementBand: 10, complementFirstRate: 10, complementLastRate: 25,
      workdays: 5, creditedAbsences: [], nightStart: "22:00", nightEnd: "07:00", nightRate: 0, sundayRate: 50,
      holidayRate: null, countHolidays: true });
    await configure("rules", { mode: "combined", basis: "days", quantity: 2 }, "2026-10");

    for (const example of cases) await scenario.test(example.name, async () => {
      const { shifts, paid, pause, premiums = {}, paidBreak = 0 } = example;
      const employeeId = String(example.employeeId);
      const from = shifts[0].date;
      const last = shifts.at(-1);
      const to = example.weekly || paid === null ? "2026-11-08" : toLocalDateKey(last.end);
      const filters = { from, to, employeeId };
      const rawBreak = pause ? Math.round((Date.parse(stamp(from, pause[1])) - Date.parse(stamp(from, pause[0]))) / 60000) : 0;
      const sessions = [];
      for (const shift of shifts) {
        const rawEnd = example.weekly && shift === shifts[0] ? new Date(+shift.end + 13 * 60_000) : shift.end;
        const events = example.events ?? [["clock_in", shift.start.toISOString()], ["clock_out", rawEnd.toISOString()]];
        let sessionId;
        for (const [action, occurredAt] of events) {
          const response = await request("post", base + "/punch", { body: {
            employeeId, businessDate: shift.date, occurredAt, action, signature, clientMutationId: randomUUID(), source: "kiosk",
          } });
          assert.equal(response.status, action === "clock_in" ? 201 : 200, JSON.stringify(response.data));
          sessionId = response.data.sessionId;
        }
        if (!sessionId) continue;
        let stored = await Session.findById(sessionId).lean();
        assert.deepEqual(stored.events.map(({ type, at }) => [type, at.toISOString()]),
          events.map(([type, at]) => [type, new Date(at).toISOString()]));
        assert.equal(stored.clockRule.revision, 1);
        for (const [key, value] of Object.entries(clockRule)) assert.equal(stored.clockRule[key], value);
        if (example.manual) {
          const prior = await request("put", base + "/sessions/:sessionId/review", { sessionId, body: { ...revision(stored), validated: true } });
          assert.equal(prior.status, 200);
          stored = await Session.findById(sessionId).lean();
          const corrected = await request("put", base + "/sessions/:sessionId/payroll", { sessionId,
            body: { ...revision(stored), clockInAt: example.retainedIn, clockOutAt: example.retainedOut,
              breaks: [{ startAt: stamp(from, "12:00"), endAt: stamp(from, "12:20") }], reason: "Motif fictif" } });
          assert.deepEqual(corrected.data, { changed: true, manual: true, reopened: true });
          const amended = await Session.findById(sessionId).lean();
          assert.deepEqual(amended.events, stored.events);
          assert.equal(amended.automaticPayroll.clockOutAt.toISOString(), new Date(events.at(-1)[1]).toISOString());
          const reopened = await request("get", reportPath, { query: filters });
          assert.equal(reopened.data.rows[0].values.paid, paid);
          assert.equal(reopened.data.rows[0].values.referenceWorked, 0);
          assert.equal(reopened.data.rows[0].values.mealsDue, 0);
          const pendingExport = await request("post", reportPath + "/export/excel", { body: filters });
          const pendingDetail = parseXlsxSheets(pendingExport.data)[2];
          assert.equal(pendingDetail.rows.length, 1);
          stored = amended;
        }
        if (!example.bulk) {
          const result = await request("put", base + "/sessions/:sessionId/review", { sessionId,
            body: { ...revision(stored), validated: true } });
          assert.equal(result.status, paid === null ? 409 : 200);
        }
        sessions.push(stored);
      }
      if (example.bulk || paid === null) {
        const result = await request("post", base + "/register/review", { body: filters });
        assert.equal(result.status, 200);
        assert.equal(result.data.validatedCount, example.bulk ? 1 : 0);
      }
      const register = await request("get", base + "/register", { query: filters });
      assert.equal(register.status, 200);
      const { days } = register.data.rows[0];
      assert.equal(days.flatMap((d) => d.shifts).filter(({ reportedAbsent }) => reportedAbsent).length, 0);
      const entries = days.flatMap((d) => d.payroll);
      const vouchers = entries.map(({ timings }) => timings);
      assert.equal(entries.length > 0, paid !== null);
      assert.ok(entries.every((entry) => entry.validated));
      if (paid !== null) {
        const iso = (value) => new Date(value).toISOString();
        assert.equal(iso(entries[0].clockInAt), iso(example.retainedIn ?? shifts[0].start));
        assert.equal(iso(entries.at(-1).clockOutAt), iso(example.retainedOut ?? last.end));
        assert.equal(vouchers.reduce((sum, line) => sum + line.workedMinutes, 0), paid);
        assert.equal(vouchers.reduce((sum, line) => sum + line.breakMinutes, 0), paidBreak);
      }
      assert.equal(sessions.flatMap((session) => session.breaks).length, pause ? 1 : 0);
      const report = await request("get", reportPath, { query: filters });
      assert.equal(report.status, 200);
      const { values, weeklyHours } = report.data.rows[0];
      assert.equal(values.paid ?? null, paid);
      assert.equal(values.paidBreak ?? null, paid === null ? null : paidBreak);
      assert.equal(values.referenceWorked, paid ?? 0);
      assert.equal(values.mealsDue, paid === null ? 0 : 2 * shifts.length);
      if (example.weekly || paid === null) assert.equal(weeklyHours["2026-W45"].retainedWeek, paid);
      if (sessions.length) assert.equal(values.clockBreak, rawBreak);
      if (example.late) assert.equal(values.late, example.late);
      for (const [key, value] of Object.entries(premiums)) assert.equal(values[key], value, key);

      const excel = await request("post", reportPath + "/export/excel", { body: filters });
      assert.equal(excel.status, 200);
      const [summary, employeeSheet, detail] = parseXlsxSheets(excel.data, { storedValuesOnly: true });
      assert.equal(detail.name, "Détails");
      const [labels, ...lines] = detail.rows;
      const rows = lines.filter((line) => line[labels.indexOf("Travail / Absence")] === "Travail");
      const total = (label) => rows.reduce((sum, line) => sum + Math.round((line[labels.indexOf(label)] || 0) * 60), 0);
      const summaryValue = (label) => {
        const index = summary.rows[2].findIndex((column) => typeof column === "string" && column.startsWith(label));
        assert.ok(index >= 0, label);
        return summary.rows[3][index];
      };
      assert.equal(rows.length, entries.length);
      for (const [index, line] of rows.entries()) {
        const time = (label) => Math.round(line[labels.indexOf(label)] * 1440);
        assert.equal(time("Début"), minutesOfDay(vouchers[index].startAt));
        assert.equal(time("Fin"), minutesOfDay(vouchers[index].endAt));
      }
      assert.equal(total("Heures Travaillées (h)"), paid ?? 0);
      assert.equal(total("Pause (h)"), paidBreak);
      assert.equal(Math.round(summaryValue("Heures travaillées retenues (h)") * 60), paid ?? 0);
      assert.equal(summaryValue("Repas Dûs"), paid === null ? 0 : 2 * shifts.length);
      if (example.weekly || paid === null) {
        const week = employeeSheet.rows.find(([title]) => title?.startsWith("Semaine 45 ·"));
        if (paid === null) assert.ok(week[11] == null || week[11] === "");
        else assert.equal(Math.round(week[11] * 60), paid);
      }
      const premiumLabels = { extra10: "Dont Heures Supp. Exceptionnelles 10%", extra20: "Dont Heures Supp. Exceptionnelles 20%",
        extra50: "Dont Heures Supp. Exceptionnelles 50%", complement10: "Dont Heures Comp. 10%", complement25: "Dont Heures Comp. 25%",
        night0: "Heures de nuit 0%", sunday50: "Heures du dimanche 50%", holidays: "Heures Jour Férié (h)" };
      for (const [key, value] of Object.entries(premiums)) assert.equal(Math.round(summaryValue(premiumLabels[key]) * 60), value, key);
    });
  }
  await t.test("RH report and Excel enforce the active restaurant and reuse the same totals", async () => {
    const reportPath = "/restaurants/:restaurantId/employees/reports";
    const filters = { from: "2025-01-01", to: "2025-01-31" };
    await Employee.collection.updateOne(
      { _id: alice, "restaurantProfiles.restaurant": restaurant },
      { $set: { "restaurantProfiles.$.options.employees": true, "restaurantProfiles.$.employment.payrollCode": "0003" } },
    );
    await Session.collection.insertMany([
      { restaurant, employee: alice, clockInAt: new Date("2025-01-10T07:00:00Z"), clockOutAt: new Date("2025-01-10T11:00:00Z"),
        status: "closed", breaks: [], reviews: [{ type: "validated", at: new Date("2025-01-10T11:30:00Z") }],
        employeeSnapshot: { firstname: "Alice", lastname: "Fictif" } },
      { restaurant: other, employee: alice, clockInAt: new Date("2025-01-11T07:00:00Z"), clockOutAt: new Date("2025-01-11T09:00:00Z"),
        status: "closed", breaks: [], employeeSnapshot: { firstname: "Alice", lastname: "Fictif" } },
    ]);
    try {
      const { data, status, headers } = await call("get", reportPath, { query: filters });
      assert.equal(status, 200);
      assert.equal(headers["Cache-Control"], "private, no-store");
      assert.equal(data.rows.length, 2);
      assert.equal(data.totals.paid, 240);
      assert.ok(data.rows.some((row) => row.values.payrollCode === "0003"));
      assert.equal((await call("get", reportPath, { query: filters, authorization: auth(alice, "employee") })).status, 200);
      assert.equal((await call("get", reportPath, { query: filters, authorization: auth(bob, "employee") })).status, 403);
      assert.equal((await call("get", reportPath, { query: filters, authorization: auth(accountant, "accountant") })).status, 403);
      assert.equal((await call("get", reportPath, { query: filters, authorization: "" })).status, 403);
      assert.equal((await call("get", reportPath, { query: filters, restaurantId: other })).status, 403);
      assert.equal((await call("get", reportPath, { query: { ...filters, from: [] } })).status, 400);
      const scoped = await call("get", reportPath, { query: { ...filters, employeeId: String(outside) } });
      assert.deepEqual(scoped.data.rows, []);
      const otherSite = await call("get", reportPath, { query: filters, restaurantId: other, authorization: auth(owner, "owner", other) });
      assert.equal(otherSite.data.totals.paid, 120);
      const excel = await call("post", reportPath + "/export/excel", { body: { ...filters, employeeId: String(alice) } });
      assert.equal(excel.status, 200);
      assert.match(excel.headers["Content-Disposition"], /rapport-rh-restaurant-fictif-2025-01-01-au-2025-01-31/);
      assert.ok(excel.data.includes(Buffer.from('<v>4</v>')));
      assert.ok(excel.data.includes(Buffer.from('0003')));
      assert.equal((await call("post", reportPath + "/export/excel", { body: filters, authorization: auth(accountant, "accountant") })).status, 403);
    } finally {
      await Session.collection.deleteMany({ clockInAt: { $lt: new Date("2025-02-01T00:00:00Z") } });
      await Employee.collection.updateOne({ _id: alice, "restaurantProfiles.restaurant": restaurant },
        { $unset: { "restaurantProfiles.$.options.employees": "", "restaurantProfiles.$.employment.payrollCode": "" } });
    }
  });
  await t.test("RH input revisions, employee membership and restaurant meal rules are enforced", async () => {
    const reportPath = "/restaurants/:restaurantId/employees/reports";
    const rulesPath = reportPath + "/inputs/rules/:date";
    const settingsPath = reportPath + "/inputs/:kind/:date";
    const inputPath = reportPath + "/inputs/:employeeId/:kind/:date";
    const ids = { employeeId: String(alice), kind: "variables", date: "2025-03" };
    const rulesOptions = { date: "2025-03", body: { revision: 0, values: { mode: "indemnities", basis: "days", quantity: 2 } } };
    assert.equal((await call("put", rulesPath, { ...rulesOptions, authorization: auth(accountant, "accountant") })).status, 403);
    assert.equal((await call("put", rulesPath, rulesOptions)).status, 200);
    assert.equal((await call("get", rulesPath, { date: "2025-04" })).data.values.quantity, 2);
    assert.equal((await call("get", rulesPath, { date: "2025-02" })).data.revision, 0);
    const leaveSettings = {
      kind: "leaveRules", date: "-", body: { revision: 0, values: {
        startMonth: "2025-03", referenceMonth: 6, unit: "businessDays", excludeHolidays: true, preserveCarry: true,
        assimilated: ["paid_leave"],
      } },
    };
    assert.equal((await call("put", settingsPath, { ...leaveSettings, authorization: auth(accountant, "accountant") })).status, 403);
    assert.equal((await call("put", settingsPath, leaveSettings)).status, 200);
    assert.equal((await call("get", settingsPath, leaveSettings)).data.values.referenceMonth, 6);
    assert.equal((await call("get", settingsPath, { kind: "overtime", date: "2025-03-04" })).status, 400);
    assert.equal((await call("put", settingsPath, { kind: "overtime", date: "2025-03-03",
      body: { revision: 0, values: { enabled: false } } })).status, 200);
    assert.equal((await call("get", settingsPath, { kind: "overtime", date: "2025-03-10" })).data.values.enabled, false);
    const movement = { employeeId: String(alice), kind: "hoursEntry", date: "2025-03-04" };
    const saveMovement = (revision, hours) => call("put", inputPath, { ...movement, body: { revision, values: { operation: "adjust", hours } } });
    assert.equal((await saveMovement(0, 2)).status, 200);
    assert.equal((await saveMovement(0, 2)).status, 409);
    assert.equal((await saveMovement(1, -0.5)).status, 200);
    assert.deepEqual((await call("get", inputPath, movement)).data.values.entries.map(({ hours }) => hours), [2, -0.5]);
    assert.equal((await call("put", inputPath, { employeeId: String(alice), kind: "amendment", date: "2025-03-03",
      body: { revision: 0, values: { weeklyHours: 39 } } })).status, 200);
    const targetsPath = reportPath + "/planning-targets";
    const targets = await call("get", targetsPath, { query: { from: "2025-03-03" } });
    assert.equal(targets.data.targets[String(alice)].minutes, 39 * 60);
    assert.equal((await call("get", targetsPath, { query: { from: "2025-03-03" }, restaurantId: other })).status, 403);
    assert.equal((await call("get", inputPath, { ...ids, employeeId: String(outside) })).status, 404);
    assert.equal((await call("get", inputPath, { ...ids, employeeId: String(accountant) })).status, 404);
    assert.equal((await call("get", inputPath, { ...ids, authorization: auth(alice, "employee") })).status, 403);
    const candidates = await Promise.all([12.5, 35].map((bonus) => call("put", inputPath, {
      ...ids, body: { revision: 0, values: { bonus } },
    })));
    assert.deepEqual(candidates.map(({ status }) => status).sort(), [200, 409]);
    const savedBonus = candidates.find(({ status }) => status === 200).data.values.bonus;
    const read = await call("get", inputPath, ids);
    assert.equal(read.data.revision, 1);
    assert.equal(read.headers["Cache-Control"], "private, no-store");
    assert.equal((await call("get", inputPath, { ...ids, restaurantId: other })).status, 403);
    assert.deepEqual((await call("get", inputPath, { ...ids, restaurantId: other,
      authorization: auth(owner, "owner", other) })).data.values, {});
    const query = { from: "2025-03-01", to: "2025-03-31", employeeId: String(alice) };
    const report = await call("get", reportPath, { query });
    assert.equal(report.data.rows[0].values.bonus, savedBonus);
    assert.equal((await call("put", inputPath, { ...ids, body: { revision: 1, values: { advance: 20 } } })).status, 400);
    assert.equal((await call("put", inputPath, { ...ids, body: { revision: 1, values: {} } })).status, 200);
    assert.equal((await call("get", reportPath, { query })).data.rows[0].values.bonus, undefined);
  });
  await t.test("une paie non déterminée bloque les validations et sort sans montant dans les exports", async () => {
    const day = "2025-02-11";
    const updatedAt = new Date();
    const { insertedId } = await Session.collection.insertOne({ restaurant, employee: bob, status: "closed",
      businessDate: day, clockInAt: new Date(day + "T08:03:00Z"), clockOutAt: new Date(day + "T11:45:00Z"),
      breaks: [], reviews: [], updatedAt, __v: 0, clockRule: { enabled: true, earlyIn: "planned" } });
    try {
      const sessionId = String(insertedId);
      assert.equal((await call("put", base + "/sessions/:sessionId/review", { sessionId,
        body: { validated: true, expectedUpdatedAt: updatedAt.toISOString(), expectedRevision: 0 } })).status, 409);
      assert.equal((await call("post", base + "/register/review", { body: { from: day, to: day, employeeId: String(bob) } })).status, 409);
      const body = { from: day, to: day, employeeIds: [String(bob)] };
      const pdf = await call("post", base + "/export/pdf", { body });
      assert.match(readPdfText(pdf.data), /Heures rémunérées nettes: À vérifier/);
      const excel = await call("post", base + "/export/excel", { body });
      assert.match(excel.data.toString(), /À corriger/);
    } finally { await Session.collection.deleteOne({ _id: insertedId }); }
  });
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
  const retainedRule = { enabled: true, earlyIn: "clocked", lateIn: "clocked", earlyOut: "clocked", lateOut: "clocked", roundMinutes: 0, pause: "clocked" };
  const clockSettings = "/restaurants/:restaurantId/employees/reports/inputs/:kind/:date";
  const ruleDate = toLocalDateKey(new Date(Date.now() - 86400000));
  const settings = { kind: "clockRules", date: ruleDate };
  assert.equal((await call("put", clockSettings, { ...settings, body: { revision: 0, values: retainedRule } })).status, 200);
  assert.deepEqual((await call("get", clockSettings, { ...settings, date: toLocalDateKey(new Date()) })).data.values, retainedRule);
  assert.deepEqual((await call("get", clockSettings, { ...settings, restaurantId: other, authorization: auth(owner, "owner", other) })).data.values, {});
  const anchor = Date.now() - 45_000;
  const actions = ["clock_in", "break_start", "break_end", "clock_out"].map((action, index) =>
    signedPunch(restaurant, keys.signing.privateKey, String(alice), offline.grant, action, new Date(anchor + index * 10_000)));
  assert.equal((await punch(actions[0], other)).status, 401);
  assert.equal((await punch({ ...actions[0], employeeId: String(bob) })).status, 422);
  const duplicate = await Promise.all([punch(actions[0]), punch(actions[0])]);
  assert.ok(duplicate.some((response) => response.status === 201));
  assert.ok(duplicate.every((response) => [200, 201, 503].includes(response.status)));
  assert.equal((await punch(actions[0])).data.idempotentReplay, true);
  assert.equal((await call("put", clockSettings, { ...settings, body: { revision: 1, values: { enabled: false } } })).status, 200);
  for (const action of actions.slice(1)) assert.equal((await punch(action)).status, 200);
  const stored = await Session.findOne({ restaurant, employee: alice }).lean();
  assert.equal(stored.clockRule.revision, 1);
  assert.equal(stored.automaticPayroll.clockInAt.getTime(), stored.clockInAt.getTime());
  assert.equal(stored.automaticPayroll.breaks.length, 1);
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
  assert.match(pdf.data.toString("latin1"), /\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/);
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
  await t.test("native punches, retained hours, RH report and Excel agree for a fictitious restaurant", checkRetainedHours);

  await t.test("les services chevauchants bloquent la paie et les écritures concurrentes sans modifier le brut", async () => {
    const restaurantId = new ObjectId();
    const employeeId = new ObjectId();
    const day = "2026-11-10";
    const monday = "2026-11-09";
    const stamp = (hour) => `${day}T${hour}:00+01:00`;
    const filters = { from: day, to: day, employeeId: String(employeeId) };
    const request = (method, path, options) => call(method, path, {
      restaurantId, authorization: auth(owner, "owner", restaurantId), ...options,
    });
    const employee = member(employeeId, "Chevauchement fictif", [restaurantId]);
    Object.assign(employee.restaurantProfiles[0], {
      snapshot: { dateOnPost: new Date("2026-11-09T08:00:00Z") },
      employment: { contractualUnit: "week", contractualValue: 35, contractType: "CDI" },
    });
    await Restaurant.collection.insertOne({ _id: restaurantId, owner_id: owner, name: "Chevauchement fictif",
      employees: [employeeId], options: { employees: true } });
    await Employee.collection.insertOne(employee);
    const reportPath = "/restaurants/:restaurantId/employees/reports";
    await PersonnelReportInput.collection.insertMany([
      { _id: `${restaurantId}:overtime`, restaurant: restaurantId, kind: "overtime", date: monday,
        values: { enabled: true, source: "validated", ordinary: 35, firstEnd: 39, secondEnd: 43,
          firstRate: 10, secondRate: 20, lastRate: 50, complementBand: 10, complementFirstRate: 10,
          complementLastRate: 25, workdays: 5, creditedAbsences: [], nightRate: 10, nightStart: "22:00",
          nightEnd: "07:00", sundayRate: null, holidayRate: null } },
      { _id: `${restaurantId}:hoursRules`, restaurant: restaurantId, kind: "hoursRules", date: monday,
        values: { start: monday, enhanced: true } },
    ]);
    const signature = { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] }] };
    const badge = (action, hour) => request("post", base + "/punch", { body: {
      employeeId: String(employeeId), businessDate: day, action, occurredAt: stamp(hour), signature,
    } });
    assert.equal((await badge("clock_in", "08:00")).status, 201);
    const first = await badge("clock_out", "10:00");
    assert.equal(first.status, 200);
    assert.equal((await badge("clock_in", "09:00")).status, 409);
    assert.equal((await badge("clock_in", "10:30")).status, 201);
    const second = await badge("clock_out", "12:00");
    assert.equal(second.status, 200);
    const ids = [first.data.sessionId, second.data.sessionId];
    const rows = () => Promise.all(ids.map((id) => Session.findById(id).lean()));
    const editPay = (id, row, changes) => request("put", base + "/sessions/:sessionId/payroll", {
      sessionId: id, body: { ...revisionOf(row), reason: "Contrôle fictif", ...changes },
    });
    const reviewPay = (id, row, validated) => request("put", base + "/sessions/:sessionId/review", {
      sessionId: id, body: { ...revisionOf(row), validated },
    });
    const before = await rows();
    const rejected = await editPay(ids[0], before[0], { clockOutAt: stamp("11:00") });
    assert.equal(rejected.status, 409);
    assert.match(rejected.data.message, /chevauchent/);
    assert.deepEqual(await rows(), before);
    const competing = await Promise.all([
      editPay(ids[0], before[0], { clockOutAt: stamp("10:20") }),
      editPay(ids[1], before[1], { clockInAt: stamp("10:10") }),
    ]);
    assert.deepEqual(competing.map(({ status }) => status).sort(), [200, 409]);
    const after = await rows();
    const nextStart = (after[1].payroll || after[1]).clockInAt.toISOString();
    assert.equal((await editPay(ids[0], after[0], { clockOutAt: nextStart })).status, 200);
    const touching = await rows();
    assert.deepEqual(touching.map(({ events }) => events), before.map(({ events }) => events));
    assert.equal(touching[0].payrollAdjustments.at(-1).reason, "Contrôle fictif");
    assert.deepEqual((await Promise.all(touching.map((row, i) => reviewPay(ids[i], row, true))))
      .map(({ status }) => status), [200, 200]);

    // An already validated legacy pair is detected on reads without rewriting either session.
    await Session.collection.updateOne({ _id: before[0]._id },
      { $set: { "payroll.clockOutAt": new Date(stamp("11:00")) } });
    await Session.collection.updateOne({ _id: before[1]._id }, { $unset: { payroll: "" } });
    const legacy = await rows();
    assert.deepEqual((await Promise.all(legacy.map((row, i) => reviewPay(ids[i], row, true))))
      .map(({ status }) => status), [409, 409]);
    assert.equal((await request("post", base + "/register/review", { body: filters })).status, 409);
    const register = await request("get", base + "/register", { query: filters });
    assert.equal(register.data.rows[0].days[0].payroll.filter(({ payrollOverlap }) => payrollOverlap).length, 2);
    const result = await request("get", reportPath, { query: filters });
    assert.equal(result.data.payrollIssues[0].kind, "payrollOverlap");
    for (const field of ["paid", "referenceWorked", "extra10", "night10", "counterEnd"]) {
      assert.equal(result.data.rows[0].values[field], null, field);
    }
    assert.equal((await request("post", reportPath + "/export/excel", { body: filters })).status, 409);
    for (const format of ["pdf", "excel"]) {
      assert.equal((await request("post", base + "/export/" + format, { body: { ...filters, employeeIds: [String(employeeId)] } })).status, 409);
    }
    assert.deepEqual(await rows(), legacy);
    const reopened = await reviewPay(ids[0], legacy[0], false);
    assert.equal(reopened.status, 200);
    const [reopenedRow] = await rows();
    assert.equal((await editPay(ids[0], reopenedRow, { clockOutAt: stamp("10:30") })).status, 200);
    const [resolved] = await rows();
    assert.equal((await reviewPay(ids[0], resolved, true)).status, 200);
    assert.equal((await request("post", reportPath + "/export/excel", { body: filters })).status, 200);
  });
});
