const {
  addDaysToDateKey,
  buildEmployeeRangeSummary,
  computeSessionMetrics,
  getEmployeeDisplay,
  toLocalDateKey,
} = require("./time-clock.service");
const { plannedMinutes } = require("./planning-shift.service");
const { computeMealAllowance } = require("./meal-allowance.service");
const { payrollDays } = require("./time-clock-payroll.service");

function employeeIdentity(employee, restaurantId) {
  const { id, firstname, lastname, post } = getEmployeeDisplay(employee, restaurantId);
  return { id, firstname, lastname, post };
}

function latestCorrectionNote(changes) {
  let latest = null;
  for (const entry of changes) {
    const text = typeof entry.reason === "string" ? entry.reason.trim() : "";
    const at = entry.at ?? entry.editedAt ?? null;
    if (text && (!latest || +new Date(at) >= +new Date(latest.at))) {
      latest = { text, at, source: entry.isNote ? "note" : "correction" };
    }
  }
  return latest;
}

function publicSession(session, source, date, note) {
  return {
    id: session.id,
    updatedAt: session.updatedAt,
    revision: source?.__v ?? 0,
    shiftId: source?.registerShiftId || null,
    status: session.status,
    clockInAt: session.clockInAt,
    clockOutAt: session.clockOutAt,
    review: session.review,
    timings: session.dayTotals,
    totals: session.totals,
    isPartialForDay: session.isPartialForDay,
    mealCount: session.dayTotals.mealCount,
    mealEditable: date === (session.businessDate || toLocalDateKey(session.clockInAt)),
    note,
    breaks: session.breaks.map(({ id, startAt, endAt, durationMinutes }) => ({
      id, startAt, endAt, durationMinutes,
    })),
    anomalies: session.anomalies,
  };
}

function isPlannedAbsence(shift) {
  const title = String(shift.title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return Boolean(shift.isLeave || shift.leaveRequestId || ["conge", "conges"].includes(title));
}

function shiftAttendanceKey(employeeId, shiftId, date) {
  return `${employeeId}:${shiftId}:${date}`;
}

function shiftMealCount(shift, openingHours, attendance) {
  if (attendance?.mealCount != null) return attendance.mealCount;
  if (attendance?.absent) return 0;
  return computeMealAllowance({ start: shift.start, end: shift.end, openingHours, explicit: shift }).count;
}

function assignPlannedServices(sessions, shifts, attendance, now = new Date()) {
  const shiftsByDate = new Map();
  for (const shift of shifts || []) {
    if (isPlannedAbsence(shift)) continue;
    const date = toLocalDateKey(shift.start);
    if (!date) continue;
    const scheduled = shiftsByDate.get(date) || [];
    scheduled.push(shift);
    shiftsByDate.set(date, scheduled);
  }
  for (const scheduled of shiftsByDate.values()) scheduled.sort((a, b) => +new Date(a.start) - +new Date(b.start));

  return [...sessions].sort((a, b) => +new Date(a.clockInAt) - +new Date(b.clockInAt)).map((session) => {
    const start = +new Date(session.clockInAt);
    const end = session.clockOutAt ? +new Date(session.clockOutAt) : Math.max(start + 1, +now);
    const date = toLocalDateKey(session.clockInAt);
    const scheduled = shiftsByDate.get(date) || [];
    let best = -1;
    let bestOverlap = 0;
    for (const [index, shift] of scheduled.entries()) {
      if (attendance.get(shiftAttendanceKey(session.employee, shift._id, date))?.absent) continue;
      const overlap = Math.min(end, +new Date(shift.end)) - Math.max(start, +new Date(shift.start));
      if (overlap > bestOverlap) {
        best = index;
        bestOverlap = overlap;
      }
    }
    if (best < 0) return session;
    const [shift] = scheduled.splice(best, 1);
    const override = attendance.get(shiftAttendanceKey(session.employee, shift._id, date))?.mealCount;
    return {
      ...session, registerShiftId: String(shift._id), plannedStart: shift.start, plannedEnd: shift.end,
      plannedBreakMinutes: shift.breakMinutes ?? 0,
      mealCountOverride: session.mealCountOverride ?? override,
    };
  });
}

function buildRegisterRows({ employees, sessions, absences = [], restaurantId, startDate, endDate, openingHours }) {
  const groups = new Map();
  const roster = new Map(employees.map((employee) => [String(employee._id), employee]));
  const attendance = new Map(absences.map((item) => [shiftAttendanceKey(item.employee, item.shift, item.shiftDate), item]));

  for (const session of sessions) {
    const id = String(session.employee);
    if (!roster.has(id)) roster.set(id, { ...session.employeeSnapshot, _id: id, former: true });
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(session);
  }

  return [...roster.values()].map((employee) => {
    const identity = employeeIdentity(employee, restaurantId);
    const profile = (employee.restaurantProfiles || []).find(
      (item) => String(item.restaurant) === String(restaurantId),
    );
    const shiftsByDate = new Map();
    for (const shift of profile?.shifts || []) {
      const date = toLocalDateKey(shift.start);
      if (!date || date > endDate) continue;
      const absence = isPlannedAbsence(shift);
      const last = absence ? toLocalDateKey(new Date(+new Date(shift.end) - 1)) || date : date;
      if (last < startDate) continue;
      const mark = attendance.get(shiftAttendanceKey(identity.id, shift._id, date));
      const planningNote = typeof shift.notes === "string" ? shift.notes.trim() : "";
      const note = latestCorrectionNote(mark?.changes || []) ??
        (planningNote ? { text: planningNote, source: "planning" } : null);
      const entry = {
        id: String(shift._id),
        start: shift.start,
        end: shift.end,
        position: shift.position || identity.post,
        title: shift.title,
        absence,
        reportedAbsent: !absence && Boolean(mark?.absent),
        absenceValidated: !absence && Boolean(mark?.absent && mark.validated),
        absenceRevision: mark?.revision || 0,
        note,
        plannedMinutes: plannedMinutes(new Date(shift.start), new Date(shift.end), shift.breakMinutes || 0),
        breakMinutes: shift.breakMinutes || 0,
        ...(!absence && {
          mealCount: shiftMealCount(shift, openingHours, mark),
        }),
      };
      for (let day = date < startDate ? startDate : date; day <= last && day <= endDate; day = addDaysToDateKey(day, 1)) {
        if (!shiftsByDate.has(day)) shiftsByDate.set(day, []);
        shiftsByDate.get(day).push(entry);
      }
    }

    const now = new Date();
    const employeeSessions = assignPlannedServices(groups.get(identity.id) || [], profile?.shifts, attendance, now);
    const sessionById = new Map(employeeSessions.map((item) => [String(item._id), item]));
    const notesById = new Map(employeeSessions.map((item) => [
      String(item._id), latestCorrectionNote([...(item.adjustments || []), ...(item.payrollAdjustments || [])]),
    ]));
    const payrollByDate = payrollDays(employeeSessions, startDate, endDate);
    const { range } = buildEmployeeRangeSummary({
      employee, restaurantId, startDate, endDate, openingHours, now,
      sessions: employeeSessions,
    });

    return {
      employee: identity,
      former: Boolean(employee.former || profile?.archivedAt),
      days: range.days.map((day) => {
        const shifts = (shiftsByDate.get(day.date) || []).sort((a, b) => +new Date(a.start) - +new Date(b.start));
        return {
          date: day.date,
          shifts,
          plannedMinutes: shifts.reduce((sum, shift) => sum + (shift.absence ? 0 : shift.plannedMinutes), 0),
          workedMinutes: day.totalWorkedMinutes,
          breakMinutes: day.totalBreakMinutes,
          mealCount: day.mealCount,
          anomalies: day.anomalies,
          sessions: day.sessions.map((session) => publicSession(session, sessionById.get(session.id), day.date, notesById.get(session.id))),
          payroll: (payrollByDate.get(day.date) || []).map((item) => ({ ...item, note: notesById.get(item.id) })),
        };
      }),
    };
  }).sort((a, b) => a.employee.lastname.localeCompare(b.employee.lastname, "fr") ||
    a.employee.firstname.localeCompare(b.employee.firstname, "fr"));
}

function buildRegisterHistory({ sessions, employees, absences = [], restaurantId, start, endExclusive }) {
  const roster = new Map(employees.map((employee) => [String(employee._id), employee]));
  const entries = [];
  function add(entry) {
    const occurredAt = new Date(entry.at);
    if (occurredAt >= start && occurredAt < endExclusive && entry.at) entries.push(entry);
  }

  for (const session of sessions) {
    const employeeId = String(session.employee);
    const employee = employeeIdentity(roster.get(employeeId) || {
      ...session.employeeSnapshot, _id: employeeId,
    }, restaurantId);
    const common = {
      employee, sessionId: String(session._id),
      sessionDate: toLocalDateKey(session.clockInAt) || session.businessDate,
      anomalies: computeSessionMetrics(session).anomalies,
    };
    for (const event of session.events || []) {
      const { at, type, source, receivedAt, actorId, actorRole } = event;
      add({ ...common, id: String(event._id), at, type, source, receivedAt, actorId, actorRole });
    }
    for (const [type, adjustment] of [
      ...(session.adjustments || []).map((item) => ["adjustment", item]),
      ...(session.payrollAdjustments || []).map((item) => {
        const type = item.isNote ? "note_added" : item.mealCount != null ? "meal_adjustment" : item.reset ? "payroll_reset"
          : Boolean(item.previousAbsent) !== Boolean(item.absent) ? (item.absent ? "absence_marked" : "absence_removed")
            : "payroll_adjustment";
        return [type, item];
      }),
    ]) {
      add({
        ...common, id: String(adjustment._id), type, at: adjustment.editedAt,
        actorId: adjustment.editedById, actorRole: adjustment.editedByRole, reason: adjustment.reason,
        ...(type !== "note_added" && {
          before: {
            in: adjustment.previousClockInAt, out: adjustment.previousClockOutAt, breaks: adjustment.previousBreaks,
            absent: adjustment.previousAbsent, pauseMinutesByDay: adjustment.previousPauseMinutesByDay,
            mealCount: adjustment.previousMealCount,
          },
          after: {
            in: adjustment.clockInAt, out: adjustment.clockOutAt, breaks: adjustment.breaks,
            absent: adjustment.absent, pauseMinutesByDay: adjustment.pauseMinutesByDay,
            mealCount: adjustment.mealCount,
          },
        }),
      });
    }
    for (const review of session.reviews || []) {
      add({ ...common, id: String(review._id), at: review.at, type: review.type, actorId: review.actorId, actorRole: review.actorRole });
    }
  }
  for (const mark of absences) {
    const employee = employeeIdentity(roster.get(String(mark.employee)) || { _id: mark.employee }, restaurantId);
    for (const { _id, at, actorId, actorRole, reason, absent, previousMealCount, mealCount, validated, isNote } of mark.changes || []) {
      const type = isNote ? "note_added" : typeof validated === "boolean" ? (validated ? "validated" : "reopened")
        : mealCount != null ? "meal_adjustment" : absent ? "absence_marked" : "absence_removed";
      add({
        id: String(_id), at, actorId, actorRole, reason, employee, sessionDate: mark.shiftDate,
        type,
        ...(mealCount != null && { before: { mealCount: previousMealCount }, after: { mealCount } }),
      });
    }
  }

  return entries.sort((a, b) => +new Date(b.at) - +new Date(a.at) || b.id.localeCompare(a.id));
}

module.exports = { buildRegisterRows, buildRegisterHistory, isPlannedAbsence, assignPlannedServices, shiftAttendanceKey, shiftMealCount };
