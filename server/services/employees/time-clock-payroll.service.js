const {
  buildOverlapQuery,
  computeSessionDayBreakdown,
  diffMinutes,
  getRangeBounds,
  toLocalDateKey,
} = require("./time-clock.service");

function payrollSchedule(session, override = session.payroll) {
  if (session.status !== "closed" || !session.clockOutAt ||
      +new Date(session.clockOutAt) < +new Date(session.clockInAt) ||
      (session.breaks || []).some((item) => !item.endAt)) return null;
  const { clockInAt, clockOutAt, breaks = [] } = override || session;
  const usePlannedPause = !override || override.usePlannedPause === true;
  const planned = Number(session.plannedBreakMinutes);
  return {
    clockInAt,
    clockOutAt,
    absent: Boolean(override?.absent),
    usePlannedPause,
    plannedBreakMinutes: usePlannedPause && !session.breaks?.length && !breaks.length && Number.isFinite(planned)
      ? Math.max(0, Math.round(planned)) : 0,
    pauseMinutesByDay: (override?.pauseMinutesByDay || []).map(({ date, minutes }) => ({ date, minutes })),
    breaks: breaks.map(({ startAt, endAt }) => ({
      startAt, endAt, durationMinutes: diffMinutes(startAt, endAt),
    })),
  };
}

function payrollDayShares(schedule) {
  const { days } = computeSessionDayBreakdown(schedule);
  if (!days.length) {
    days.push({
      date: toLocalDateKey(schedule.clockInAt), startAt: schedule.clockInAt, endAt: schedule.clockOutAt,
      grossMinutes: 0, breakMinutes: 0, workedMinutes: 0,
    });
  }
  let plannedRemaining = schedule.plannedBreakMinutes || 0;
  return days.filter((day) => day.startAt).map((day) => {
    const plannedPause = Math.min(plannedRemaining, day.grossMinutes);
    plannedRemaining -= plannedPause;
    const minutes = schedule.pauseMinutesByDay.find((item) => item.date === day.date)?.minutes;
    const breakMinutes = minutes ?? (day.breakMinutes + plannedPause);
    return {
      ...day,
      breakMinutes,
      workedMinutes: schedule.absent ? 0 : Math.max(0, day.grossMinutes - breakMinutes),
    };
  });
}

function auditPayrollPauses(schedule) {
  if (!schedule.plannedBreakMinutes) return schedule.pauseMinutesByDay;
  const manuallySetDates = new Set(schedule.pauseMinutesByDay.map(({ date }) => date));
  return payrollDayShares(schedule).filter((day) => day.breakMinutes || manuallySetDates.has(day.date))
    .map(({ date, breakMinutes }) => ({ date, minutes: breakMinutes }));
}

function payrollDays(sessions, from, to) {
  const result = new Map();
  for (const session of sessions) {
    const schedule = payrollSchedule(session);
    if (!schedule) continue;
    for (const day of payrollDayShares(schedule)) {
      if (day.date < from || day.date > to) continue;
      const items = result.get(day.date) || [];
      items.push({
        ...schedule,
        breaks: schedule.breaks.map((item, index) => ({ ...item, id: String(index) })),
        id: String(session._id),
        updatedAt: session.updatedAt || null,
        revision: session.__v ?? 0,
        manual: Boolean(session.payroll),
        validated: session.reviews?.at(-1)?.type === "validated",
        timings: day,
      });
      result.set(day.date, items);
    }
  }
  for (const items of result.values()) items.sort((a, b) => +new Date(a.timings.startAt) - +new Date(b.timings.startAt));
  return result;
}

function buildPayrollOverlapQuery(from, to) {
  const { start, endExclusive } = getRangeBounds(from, to);
  return {
    $or: [
      buildOverlapQuery(from, to),
      { "payroll.clockInAt": { $lt: endExclusive }, "payroll.clockOutAt": { $gt: start } },
    ],
  };
}

module.exports = { payrollSchedule, payrollDayShares, payrollDays, auditPayrollPauses, buildPayrollOverlapQuery };
