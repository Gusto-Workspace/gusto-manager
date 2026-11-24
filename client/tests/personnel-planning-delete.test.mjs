import assert from "node:assert/strict";
import test from "node:test";
import { deletePlanningShift, reconcilePlanningShift, visiblePlanningEmployees } from "../src/components/dashboard/employees/planning-actions.utils.mjs";
import { buildPlanningGrid, getPlanningPeriod, parsePlanningDate } from "../src/components/dashboard/employees/planning-grid.utils.mjs";

function service(id, hour) {
  const start = new Date(`2026-10-03T${hour}:00:00+02:00`);
  const end = new Date(+start + 60 * 60 * 1000);
  return { id, _id: id, resourceId: "employee", start, end };
}

function planning() {
  const first = service("first", "18");
  const second = service("second", "20");
  const otherDay = { ...service("next", "18"), start: new Date("2026-10-05T17:00Z"), end: new Date("2026-10-05T18:00Z") };
  const employees = [{ _id: "employee", name: "Recette", shifts: [first, second, otherDay] }];
  const hidden = new Set();
  let displayed = new Set();
  const errors = [];
  const deleted = [];
  const calls = [];
  function remove(shift) {
    const response = Promise.withResolvers();
    const result = deletePlanningShift(shift, hidden, {
      send: (entry) => { calls.push(entry); return response.promise; },
      onChange: (next) => { displayed = next; },
      onError: (error) => errors.push(error),
      onDeleted: (entry) => deleted.push(entry),
    });
    return { ...response, result };
  }
  function total(date = "2026-10-03", view = "week", group = "employees") {
    const visible = visiblePlanningEmployees(employees, displayed);
    return buildPlanningGrid(visible, getPlanningPeriod(parsePlanningDate(date), view), group).totalMinutes;
  }
  return { first, second, remove, total, errors, deleted, calls };
}

test("single delete updates totals immediately, ignores a repeat, and stays hidden on success", async () => {
  const { first, remove, total, calls, deleted, errors } = planning();
  assert.equal(total(), 120);
  const request = remove(first);
  assert.equal(total(), 60);
  assert.equal(deleted.length, 0);
  await remove(first).result;
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { employeeId: "employee", shiftId: "first", start: first.start.toISOString(), end: first.end.toISOString() });
  request.resolve();
  await request.result;
  assert.equal(total(), 60);
  assert.deepEqual(deleted, calls);
  assert.deepEqual(errors, []);
});

for (const [name, status] of [["network error"], ["access denied", 403], ["revision conflict", 409], ["locked period", 423]]) {
  test(`single delete rolls back after ${name}`, async () => {
    const { first, remove, total, deleted, errors } = planning();
    const request = remove(first);
    assert.equal(total(), 60);
    const failure = status ? { response: { status } } : new Error("Network error");
    request.reject(failure);
    await request.result;
    assert.equal(total(), 120);
    assert.deepEqual(errors, [failure]);
    assert.deepEqual(deleted, []);
  });
}

test("rollback follows the original shift across dates and groupings", async () => {
  const { first, remove, total } = planning();
  const request = remove(first);
  assert.equal(total("2026-10-05", "day", "positions"), 60);
  request.reject(new Error("Network error"));
  await request.result;
  assert.equal(total("2026-10-05", "day", "positions"), 60);
  assert.equal(total("2026-10-03", "day", "positions"), 120);
});

test("two concurrent deletes reconcile independently when the responses arrive out of order", async () => {
  const { first, second, remove, total } = planning();
  const a = remove(first);
  const b = remove(second);
  assert.equal(total(), 0);
  b.resolve();
  await b.result;
  assert.equal(total(), 0);
  a.reject({ response: { status: 409 } });
  await a.result;
  assert.equal(total(), 60);
});

test("a conflict refresh reconciles only the affected shift and preserves newer edits", () => {
  const first = service("first", "18");
  const second = service("second", "20");
  const edited = { ...first, notes: "Modified on the server" };
  const employee = { shifts: [first, second] };
  assert.deepEqual(reconcilePlanningShift(employee, first.id, first, [edited]).shifts, [edited, second]);
  assert.deepEqual(reconcilePlanningShift(employee, first.id, first, []).shifts, [second]);
  const newerEmployee = { shifts: [{ ...first, notes: "Changed again" }, second] };
  assert.equal(reconcilePlanningShift(newerEmployee, first.id, first, [edited]), newerEmployee);
});
