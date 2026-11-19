import assert from "node:assert/strict";
import { test } from "node:test";
import axios from "axios";
import {
  getFailedPunchesForRestaurant,
  getPendingPunchCountForRestaurant,
  mergeTimeClockPunches,
  replayPendingTimeClockPunches,
} from "../src/components/dashboard/time-clock/time-clock.offline.js";

const employee = { id: "employee-a", firstname: "Alex", lastname: "Fictif" };
const date = "2026-11-19";
const punch = (action, time, suffix, employeeId = employee.id) => ({
  action,
  employeeId,
  businessDate: date,
  occurredAt: `${date}T${time}:00.000Z`,
  clientMutationId: `mutation-${suffix}`,
});

test("offline events restore available actions and totals in chronological order", () => {
  const arrival = punch("clock_in", "08:00", "a");
  const pause = punch("break_start", "10:00", "b");
  const resume = punch("break_end", "10:30", "c");
  const departure = punch("clock_out", "12:00", "d");
  const unrelated = punch("clock_out", "10:15", "other", "employee-b");
  const at = (value) => new Date(`${date}T${value}:00.000Z`);

  const paused = mergeTimeClockPunches({ employee, anchorDate: date, now: at("10:15"), pending: [pause, arrival, unrelated] });
  assert.deepEqual(paused.state.availableActions, ["break_end"]);
  assert.equal(paused.day.totalWorkedMinutes, 120);
  assert.equal(paused.day.totalBreakMinutes, 15);

  const closed = mergeTimeClockPunches({
    employee, anchorDate: date, now: at("12:05"), pending: [departure, resume, arrival, pause, unrelated],
  });
  assert.deepEqual(closed.state.availableActions, ["clock_in"]);
  assert.equal(closed.state.activeSession, null);
  assert.equal(closed.day.totalWorkedMinutes, 210);
  assert.equal(closed.day.totalBreakMinutes, 30);
});

function installLegacyQueue(t, items, { canWrite = true } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let value = JSON.stringify({ restaurants: { restaurant: { pendingPunches: items, failedPunches: [] } } });
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => value,
      setItem: (_key, next) => {
        if (!canWrite) throw new Error("Storage exhausted");
        value = next;
      },
    },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  });
}

const replay = () => replayPendingTimeClockPunches({
  restaurantId: "restaurant", token: "fixture-only", apiUrl: "http://api.example.test",
});

test("a revoked dashboard session leaves old events available for retry", async (t) => {
  installLegacyQueue(t, [punch("clock_in", "08:00", "a")]);
  t.mock.method(axios, "post", async () => { throw { response: { status: 403 } }; });
  assert.equal((await replay()).stopped, true);
  assert.equal(getPendingPunchCountForRestaurant("restaurant"), 1);
  assert.equal(getFailedPunchesForRestaurant("restaurant").length, 0);
});

test("legacy conflicts remain available even after more than twenty refusals", async (t) => {
  const items = Array.from({ length: 22 }, (_, index) => punch("clock_in", "08:00", index));
  installLegacyQueue(t, items);
  t.mock.method(axios, "post", async () => { throw { response: { status: 409, data: { message: "Conflit fictif" } } }; });
  const result = await replay();
  assert.equal(result.failed, 22);
  assert.equal(getPendingPunchCountForRestaurant("restaurant"), 0);
  assert.equal(getFailedPunchesForRestaurant("restaurant").length, 22);
});

test("when local storage refuses the transfer, the old event is still in the queue", async (t) => {
  installLegacyQueue(t, [punch("clock_in", "08:00", "a")], { canWrite: false });
  t.mock.method(axios, "post", async () => { throw { response: { status: 409 } }; });
  assert.equal((await replay()).stopped, true);
  assert.equal(getPendingPunchCountForRestaurant("restaurant"), 1);
});
