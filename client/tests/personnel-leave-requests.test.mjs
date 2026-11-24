import assert from "node:assert/strict";
import { test } from "node:test";
import { conflictKey, filterLeaveRequests, leaveDuration, leaveFormInterval, plannedLeaveDuration, requestCreationTime } from "../src/components/dashboard/employees/leave-requests.utils.mjs";

const first = {
  person: { id: "first", name: "Élodie Martin" },
  request: { status: "pending", start: "2026-12-30T23:00:00Z", end: "2027-01-02T22:59:59Z", absenceType: "paid_leave" },
};

test("the table combines accent-insensitive search, category, employee and overlapping Paris dates", () => {
  const second = { person: { id: "second", name: "Camille Fictif" }, request: { ...first.request, absenceType: null } };
  assert.deepEqual(filterLeaveRequests([first, second], { search: "martin elodie", category: "paid_leave", from: "2027-01-02", to: "2027-01-03" }), [first]);
  assert.deepEqual(filterLeaveRequests([first, second], { employeeId: "second", category: "unspecified" }), [second]);
  assert.deepEqual(filterLeaveRequests([first], { from: "2027-01-03" }), []);
});

test("durations count civil days and use elapsed time for custom periods", () => {
  assert.equal(leaveDuration(first.request), "3 jours");
  assert.equal(leaveDuration({ ...first.request, type: "morning" }), "½ journée");
  assert.equal(leaveDuration({ type: "custom", start: "2026-10-24T23:30:00Z", end: "2026-10-25T03:00:00Z" }), "3 h 30");
  assert.equal(leaveFormInterval({ startDate: "2026-03-29", endDate: "2026-03-29", type: "custom", startTime: "02:30", endTime: "12:00" }), null);
  assert.equal(plannedLeaveDuration({ start: "2026-11-18T23:00:00Z", end: "2026-11-19T11:00:00Z" }), "morning");
  assert.equal(plannedLeaveDuration({ start: "2026-11-18T23:00:00Z", end: "2026-11-19T22:59:00Z" }), "full");
});

test("confirmation identifies each conflict by ID and time, and historic requests retain a sortable date", () => {
  const shift = { _id: "shift-a", start: "2026-11-19T10:00:00Z", end: "2026-11-19T12:00:00Z" };
  assert.notEqual(conflictKey(shift), conflictKey({ ...shift, end: "2026-11-19T13:00:00Z" }));
  assert.equal(requestCreationTime({ _id: "00000001ffffffffffffffff" }), 1000);
  assert.equal(requestCreationTime({ createdAt: "2026-11-19T10:00:00Z" }), Date.parse("2026-11-19T10:00:00Z"));
});
