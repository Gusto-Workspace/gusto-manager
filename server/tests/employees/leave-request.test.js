const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readLeaveRequest, canTransitionLeave } = require("../../services/employees/leave-request.service");

test("leave dates use Paris civil time across DST, years and half days", () => {
  const full = readLeaveRequest({ startDate: "2026-03-29", endDate: "2026-03-29" });
  assert.equal(full.start.toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(full.end.toISOString(), "2026-03-29T21:59:59.000Z");
  assert.equal(+full.end - +full.start, 23 * 60 * 60 * 1000 - 1000);
  const morning = readLeaveRequest({ startDate: "2026-10-25", endDate: "2026-10-25", type: "morning" });
  const afternoon = readLeaveRequest({ startDate: "2026-10-25", endDate: "2026-10-25", type: "afternoon" });
  assert.equal(+morning.end, +afternoon.start);
  assert.equal(morning.end.toISOString(), "2026-10-25T11:00:00.000Z");
  const acrossYear = readLeaveRequest({ startDate: "2026-12-31", endDate: "2027-01-02", note: "  Raison fictive  ", absenceType: "paid_leave" });
  assert.equal(acrossYear.end.toISOString(), "2027-01-02T22:59:59.000Z");
  assert.equal(acrossYear.note, "Raison fictive");
  assert.equal(acrossYear.absenceType, "paid_leave");
});

test("invalid dates, ambiguous custom hours and mismatched half days are rejected", () => {
  const custom = (date, startTime) => readLeaveRequest({ startDate: date, endDate: date, type: "custom", startTime, endTime: "13:00" });
  assert.equal(custom("2026-03-29", "02:30"), null);
  assert.equal(custom("2026-10-25", "02:30"), null);
  assert.equal(custom("2026-02-30", "09:00"), null);
  assert.equal(custom("2026-11-19", "15:00"), null);
  assert.equal(readLeaveRequest({ startDate: "2026-11-19", endDate: "2026-11-20", type: "morning" }), null);
  assert.equal(readLeaveRequest({ start: "2026-02-30T00:00:00Z", end: "2026-03-03T00:00:00Z" }), null);
  assert.equal(readLeaveRequest({ startDate: "2026-11-19", endDate: "2026-11-19", note: "a".repeat(1001) }), null);
  assert.equal(custom("2026-11-19", "09:00").start.toISOString(), "2026-11-19T08:00:00.000Z");
});

test("ordinary employees only cancel pending requests and approvals cannot reopen terminal requests", () => {
  assert.equal(canTransitionLeave("pending", "canceled", false), true);
  assert.equal(canTransitionLeave("pending", "rejected", false), false);
  assert.equal(canTransitionLeave("approved", "canceled", false), false);
  assert.equal(canTransitionLeave("pending", "approved", true), true);
  assert.equal(canTransitionLeave("requested", "approved", true), false);
  assert.equal(canTransitionLeave("approved", "pending", true), false);
  assert.equal(canTransitionLeave("canceled", "approved", true), false);
});
