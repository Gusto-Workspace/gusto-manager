const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computeSessionDayBreakdown,
  computeSessionMetrics,
} = require("../services/time-clock.service");
const {
  computeMealAllowance,
} = require("../services/meal-allowance.service");

function buildOpeningHours(dayIndex, open, close) {
  const openingHours = Array.from({ length: 7 }, () => ({
    isClosed: true,
    hours: [],
  }));
  openingHours[dayIndex] = {
    isClosed: false,
    hours: [{ open, close }],
  };
  return openingHours;
}

test("a 19:30-02:00 session keeps its full duration across midnight", () => {
  const session = {
    businessDate: "2026-08-19",
    clockInAt: new Date("2026-08-19T19:30:00+02:00"),
    clockOutAt: new Date("2026-08-20T02:00:00+02:00"),
    breaks: [],
  };

  const metrics = computeSessionMetrics(session);
  const breakdown = computeSessionDayBreakdown(session);

  assert.equal(metrics.workedMinutes, 390);
  assert.deepEqual(
    breakdown.days.map((day) => [day.date, day.workedMinutes]),
    [
      ["2026-08-19", 270],
      ["2026-08-20", 120],
    ],
  );
});

test("an active overnight session is not marked missing at midnight", () => {
  const session = {
    businessDate: "2026-08-19",
    clockInAt: new Date("2026-08-19T19:30:00+02:00"),
    clockOutAt: null,
    breaks: [],
  };

  const overnight = computeSessionMetrics(session, {
    now: new Date("2026-08-20T03:00:00+02:00"),
    referenceDateKey: "2026-08-20",
  });
  const stale = computeSessionMetrics(session, {
    now: new Date("2026-08-20T19:30:00+02:00"),
    referenceDateKey: "2026-08-20",
  });

  assert.equal(overnight.anomalies.includes("missing_clock_out"), false);
  assert.equal(stale.anomalies.includes("missing_clock_out"), true);
});

test("the dinner meal follows a 19:30-02:00 opening after midnight", () => {
  // 19 August 2026 is a Wednesday, index 2 in the Monday-first API array.
  const openingHours = buildOpeningHours(2, "19:30", "02:00");
  const allowance = computeMealAllowance({
    start: new Date("2026-08-20T00:30:00+02:00"),
    end: new Date("2026-08-20T02:00:00+02:00"),
    openingHours,
  });

  assert.deepEqual(allowance.periods, ["dinner"]);
  assert.equal(allowance.count, 1);
});

test("a 22:00-03:00 service is handled without a fixed 02:00 cutoff", () => {
  const openingHours = buildOpeningHours(2, "22:00", "03:00");
  const session = {
    businessDate: "2026-08-19",
    clockInAt: new Date("2026-08-19T22:00:00+02:00"),
    clockOutAt: new Date("2026-08-20T03:00:00+02:00"),
    breaks: [],
  };

  assert.equal(computeSessionMetrics(session).workedMinutes, 300);
  assert.deepEqual(
    computeMealAllowance({
      start: session.clockInAt,
      end: session.clockOutAt,
      openingHours,
    }).periods,
    ["dinner"],
  );
});

test("a break crossing midnight is deducted from both civil days", () => {
  const session = {
    businessDate: "2026-08-19",
    clockInAt: new Date("2026-08-19T22:00:00+02:00"),
    clockOutAt: new Date("2026-08-20T03:00:00+02:00"),
    breaks: [
      {
        startAt: new Date("2026-08-19T23:45:00+02:00"),
        endAt: new Date("2026-08-20T00:15:00+02:00"),
      },
    ],
  };

  const metrics = computeSessionMetrics(session);
  const breakdown = computeSessionDayBreakdown(session);

  assert.equal(metrics.breakMinutes, 30);
  assert.equal(metrics.workedMinutes, 270);
  assert.deepEqual(
    breakdown.days.map((day) => [
      day.date,
      day.breakMinutes,
      day.workedMinutes,
    ]),
    [
      ["2026-08-19", 15, 105],
      ["2026-08-20", 15, 165],
    ],
  );
});
