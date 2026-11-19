import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlanningGrid,
  getPlanningEmployees,
  getPlanningPeriod,
  getPlanningSlot,
  getPlanningTimeline,
  layOutPlanningDay,
  movePlanningDate,
  parsePlanningDate,
  planningDateKey,
  restorePlanningConsultation,
} from "../src/components/dashboard/employees/planning-grid.utils.mjs";
import { getShiftMealMeta } from "../src/components/dashboard/employees/planning-meals.utils.js";

process.env.TZ = "Europe/Paris";
const date = parsePlanningDate;
const plan = (employees, day, view, group = "employees") =>
  buildPlanningGrid(
    employees,
    getPlanningPeriod(date(day), view),
    group,
    "Sans poste",
  );
const shift = (_id, start, end, extra = {}) => ({ _id, start, end, ...extra });

test("the week starts on Monday and a period can cross a year boundary", () => {
  const period = getPlanningPeriod(date("2026-01-01"), "week");
  assert.deepEqual(period.days.map(planningDateKey), [
    "2025-12-29",
    "2025-12-30",
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-01-04",
  ]);
  assert.equal(
    planningDateKey(movePlanningDate(date("2025-12-31"), "day", 1)),
    "2026-01-01",
  );
  assert.equal(
    planningDateKey(movePlanningDate(date("2025-12-31"), "week", 1)),
    "2026-01-07",
  );
});

test("the month uses real civil days and clamps reference dates when navigating", () => {
  assert.equal(getPlanningPeriod(date("2024-02-15"), "month").days.length, 29);
  assert.equal(getPlanningPeriod(date("2026-02-16"), "month").days.length, 28);
  assert.equal(
    planningDateKey(movePlanningDate(date("2026-01-31"), "month", 1)),
    "2026-02-28",
  );
  assert.equal(date("2026-02-30"), null);
  assert.equal(date("2026-2-03"), null);
});

test("the selected date and view return without restoring another tenant's employee or query", () => {
  const saved = {
    restaurantId: "a",
    employeeId: "emp",
    query: "Café",
    group: "posts",
    view: "month",
    date: "2026-06-07",
  };
  assert.deepEqual(restorePlanningConsultation(saved, "a"), {
    employeeId: "emp",
    query: "Café",
    group: "posts",
    view: "month",
    date: date(saved.date),
  });
  const next = restorePlanningConsultation(saved, "b");
  assert.equal(next.employeeId, null);
  assert.equal(next.query, "");
  assert.equal(planningDateKey(next.date), saved.date);
  assert.equal(
    restorePlanningConsultation({ view: "injected" }, "a").view,
    "week",
  );
});

test("the employee projection uses the active restaurant profile and current shifts", () => {
  const employee = {
    _id: "e",
    firstname: "Camille",
    lastname: "R.",
    post: "Fallback",
    shifts: [shift("fresh", "2026-04-06T09:00:00", "2026-04-06T14:00:00")],
    restaurantProfiles: [
      {
        restaurant: "a",
        snapshot: { post: "Salle" },
        employment: { contractualValue: 20 },
      },
      {
        restaurant: { _id: "b" },
        snapshot: { firstname: "Cam", post: "Cuisine" },
        employment: { contractualValue: 35 },
        shifts: [],
      },
    ],
  };
  const [current, empty] = getPlanningEmployees(
    [employee, { _id: "empty" }, { _id: "account", accountType: "accountant" }],
    "b",
  );
  assert.equal(current.name, "Cam R.");
  assert.equal(current.post, "Cuisine");
  assert.equal(current.employment.contractualValue, 35);
  assert.equal(current.shifts[0]._id, "fresh");
  assert.deepEqual(empty.shifts, []);
  assert.equal(getPlanningEmployees([employee], "b").length, 1);
  assert.deepEqual(
    getPlanningEmployees([{ _id: "empty", accountType: "accountant" }], "b"),
    [],
  );
});

test("multiple shifts, empty rows, post groups and leave types contribute the correct minutes", () => {
  const employees = [
    {
      _id: "a",
      post: "Salle",
      shifts: [
        shift("am", "2026-04-06T09:00:00", "2026-04-06T12:30:00"),
        shift("pm", "2026-04-06T19:00:00", "2026-04-06T22:00:00"),
        shift("leave", "2026-04-07T00:00:00", "2026-04-09T23:59:00", {
          leaveRequestId: "r",
        }),
        shift("half", "2026-04-10T12:00:00", "2026-04-10T23:59:00", {
          leaveRequestId: "half",
        }),
        shift("legacy", "2026-04-11T00:00:00", "2026-04-11T23:59:00", {
          title: "Congé",
        }),
        shift("invalid", "2026-04-11T10:00:00", "2026-04-11T09:00:00"),
      ],
      leaveRequests: [{ _id: "half", type: "afternoon" }],
    },
    {
      _id: "b",
      post: "Cuisine",
      shifts: [shift("third", "2026-04-07T15:00:00", "2026-04-07T17:00:00")],
    },
    { _id: "c", post: "", shifts: [] },
  ];
  const result = plan(employees, "2026-04-06", "week", "posts");
  assert.deepEqual(
    result.groups.map(({ label, minutes }) => [label, minutes]),
    [
      ["Salle", 390],
      ["Cuisine", 120],
      ["Sans poste", 0],
    ],
  );
  assert.deepEqual(result.dailyMinutes, [390, 120, 0, 0, 0, 0, 0]);
  assert.equal(result.totalMinutes, 510);
  const [first] = result.groups[0].rows;
  assert.deepEqual(
    first.cells.map((day) => day.length),
    [2, 1, 1, 1, 1, 1, 0],
  );
  assert.equal(first.cells[2][0].event.fullDay, true);
  assert.equal(first.cells[4][0].event.leaveType, "afternoon");
  assert.equal(first.cells[4][0].event.fullDay, false);
  assert.equal(plan(employees, "2026-04-06", "month").totalMinutes, 510);
});

test("overnight hours are assigned to the start date, while both civil days display their segment", () => {
  const employees = [
    {
      _id: "a",
      shifts: [shift("night", "2026-04-06T19:30:00", "2026-04-07T02:00:00")],
    },
  ];
  const week = plan(employees, "2026-04-06", "week");
  assert.deepEqual(week.dailyMinutes, [390, 0, 0, 0, 0, 0, 0]);
  assert.equal(week.totalMinutes, 390);
  assert.equal(week.groups[0].rows[0].cells[0][0].endsAtMidnight, true);
  const period = getPlanningPeriod(date("2026-04-07"), "day");
  const day = plan(employees, "2026-04-07", "day");
  assert.equal(day.carriedMinutes, 390);
  assert.equal(day.totalMinutes, 390);
  assert.deepEqual(day.dailyMinutes, [0]);
  const segment = day.groups[0].rows[0].cells[0][0];
  assert.equal(segment.fromPreviousDay, true);
  assert.equal(segment.start.getHours(), 0);
  assert.equal(segment.end.getHours(), 2);
  const [layout] = layOutPlanningDay(
    [segment],
    period.start,
    period.endExclusive,
  );
  assert.equal(layout.left, 0);
  assert.equal(layout.width, (100 * 2) / 24);
});

test("a day with a clock change displays real elapsed time and keeps the default slot at 09:00", () => {
  for (const [key, hours] of [
    ["2026-03-29", 23],
    ["2026-10-25", 25],
  ]) {
    const period = getPlanningPeriod(date(key), "day");
    assert.equal(
      getPlanningTimeline(period.start, period.endExclusive).hours.length,
      hours,
    );
    assert.equal(getPlanningSlot(period.start).start.getHours(), 9);
    assert.equal(
      planningDateKey(movePlanningDate(period.start, "day", 1)),
      planningDateKey(period.endExclusive),
    );
  }
  const autumn = getPlanningPeriod(date("2026-10-25"), "day");
  const timeline = getPlanningTimeline(autumn.start, autumn.endExclusive);
  assert.equal(
    timeline.hours.filter((hour) => hour.getHours() === 2).length,
    2,
  );
});

test("overlapping events can be inspected in separate lanes without hiding shorter shifts", () => {
  const period = getPlanningPeriod(date("2026-04-06"), "day");
  const cells = plan(
    [
      {
        _id: "a",
        shifts: [
          shift("first", "2026-04-06T09:00:00", "2026-04-06T13:00:00"),
          shift("second", "2026-04-06T10:00:00", "2026-04-06T12:00:00"),
          shift("third", "2026-04-06T12:00:00", "2026-04-06T14:00:00"),
        ],
      },
    ],
    "2026-04-06",
    "day",
  ).groups[0].rows[0].cells[0];
  assert.deepEqual(
    layOutPlanningDay(cells, period.start, period.endExclusive).map(
      (block) => block.lane,
    ),
    [0, 1, 1],
  );
});

test("a populated month retains all employees, shifts and daily totals", () => {
  const employees = Array.from({ length: 48 }, (_, index) => ({
    _id: String(index),
    post: index % 2 ? "Salle" : "Cuisine",
    shifts: Array.from({ length: 31 }, (_, day) => {
      const key = `2026-05-${String(day + 1).padStart(2, "0")}`;
      return shift(`${index}-${day}`, `${key}T08:00:00`, `${key}T15:00:00`);
    }),
  }));
  const month = plan(employees, "2026-05-01", "month", "posts");
  assert.deepEqual(
    month.groups.map((group) => group.rows.length),
    [24, 24],
  );
  assert.equal(month.totalMinutes, 48 * 31 * 420);
  assert.deepEqual(month.dailyMinutes, Array(31).fill(48 * 420));
});

test("the meal indicator uses the existing overnight calculation and excludes leave", () => {
  const openingHours = Array.from({ length: 7 }, () => ({}));
  openingHours[0] = { hours: [{ open: "19:30", close: "02:00" }] };
  const args = {
    start: new Date("2026-04-06T23:30:00"),
    end: new Date("2026-04-07T02:00:00"),
    openingHours,
  };
  assert.deepEqual(getShiftMealMeta({ ...args, isLeave: true }), {
    hasMeal: false,
    mealCount: 0,
    mealPeriods: [],
  });
  assert.equal(getShiftMealMeta(args).hasMeal, true);
});

test("the three grids group individual shifts by position and retain net night totals and historical shifts", () => {
  const night = shift("night", "2026-10-24T22:00:00+02:00", "2026-10-25T06:00:00+01:00", {
    position: "Bar", breakMinutes: 45, notes: "Faire la fermeture",
  });
  const legacy = shift("legacy", "2026-10-24T15:00:00+02:00", "2026-10-24T17:00:00+02:00");
  const employee = { _id: "employee", post: "Salle", shifts: [legacy, night] };
  for (const view of ["day", "week", "month"]) {
    const result = plan([employee], "2026-10-24", view, "posts");
    assert.equal(result.totalMinutes, 615);
    assert.deepEqual(result.groups.map(({ label, minutes }) => [label, minutes]), [["Salle", 120], ["Bar", 495]]);
    const [bar] = result.groups[1].rows;
    const [event] = bar.cells.flat().map((segment) => segment.event);
    assert.equal(event.position, "Bar");
    assert.equal(event.notes, "Faire la fermeture");
    assert.equal(event.breakMinutes, 45);
  }
  const carried = plan([employee], "2026-10-25", "day", "posts");
  assert.equal(carried.carriedMinutes, 495);
  assert.equal(carried.groups[1].rows[0].cells[0][0].fromPreviousDay, true);
});

test("Paris boundaries and default slots remain correct when viewed from another time zone", () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const civil = date("2026-03-29");
    const period = getPlanningPeriod(civil, "day");
    assert.equal(period.startInstant.toISOString(), "2026-03-28T23:00:00.000Z");
    assert.equal(getPlanningTimeline(period.startInstant, period.endInstant).hours.length, 23);
    assert.equal(getPlanningSlot(civil).start.toISOString(), "2026-03-29T07:00:00.000Z");
  } finally {
    process.env.TZ = originalTimeZone;
  }
});
