import assert from "node:assert/strict";
import { test } from "node:test";
import { movePersonalPlanning, nextPersonalDay, personalShifts, planningRange, resolvePersonalSection, shiftsForDate } from
  "../src/components/dashboard/my-space/my-space-planning.utils.mjs";

test("personal weeks follow the Paris calendar across the year and month navigation preserves leap days", () => {
  assert.deepEqual(planningRange("2027-01-01").dates, [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
  assert.equal(movePersonalPlanning("2028-01-31", "month", 1), "2028-02-01");
  assert.equal(planningRange("2028-02-07", "month").to, "2028-02-29");
});

test("personal shifts use the restaurant time zone, elapsed time and actual absence type", () => {
  const rows = personalShifts([
    { _id: "overnight", start: "2026-10-24T23:00:00+02:00", end: "2026-10-25T04:00:00+01:00", breakMinutes: 30, position: "Cuisine" },
    { _id: "leave", start: "2026-10-26T00:00:00+01:00", end: "2026-10-27T00:00:00+01:00",
      absenceDuration: "full", absenceType: "sick_leave" },
    { _id: "invalid", start: "2026-10-27T04:00:00+01:00", end: "2026-10-27T02:00:00+01:00" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].netMinutes, 330);
  assert.equal(rows[0].startDate, "2026-10-24");
  assert.equal(shiftsForDate(rows, "2026-10-25")[0].id, "overnight");
  assert.equal(rows[1].absence, "sick_leave");
  assert.equal(shiftsForDate(rows, "2026-10-27").length, 0);
  assert.equal(nextPersonalDay(rows, new Date("2026-10-25T00:00:00+02:00"))[0].id, "overnight");
  assert.equal(nextPersonalDay(rows, new Date("2026-10-25T10:00:00+01:00")).length, 0);
});

test("published planning and leave notification links select the expected destination", () => {
  assert.equal(resolvePersonalSection({ planningDate: "2026-10-26" }), "planning");
  assert.equal(resolvePersonalSection({ planningDate: "2026-02-31" }), "home");
  assert.equal(resolvePersonalSection({ leave: true }), "requests");
  assert.equal(resolvePersonalSection({ tab: "documents" }), "documents");
  assert.equal(resolvePersonalSection({ tab: "/dashboard/employees" }), "home");
});
