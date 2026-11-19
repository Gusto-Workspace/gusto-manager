import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cellCopyTargets, cellShiftEntries, copyDestinations, dropEntry, isSourceCell,
  rectangleCells, eventsInCell,
} from "../src/components/dashboard/employees/planning-actions.utils.mjs";

const shift = (id, resourceId, date) => ({
  id, resourceId, start: new Date(`${date}T08:00:00Z`), end: new Date(`${date}T10:00:00Z`),
});
const cell = (employeeId, date) => ({ employeeId, date });
const monday = "2026-11-16";

test("the handle previews inclusive horizontal, vertical and rectangular ranges in both directions", () => {
  const rows = ["alice", "ben", "cam"];
  assert.deepEqual(rectangleCells(rows, cell("alice", monday), cell("alice", "2026-11-18")), [
    cell("alice", monday), cell("alice", "2026-11-17"), cell("alice", "2026-11-18"),
  ]);
  assert.deepEqual(rectangleCells(rows, cell("cam", monday), cell("alice", monday)), rows.map((id) => cell(id, monday)));
  assert.deepEqual(rectangleCells(rows, cell("ben", "2026-11-17"), cell("alice", monday)), [
    cell("alice", monday), cell("alice", "2026-11-17"), cell("ben", monday), cell("ben", "2026-11-17"),
  ]);
  assert.deepEqual(rectangleCells(rows, cell("alice", monday), cell("filtered", monday)), []);
});

test("the accessible duplication form skips the original and bounds the number of writes", () => {
  const original = shift("shift-a", "alice", monday);
  const origin = cell("alice", monday);
  const targets = copyDestinations(origin, ["alice", "ben"], monday, "2026-11-17", 1);
  assert.deepEqual(targets, [cell("alice", "2026-11-17"), cell("ben", monday), cell("ben", "2026-11-17")]);
  assert.ok(targets.every((target) => !isSourceCell(original, target)));
  assert.deepEqual(copyDestinations(origin, ["alice"], monday, "2027-11-24", 1), []);
  assert.equal(copyDestinations(origin, ["alice"], monday, "2027-02-24", 2).length, 100);
  assert.deepEqual(copyDestinations(origin, ["alice"], monday, "2027-02-24", 3), []);
  assert.deepEqual(dropEntry(original, targets[0]), {
    employeeId: "alice", shiftId: "shift-a", targetEmployeeId: "alice", date: "2026-11-17",
    start: "2026-11-16T08:00:00.000Z", end: "2026-11-16T10:00:00.000Z",
  });
});

test("the day handle copies all work shifts, including collapsed cards, across dates or employees", () => {
  const origin = cell("alice", monday);
  const tuesday = "2026-11-17";
  const roster = ["alice", "ben"];
  const shifts = ["first", "second", "third"].map((id) => shift(id, "alice", monday));
  const events = eventsInCell([
    { event: shift("overnight", "alice", "2026-11-15"), fromPreviousDay: true },
    ...shifts.map((event) => ({ event })),
  ]);
  assert.deepEqual(events, shifts);
  for (const [target, expected] of [
    [origin, []],
    [cell("alice", tuesday), [cell("alice", tuesday)]],
    [cell("ben", monday), [cell("ben", monday)]],
    [cell("ben", tuesday), [cell("alice", tuesday), cell("ben", monday), cell("ben", tuesday)]],
  ]) {
    const destinations = cellCopyTargets(roster, origin, target);
    assert.deepEqual(destinations, expected);
    assert.deepEqual(cellShiftEntries(events, origin, destinations).map(({ shiftId, targetEmployeeId, date }) =>
      [shiftId, targetEmployeeId, date]),
    expected.flatMap(({ employeeId, date }) => shifts.map(({ id }) => [id, employeeId, date])));
  }
});

test("a leave visible in a continuation cell copies the selected day using the original absence identity", () => {
  const leave = { ...shift("leave", "alice", "2026-11-15"), isLeave: true, end: new Date("2026-11-18T04:00:00Z") };
  const origin = cell("alice", monday);
  const destination = cell("ben", "2026-11-20");
  const events = eventsInCell([{ event: leave, fromPreviousDay: true }]);
  assert.deepEqual(events, [leave]);
  assert.deepEqual(cellShiftEntries(events, origin, [destination]), [{
    ...dropEntry(leave, destination), sourceDate: monday,
  }]);
});
