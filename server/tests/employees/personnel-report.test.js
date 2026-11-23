const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DateTime } = require("luxon");
const { buildPersonnelReport, validateReportFilters } = require("../../services/employees/personnel-report.service");
const { buildPersonnelReportWorkbook } = require("../../services/excel/render-personnel-report-workbook.service");
const { validateValues, validInputDate } = require("../../services/employees/personnel-report-pay.service");

const date = (value) => DateTime.fromISO(value, { zone: "Europe/Paris" }).toJSDate();
const restaurant = { name: "Restaurant fictif", opening_hours: [] };
const restaurantId = "fixture-restaurant";
const employeeId = "fixture-employee";

function profileEmployee(shifts = [], leaveRequests = [], employment = {}) {
  return {
    _id: employeeId, firstname: "Ari", lastname: "=2+2",
    restaurantProfiles: [{ _id: "fixture-profile", restaurant: restaurantId, snapshot: { post: "Cuisine", dateOnPost: date("2026-11-02") },
      shifts, leaveRequests, employment }],
  };
}

function session(id, start, end, overrides = {}) {
  return { _id: id, employee: employeeId, clockInAt: date(start), clockOutAt: date(end), status: "closed", breaks: [], ...overrides };
}

function report({ from = "2026-11-01", to = "2026-11-30", employee, sessions = [], attendance = [], planningDays = [],
  inputs = [], asOf = "2026-12-01", ...filters } = {}) {
  return buildPersonnelReport({ restaurant, restaurantId, employees: employee ? [employee] : [],
    sessions, attendance, planningDays, filters: { from, to, ...filters }, inputs, asOf, detail: true });
}

test("the report uses the same planned, clocked, and payroll values as the register", () => {
  const employee = profileEmployee([
    { _id: "shift1", start: date("2026-11-03T08:00"), end: date("2026-11-03T12:00"), breakMinutes: 20, requiresPlanningPublication: true },
    { _id: "shift2", start: date("2026-11-04T08:00"), end: date("2026-11-04T10:00"), requiresPlanningPublication: true },
  ], [], { contractType: "CDI", contractualUnit: "week", contractualValue: 39, payrollCode: "0012" });
  const first = session("clock1", "2026-11-03T08:00", "2026-11-03T11:45", {
    payroll: { clockInAt: date("2026-11-03T08:00"), clockOutAt: date("2026-11-03T11:45"), pauseMinutesByDay: [{ date: "2026-11-03", minutes: 15 }] },
    mealCountOverride: 2,
  });
  const second = session("clock2", "2026-11-04T08:00", "2026-11-04T10:00", {
    breaks: [{ _id: "break", startAt: date("2026-11-04T08:55"), endAt: date("2026-11-04T09:05") }],
    mealCountOverride: 0,
  });
  const output = report({ employee, sessions: [first, second],
    planningDays: [{ date: "2026-11-03", publishedEmployees: [employeeId] }] });
  const { values } = output.rows[0];
  assert.deepEqual([values.planned, values.draft, values.plannedBreak], [340, 120, 20]);
  assert.deepEqual([values.gross, values.clockBreak, values.worked], [345, 10, 335]);
  assert.deepEqual([values.paid, values.paidBreak, values.delta], [320, 25, -20]);
  assert.equal(values.mealsDue, undefined);
  assert.equal(values.weeklyHours, 39);
  assert.equal(values.monthlyHours, null);
  assert.equal(values["2026-W45"], null);
  assert.deepEqual(output.rows[0].weeklyHours["2026-W45"], {
    provisional: false, planned: 340, plannedBreak: 20, draft: 120, gross: 345, clockBreak: 10,
    worked: 335, workedDays: 2, paid: 320, paidBreak: 25, delta: -20,
    exceptional: null, counterVariation: null,
    contractWeek: 2340, paidAbsences: { employer: 0, thirdParty: 0, incomplete: false },
    plannedWeek: 340, plannedWeekCredit: 0, retainedWeek: 340, plannedWeekSurplus: null,
  });
  assert.equal(output.totals.paid, values.paid);
  assert.equal(output.rows[0].days.find(({ date }) => date === "2026-11-03").payroll[0].timings.workedMinutes, 210);
});

test("les pointages en attente de correction laissent les totaux de paie indéterminés", () => {
  const employee = profileEmployee([]);
  const record = session("unmatched", "2026-11-03T08:00", "2026-11-03T11:45", { clockRule: { enabled: true } });
  const result = report({ employee, sessions: [record] });
  assert.equal(result.rows[0].values.worked, 225);
  assert.equal(result.rows[0].values.requiresCorrection, true);
  assert.equal(result.rows[0].weeklyHours["2026-W45"].paid, null);
  assert.equal(result.totals.paid, null);
});

const input = (kind, date, values, profile = "fixture-profile") => ({ kind, date, values, profile });

test("historical lateness is scoped to the imported service and never becomes payroll", () => {
  const day = "2028-03-07";
  const start = date(`${day}T09:00`);
  const end = date(`${day}T13:00`);
  const employee = { ...profileEmployee([{ _id: "imported-service", start, end, breakMinutes: 30 }]), historicalImport: "synthetic-lot" };
  const values = { source: "skello", batch: employee.historicalImport, events: [{ shiftId: "imported-service", start, end, minutes: 27 }] };
  const history = input("historicalLate", day, values);
  const run = (extra = {}) => report({ from: day, to: day, employee, inputs: [history], ...extra }).rows[0];
  assert.deepEqual(run().tardiness, [{ shiftId: "imported-service", date: day, minutes: 27, source: "skello" }]);
  assert.deepEqual(run().values, { ...run({ inputs: [] }).values, late: 27 });
  assert.equal(run().days[0].sessions.length, 0);
  assert.equal(run({ inputs: [input("historicalLate", day, { ...values, batch: "another-batch" })] }).values.late, null);
  assert.equal(run({ inputs: [input("historicalLate", day, values, "other-profile")] }).values.late, null);
  assert.equal(run({ inputs: [history, history] }).values.late, 27);
  assert.equal(run({ attendance: [{ employee: employeeId, shift: "imported-service", shiftDate: day, absent: true, validated: true }] }).values.late, null);
  for (const [arrival, minutes] of [["09:12", 12], ["09:00", 0]]) {
    const validated = session("clock", `${day}T${arrival}`, `${day}T13:00`, { reviews: [{ type: "validated", at: end }] });
    const options = { sessions: [validated] };
    assert.deepEqual(run(options).tardiness, [{ shiftId: "imported-service", date: day, minutes, source: "clock" }]);
    assert.deepEqual(run(options).values, run({ ...options, inputs: [] }).values);
  }
  employee.restaurantProfiles[0].shifts[0].end = date(`${day}T12:55`);
  assert.equal(run().values.late, null);
});

const overtimeRules = validateValues("overtime", {
  enabled: true, source: "hybrid", ordinary: 35, firstEnd: 39, secondEnd: 43, firstRate: 10, secondRate: 20, lastRate: 50,
  complementBand: 10, complementFirstRate: 10, complementLastRate: 25, workdays: 5,
  creditedAbsences: ["paid_leave"], nightStart: "22:00", nightEnd: "07:00", nightRate: 0, sundayRate: null, holidayRate: null,
});
const paidLeave = (id, key, type = "full", status = "approved") => ({
  _id: id, start: date(`${key}T${type === "afternoon" ? "12:00" : "00:00"}`), end: date(`${key}T${type === "morning" ? "12:00" : "23:59:59"}`),
  type, status, absenceType: "paid_leave",
});

test("weekly planning, retained hours and Excel overtime recalculate on each restaurant profile", () => {
  const monday = "2027-02-01";
  const sunday = "2027-02-07";
  const week = "2027-W5";
  const employee = profileEmployee(workWeek(monday, [9, 9, 9, 9]), [],
    { contractualUnit: "week", contractualValue: 35 });
  const otherId = "second-restaurant";
  employee.restaurantProfiles.push({ _id: "other-profile", restaurant: otherId,
    snapshot: { dateOnPost: date("2026-12-01") },
    employment: { contractualUnit: "week", contractualValue: 21 },
    shifts: workWeek(monday, [6, 6, 6]), leaveRequests: [paidLeave("other-leave", "2027-02-04")] });
  const rule = (paidLeaveDays) => input("overtime", monday, validateValues("overtime", {
    ...overtimeRules, source: "planning", paidLeaveDays,
  }));
  const run = (rid, inputs, to = sunday) => buildPersonnelReport({ restaurant, restaurantId: rid,
    employees: [employee], sessions: [], attendance: [], planningDays: [], filters: { from: monday, to }, inputs, detail: true });
  const first = run(restaurantId, [rule(5)]);
  const other = run(otherId, [rule(6)]);
  assert.equal(first.rows[0].weeklyHours[week].plannedWeek, 2160);
  assert.equal(first.rows[0].weeklyHours[week].retainedWeek, 2160);
  assert.equal(first.rows[0].values[week], 60);
  assert.deepEqual(first.rows[0].weeklyHours[week].breakdown.bands, { extra10: first.rows[0].values[week] });
  assert.equal(first.rows[0].weeklyHours[week].contractWeek, 2100);
  assert.equal(other.rows[0].weeklyHours[week].breakdown.bands.complement10, other.rows[0].values[week]);
  assert.deepEqual(first.rows[0].weeklyHours[week].paidAbsences, { employer: 0, thirdParty: 0, incomplete: false });
  assert.equal(other.rows[0].weeklyHours[week].plannedWeek, 1080);
  assert.equal(other.rows[0].weeklyHours[week].retainedWeek, 1290);
  assert.equal(other.rows[0].values[week], 30);
  employee.restaurantProfiles[1].shifts[0].breakMinutes = 45;
  assert.equal(run(otherId, [rule(6)]).rows[0].weeklyHours[week].retainedWeek, 1245);
  assert.equal(run(otherId, [rule(5)]).rows[0].weeklyHours[week].retainedWeek, 1287);
  assert.equal(run(restaurantId, [rule(5)]).rows[0].weeklyHours[week].retainedWeek, 2160);
  assert.equal(run(otherId, [rule(6)], "2027-02-06").rows[0].weeklyHours[week].retainedWeek, undefined);
  const workbook = entries(buildPersonnelReportWorkbook(first));
  assert.match(workbook["xl/worksheets/sheet1.xml"], /S5 \(Heures supp\.\/compl\.\)/);
  assert.match(workbook["xl/worksheets/sheet2.xml"], /Semaine 5 · Heures retenues, absences comprises/);
});

test("Sunday premiums use the Paris calendar window for retained overnight services", () => {
  const employee = profileEmployee([
    { _id: "arrival-sunday", start: date("2027-02-06T18:00"), end: date("2027-02-07T00:10"), breakMinutes: 30 },
    { _id: "departure-monday", start: date("2027-02-07T22:00"), end: date("2027-02-08T00:30"), breakMinutes: 30 },
  ], [], { contractualUnit: "week", contractualValue: 35 });
  const rules = input("overtime", "2027-02-01", validateValues("overtime", {
    ...overtimeRules, source: "planning", planningAttribution: "shiftStart", sundayRate: 50,
  }));
  const row = report({ from: "2027-02-01", to: "2027-02-07", employee, inputs: [rules] }).rows[0];
  assert.equal(row.weeklyHours["2027-W5"].retainedWeek, 460);
  assert.equal(row.values.sunday50, 130);
});

test("a holiday premium counts only the holiday stretch on shifts entering and leaving it at midnight", () => {
  const employee = profileEmployee([
    { _id: "into-holiday", start: date("2026-11-10T23:00"), end: date("2026-11-11T00:30") },
    { _id: "out-of-holiday", start: date("2026-11-11T23:00"), end: date("2026-11-12T00:30") },
  ], [], { contractualUnit: "week", contractualValue: 35 });
  const rule = input("overtime", "2026-11-09", validateValues("overtime", {
    ...overtimeRules, source: "planning", planningAttribution: "shiftStart", holidayRate: 100,
  }));
  const { values } = report({ employee, inputs: [rule], from: "2026-11-09", to: "2026-11-15" }).rows[0];
  assert.equal(values.holidays100, 90);
  assert.equal(values.night0, 180);
});

test("Sunday premiums in validated mode use the corrected interval through the repeated Paris hour", () => {
  const employee = profileEmployee([{ _id: "ends-saturday", start: date("2026-10-24T18:00"), end: date("2026-10-25T00:00") }],
    [], { contractualUnit: "week", contractualValue: 35 });
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-10-19");
  const correctedEnd = date("2026-10-25T02:10+01:00");
  const retained = session("retained", "2026-10-24T18:00", "2026-10-25T02:08+02:00", {
    payroll: { clockInAt: date("2026-10-24T18:00"), clockOutAt: correctedEnd },
    reviews: [{ type: "validated", at: correctedEnd }],
  });
  const rule = input("overtime", "2026-10-19", validateValues("overtime", {
    ...overtimeRules, source: "validated", sundayRate: 50,
  }));
  const { values } = report({ employee, sessions: [retained], inputs: [rule], from: "2026-10-19", to: "2026-10-25" }).rows[0];
  assert.equal(values.planned, 360);
  assert.equal(values.paid, 550);
  assert.equal(values.sunday50, 190);
});

test("Excel keeps weekly shift details and limits night premiums to the selected period", () => {
  const employee = profileEmployee([1, 2].map((day) => ({ _id: `shift-${day}`,
    start: date(`2027-02-0${day}T22:00`), end: date(`2027-02-0${day}T23:00`) })), [],
  { contractualUnit: "week", contractualValue: 35 });
  const rules = input("overtime", "2027-02-01", validateValues("overtime", {
    ...overtimeRules, source: "planning", planningAttribution: "shiftStart",
  }));
  const data = report({ employee, from: "2027-02-02", to: "2027-02-07", inputs: [rules] });
  assert.equal(data.rows[0].weeklyHours["2027-W5"].retainedWeek, 120);
  assert.equal(data.rows[0].values.night0, 60);
  const file = entries(buildPersonnelReportWorkbook(data))["xl/worksheets/sheet3.xml"];
  assert.match(file, /<c r="R2" s="4"><v>1<\/v>/);
  assert.doesNotMatch(file, /<c r="Z2"[^>]*><v>/);
  assert.match(file, /<c r="Z3" s="4"><v>1<\/v>/);

  employee.restaurantProfiles[0].shifts = [{ _id: "holiday",
    start: date("2027-05-01T22:00"), end: date("2027-05-01T23:00") }];
  const holidayRules = input("overtime", "2027-04-26", { ...rules.values, countHolidays: true });
  const april = report({ employee, from: "2027-04-26", to: "2027-04-30", inputs: [holidayRules] });
  const details = entries(buildPersonnelReportWorkbook(april))["xl/worksheets/sheet3.xml"];
  assert.match(details, /<c r="Y2" s="4"><v>1<\/v>/);
  assert.doesNotMatch(details, /<c r="Z2"[^>]*><v>/);
});

function workWeek(monday, lengths) {
  return lengths.map((length, index) => {
    const start = DateTime.fromISO(monday, { zone: "Europe/Paris" }).plus({ days: index }).set({ hour: 8 });
    return { _id: start.toISO(), start: start.toJSDate(), end: start.plus({ hours: length }).toJSDate() };
  });
}

test("weekly planning shows complete ISO weeks net of breaks without overtime rules", () => {
  const employee = profileEmployee([
    ...workWeek("2026-11-02", [8, 8, 8, 8, 6]),
    { _id: "night", start: date("2026-11-06T23:00"), end: date("2026-11-07T01:00"), breakMinutes: 30 },
    { _id: "leave", start: date("2026-11-08T00:00"), end: date("2026-11-08T23:59"), isLeave: true, absenceType: "weekly_rest" },
    ...workWeek("2026-11-09", [7]),
  ], [], { contractualUnit: "week", contractualValue: 35 });
  const row = report({ employee, from: "2026-11-05", to: "2026-11-14" }).rows[0];
  assert.equal(row.weeklyHours["2026-W45"].planned, 930);
  assert.equal(row.weeklyHours["2026-W45"].plannedWeek, 2370);
  assert.equal(row.weeklyHours["2026-W45"].plannedWeekSurplus, 270);
  assert.equal(row.values["2026-W45"], null);
  assert.equal(row.weeklyHours["2026-W46"].planned, 420);
  assert.equal(row.weeklyHours["2026-W46"].plannedWeek, undefined);
  const extended = report({ employee, from: "2026-11-05", to: "2026-11-15" }).rows[0];
  assert.equal(extended.weeklyHours["2026-W46"].plannedWeek, 420);
});

test("weekly planning credits six days of paid leave and excludes a documented Monday rest", () => {
  const week = DateTime.fromISO("2026-11-02", { zone: "Europe/Paris" });
  const shifts = Array.from({ length: 7 }, (_, index) => {
    const day = week.plus({ days: index });
    return { _id: `day-${index}`, start: day.toJSDate(), end: day.endOf("day").toJSDate(), isLeave: true,
      absenceDuration: "full", absenceType: index === 0 ? "weekly_rest" : "paid_leave" };
  });
  const employee = profileEmployee(shifts, [], { contractualUnit: "week", contractualValue: 35 });
  const row = report({ employee, from: "2026-11-04", to: "2026-11-08" }).rows[0];
  assert.equal(row.values.plannedBreak, 0);
  assert.equal(row.values.referenceWorked, 0);
  assert.equal(row.values["absence:paid_leave"], 5);
  assert.deepEqual({
    planned: row.weeklyHours["2026-W45"].plannedWeek,
    credited: row.weeklyHours["2026-W45"].plannedWeekCredit,
    surplus: row.weeklyHours["2026-W45"].plannedWeekSurplus,
  }, { planned: 0, credited: 2100, surplus: null });
});

test("weekly planning applies configured working days and a half day of paid leave", () => {
  const leave = paidLeave("half", "2026-11-08", "morning");
  const employee = profileEmployee(workWeek("2026-11-02", [8]), [leave],
    { contractualUnit: "week", contractualValue: 35 });
  const rules = { ...overtimeRules, weekdays: [1, 3, 5, 6, 7], workdays: 5 };
  const row = report({ employee, from: "2026-11-02", to: "2026-11-08", inputs: [input("overtime", "2026-11-02", rules)] }).rows[0];
  assert.equal(row.weeklyHours["2026-W45"].plannedWeekCredit, 210);
});

test("structural hours follow effective amendments even when the employee works less than the contractual volume", () => {
  const employee = profileEmployee(workWeek("2026-11-02", [8, 8, 8, 8]), [], { contractualUnit: "week", contractualValue: 39 });
  const inputs = [
    input("overtime", "2026-11-02", overtimeRules),
    input("amendment", "2026-11-09", { weeklyHours: 35, until: "2026-11-15", label: "Avenant temporaire" }),
  ];
  const result = report({ employee, inputs, from: "2026-11-02", to: "2026-11-22" });
  const { values, amendments } = result.rows[0];
  assert.deepEqual([values.structural10, values.exceptional, values["2026-W45"]], [480, 0, 0]);
  assert.equal(values.weeklyHours, 39);
  assert.equal(amendments[0].delta, -4);
  assert.match(entries(buildPersonnelReportWorkbook(result))["xl/worksheets/sheet3.xml"], /Avenant temporaire/);
});

test("a weekly counter carries earlier work and a dated opening, with recorded payments and replacement rest", () => {
  const employee = profileEmployee([
    ...workWeek("2026-11-02", [8, 8, 7, 7, 7]), ...workWeek("2026-11-09", [8, 8, 8, 8]),
  ], [], { contractualUnit: "week", contractualValue: 35 });
  const inputs = [
    input("hoursRules", "-", { start: "2026-11-02", enhanced: false }),
    input("hoursEntry", "2026-11-01", { entries: [{ operation: "reset", hours: 2 }] }),
    input("hoursEntry", "2026-11-08", { entries: [{ operation: "recover", hours: 1 }, { operation: "paid", hours: 1 }] }),
    input("hoursEntry", "2026-11-11", { entries: [{ operation: "adjust", hours: 0.5 }] }),
  ];
  const { values } = report({ employee, inputs, from: "2026-11-09", to: "2026-11-15" }).rows[0];
  assert.deepEqual([values.counterStart, values["2026-W46"], values.counterChanges, values.counterEnd, values.recoveryBalance],
    [120, -180, 30, -30, 60]);
});

test("dated counter rules preserve closed weeks and apply premiums prospectively", () => {
  const employee = profileEmployee([
    ...workWeek("2026-11-02", [8, 8, 8, 7, 7]), ...workWeek("2026-11-09", [8, 8, 8, 7, 7]),
  ], [], { contractualUnit: "week", contractualValue: 35 });
  const old = [input("overtime", "2026-11-02", overtimeRules),
    input("hoursRules", "-", { start: "2026-11-02", enhanced: false }),
    input("hoursEntry", "2026-11-01", { operation: "reset", hours: 5 })];
  const current = [...old, input("hoursRules", "2026-11-09", { start: "2026-11-02", enhanced: true })];
  const closed = (inputs) => Object.fromEntries(Object.entries(entries(buildPersonnelReportWorkbook(
    report({ employee, from: "2026-11-02", to: "2026-11-08", inputs })))).filter(([name]) => name.startsWith("xl/worksheets/")));
  assert.deepEqual(closed(current), closed(old));
  const { values } = report({ employee, from: "2026-11-09", to: "2026-11-15", inputs: current }).rows[0];
  assert.deepEqual([values.counterStart, values["2026-W46"], values.counterEnd], [480, 198, 678]);
});

test("a dated absence rule affects meals and splits a multi-day absence by its actual payer", () => {
  const leave = { ...paidLeave("two-days", "2026-11-09"), end: date("2026-11-10T23:59:59") };
  const employee = profileEmployee([], [leave], { contractualUnit: "week", contractualValue: 35 });
  const inputs = [input("rules", "2026-11", { mode: "combined", basis: "days", quantity: 1 }),
    input("absenceRules", "-", { categories: { paid_leave: { payer: "employer", meal: 1 } } }),
    input("absenceRules", "2026-11-10", { categories: { paid_leave: { payer: "thirdParty", meal: 2 } } })];
  const row = report({ employee, inputs }).rows[0];
  assert.equal(row.values.mealsDue, 3);
  assert.equal(row.values["absence:paid_leave"], 1);
  assert.deepEqual(row.absences.map(({ payer, payrollMinutes, days }) => [payer, payrollMinutes, days]),
    [["employer", 420, 1], ["thirdParty", 420, 1]]);
});

test("dated leave rules carry accrued days and require a new opening when the unit changes", () => {
  const employee = profileEmployee([], [paidLeave("november", "2026-11-03"), paidLeave("december", "2026-12-01")]);
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-11-01");
  const rule = { startMonth: "2026-11", referenceMonth: 6, unit: "businessDays", excludeHolidays: false, preserveCarry: true, assimilated: ["paid_leave"] };
  const old = input("leaveRules", "-", rule);
  const next = input("leaveRules", "2026-12-01", { ...rule, excludeHolidays: true });
  const closed = (inputs) => report({ employee, from: "2026-11-01", to: "2026-11-30", inputs }).rows[0].leaveBalance;
  assert.deepEqual(closed([old, next]), closed([old]));
  const after = (extra) => report({ employee, from: "2026-12-01", to: "2026-12-31", asOf: "2026-12-31", inputs: [old, ...extra] }).rows[0];
  assert.deepEqual([after([next]).leaveBalance.currentAcquired, after([next]).leaveBalance.currentUsed], [5, 2]);
  const differentUnit = { ...next, values: { ...rule, unit: "workdays" } };
  assert.equal(after([differentUnit]).leaveStatus, "needsOpening");
  const opening = input("leave", "2026-11-30", { previousBalance: 0, currentBalance: 2 });
  assert.equal(after([differentUnit, opening]).leaveStatus, "automatic");
  assert.equal(after([differentUnit, opening]).leaveBalance.currentBalance, 3.08);
});

test("annual closing deducts weekly excess already paid and includes hours carried at initialization", () => {
  const employee = profileEmployee(workWeek("2026-10-26", [9, 9, 9, 9, 11]), [], { contractualUnit: "week", contractualValue: 35 });
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2025-11-02");
  const annual = validateValues("annual", { initialized: "2026-10-26", opening: 100, target: 140, weeklyLimit: 44, includeSunday: true }, "2025-11-02");
  assert.ok(annual);
  const result = report({ employee, inputs: [input("annual", "2025-11-02", annual)],
    from: "2026-10-26", to: "2026-11-01" }).rows[0].values;
  assert.deepEqual([result.annualWorked, result.annualWeeklyPaid, result.annualClosingExtra], [147 * 60, 180, 240]);
});

test("a validated badge without planning accrues leave and an eligible absence maintains a meal indemnity", () => {
  const employee = profileEmployee([], [paidLeave("leave", "2026-11-12")], { contractualUnit: "week", contractualValue: 35 });
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-10-01");
  const clock = session("validated", "2026-10-14T08:00", "2026-10-14T16:00", {
    reviews: [{ type: "validated", at: date("2026-10-14T16:15") }],
  });
  const inputs = [
    input("leaveRules", "-", { startMonth: "2026-10", referenceMonth: 6, unit: "businessDays", excludeHolidays: false, preserveCarry: true, assimilated: [] }),
    input("absenceRules", "-", { categories: { paid_leave: { payer: "employer", meal: 1 } } }),
    input("rules", "2026-11", { mode: "combined", basis: "days", quantity: 1 }),
  ];
  const result = report({ employee, sessions: [clock], inputs });
  assert.deepEqual([result.rows[0].values.currentAcquired, result.rows[0].values.mealsDue,
    result.rows[0].values.compensation, result.rows[0].absences[0].payrollMinutes], [2.5, 1, 1, 420]);
  const detail = entries(buildPersonnelReportWorkbook(result))["xl/worksheets/sheet3.xml"];
  assert.match(detail, /r="T\d+" s="4"><v>7<\/v>/);
});

test("weekly overtime splits contractual and exceptional bands even when the report displays only Friday", () => {
  assert.ok(overtimeRules);
  assert.equal(validateValues("overtime", { ...overtimeRules, secondEnd: 38 }), null);
  const employee = profileEmployee(Array.from({ length: 5 }, (_, index) => ({
    _id: `shift${index}`, start: date(`2026-11-0${index + 2}T08:00`), end: date(`2026-11-0${index + 2}T17:00`),
  })), [], { contractualUnit: "week", contractualValue: 39 });
  const inputs = [input("overtime", "2026-11-02", overtimeRules)];
  const full = report({ from: "2026-11-02", to: "2026-11-08", employee, inputs });
  assert.deepEqual([full.rows[0].values.structural10, full.rows[0].values.extra20,
    full.rows[0].values.extra50, full.rows[0].values.premiums], [240, 240, 120, 600]);
  const single = report({ from: "2026-11-06", to: "2026-11-06", employee, inputs });
  assert.deepEqual([single.rows[0].values.structural10, single.rows[0].values.extra20, single.rows[0].values.extra50], [48, 240, 120]);
  assert.equal(single.rows[0].values["2026-W45"], 360);
  assert.equal(single.rows[0].values.planned, 540);
  assert.match(entries(buildPersonnelReportWorkbook(full))["xl/worksheets/sheet1.xml"], /Heures de nuit 0%/);
});

test("overtime distinguishes part-time bands, credited leave, and periods awaiting validation", () => {
  const employee = profileEmployee([
    { _id: "single", start: date("2026-11-06T04:00"), end: date("2026-11-07T02:00") },
  ], [paidLeave("leave", "2026-11-03")], { contractualUnit: "week", contractualValue: 20 });
  const result = report({ from: "2026-11-02", to: "2026-11-08", employee,
    inputs: [input("overtime", "2026-11-02", overtimeRules)] }).rows[0].values;
  assert.deepEqual([result.complement10, result.complement25, result.night0, result.exceptional], [120, 240, 420, 360]);
  const pending = report({ from: "2026-11-02", to: "2026-11-08", employee,
    inputs: [input("overtime", "2026-11-02", { ...overtimeRules, source: "validated" })] }).rows[0].values;
  assert.equal(pending.premiums, null);
  const alerts = report({ from: "2026-11-02", to: "2026-11-08", employee,
    inputs: [input("overtime", "2026-11-02", { ...overtimeRules, ordinary: 25 })] }).rows[0].values;
  assert.equal(alerts.overtimeNeedsReview, true);
  assert.equal(alerts.complement10, null);
});

test("paid leave accrues automatically, deduplicates approved absences, and projects future leave separately", () => {
  const approved = paidLeave("approved", "2026-11-03");
  const employee = profileEmployee([
    { _id: "day", start: date("2026-11-02T08:00"), end: date("2026-11-02T12:00") },
    { ...approved, _id: "projection", isLeave: true, leaveRequestId: approved._id },
  ], [approved, paidLeave("half", "2026-11-05", "morning"), paidLeave("pending", "2026-11-06", "full", "pending")]);
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-11-01");
  const rules = { startMonth: "2026-11", referenceMonth: 6, unit: "businessDays", excludeHolidays: false, preserveCarry: true, assimilated: ["paid_leave"] };
  assert.ok(validateValues("leaveRules", rules));
  const inputs = [input("leaveRules", "-", rules)];
  const current = report({ employee, inputs, asOf: "2026-11-04" }).rows[0];
  assert.equal(current.leaveStatus, "automatic");
  assert.deepEqual([current.values.currentAcquired, current.values.currentUsed, current.values.scheduled, current.values.leaveAvailable], [0.3, 1, 0.5, -1.2]);
  const monthEnd = report({ employee, inputs }).rows[0].values;
  assert.deepEqual([monthEnd.currentAcquired, monthEnd.currentUsed, monthEnd.scheduled, monthEnd.leaveAvailable], [2.5, 1.5, 0, 1]);
});

test("historical leave requires an opening and rolls unused rights across the reference date", () => {
  const employee = profileEmployee([], [paidLeave("leave", "2026-06-10")]);
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-04-01");
  const rules = input("leaveRules", "-", { startMonth: "2026-06", referenceMonth: 6, unit: "businessDays",
    excludeHolidays: false, preserveCarry: true, assimilated: ["paid_leave"] });
  assert.equal(report({ employee, inputs: [rules], from: "2026-06-01", to: "2026-06-30" }).rows[0].leaveStatus, "needsOpening");
  const snapshot = input("leave", "2026-05-31", { previousBalance: 2, currentBalance: 5.5, currentAcquired: 8.5, currentUsed: 3 });
  const output = report({ employee, inputs: [rules, snapshot], from: "2026-06-01", to: "2026-06-30" });
  assert.deepEqual([output.rows[0].values.previousBalance, output.rows[0].values.currentAcquired, output.rows[0].values.leaveAvailable], [7, 2.5, 9.5]);
  assert.match(entries(buildPersonnelReportWorkbook(output))["xl/worksheets/sheet5.xml"], /Calcul automatique/);
});

test("leave honors configured workdays and combines morning and afternoon without double-counting", () => {
  const employee = profileEmployee([], [
    paidLeave("morning", "2026-11-07", "morning"), paidLeave("copy", "2026-11-07", "morning"),
    paidLeave("afternoon", "2026-11-07", "afternoon"), paidLeave("weekly-rest", "2026-11-09"),
  ]);
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-11-01");
  const options = { startMonth: "2026-11", referenceMonth: 6, unit: "workdays", excludeHolidays: false, preserveCarry: true,
    assimilated: ["paid_leave"], weekdays: [2, 3, 4, 5, 6] };
  assert.equal(validateValues("leaveRules", { ...options, weekdays: [1, 1, 2, 3, 4] }), null);
  const { values } = report({ employee, inputs: [input("leaveRules", "-", validateValues("leaveRules", options))] }).rows[0];
  assert.deepEqual([values.currentUsed, values.currentAcquired, values.leaveAvailable], [1, 2.08, 1.08]);
});

test("meal rights use planning or validated paid shifts, separately from known consumption", () => {
  const employee = profileEmployee([
    { _id: "first", start: date("2026-11-02T09:00"), end: date("2026-11-02T14:00") },
    { _id: "second", start: date("2026-11-03T09:00"), end: date("2026-11-03T14:00") },
    { _id: "third", start: date("2026-11-04T09:00"), end: date("2026-11-04T14:00") },
    { _id: "fourth", start: date("2026-11-05T09:00"), end: date("2026-11-05T14:00") },
  ]);
  const sessions = [
    session("validated", "2026-11-03T09:00", "2026-11-03T14:00", {
      payroll: { clockInAt: date("2026-11-03T09:00"), clockOutAt: date("2026-11-03T11:00") },
      reviews: [{ type: "validated", at: date("2026-11-03T15:00") }],
      mealCountOverride: 9,
    }),
    session("pending", "2026-11-05T09:00", "2026-11-05T11:00"),
  ];
  const inputs = [
    input("rules", "2026-10", validateValues("rules", { mode: "combined", basis: "criteria",
      criteria: [{ start: "11:30", end: "14:30", minimum: 120 }], amount: 4.25 })),
    input("meals", "2026-11-02", { taken: 1 }),
    input("meals", "2026-11-05", { taken: 0 }),
    input("meals", "2026-11-04", { taken: 10 }, "another-profile"),
  ];
  const attendance = [{ employee: employeeId, shift: "third", shiftDate: "2026-11-04", absent: true, validated: true }];
  const data = report({ employee, inputs, sessions, attendance });
  const { values, mealDays } = data.rows[0];
  assert.deepEqual([values.mealsDue, values.benefits, values.compensation, values.mealCost], [2, 1, 1, 4.25]);
  assert.deepEqual(mealDays.slice(0, 4).map(({ due, taken }) => [due, taken]), [[1, 1], [0, null], [0, null], [1, 0]]);
  const excel = entries(buildPersonnelReportWorkbook(data));
  assert.match(excel["xl/worksheets/sheet1.xml"], /<v>4\.25<\/v>/);
  assert.match(excel["xl/worksheets/sheet3.xml"], /Avantages Nature/);
  const unknown = report({ employee, inputs: inputs.filter(({ date }) => date !== "2026-11-05"), sessions, attendance }).rows[0].values;
  assert.deepEqual([unknown.mealsDue, unknown.benefits, unknown.compensation], [2, null, null]);
});

test("fixed meal amounts are shown only for complete contract months, while pay inputs keep their scopes", () => {
  const employee = profileEmployee([], [], { contractualValue: 39, contractualUnit: "week" });
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-11-01");
  const inputs = [
    input("contract", "-", { transport: 30.5, grossSalary: 2500, monthlyContractHours: 169 }),
    input("variables", "2026-11", { bonus: 100, bonusLabel: "=Prime", advance: -50 }),
    input("variables", "2026-10", { bonus: 75 }),
    input("rules", "2026-11", { mode: "indemnities", basis: "monthly", quantity: 40 }),
    input("leave", "2026-11-30", { leaveAvailable: 13.5 }),
  ];
  const full = report({ employee, inputs });
  const { values, leaveBalance } = full.rows[0];
  assert.deepEqual([values.mealsDue, values.compensation, values.grossSalary, values.monthlyHours, values.transport], [40, 40, 2500, 169, 30.5]);
  assert.deepEqual([values.bonus, values.advance, values.bonusLabel, leaveBalance.leaveAvailable], [100, -50, "=Prime", 13.5]);
  assert.match(entries(buildPersonnelReportWorkbook(full))["xl/worksheets/sheet5.xml"], /<v>13\.5<\/v>/);
  assert.equal(report({ employee, inputs, to: "2026-11-29" }).rows[0].values.mealsDue, null);
  assert.equal(validateValues("variables", { advance: 5 }), null);
  assert.equal(validateValues("rules", { mode: "combined", basis: "criteria", criteria: [{ start: "11:00" }] }), null);
});

test("clocked payroll shares cross midnight and DST boundaries without inflating the planning total", () => {
  const overnight = session("oct", "2026-10-31T23:30", "2026-11-01T02:00");
  const employee = profileEmployee([{ _id: "overnight", start: overnight.clockInAt, end: overnight.clockOutAt }]);
  const october = report({ employee, sessions: [overnight], from: "2026-10-31", to: "2026-10-31" }).rows[0].values;
  const november = report({ employee, sessions: [overnight], from: "2026-11-01", to: "2026-11-01" }).rows[0].values;
  assert.equal(october.planned, 150);
  assert.equal(november.planned, undefined);
  assert.deepEqual([october.gross, november.gross, october.paid, november.paid], [30, 120, 30, 120]);
  const dst = session("clock-dst", "2026-10-25T00:30", "2026-10-25T04:30");
  assert.equal(report({ employee, sessions: [dst], from: "2026-10-25", to: "2026-10-25" }).totals.paid, 300);
});

test("absences only include applicable records, deduplicate linked approvals and distinguish hours from days", () => {
  const approved = { _id: "leave", start: date("2026-10-31T00:00"), end: date("2026-11-02T23:59:59"),
    status: "approved", type: "full", absenceType: "paid_leave" };
  const rejected = { ...approved, _id: "rejected", status: "rejected" };
  const employee = profileEmployee([
    { ...approved, _id: "leave-shift-a", isLeave: true, leaveRequestId: "leave" },
    { ...approved, _id: "leave-shift-b", isLeave: true, leaveRequestId: "leave" },
    { ...rejected, _id: "orphan", isLeave: true, leaveRequestId: "rejected" },
    { _id: "admin", start: date("2026-11-07T09:00"), end: date("2026-11-07T11:00"), isLeave: true, absenceDuration: "custom" },
    { _id: "validated", start: date("2026-11-08T09:00"), end: date("2026-11-08T10:00") },
    { _id: "not-validated", start: date("2026-11-09T09:00"), end: date("2026-11-09T10:00") },
  ], [approved, rejected, { ...approved, _id: "pending", status: "pending" }]);
  const result = report({ employee, attendance: [
    { employee: employeeId, shift: "validated", shiftDate: "2026-11-08", absent: true, validated: true },
    { employee: employeeId, shift: "not-validated", shiftDate: "2026-11-09", absent: true, validated: false },
  ] });
  const { values } = result.rows[0];
  assert.deepEqual([values.absenceCount, values.absenceDays, values.absenceMinutes], [3, 2, 180]);
  assert.equal(values["absence:paid_leave"], 1);
  assert.equal(result.totals.paid, null);
});

test("report filters preserve the unfiltered roster and reject invalid or overly long periods", () => {
  const employee = profileEmployee([], [], { contractualUnit: "month", contractualValue: 151.67, payrollCode: "0004" });
  const filters = validateReportFilters({ from: "2026-11-01", to: "2026-11-30", search: " CUISINÉ " }, () => true);
  assert.equal(filters.search, "cuisine");
  assert.equal(validateReportFilters({ ...filters, to: "2027-03-01" }, () => true), null);
  assert.equal(validateReportFilters({ ...filters, employeeId: "invalid" }, () => false), null);
  assert.equal(report({ employee, search: "0004", post: "cuisine" }).rows[0].values.monthlyHours, 151.67);
  const excluded = report({ employee, employeeId: "unknown" });
  assert.equal(excluded.rows.length, 0);
  assert.equal(excluded.options.length, 1);
  const former = report({ sessions: [session("former", "2026-11-02T08:00", "2026-11-02T12:00",
    { employeeSnapshot: { firstname: "Dani", lastname: "Ancien" } })] }).rows[0];
  assert.equal(former.former, true);
  assert.equal(former.values.paid, 240);
});

test("the contract start follows the employee profile and falls back to the historical date only when unset", () => {
  const employee = profileEmployee();
  employee.dateOnPost = date("2026-10-05");
  employee.restaurantProfiles.unshift({ restaurant: "other", snapshot: { dateOnPost: date("2026-01-01") } });
  assert.equal(report({ employee }).rows[0].values.contractStart, "2026-11-02");
  const current = employee.restaurantProfiles.find((profile) => profile.restaurant === restaurantId);
  delete current.snapshot.dateOnPost;
  assert.equal(report({ employee }).rows[0].values.contractStart, "2026-10-05");
  current.snapshot.dateOnPost = null;
  assert.equal(report({ employee }).rows[0].values.contractStart, null);
});

function entries(zip) {
  const files = {};
  for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const dataOffset = offset + 30 + nameLength + zip.readUInt16LE(offset + 28);
    files[zip.toString("utf8", offset + 30, offset + 30 + nameLength)] = zip.toString("utf8", dataOffset, dataOffset + size);
    offset = dataOffset + size;
  }
  return files;
}

test("paid leave uses a dated five or six day basis without moving the contract workdays", () => {
  const employee = profileEmployee(workWeek("2026-11-02", [8, 8, 8]), [
    paidLeave("fri", "2026-11-06"), paidLeave("sat", "2026-11-07", "morning"),
  ], { contractualUnit: "week", contractualValue: 36 });
  const run = (paidLeaveDays, to = "2026-11-08") => report({ employee, from: "2026-11-05", to,
    inputs: [input("overtime", "2026-11-02", validateValues("overtime", { ...overtimeRules, paidLeaveDays }))],
  }).rows[0];
  const [five, six] = [run(5), run(6)];
  assert.equal(five.weeklyHours["2026-W45"].plannedWeekCredit, 648);
  assert.equal(six.weeklyHours["2026-W45"].plannedWeekCredit, 540);
  assert.equal(six.weeklyHours["2026-W45"].plannedWeek, 1440);
  assert.equal(six.absences.reduce((sum, item) => sum + item.payrollMinutes, 0), 540);
  assert.equal(run(6, "2026-11-07").weeklyHours["2026-W45"].plannedWeek, undefined);
  assert.deepEqual(validateValues("overtime", { enabled: false, paidLeaveDays: 6 }), { enabled: false, paidLeaveDays: 6 });
  assert.equal(validateValues("overtime", { enabled: false, paidLeaveDays: 7 }), null);
});

test("a verified historical service contributes once to the report and does not generate a shift or a punch", () => {
  const employee = profileEmployee([], [], { contractualUnit: "week", contractualValue: 35 });
  employee.historicalImport = "batch-fixture";
  const shift = { start: "2026-11-08T18:00:00+01:00", end: "2026-11-08T23:00:00+01:00", breakMinutes: 30, position: "Cuisine" };
  const history = input("historicalWork", "2026-11-08", { source: "skello", batch: "batch-fixture", services: [shift], taken: 1 });
  const rules = input("overtime", "2026-11-02", validateValues("overtime", { ...overtimeRules, source: "planning",
    planningAttribution: "shiftStart", plannedNightGross: true, countHolidays: true, sundayRate: 50 }));
  const meal = input("rules", "2026-11", validateValues("rules", { mode: "combined", basis: "days", quantity: 2, amount: 4 }));
  const run = (...historyRecords) => report({ employee, from: "2026-11-08", to: "2026-11-08", inputs: [rules, meal, ...historyRecords] });
  const output = run(history);
  const row = output.rows[0];
  assert.equal(row.weeklyHours["2026-W45"].historicalWeek, 270);
  assert.equal(row.values.referenceWorked, 270);
  assert.equal(row.values.referencePause, 30);
  assert.equal(row.values.night0, 60);
  assert.equal(row.values.sunday50, 270);
  assert.equal(row.values.holidays, 0);
  assert.deepEqual([row.values.mealsDue, row.values.benefits, row.values.compensation], [2, 1, 1]);
  assert.equal(row.values.planned, undefined);
  assert.equal(row.values.paid, undefined);
  assert.equal(row.values.worked, undefined);
  assert.equal(validInputDate("historicalWork", history.date), false);
  assert.equal(run({ ...history, values: { ...history.values, batch: "other-batch" } }).rows[0].values.referenceWorked, 0);
  assert.equal(run({ ...history, values: { ...history.values, services: [shift, shift] } }).rows[0].values.referenceWorked, 0);
  const overlapping = { ...shift, start: "2026-11-08T22:00:00+01:00", end: "2026-11-08T23:30:00+01:00" };
  const overlappingValues = { ...history.values, services: [shift, overlapping] };
  assert.equal(run({ ...history, values: overlappingValues }).rows[0].values.referenceWorked, 0);
  const attested = run({ ...history, values: { ...overlappingValues, overlapVerified: true } }).rows[0];
  assert.equal(attested.values.referenceWorked, 330);
  assert.equal(attested.weeklyHours["2026-W45"].historicalOverlap, true);
  assert.equal(attested.values.planned, undefined);
  employee.restaurantProfiles[0].shifts.push({ ...shift, start: date(shift.start), end: date(shift.end), _id: "native" });
  const native = run(history).rows[0];
  assert.equal(native.weeklyHours["2026-W45"].historicalWeek, undefined);
  assert.equal(native.values.referenceWorked, 270);
  const files = entries(buildPersonnelReportWorkbook(output));
  assert.match(files["xl/worksheets/sheet2.xml"], /Semaine 45/);
  assert.match(files["xl/worksheets/sheet3.xml"], /<v>4\.5<\/v>/);
});

test("a configured report keeps timed sick leave in the weekly total and mensalizes structural hours for a full month", () => {
  const employee = profileEmployee(workWeek("2026-11-02", [8, 8, 8, 8]), [
    { _id: "sick", start: date("2026-11-06T08:00"), end: date("2026-11-06T16:00"),
      type: "custom", status: "approved", absenceType: "sick_leave" },
  ], { contractualUnit: "week", contractualValue: 39 });
  employee.restaurantProfiles[0].snapshot.dateOnPost = date("2026-10-01");
  const rules = input("overtime", "2026-10-26", validateValues("overtime", {
    ...overtimeRules, source: "planning", planningAttribution: "shiftStart", structuralMonthly: true,
  }));
  const data = report({ employee, inputs: [rules] }).rows[0];
  assert.equal(data.weeklyHours["2026-W45"].timedSicknessWeek, 480);
  assert.equal(data.weeklyHours["2026-W45"].plannedWeekSurplus, null);
  assert.equal(data.values.normalHours, 60);
  assert.equal(data.values.exceptional, 0);
  assert.equal(data.values.structural10, 1040);
});

test("Excel preserves five sheets and grouped headers, encodes typed dates and hours, and never creates formulas", () => {
  const reportData = report({ employee: profileEmployee([], [], { contractualUnit: "week", contractualValue: 35, payrollCode: "0007" }),
    sessions: [session("clock", "2026-11-02T08:00", "2026-11-02T11:45", {
      reviews: [{ type: "validated", at: date("2026-11-02T12:00") }],
    })] });
  const files = entries(buildPersonnelReportWorkbook(reportData));
  const workbook = files["xl/workbook.xml"];
  assert.deepEqual([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]),
    ["01-11 - 30-11", "Fiche employés", "Détails", "Absences Employés", "Solde Congés"]);
  const sheet = files["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /mergeCell ref="D2:I2"/);
  assert.match(sheet, /<c r="A4" t="inlineStr"><is><t xml:space="preserve">=2\+2/);
  assert.match(sheet, /<c r="D4" t="inlineStr"><is><t xml:space="preserve">0007/);
  assert.match(sheet, /<c r="G4" s="3"><v>\d+<\/v>/);
  assert.match(sheet, /<c r="[A-Z]+4" s="4"><v>3\.75<\/v>/);
  assert.match(sheet, /Repas Dûs/);
  assert.doesNotMatch(sheet, />Total<\/t>/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(files["xl/worksheets/sheet3.xml"], / s="5"><v>/);
  assert.match(files["xl/worksheets/sheet5.xml"], /Soldes saisis dans la fiche salarié/);
});
