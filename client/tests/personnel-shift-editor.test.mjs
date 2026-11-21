import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlanningGrid,
  getPlanningPeriod,
  getPlanningSlot,
  parsePlanningDate,
  planningDateKey,
} from "../src/components/dashboard/employees/planning-grid.utils.mjs";
import {
  findDraftConflict,
  defaultShiftRepeat,
  getShiftBatch,
  getShiftDraftRange,
  makeExtraShift,
  makeShiftDraft,
  normalizeShiftTime,
  savePlanningShift,
  savePlanningShiftBatch,
  shiftTemplateDraftPatch,
  shiftTemplateFromDraft,
  SHIFT_TIME_OPTIONS,
  updatePlanningEmployee,
  validateShiftDraft,
} from "../src/components/dashboard/employees/shift-editor.utils.mjs";

process.env.TZ = "Europe/Paris";
const date = parsePlanningDate("2026-11-18");
const newDraft = () =>
  makeShiftDraft({ employeeId: "employee-a", slot: getPlanningSlot(date) });

test("a shift template reuses Paris wall times without copying the employee, shift ID or date", () => {
  const original = { ...newDraft(), shiftId: "source", title: "Fermeture", position: "Bar", notes: "Fermer la terrasse",
    date: "2026-11-18", startTime: "18:00", endTime: "00:30", breakMinutes: "20" };
  const template = shiftTemplateFromDraft("Soir", original, getShiftDraftRange(original));
  assert.deepEqual(template, { name: "Soir", title: "Fermeture", position: "Bar", notes: "Fermer la terrasse",
    startTime: "18:00", endTime: "00:30", endDayOffset: 1, breakMinutes: 20 });
  const target = { ...newDraft(), employeeId: "employee-b", date: "2027-06-03" };
  const prepared = { ...target, ...shiftTemplateDraftPatch(template, target.date) };
  const range = getShiftDraftRange(prepared);
  assert.equal(prepared.employeeId, "employee-b");
  assert.equal(prepared.shiftId, null);
  assert.equal(range.start.toISOString(), "2027-06-03T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2027-06-03T22:30:00.000Z");
  const gap = { ...target, date: "2027-03-28" };
  assert.equal(getShiftDraftRange({ ...gap, ...shiftTemplateDraftPatch({ ...template,
    startTime: "02:30", endTime: "04:00", endDayOffset: 0 }, gap.date) }).error, "invalidLocalTime");
});

test("cell slots preserve employee, date and time", () => {
  const slot = getPlanningSlot(date, 23 * 60 + 45);
  const draft = makeShiftDraft({ employeeId: "employee-a", slot });
  assert.equal(draft.employeeId, "employee-a");
  assert.equal(draft.date, "2026-11-18");
  assert.equal(draft.startTime, "23:45");
  assert.equal(draft.endTime, "00:15");
  const range = getShiftDraftRange(draft);
  assert.equal(range.endsAnotherDay, true);
  assert.equal(range.minutes, 30);
  assert.equal(planningDateKey(range.end), "2026-11-19");

  const missingEmployee = makeShiftDraft({ slot });
  assert.equal(
    validateShiftDraft(missingEmployee, getShiftDraftRange(missingEmployee)),
    "employeeRequired",
  );
});

test("quick options, precise time and overnight durations use the same validation", () => {
  assert.equal(SHIFT_TIME_OPTIONS.length, 96);
  assert.equal(SHIFT_TIME_OPTIONS.at(-1), "23:45");
  assert.equal(normalizeShiftTime("9:07"), "09:07");
  assert.equal(normalizeShiftTime("0147"), "01:47");
  assert.equal(normalizeShiftTime("24:00"), "");
  assert.equal(normalizeShiftTime("07:80"), "");
  const draft = { ...newDraft(), startTime: "22:13", endTime: "01:47" };
  assert.equal(getShiftDraftRange(draft).minutes, 214);
  assert.equal(
    getShiftDraftRange({ ...draft, endTime: "22:13" }).error,
    "invalidRange",
  );
  assert.equal(
    getShiftDraftRange({ ...draft, endDate: draft.date }).error,
    "invalidRange",
  );
  assert.equal(
    getShiftDraftRange({ ...draft, endTime: "29:00" }).error,
    "invalidTimes",
  );
  assert.equal(
    getShiftDraftRange({ ...draft, date: "2026-02-30" }).error,
    "invalidDates",
  );
  assert.equal(
    validateShiftDraft(
      { ...draft, title: "Congés" },
      getShiftDraftRange(draft),
    ),
    "leaveTitle",
  );
});

test("whole-day absences keep their inclusive Gusto endpoints over several days", () => {
  const draft = {
    ...newDraft(),
    isLeave: true,
    absenceDuration: "full",
    endDate: "2026-11-20",
  };
  const range = getShiftDraftRange(draft);
  assert.equal(range.start.toISOString(), "2026-11-17T23:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-11-20T22:59:00.000Z");
  assert.equal(
    getShiftDraftRange({ ...draft, endDate: "2026-11-17" }).error,
    "invalidRange",
  );
});

test("half-day absences use the selected date and custom hours remain editable", () => {
  const draft = {
    ...newDraft(),
    isLeave: true,
    endDate: "2026-11-20",
    startTime: "10:15",
    endTime: "12:10",
  };
  const morning = getShiftDraftRange({ ...draft, absenceDuration: "morning" });
  assert.equal(morning.start.toISOString(), "2026-11-17T23:00:00.000Z");
  assert.equal(morning.end.toISOString(), "2026-11-18T11:00:00.000Z");
  const afternoon = getShiftDraftRange({
    ...draft,
    absenceDuration: "afternoon",
  });
  assert.equal(afternoon.start.toISOString(), morning.end.toISOString());
  assert.equal(afternoon.end.toISOString(), "2026-11-18T22:59:00.000Z");
  const custom = getShiftDraftRange({
    ...draft,
    endDate: "",
    absenceDuration: "custom",
  });
  assert.equal(custom.minutes, 115);
});

test("the editor reopens typed and legacy absences with the correct duration", () => {
  const legacy = {
    _id: "legacy",
    isLeave: true,
    start: "2026-11-18T00:00:00",
    end: "2026-11-18T12:00:00",
  };
  const typed = {
    ...legacy,
    _id: "typed",
    absenceType: "sick_leave",
    absenceDuration: "custom",
  };
  const grid = buildPlanningGrid(
    [{ _id: "employee-a", shifts: [legacy, typed] }],
    getPlanningPeriod(date, "day"),
    "employees",
    "Sans poste",
  );
  const [first, second] = grid.groups[0].rows[0].cells[0].map(({ event }) =>
    makeShiftDraft({ event }),
  );
  assert.equal(first.absenceDuration, "morning");
  assert.equal(first.absenceType, "");
  assert.equal(second.absenceDuration, "custom");
  assert.equal(second.absenceType, "sick_leave");
  assert.equal(grid.totalMinutes, 0);
});

test("editing preserves exact stored times, including the repeated hour and multiple days", () => {
  const event = {
    id: "shift-existing",
    resourceId: "employee-a",
    shiftLabel: "Service",
    start: new Date("2026-10-25T02:50:12+02:00"),
    end: new Date("2026-10-25T02:10:12+01:00"),
  };
  const draft = makeShiftDraft({ event });
  const range = getShiftDraftRange(draft);
  assert.deepEqual(range.start, event.start);
  assert.deepEqual(range.end, event.end);
  assert.equal(range.minutes, 20);
  const longEvent = { ...event, end: new Date("2026-10-27T04:00:00+01:00") };
  const longDraft = makeShiftDraft({ event: longEvent });
  assert.equal(longDraft.endDate, "2026-10-27");
  assert.deepEqual(getShiftDraftRange(longDraft).end, longEvent.end);
  assert.equal(
    getShiftDraftRange({
      ...newDraft(),
      date: "2026-03-29",
      startTime: "02:30",
    }).error,
    "invalidLocalTime",
  );
});

test("the conflict preview excludes the edited shift and permits adjacent shifts", () => {
  const range = getShiftDraftRange(newDraft());
  const shifts = [
    { _id: "self", start: range.start, end: range.end },
    {
      _id: "previous",
      start: new Date(+range.start - 60_000),
      end: range.start,
    },
    { _id: "next", start: range.end, end: new Date(+range.end + 60_000) },
  ];
  assert.equal(findDraftConflict(shifts, "self", range), null);
  const absence = {
    _id: "leave",
    leaveRequestId: "request",
    start: range.start,
    end: range.end,
  };
  assert.equal(
    findDraftConflict([...shifts, absence], "self", range).isLeave,
    true,
  );
});

test("create and edit submit only persisted fields to the matching restaurant and shift", async (t) => {
  const shifts = [{ _id: "shift-a" }];
  const http = {
    post: t.mock.fn(async () => ({ data: { shifts } })),
    put: t.mock.fn(async () => ({ data: { shifts } })),
  };
  const baseUrl = "http://example.test/api";
  const draft = {
    ...newDraft(),
    title: "  Service  ",
    startTime: "19:30",
    endTime: "02:00",
    breakMinutes: "30",
    position: "Salle",
    notes: "  Fermer la terrasse  ",
  };
  const range = getShiftDraftRange(draft);
  assert.equal(
    await savePlanningShift(http, baseUrl, "restaurant-a", draft, range),
    shifts,
  );
  const collection = `${baseUrl}/restaurants/restaurant-a/employees/employee-a/shifts`;
  const payload = {
    isLeave: false,
    title: "Service",
    start: "2026-11-18T18:30:00.000Z",
    end: "2026-11-19T01:00:00.000Z",
    breakMinutes: 30,
    position: "Salle",
    notes: "Fermer la terrasse",
  };
  assert.deepEqual(http.post.mock.calls[0].arguments, [collection, payload]);
  await savePlanningShift(
    http,
    baseUrl,
    "restaurant-a",
    { ...draft, shiftId: "shift-a" },
    range,
  );
  assert.deepEqual(http.put.mock.calls[0].arguments, [
    `${collection}/shift-a`,
    payload,
  ]);
  const absence = {
    ...draft,
    shiftId: "shift-a",
    isLeave: true,
    absenceType: "paid_leave",
    absenceDuration: "full",
  };
  await savePlanningShift(
    http,
    baseUrl,
    "restaurant-a",
    absence,
    getShiftDraftRange(absence),
  );
  assert.deepEqual(http.put.mock.calls[1].arguments[1], {
    isLeave: true,
    title: "",
    start: "2026-11-17T23:00:00.000Z",
    end: "2026-11-18T22:59:00.000Z",
    absenceType: "paid_leave",
    absenceDuration: "full",
  });
});

test("a batch repeats Paris wall times, deducts pauses across DST and reuses the submission key", async (t) => {
  const draft = {
    ...newDraft(), date: "2026-03-28", startTime: "22:00", endTime: "06:00",
    breakMinutes: "30", position: "Cuisine", notes: "Fermeture",
  };
  const second = { ...makeExtraShift(draft, draft), startTime: "09:00", endTime: "14:00", position: "Salle" };
  const rule = { ...defaultShiftRepeat, frequency: "daily", count: "2" };
  const batch = getShiftBatch(draft, [second], rule);
  assert.equal(batch.count, 2);
  assert.equal(batch.occurrences.length, 4);
  assert.equal(batch.minutes, (7.5 + 8.5 + 5 + 5 - 2) * 60);
  assert.equal(batch.occurrences[0].range.end.toISOString(), "2026-03-29T04:00:00.000Z");
  assert.equal(batch.occurrences[2].range.start.toISOString(), "2026-03-29T20:00:00.000Z");

  const http = { post: t.mock.fn(async () => ({ data: { shifts: [] } })) };
  const requests = new Map();
  await savePlanningShiftBatch(http, "/shifts", batch, requests);
  await savePlanningShiftBatch(http, "/shifts", batch, requests);
  const [[url, first], [, retry]] = http.post.mock.calls.map(({ arguments: args }) => args);
  assert.equal(url, "/shifts/batch");
  assert.deepEqual(first, retry);
  assert.equal(first.shifts[0].breakMinutes, 30);
  assert.equal(first.shifts[0].notes, "Fermeture");
  assert.equal(first.shifts[1].position, "Salle");
});

test("weekly repeats retain the anchor, reject gaps and report the date of a cross-day conflict", () => {
  const draft = { ...newDraft(), date: "2026-10-21", startTime: "09:00", endTime: "10:00" };
  const weekly = getShiftBatch(draft, [], {
    ...defaultShiftRepeat, frequency: "weekly", interval: "2", days: [1, 5], end: "until", until: "2026-11-06",
  });
  assert.deepEqual(weekly.occurrences.map(({ draft: entry }) => entry.date),
    ["2026-10-21", "2026-10-23", "2026-11-02", "2026-11-06"]);
  const springGap = getShiftBatch({ ...draft, date: "2026-03-28", startTime: "02:30" }, [], {
    ...defaultShiftRepeat, frequency: "daily",
  });
  assert.equal(springGap.error, "invalidLocalTime");
  assert.equal(springGap.date, "2026-03-29");
  const overnight = { ...draft, startTime: "20:00", endTime: "10:00" };
  const conflict = getShiftBatch(overnight, [draft], { ...defaultShiftRepeat, frequency: "daily" });
  assert.equal(conflict.error, "batchOverlap");
  assert.equal(conflict.date, "2026-10-22");
  assert.equal(getShiftBatch({ ...draft, breakMinutes: "60" }, [], defaultShiftRepeat).blockErrors[0], "invalidBreak");
});

test("the API conflict is preserved and a linked absence cannot be saved as a shift", async (t) => {
  const conflict = new Error("Conflict");
  conflict.response = {
    status: 409,
    data: { conflictType: "leave_overlap", conflict: { isLeave: true } },
  };
  const http = {
    put: t.mock.fn(async () => {
      throw conflict;
    }),
  };
  const draft = { ...newDraft(), shiftId: "shift-a" };
  const range = getShiftDraftRange(draft);
  const save = (values) =>
    savePlanningShift(
      http,
      "http://example.test/api",
      "restaurant-a",
      values,
      range,
    );
  await assert.rejects(save(draft), (error) => error === conflict);
  await assert.rejects(
    save({ ...draft, leaveRequestId: "request-a" }),
    /Invalid planning shift/,
  );
  assert.equal(http.put.mock.callCount(), 1);
});

test("a late shift response cannot replace another restaurant's employee projection", () => {
  const employee = { _id: "shared", shifts: [] };
  const active = {
    _id: "restaurant-b",
    employees: [employee, { _id: "other" }],
  };
  const update = (item) => ({ ...item, shifts: [{ _id: "shift" }] });
  assert.equal(
    updatePlanningEmployee(active, "restaurant-a", employee._id, update),
    active,
  );
  const next = updatePlanningEmployee(
    active,
    "restaurant-b",
    employee._id,
    update,
  );
  assert.equal(next.employees[0].shifts[0]._id, "shift");
  assert.equal(next.employees[1], active.employees[1]);
});

test("empty and large rosters retain their expected rows and totals in every view", () => {
  const employees = Array.from({ length: 160 }, (_, index) => ({
    _id: `employee-${index}`,
    post: index % 2 === 0 ? "Salle" : "Cuisine",
    shifts: [
      {
        _id: `shift-${index}`,
        start: "2026-11-18T11:00:00",
        end: "2026-11-18T14:00:00",
      },
    ],
  }));
  for (const view of ["day", "week", "month"]) {
    const period = getPlanningPeriod(date, view);
    const empty = buildPlanningGrid([], period, "posts", "Sans poste");
    assert.equal(
      empty.groups.every((group) => group.rows.length === 0),
      true,
    );
    assert.equal(empty.totalMinutes, 0);
    const large = buildPlanningGrid(employees, period, "posts", "Sans poste");
    assert.deepEqual(
      large.groups.map((group) => group.rows.length),
      [80, 80],
    );
    assert.equal(large.totalMinutes, 160 * 180);
  }
});
