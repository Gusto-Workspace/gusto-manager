const assert = require("node:assert/strict");
const { once } = require("node:events");
const { test } = require("node:test");
const { DateTime } = require("luxon");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-hr-questionnaire";
process.env.TIME_CLOCK_SECRET = "synthetic-clock-questionnaire";
const routes = require("../../routes/admin/hr-configuration.routes");
const clock = require("../../routes/time-clock.routes");
const Restaurant = require("../../models/restaurant.model");
const Owner = require("../../models/owner.model");
const Employee = require("../../models/employee.model");
const Input = require("../../models/personnel-report-input.model");
const Session = require("../../models/time-clock-session.model");
const Draft = require("../../models/hr-configuration-draft.model");
const Audit = require("../../models/hr-configuration-import.model");
const { kinds } = require("../../services/employees/hr-configuration-format.service");
const { questionnaireRule } = require("../../services/employees/hr-configuration-draft.service");
const { parseXlsxSheets } = require("../../services/dish-card-import.service");
const example = require("../../docs/configurations-rh/les-artistes-limoges.json");

const yes = (value) => ({ status: "confirmed", value });
const unknown = { status: "to_confirm" };
const family = (values) => ({ mode: "on", answers: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, yes(value)])) });
const clockValues = { earlyIn: "planned", lateIn: "planned", earlyOut: "clocked", lateOut: "clocked", roundMinutes: 0, pause: "plannedFallback" };

test("draft answers distinguish unconfigured, unknown, disabled, zero and explicit empty values", () => {
  assert.equal(questionnaireRule("clockRules").status, "unconfigured");
  assert.equal(questionnaireRule("clockRules", { mode: "unknown", answers: {} }).status, "to_confirm");
  assert.deepEqual(questionnaireRule("clockRules", { mode: "off", answers: {} }).values, { enabled: false });
  assert.equal(questionnaireRule("clockRules", family(clockValues)).values.roundMinutes, 0);
  const meals = questionnaireRule("rules", family({ mode: "combined", basis: "days", quantity: 0, amount: null }));
  assert.equal(meals.values.quantity, 0);
  assert.equal(meals.values.amount, null);
  assert.equal(questionnaireRule("rules", family({ mode: "basket", amount: null })).status, "to_confirm");
  assert.equal(questionnaireRule("rules", family({ mode: "combined", basis: "days", quantity: 2 })).status, "to_confirm");
  assert.equal(questionnaireRule("clockRules", { mode: "on", answers: { earlyIn: unknown } }).missing, 6);
});

const uri = process.env.GUSTO_CLOCK_TEST_MONGO_URI;
test("owners and admins share resumable drafts, dated import, history and applicable payroll safeguards", {
  skip: uri ? false : "Dedicated loopback MongoDB replica set required",
}, async (t) => {
  const parsed = new URL(uri);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.protocol, "mongodb:");
  assert.equal(parsed.username + parsed.password, "");
  assert.equal(parsed.pathname, "/");
  const objectId = () => new mongoose.Types.ObjectId();
  await mongoose.connect(uri, { dbName: `gusto_questionnaire_${objectId()}`, serverSelectionTimeoutMS: 5000 });
  const app = express().use(express.json()).use(routes).use(clock);
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(async () => {
    listener.close();
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  await Promise.all([Draft.init(), Input.init(), Session.init(), Audit.init()]);
  const [first, second, firstOwner, secondOwner, administrator, employee, profile] = Array.from({ length: 7 }, objectId);
  const tomorrow = DateTime.now().setZone("Europe/Paris").plus({ days: 1 }).startOf("day");
  let opening = tomorrow.plus({ months: 1 }).startOf("month");
  while (opening.weekday !== 1) opening = opening.plus({ months: 1 });
  const day = opening.toISODate();
  const earlier = tomorrow.minus({ days: 3 }).toISODate();
  const hours = (current, hour, minute = 0) => current.set({ hour, minute }).toISO();
  await Promise.all([
    Owner.collection.insertMany([{ _id: firstOwner, firstname: "Propriétaire fictif A" }, { _id: secondOwner, firstname: "Propriétaire fictif B" }]),
    Restaurant.collection.insertMany([
      { _id: first, name: "Restaurant sans import fictif", owner_id: firstOwner, options: { employees: true }, employees: [employee] },
      { _id: second, name: "Restaurant avec import fictif", owner_id: secondOwner, options: { employees: true }, employees: [] },
    ]),
    Employee.collection.insertOne({ _id: employee, firstname: "Camille", lastname: "Fictif", restaurants: [first], accountType: "employee",
      restaurantProfiles: [{ _id: profile, restaurant: first, snapshot: { dateOnPost: new Date(earlier + "T00:00:00Z") },
        employment: { contractualUnit: "week", contractualValue: 35, contractType: "CDI" }, shifts: [tomorrow, opening].map((current) => ({
          _id: objectId(), start: new Date(hours(current, 9)), end: new Date(hours(current, 17)), breakMinutes: 30,
        })) }] }),
  ]);
  const ownerBase = (id) => `/restaurants/${id}/hr-configuration`;
  const adminBase = (id) => `/admin/restaurants/${id}/hr-configuration`;
  const auth = (role, id, restaurantId) => jwt.sign({ role, id: String(id), restaurantId: String(restaurantId) }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const firstToken = auth("owner", firstOwner, first);
  const secondToken = auth("owner", secondOwner, second);
  const adminToken = auth("admin", administrator, first);
  const call = (path, method = "GET", body, token = firstToken) => fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body && { body: JSON.stringify(body) }),
  });
  async function json(path, method, body, token, expected = 200) {
    const response = await call(path, method, body, token);
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  const base = ownerBase(first);
  const put = (draft, route = base, token) => json(`${route}/draft`, "PUT", { draft }, token);
  const effects = Object.fromEntries(kinds.map((kind) => [kind, day]));
  const report = `/restaurants/${first}/employees/reports`;
  const clockBase = `/restaurants/${first}/time-clock`;
  const filters = (date) => ({ from: date, to: date, employeeId: String(employee) });
  const excel = async (date) => {
    const response = await call(`${report}/export/excel`, "POST", filters(date));
    if (!response.ok) assert.fail(`Excel ${response.status}: ${await response.text()}`);
    return parseXlsxSheets(Buffer.from(await response.arrayBuffer()), { storedValuesOnly: true });
  };
  const before = await excel(earlier);
  const blank = await json(`${base}/draft`);
  assert.equal(blank.revision, 0);
  assert.equal(blank.needsSetup, true);
  assert.ok(Object.values(blank.statuses).every(({ status }) => status === "unconfigured"));
  assert.equal((await call(`${ownerBase(second)}/draft`)).status, 403);
  assert.equal((await call(`${ownerBase(second)}/draft`, "GET", null, auth("owner", firstOwner, second))).status, 403);
  assert.equal((await call(`${base}/draft`, "GET", null, auth("employee", employee, first))).status, 403);
  assert.equal((await call(`${adminBase(first)}/draft`)).status, 403);
  assert.equal((await call(`${adminBase(first)}/draft`, "GET", null, auth("seller", administrator, first))).status, 403);

  const partial = { clockRules: { mode: "on", answers: { earlyIn: unknown } }, overtime: { mode: "unknown", answers: {} },
    hoursRules: { mode: "off", answers: {} } };
  let saved = await put({ families: partial, step: 3, revision: 0 });
  assert.equal(saved.statuses.hoursRules.status, "not_applicable");
  assert.equal(saved.statuses.clockRules.status, "to_confirm");
  assert.equal(await Input.countDocuments({ restaurant: first }), 0);
  const reopened = await json(`${adminBase(first)}/draft`, "GET", null, adminToken);
  assert.deepEqual([reopened.step, reopened.families], [3, partial]);
  const sameRevision = { families: partial, step: 6, revision: saved.revision };
  const concurrent = await Promise.all([call(`${base}/draft`, "PUT", { draft: sameRevision }),
    call(`${base}/draft`, "PUT", { draft: sameRevision })]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  saved = await concurrent.find((response) => response.status === 200).json();
  let preview = await json(`${base}/draft/preview`, "POST", { revision: saved.revision, effects });
  assert.deepEqual(preview.rules.filter(({ action }) => action === "apply").map(({ kind }) => kind), ["hoursRules"]);

  async function punch(current, action, hour, minute = 0) {
    return json(`${clockBase}/punch`, "POST", { action, employeeId: String(employee), businessDate: current.toISODate(),
      occurredAt: hours(current, hour, minute), signature: { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] }] } },
    firstToken, action === "clock_in" ? 201 : 200);
  }
  const tomorrowDay = tomorrow.toISODate();
  await punch(tomorrow, "clock_in", 9);
  const captured = await punch(tomorrow, "clock_out", 17);
  const unresolved = await Session.findById(captured.sessionId).lean();
  const review = (session, sessionId) => call(`${clockBase}/sessions/${sessionId}/review`, "PUT", {
    validated: true, expectedRevision: session.__v, expectedUpdatedAt: session.updatedAt.toISOString(),
  });
  assert.equal((await review(unresolved, captured.sessionId)).status, 409);
  assert.equal((await call(`${clockBase}/register/review`, "POST", filters(tomorrowDay))).status, 409);
  assert.equal((await call(`${report}/export/excel`, "POST", filters(tomorrowDay))).status, 409);
  const issues = await json(`${report}?${new URLSearchParams(filters(tomorrowDay))}`);
  assert.deepEqual(issues.payrollIssues.map(({ kind }) => kind), ["clockRules"]);
  assert.deepEqual(await excel(earlier), before);

  const complete = {
    clockRules: family(clockValues),
    overtime: family({ source: "validated", ordinary: 35, firstEnd: 39, secondEnd: 43, firstRate: 10, secondRate: 20, lastRate: 50,
      complementBand: 10, complementFirstRate: 10, complementLastRate: 25, workdays: 5, creditedAbsences: [], weekdays: null,
      paidLeaveDays: null, nightRate: null, sundayRate: 0, holidayRate: null, countHolidays: false, structuralMonthly: false }),
    hoursRules: family({ start: day, enhanced: false }),
    leaveRules: family({ startMonth: day.slice(0, 7), referenceMonth: 6, unit: "businessDays", excludeHolidays: true,
      preserveCarry: true, assimilated: [], weekdays: null }),
    absenceRules: family({ categories: { paid_leave: { payer: "employer", meal: 0 } }, reviewCategories: true }),
    rules: family({ mode: "combined", basis: "days", quantity: 2, amount: null }),
  };
  const oldToken = preview.token;
  saved = await put({ families: complete, effects, step: 6, revision: saved.revision });
  assert.ok(Object.values(saved.statuses).every(({ status }) => status === "confirmed"));
  assert.equal((await call(`${base}/draft/apply`, "POST", { revision: saved.revision, effects, token: oldToken, confirmed: true })).status, 409);
  preview = await json(`${base}/draft/preview`, "POST", { revision: saved.revision, effects });
  const allowed = { revision: saved.revision, effects, token: preview.token, confirmed: true };
  const applies = await Promise.all([call(`${base}/draft/apply`, "POST", allowed), call(`${base}/draft/apply`, "POST", allowed)]);
  assert.deepEqual(applies.map((response) => response.status).sort(), [200, 409]);
  const { batch } = await applies.find((response) => response.status === 200).json();
  assert.equal(batch.kinds.length, 6);
  assert.equal(await Input.countDocuments({ restaurant: first, employee: null, profile: null }), 6);
  assert.equal(await Input.countDocuments({ restaurant: first, employee }), 0);
  const activePreview = await json(`${base}/draft/preview`, "POST", { revision: saved.revision, effects });
  assert.equal(activePreview.token, null);
  assert.deepEqual(await excel(earlier), before);
  assert.equal((await json(`${base}/history`)).batches[0].id, batch.id);
  assert.equal((await call(`${ownerBase(second)}/${batch.id}/restore`, "POST", { confirmed: true }, secondToken)).status, 404);

  await punch(opening, "clock_in", 9, 13);
  const paid = await punch(opening, "clock_out", 17, 13);
  const session = await Session.findById(paid.sessionId).lean();
  assert.equal(session.clockRule.pause, "plannedFallback");
  assert.equal((await review(session, paid.sessionId)).status, 200);
  const payroll = await json(`${report}?${new URLSearchParams(filters(day))}`);
  assert.deepEqual([payroll.rows[0].values.paid, payroll.rows[0].values.paidBreak, payroll.rows[0].values.mealsDue], [463, 30, 2]);
  const detail = (await excel(day)).find((sheet) => sheet.name === "Détails");
  assert.equal(Math.round(detail.rows[1][detail.rows[0].indexOf("Heures Travaillées (h)")] * 60), 463);

  const clockOnly = { ...example, rules: { clockRules: example.rules.clockRules } };
  async function importSkello(target, effect, configuration = clockOnly) {
    const path = adminBase(target);
    const plan = await json(`${path}/preview`, "POST", { configuration, effect }, adminToken);
    return json(`${path}/apply`, "POST", { configuration, effect, token: plan.token, confirmed: true }, adminToken);
  }
  const caseSkello = structuredClone(clockOnly);
  caseSkello.rules.clockRules.values.earlyIn = "clocked";
  const later = opening.plus({ days: 7 }).toISODate();
  assert.equal((await importSkello(first, later, caseSkello)).batch.kinds[0], "clockRules");
  assert.deepEqual((await json(`${base}/draft`)).families, complete);
  await importSkello(second, day);
  const afterSkello = await put({ families: { clockRules: { mode: "unknown", answers: {} }, rules: complete.rules }, step: 6, revision: 0 }, ownerBase(second), secondToken);
  const overSecond = `${ownerBase(second)}/draft`;
  const supplement = await json(`${overSecond}/preview`, "POST", { revision: afterSkello.revision, effects }, secondToken);
  const add = await json(`${overSecond}/apply`, "POST", { revision: afterSkello.revision, effects, token: supplement.token, confirmed: true }, secondToken);
  assert.deepEqual(add.batch.kinds, ["rules"]);
  assert.equal(await Input.countDocuments({ restaurant: second, kind: "clockRules" }), 1);
  assert.equal((await json(`${base}/${batch.id}/restore`, "POST", { confirmed: true })).batch.canRestore, false);
  assert.equal(await Input.countDocuments({ restaurant: first }), 1);
});
