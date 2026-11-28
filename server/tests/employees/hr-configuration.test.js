const assert = require("node:assert/strict");
const { once } = require("node:events");
const { test } = require("node:test");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { DateTime } = require("luxon");

process.env.JWT_SECRET = "hr-configuration-test-signing-key";
process.env.TIME_CLOCK_SECRET = "hr-configuration-test-clock-key";

const route = require("../../routes/admin/hr-configuration.routes");
const clockRouter = require("../../routes/time-clock.routes");
const Input = require("../../models/personnel-report-input.model");
const Import = require("../../models/hr-configuration-import.model");
const Restaurant = require("../../models/restaurant.model");
const Owner = require("../../models/owner.model");
const Admin = require("../../models/admin.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const Employee = require("../../models/employee.model");
const Session = require("../../models/time-clock-session.model");
const { parseXlsxSheets } = require("../../services/dish-card-import.service");
const { readHrConfiguration } = require("../../services/employees/hr-configuration-format.service");
const { validateValues } = require("../../services/employees/personnel-report-pay.service");
const lesArtistes = require("../../docs/configurations-rh/les-artistes-limoges.json");

test("the Skello file preserves individual observations and rejects extra or ambiguous data", () => {
  assert.equal(readHrConfiguration(lesArtistes).rules.clockRules.values.pause, "plannedFallback");
  assert.equal(lesArtistes.observations.find(({ id }) => id === "gusto-break").origin.system, "gusto");
  const cycle = lesArtistes.observations.find(({ id }) => id === "paid-leave-cycle");
  assert.deepEqual([cycle.status, cycle.value, cycle.gusto], ["confirmed", 6, "leaveRules.referenceMonth"]);
  assert.equal(lesArtistes.rules.leaveRules.values, null);
  for (const change of [
    (file) => { file.version = 2; },
    (file) => { file.metadata.restaurantId = "012345678901234567890123"; },
    (file) => { file.rules.contract = file.rules.clockRules; },
    (file) => { file.rules.clockRules.values.roundMinutes = "0"; },
    (file) => { file.rules.clockRules.values.pause = "fallback"; },
    (file) => { delete file.rules.clockRules.values.earlyOut; },
    (file) => { file.rules.overtime.status = "confirmed"; },
    (file) => { file.rules.leaveRules.values = { referenceMonth: 6, unit: "businessDays" }; },
    (file) => { file.rules.rules.values.criteria = [{ start: "11:30", end: "14:00", minimum: null, maximum: null, salary: 2000 }]; },
    (file) => { file.rules.clockRules.preserveUnspecified = true; },
    (file) => { file.rules.absenceRules.values.categories = {}; },
    (file) => { file.rules.rules.preserveUnspecified = false; },
    (file) => { file.observations.push(file.observations[0]); },
  ]) {
    const copy = structuredClone(lesArtistes);
    change(copy);
    assert.throws(() => readHrConfiguration(copy), { status: 400 });
  }
});

const testUri = process.env.GUSTO_CLOCK_TEST_MONGO_URI;
test("RH configuration previews, applies, reports and restores only in the selected fictitious restaurant", {
  skip: testUri ? false : "Requires a dedicated loopback replica set",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.pathname, "/");
  assert.equal(uri.username + uri.password, "");
  const { ObjectId } = mongoose.Types;
  await mongoose.connect(testUri, { dbName: `gusto_hr_config_${new ObjectId()}`, serverSelectionTimeoutMS: 6000 });
  const app = express().use(express.json()).use(route).use(clockRouter);
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(async () => {
    listener.close();
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  await Promise.all([Import.init(), Input.init(), Session.init()]);
  const [source, target, owner, employee, admin, otherAdmin] = Array.from({ length: 6 }, () => new ObjectId());
  const today = DateTime.now().setZone("Europe/Paris").startOf("day");
  const old = today.minus({ months: 1 }).startOf("week");
  const tomorrow = today.plus({ days: 1 }).toISODate();
  let opening = today.plus({ months: 1 }).startOf("month");
  while (opening.weekday !== 1) opening = opening.plus({ months: 1 });
  const date = opening.toISODate();
  const local = (hour, minute = 0) => opening.set({ hour, minute }).toISO();
  const clock = lesArtistes.rules.clockRules.values;
  const overtime = { enabled: true, source: "validated", ordinary: 35, firstEnd: 39, secondEnd: 43, firstRate: 10, secondRate: 20,
    lastRate: 50, complementBand: 10, complementFirstRate: 10, complementLastRate: 25, workdays: 5, creditedAbsences: [],
    nightStart: "22:00", nightEnd: "07:00", nightRate: 0, sundayRate: 30, holidayRate: null };
  const meals = { mode: "combined", basis: "days", quantity: 2, amount: null, criteria: null };
  const id = (restaurant, kind, start) => `${restaurant}:restaurant:${kind}:${start}`;
  function row(restaurant, kind, start, values) {
    return { _id: id(restaurant, kind, start), restaurant, kind, date: start, values: validateValues(kind, values, start), revision: 1, updatedBy: String(admin) };
  }
  const oldClock = row(target, "clockRules", old.toISODate(), { ...clock, pause: "clocked" });
  const futureMeal = row(target, "rules", date.slice(0, 7), { ...meals, quantity: 1 });
  await Promise.all([
    Admin.collection.insertMany([{ _id: admin, role: "admin" }, { _id: otherAdmin, role: "admin" }]),
    Owner.collection.insertOne({ _id: owner, firstname: "Responsable fictif" }),
    Restaurant.collection.insertMany([
      { _id: source, name: "Source fictive", options: { employees: true }, employees: [] },
      { _id: target, name: "Destination fictive", owner_id: owner, options: { employees: true }, employees: [employee] },
    ]),
    Employee.collection.insertOne({ _id: employee, firstname: "Salarié", lastname: "Fictif", accountType: "employee", restaurants: [target],
      restaurantProfiles: [{ _id: new ObjectId(), restaurant: target, shifts: [{ _id: new ObjectId(), start: new Date(local(9)), end: new Date(local(17)), breakMinutes: 30 }],
        snapshot: { dateOnPost: old.toJSDate() }, employment: { contractualUnit: "week", contractualValue: 35, contractType: "CDI" } }] }),
    Input.insertMany([
      row(source, "clockRules", old.toISODate(), clock), row(source, "overtime", old.toISODate(), overtime),
      row(source, "rules", old.toFormat("yyyy-MM"), meals), row(source, "hoursRules", "-", { start: old.toISODate(), enhanced: true }),
      row(source, "leaveRules", "-", { startMonth: old.toFormat("yyyy-MM"), referenceMonth: 6, unit: "businessDays", excludeHolidays: true,
        preserveCarry: true, assimilated: [], weekdays: null }), row(source, "absenceRules", "-", { categories: { paid_leave: { payer: "employer", meal: 2 } } }),
      oldClock, futureMeal,
    ]),
  ]);

  const endpoint = (restaurant) => `/admin/restaurants/${restaurant}/hr-configuration`;
  const request = (path, body, { method = body ? "POST" : "GET", role = "admin", user, restaurant = target } = {}) => {
    const id = String(user || (role === "owner" ? owner : admin));
    const authorization = role === "admin" ? signAdminToken({ _id: id, role }) :
      role && jwt.sign({ id, role, restaurantId: String(restaurant) }, process.env.JWT_SECRET);
    return fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      method, ...(body && { body: JSON.stringify(body) }), headers: {
        "Content-Type": "application/json", ...(role && { Authorization: `Bearer ${authorization}` }),
      },
    });
  };
  const current = (kind, start) => Input.findById(id(target, kind, start)).lean();
  const base = endpoint(target);
  const report = `/restaurants/${target}/employees/reports`;
  const ownerCall = (path, body, method) => request(path, body, { method, role: "owner" });
  const past = { from: old.toISODate(), to: old.plus({ days: 6 }).toISODate(), employeeId: String(employee) };
  const closedWorkbook = async () => {
    const response = await ownerCall(`${report}/export/excel`, past);
    assert.equal(response.status, 200);
    return parseXlsxSheets(Buffer.from(await response.arrayBuffer()), { storedValuesOnly: true });
  };
  const closedBefore = await closedWorkbook();
  assert.equal((await request(`${endpoint(source)}/export`, null, { role: null })).status, 403);
  assert.equal((await request(`${endpoint(source)}/export`, null, { role: "seller" })).status, 403);
  assert.equal((await request(`${base}/preview`, {}, { role: "owner" })).status, 403);
  const exported = await request(`${endpoint(source)}/export`);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("cache-control"), "private, no-store");
  const configuration = readHrConfiguration(await exported.json());
  assert.equal(configuration.metadata.establishment, "Source fictive");
  assert.deepEqual(configuration.rules.clockRules.values, clock);
  assert.equal(configuration.rules.absenceRules.values.categories.paid_leave.meal, 2);
  assert.equal(JSON.stringify(configuration).includes(String(source)), false);
  assert.equal((await request(`${base}/preview`, { configuration, effect: today.toISODate() })).status, 400);
  assert.equal((await request(`${base}/preview`, { configuration: { ...configuration, version: 99 }, effect: date })).status, 400);
  const absenceDate = opening.plus({ days: 1 }).toISODate();
  const effects = Object.fromEntries(Object.keys(configuration.rules).map((kind) => [kind, kind === "absenceRules" ? absenceDate : date]));
  const payload = { configuration, effects };
  const inspect = async (body = payload) => {
    const response = await request(`${base}/preview`, body);
    const data = await response.json();
    assert.equal(response.status, 200, data.message);
    return data;
  };
  const targetInputs = () => Input.find({ restaurant: target }).sort({ _id: 1 }).lean();
  const inputsBeforePreview = await targetInputs();
  const restaurantBeforePreview = await Restaurant.findById(target).lean();
  const preview = await inspect();
  assert.deepEqual(await targetInputs(), inputsBeforePreview);
  assert.deepEqual(await Restaurant.findById(target).lean(), restaurantBeforePreview);
  assert.equal(await Import.countDocuments({ restaurant: target }), 0);
  assert.deepEqual(preview.target, { id: String(target), name: "Destination fictive" });
  const ready = preview.rules.filter(({ action }) => action === "apply");
  assert.deepEqual(ready.map(({ kind }) => kind), ["clockRules", "overtime", "rules", "leaveRules", "absenceRules", "hoursRules"]);
  assert.equal(preview.rules.filter(({ action }) => action === "blocked").length, 0);
  assert.equal(ready[0].previous.pause, "clocked");
  assert.equal(ready.find(({ kind }) => kind === "rules").previous.quantity, 1);
  const apply = (token, options = {}, path = base) => request(`${path}/apply`, { ...payload, token, confirmed: true, ...options });
  assert.equal((await apply(preview.token, { confirmed: false })).status, 400);
  assert.deepEqual(await targetInputs(), inputsBeforePreview);
  assert.equal(await Import.countDocuments({ restaurant: target }), 0);
  assert.equal((await apply(preview.token, {}, endpoint(source))).status, 409);
  assert.equal((await apply(preview.token, { effects: { ...effects, clockRules: opening.plus({ days: 7 }).toISODate() } })).status, 409);
  assert.equal((await request(`${base}/apply`, { ...payload, confirmed: true, token: preview.token }, { user: otherAdmin })).status, 409);
  const pendingMeal = structuredClone(lesArtistes);
  pendingMeal.rules.rules.status = "to_confirm";
  assert.equal((await request(`${base}/review`, { configuration: pendingMeal, review: {
    kind: "rules", values: { ...meals, amount: 4 }, reason: "", confirmed: true } })).status, 400);
  const reviewed = await request(`${base}/review`, { configuration: pendingMeal, review: {
    kind: "rules", values: { ...meals, amount: 4 }, reason: "Montant confirmé dans cette recette fictive.", confirmed: true } });
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).rules.rules.review.reason, "Montant confirmé dans cette recette fictive.");
  const separateDates = Object.fromEntries(Object.keys(configuration.rules).map((kind) => [kind, kind === "clockRules" ? tomorrow : date]));
  const separate = await inspect({ configuration, effects: separateDates });
  assert.deepEqual(separate.effects, separateDates);
  assert.equal(separate.rules.find(({ kind }) => kind === "clockRules").effect, tomorrow);
  await Input.updateOne({ _id: futureMeal._id }, { $inc: { revision: 1 } });
  assert.equal((await apply(preview.token)).status, 409);
  assert.equal(await current("clockRules", date), null);
  const refreshed = await inspect();
  const collection = Input.collection.collectionName;
  await mongoose.connection.db.command({ collMod: collection, validator: { $nor: [{ restaurant: target, kind: "rules", "values.quantity": 2 }] } });
  try {
    assert.equal((await apply(refreshed.token)).status, 500);
    assert.equal(await current("clockRules", date), null);
    assert.equal(await current("overtime", date), null);
    assert.equal(await Import.countDocuments({ restaurant: target }), 0);
  } finally {
    await mongoose.connection.db.command({ collMod: collection, validator: {} });
  }
  const results = await Promise.all([apply(refreshed.token), apply(refreshed.token)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const { batch } = await results.find(({ status }) => status === 200).json();
  assert.deepEqual(batch.effects, effects);
  for (const { kind, date: storageDate } of ready) {
    assert.deepEqual((await current(kind, storageDate)).values, validateValues(kind, configuration.rules[kind].values, storageDate));
  }
  assert.deepEqual((await current("clockRules", old.toISODate())).values, oldClock.values);
  assert.equal((await (await request(`${base}/export`)).json()).rules.clockRules.values.pause, "clocked");
  assert.equal((await (await request(endpoint(source))).json()).batches.length, 0);
  assert.equal(await current("leaveRules", "-"), null);
  assert.equal(await current("absenceRules", date), null);
  assert.deepEqual(await closedWorkbook(), closedBefore);
  assert.equal((await Import.findById(batch.id).lean()).changes.find(({ kind }) => kind === "rules").before.values.quantity, 1);
  assert.equal((await inspect()).token, null);

  const clockBase = `/restaurants/${target}/time-clock`;
  const signature = { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 }] }] };
  const events = [["clock_in", local(9, 13)], ["break_start", local(12)], ["break_end", local(12)], ["clock_out", local(17, 13)]];
  let sessionId;
  for (const [action, occurredAt] of events) {
    const response = await ownerCall(`${clockBase}/punch`, { employeeId: String(employee), businessDate: date, action, occurredAt,
      signature, source: "kiosk" });
    assert.equal(response.status, action === "clock_in" ? 201 : 200);
    sessionId = (await response.json()).sessionId;
  }
  const session = await Session.findById(sessionId).lean();
  assert.equal(session.clockRule.effectiveDate, date);
  assert.equal(session.clockRule.pause, "plannedFallback");
  const review = await ownerCall(`${clockBase}/sessions/${sessionId}/review`, { validated: true, expectedRevision: session.__v,
    expectedUpdatedAt: session.updatedAt.toISOString() }, "PUT");
  assert.equal(review.status, 200);
  const filters = { from: date, to: date, employeeId: String(employee) };
  const query = new URLSearchParams(filters);
  const register = await (await ownerCall(`${clockBase}/register?${query}`)).json();
  assert.equal(register.rows[0].days[0].payroll[0].timings.workedMinutes, 463);
  const { values } = (await (await ownerCall(`${report}?${query}`)).json()).rows[0];
  assert.deepEqual([values.clockBreak, values.paidBreak, values.referenceWorked, values.mealsDue], [0, 30, 463, 2]);
  const spreadsheet = await ownerCall(`${report}/export/excel`, filters);
  assert.equal(spreadsheet.status, 200);
  const [, , details] = parseXlsxSheets(Buffer.from(await spreadsheet.arrayBuffer()), { storedValuesOnly: true });
  const [labels, service] = details.rows;
  assert.equal(Math.round(service[labels.indexOf("Heures Travaillées (h)")] * 60), 463);
  assert.equal(service[labels.indexOf("Pause (h)")], 0.5);
  const targets = (range) => ownerCall(`${report}/planning-targets?from=${range}`);
  assert.equal((await (await targets(date)).json()).targets[String(employee)].hasCounter, true);
  assert.equal((await (await targets(old.toISODate())).json()).targets[String(employee)].hasCounter, false);
  assert.equal((await ownerCall(`/restaurants/${source}/employees/reports/planning-targets?from=${date}`)).status, 403);

  const path = `${base}/${batch.id}/restore`;
  assert.equal((await request(`${endpoint(source)}/${batch.id}/restore`, { confirmed: true })).status, 404);
  assert.equal((await request(`${endpoint(source)}/${batch.id}/backup`)).status, 404);
  const backup = readHrConfiguration(await (await request(`${base}/${batch.id}/backup`)).json());
  assert.equal(backup.rules.clockRules.values.pause, "clocked");
  assert.equal(backup.rules.rules.values.quantity, 1);
  assert.equal(backup.rules.leaveRules.values.startMonth, null);
  assert.equal((await request(path, { confirmed: false })).status, 400);
  // Repeat with an intervening edit in the last family. Earlier deletes must be rolled back.
  await Input.updateOne({ _id: futureMeal._id }, { $inc: { revision: 1 } });
  assert.equal((await request(path, { confirmed: true })).status, 409);
  assert.ok(await current("clockRules", date));
  assert.ok(await current("overtime", date));
  await Input.updateOne({ _id: futureMeal._id }, { $inc: { revision: -1 } });
  assert.equal((await request(path, { confirmed: true })).status, 200);
  assert.equal(await current("clockRules", date), null);
  assert.equal(await current("overtime", date), null);
  assert.equal(await current("leaveRules", date), null);
  assert.equal(await current("absenceRules", absenceDate), null);
  assert.equal(await current("hoursRules", date), null);
  assert.deepEqual((await current("rules", date.slice(0, 7))).values, futureMeal.values);
  assert.equal((await request(path, { confirmed: true })).status, 409);
  assert.equal((await (await targets(date)).json()).targets[String(employee)].hasCounter, false);

  const previousAbsences = { sick_leave: { payer: "thirdParty", meal: 2 } };
  await Input.insertMany([
    row(target, "absenceRules", "-", { categories: previousAbsences }),
    row(target, "hoursRules", "-", { start: old.toISODate(), enhanced: true }),
  ]);
  assert.equal((await (await targets(date)).json()).targets[String(employee)].hasCounter, true);
  const sample = { configuration: lesArtistes, effects: { ...effects, clockRules: tomorrow, absenceRules: date } };
  const fresh = await inspect(sample);
  assert.deepEqual(fresh.rules.filter(({ action }) => action === "skipped").map(({ kind }) => kind), ["overtime", "leaveRules"]);
  assert.equal(fresh.rules.find(({ kind }) => kind === "rules").rule.values.amount, null);

  const mealDate = date.slice(0, 7);
  await Input.updateOne({ _id: futureMeal._id }, { $set: { values: { mode: "basket", amount: 5 } } });
  const blocked = await inspect(sample);
  assert.equal(blocked.rules.find(({ kind }) => kind === "rules").action, "blocked");
  await Input.updateOne({ _id: futureMeal._id }, { $set: { values: { ...futureMeal.values, amount: 5 } } });
  const selective = await inspect(sample);
  const imported = await request(`${base}/apply`, { ...sample, confirmed: true, token: selective.token });
  assert.equal(imported.status, 200);
  assert.deepEqual((await imported.json()).batch.kinds, ["clockRules", "rules", "absenceRules", "hoursRules"]);
  assert.deepEqual((await current("clockRules", tomorrow)).values, lesArtistes.rules.clockRules.values);
  assert.deepEqual((await current("rules", mealDate)).values, { ...lesArtistes.rules.rules.values, amount: 5 });
  assert.deepEqual((await current("absenceRules", date)).values.categories,
    { ...previousAbsences, ...lesArtistes.rules.absenceRules.values.categories });
  assert.deepEqual((await current("hoursRules", date)).values, { start: null, enhanced: false });
  assert.equal(await Input.countDocuments({ restaurant: target, kind: { $in: ["overtime", "leaveRules"] } }), 0);
  assert.equal((await (await targets(date)).json()).targets[String(employee)].hasCounter, false);
  const repeated = await inspect(sample);
  assert.equal(repeated.token, null);
  assert.deepEqual(repeated.rules.map(({ action }) => action), ["unchanged", "skipped", "unchanged", "skipped", "unchanged", "unchanged"]);
  assert.equal((await request(`${base}/apply`, { ...sample, confirmed: true, token: selective.token })).status, 409);

  const absence = opening.plus({ days: 1 });
  await Employee.updateOne({ _id: employee }, { $push: { "restaurantProfiles.0.shifts": {
    _id: new ObjectId(), start: new Date(absence.set({ hour: 9 }).toISO()), end: new Date(absence.set({ hour: 17 }).toISO()),
    isLeave: true, absenceType: "paid_leave", absenceDuration: "full",
  } } });
  const reportRange = new URLSearchParams({ from: date, to: opening.plus({ days: 6 }).toISODate(), employeeId: String(employee) });
  const importedReport = (await (await ownerCall(`${report}?${reportRange}`)).json()).rows[0];
  assert.equal(importedReport.mealDays.find(({ date: day }) => day === date).due, 2);
  assert.equal(importedReport.mealDays.find(({ date: day }) => day === absence.toISODate()).protectedMeals, 2);
  assert.ok(Object.values(importedReport.weeklyHours).some(({ paidAbsences }) => paidAbsences?.employer === 420));

  const profile = (await Employee.findById(employee).lean()).restaurantProfiles[0]._id;
  await Input.create({ _id: `${target}:${profile}:annual:${date}`, restaurant: target, employee, profile, date, kind: "annual",
    values: { initialized: date, opening: 0, target: 1600, includeSunday: true }, revision: 1, updatedBy: String(admin) });
  assert.equal((await (await targets(date)).json()).targets[String(employee)].hasCounter, true);

  assert.equal(await Session.countDocuments({ restaurant: target }), 1);

  const completed = structuredClone(sample);
  completed.configuration.metadata.collectedOn = configuration.metadata.collectedOn;
  const nextMonth = opening.plus({ months: 1 }).toISODate();
  const nextMonday = opening.plus({ weeks: 1 }).toISODate();
  completed.effects = { ...sample.effects, clockRules: nextMonday, rules: nextMonth,
    overtime: nextMonday, leaveRules: nextMonth, hoursRules: nextMonday };
  completed.configuration.rules.overtime = configuration.rules.overtime;
  completed.configuration.rules.leaveRules = configuration.rules.leaveRules;
  completed.configuration.rules.absenceRules.values.categories = {
    family_event: { payer: "employer", meal: 1 }, paid_leave: { payer: null, meal: 0 },
  };
  const previewCompleted = await inspect(completed);
  assert.deepEqual(previewCompleted.rules.map(({ kind, action }) => [kind, action]), [
    ["clockRules", "unchanged"], ["overtime", "apply"], ["rules", "unchanged"],
    ["leaveRules", "apply"], ["absenceRules", "apply"], ["hoursRules", "unchanged"],
  ]);
  assert.equal(previewCompleted.rules.find(({ kind }) => kind === "rules").rule.values.amount, 5);
  const priorInputs = await targetInputs();
  const completedResult = await request(`${base}/apply`, { ...completed, confirmed: true, token: previewCompleted.token });
  assert.equal(completedResult.status, 200);
  assert.deepEqual((await completedResult.json()).batch.kinds, ["overtime", "leaveRules", "absenceRules"]);
  const absenceId = id(target, "absenceRules", date);
  const afterCompletion = await targetInputs();
  const previousIds = new Set(priorInputs.map(({ _id }) => _id));
  assert.deepEqual(afterCompletion.filter(({ _id }) => !previousIds.has(_id)).map(({ _id }) => _id).sort(),
    [id(target, "overtime", nextMonday), id(target, "leaveRules", nextMonth)].sort());
  assert.deepEqual(afterCompletion.filter(({ _id }) => previousIds.has(_id) && _id !== absenceId),
    priorInputs.filter(({ _id }) => _id !== absenceId));
  assert.deepEqual((await current("absenceRules", date)).values.categories, {
    ...previousAbsences, ...lesArtistes.rules.absenceRules.values.categories,
    family_event: { payer: "employer", meal: 1 }, paid_leave: { payer: "employer", meal: 0 },
  });
  const completedAgain = await inspect(completed);
  assert.equal(completedAgain.token, null);
  assert.ok(completedAgain.rules.every(({ action }) => action === "unchanged"));

  const otherConfiguration = structuredClone(configuration);
  otherConfiguration.rules = {
    rules: { ...otherConfiguration.rules.rules, preserveUnspecified: true, values: { ...meals, quantity: 3 } },
    absenceRules: { ...otherConfiguration.rules.absenceRules, preserveUnspecified: true,
      values: { categories: { paid_leave: { payer: null, meal: 0 } } } },
  };
  const otherPayload = { configuration: otherConfiguration, effect: date };
  const otherBase = endpoint(source);
  const otherPreview = await request(`${otherBase}/preview`, otherPayload);
  assert.equal(otherPreview.status, 200);
  const otherToken = (await otherPreview.json()).token;
  assert.ok(otherToken);
  const otherImport = await request(`${otherBase}/apply`, { ...otherPayload, token: otherToken, confirmed: true });
  assert.equal(otherImport.status, 200);
  assert.deepEqual((await otherImport.json()).batch.kinds, ["rules", "absenceRules"]);
  assert.deepEqual((await Input.findById(id(source, "rules", mealDate)).lean()).values, { ...meals, quantity: 3 });
  assert.deepEqual((await Input.findById(id(source, "absenceRules", date)).lean()).values.categories.paid_leave,
    { payer: "employer", meal: 0 });
});
