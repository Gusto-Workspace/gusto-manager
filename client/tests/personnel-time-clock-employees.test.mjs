import assert from "node:assert/strict";
import { test } from "node:test";
import {
  employeeWeek, filterServices, groupClockServices, searchStaff, shiftDate, validRange, weekRange,
} from "../src/components/dashboard/time-clock/register-employees.utils.mjs";

const now = Date.parse("2026-11-19T12:00:00Z");

function day(date, data = {}) {
  return { date, shifts: [], sessions: [], plannedMinutes: 0, workedMinutes: 0, breakMinutes: 0, mealCount: 0, anomalies: [], ...data };
}

test("weekly navigation uses Monday to Sunday through year and DST boundaries", () => {
  assert.deepEqual(weekRange("2026-01-01"), { from: "2025-12-29", to: "2026-01-04" });
  assert.deepEqual(weekRange("2026-10-25"), { from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(weekRange(shiftDate("2026-10-25", 7)), { from: "2026-10-26", to: "2026-11-01" });
  assert.equal(validRange({ from: "2026-01-01", to: "2026-01-31" }), true);
  assert.equal(validRange({ from: "2026-01-01", to: "2026-02-01" }), false);
  assert.equal(validRange({ from: "2026-02-30", to: "2026-03-09" }), false);
  assert.equal(validRange({ from: "2026-01-01", to: "2025-12-31" }), false);
});

test("the staff search matches names without accents and supports name and position together", () => {
  const roster = [
    { id: "1", firstname: "Éléonore", lastname: "Désiré", post: "Pâtisserie" },
    { id: "2", firstname: "Jean", lastname: "Côté", post: "Salle" },
  ];
  assert.deepEqual(searchStaff(roster, "patisserie desire").map(({ id }) => id), ["1"]);
  assert.deepEqual(searchStaff(roster, "JEAN cote").map(({ id }) => id), ["2"]);
  assert.deepEqual(searchStaff(roster, "autre"), []);
  assert.deepEqual(searchStaff(roster, ""), roster);
});

test("the period keeps daily tracked and payroll values and counts an overnight validation once", () => {
  const signed = (grossMinutes) => ({ id: "overnight", status: "closed", review: { at: now }, timings: { grossMinutes } });
  const report = employeeWeek([
    day("2026-11-18", {
      shifts: [{ id: "shift-a", plannedMinutes: 210, breakMinutes: 30 }, { id: "leave", absence: true, breakMinutes: 100 }],
      sessions: [signed(120)], plannedMinutes: 210, workedMinutes: 110, breakMinutes: 10, mealCount: 1,
    }),
    day("2026-11-19", { sessions: [signed(130)], workedMinutes: 120, breakMinutes: 10 }),
    day("2026-11-20", { shifts: [{ id: "leave", absence: true }] }),
    day("2026-11-21", { payroll: [{ id: "overnight", manual: true, timings: { workedMinutes: 15 } }] }),
  ]);
  assert.equal("totals" in report, false);
  assert.equal(report.reviewableCount, 1);
  assert.equal(report.reviewedCount, 1);
  assert.deepEqual(report.services.map(({ date, workedMinutes }) => [date, workedMinutes]), [
    ["2026-11-18", 110], ["2026-11-19", 120], ["2026-11-21", 0],
  ]);
  assert.equal(report.services[2].payroll[0].timings.workedMinutes, 15);
  assert.deepEqual(report.absences.map(({ date }) => date), ["2026-11-18", "2026-11-20"]);
});

test("filters distinguish missing, upcoming and active work and retain unscheduled punches", () => {
  const shifts = (date, start, end) => [{ id: date, start: `${date}T${start}:00Z`, end: `${date}T${end}:00Z` }];
  const report = employeeWeek([
    day("2026-11-17", { sessions: [{ id: "closed", status: "closed", anomalies: ["long_shift"] }], anomalies: ["long_shift"] }),
    day("2026-11-18", { shifts: shifts("2026-11-18", "09:00", "11:00") }),
    day("2026-11-19", { shifts: shifts("2026-11-19", "11:00", "15:00") }),
    day("2026-11-20", { shifts: shifts("2026-11-20", "09:00", "11:00") }),
    day("2026-11-21", { sessions: [{ id: "open", status: "open" }] }),
    day("2026-11-22"),
  ]);
  const filterDates = (filter) => report.services.filter((entry) =>
    filterServices(groupClockServices(entry, now), filter, now).length,
  ).map(({ date }) => date);
  assert.deepEqual(filterDates("missing"), ["2026-11-18"]);
  assert.deepEqual(filterDates("active"), ["2026-11-21"]);
  assert.deepEqual(filterDates("unreviewed"), ["2026-11-17"]);
  assert.deepEqual(filterDates("anomalies"), ["2026-11-17"]);
  assert.equal(report.services.length, 5);
});

test("reported absences appear in the service validation summary and filter", () => {
  const result = day("2026-11-19", { shifts: [
    { id: "verified", start: "2026-11-19T08:00Z", end: "2026-11-19T10:00Z", reportedAbsent: true, absenceValidated: true },
    { id: "to-review", start: "2026-11-19T10:00Z", end: "2026-11-19T11:00Z", reportedAbsent: true },
  ] });
  const week = employeeWeek([result]);
  assert.equal(week.reviewableCount, 2);
  assert.equal(week.reviewedCount, 1);
  assert.deepEqual(filterServices(groupClockServices(result, now), "unreviewed", now).map(({ key }) => key), ["to-review"]);
});

test("each grid row keeps its own planned and measured service and retains marked absences", () => {
  const schedule = (hour) => `2026-11-19T${hour}:00Z`;
  const result = day("2026-11-19", {
    shifts: [
      { id: "morning", start: schedule("08:00"), end: schedule("11:00") },
      { id: "midday", start: schedule("12:00"), end: schedule("15:00"), reportedAbsent: true },
      { id: "evening", start: schedule("18:00"), end: schedule("22:00") },
      { id: "leave", start: schedule("19:00"), end: schedule("23:00"), absence: true },
      { id: "missing", start: schedule("16:00"), end: schedule("17:00") },
    ],
    sessions: [
      { id: "session-a", clockInAt: schedule("08:04"), clockOutAt: schedule("11:02") },
      { id: "session-b", clockInAt: schedule("12:04"), clockOutAt: schedule("14:00") },
      { id: "session-c", clockInAt: schedule("18:04"), clockOutAt: schedule("21:02") },
    ],
    payroll: [{ id: "session-a" }, { id: "session-c", absent: true }],
  });
  const rows = groupClockServices(result, now);
  assert.deepEqual(rows.map(({ shift, session, paid }) => [shift?.id, session?.id, paid?.id]), [
    ["morning", "session-a", "session-a"],
    ["midday", undefined, undefined],
    [undefined, "session-b", undefined],
    ["missing", undefined, undefined],
    ["evening", "session-c", "session-c"],
  ]);
  assert.equal(filterServices(rows, "absent", now).length, 2);
  assert.deepEqual(filterServices(rows, "missing", Date.parse(schedule("23:00"))).map(({ key }) => key), ["missing"]);
});
