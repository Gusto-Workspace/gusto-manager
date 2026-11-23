const {
  buildOverlapQuery,
  computeSessionDayBreakdown,
  diffMinutes,
  getRangeBounds,
  toLocalDateKey,
} = require("./time-clock.service");

function hasRecordedBreak(breaks) {
  return breaks?.some(({ startAt, endAt }) => startAt && endAt && new Date(endAt) > new Date(startAt)) ?? false;
}

function payrollSchedule(session, override = session.payroll) {
  if (session.status !== "closed" || !session.clockOutAt ||
      +new Date(session.clockOutAt) < +new Date(session.clockInAt) ||
      (session.breaks || []).some((item) => !item.endAt)) return null;
  override = override || session.automaticPayroll;
  const { clockInAt, clockOutAt, breaks = [] } = override || session;
  const usePlannedPause = !override || override.usePlannedPause === true;
  const planned = Number(session.plannedBreakMinutes);
  return {
    clockInAt,
    clockOutAt,
    absent: Boolean(override?.absent),
    usePlannedPause,
    plannedBreakMinutes: usePlannedPause && !hasRecordedBreak(session.breaks) && !hasRecordedBreak(breaks) && Number.isFinite(planned)
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

function suggestedPayroll(session, rule) {
  if (!rule?.enabled || !session.clockOutAt) return null;
  if ((!session.plannedStart && [rule.earlyIn, rule.lateIn].includes("planned")) ||
      (!session.plannedEnd && [rule.earlyOut, rule.lateOut].includes("planned"))) return null;
  function boundary(raw, planned, early, late) {
    const measured = +new Date(raw);
    if (planned && (measured < +new Date(planned) ? early : late) === "planned") return new Date(planned);
    const step = rule.roundMinutes * 60_000;
    return step ? new Date(Math.round(measured / step) * step) : new Date(raw);
  }
  const clockInAt = boundary(session.clockInAt, session.plannedStart, rule.earlyIn, rule.lateIn);
  const clockOutAt = boundary(session.clockOutAt, session.plannedEnd, rule.earlyOut, rule.lateOut);
  if (clockOutAt <= clockInAt) return null;
  const breaks = (session.breaks || []).map(({ startAt, endAt }) => ({
    startAt: new Date(Math.max(+clockInAt, +new Date(startAt))), endAt: new Date(Math.min(+clockOutAt, +new Date(endAt))),
  })).filter((item) => item.endAt > item.startAt);
  const actual = breaks.reduce((sum, item) => sum + diffMinutes(item.startAt, item.endAt), 0);
  const planned = session.plannedBreakMinutes || 0;
  const minimum = rule.pause === "plannedMinimum" || (rule.pause === "plannedFallback" && !hasRecordedBreak(session.breaks)) ? planned : 0;
  const schedule = { clockInAt, clockOutAt, breaks, pauseMinutesByDay: [], usePlannedPause: false };
  let remaining = Math.max(0, minimum - actual);
  for (const day of payrollDayShares(schedule)) {
    const extra = Math.min(remaining, day.grossMinutes - day.breakMinutes);
    if (extra > 0) schedule.pauseMinutesByDay.push({ date: day.date, minutes: day.breakMinutes + extra });
    remaining -= extra;
  }
  return schedule;
}

function auditPayrollPauses(schedule) {
  if (!schedule.plannedBreakMinutes) return schedule.pauseMinutesByDay;
  const manuallySetDates = new Set(schedule.pauseMinutesByDay.map(({ date }) => date));
  return payrollDayShares(schedule).filter((day) => day.breakMinutes || manuallySetDates.has(day.date))
    .map(({ date, breakMinutes }) => ({ date, minutes: breakMinutes }));
}

const payrollOverlapMessage = "Des horaires rémunérés se chevauchent pour un même salarié. Corrigez les services concernés dans la Pointeuse.";

function paidIntervals(schedule, day) {
  const start = +new Date(day.startAt);
  const end = +new Date(day.endAt);
  const breaks = schedule.breaks.map(({ startAt, endAt }) => [
    Math.max(start, +new Date(startAt)), Math.min(end, +new Date(endAt)),
  ]).filter(([from, to]) => from < to).sort(([left], [right]) => left - right);
  // A pause entered only as a number of minutes does not locate unpaid time.
  if (breaks.reduce((total, [from, to]) => total + diffMinutes(from, to), 0) > day.breakMinutes) return [[start, end]];
  const intervals = [];
  let current = start;
  for (const [from, to] of breaks) {
    if (current < from) intervals.push([current, from]);
    current = Math.max(current, to);
  }
  if (current < end) intervals.push([current, end]);
  return intervals;
}

function payrollConflicts(sessions, from, to) {
  const byEmployeeDay = new Map();
  const conflicts = new Map();
  for (const session of sessions) {
    const schedule = payrollSchedule(session);
    if (!schedule || schedule.absent) continue;
    for (const day of payrollDayShares(schedule)) {
      if (!day.workedMinutes || day.date < from || day.date > to) continue;
      const key = `${session.restaurant}:${session.employee}:${day.date}`;
      if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
      for (const [start, end] of paidIntervals(schedule, day)) {
        byEmployeeDay.get(key).push({ id: String(session._id), date: day.date, start, end });
      }
    }
  }
  for (const intervals of byEmployeeDay.values()) {
    let longest = null;
    for (const item of intervals.sort((left, right) => left.start - right.start)) {
      if (longest && longest.end > item.start) {
        for (const interval of [longest, item]) {
          if (!conflicts.has(interval.id)) conflicts.set(interval.id, new Set());
          conflicts.get(interval.id).add(interval.date);
        }
      }
      if (!longest || item.end > longest.end) longest = item;
    }
  }
  return conflicts;
}

function payrollDays(sessions, from, to) {
  const result = new Map();
  const conflicts = payrollConflicts(sessions, from, to);
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
        ...(needsClockRuleReview(session) && { requiresCorrection: true }),
        ...(conflicts.get(String(session._id))?.has(day.date) && { requiresCorrection: true, payrollOverlap: true }),
        validated: session.reviews?.at(-1)?.type === "validated",
        timings: day,
      });
      result.set(day.date, items);
    }
  }
  for (const items of result.values()) items.sort((a, b) => +new Date(a.timings.startAt) - +new Date(b.timings.startAt));
  return result;
}

function needsClockRuleReview(session) {
  return Boolean(session.clockRule?.enabled && !session.automaticPayroll && !session.payroll);
}

function buildPayrollOverlapQuery(from, to) {
  const { start, endExclusive } = getRangeBounds(from, to);
  return {
    $or: [
      buildOverlapQuery(from, to),
      { "automaticPayroll.clockInAt": { $lt: endExclusive }, "automaticPayroll.clockOutAt": { $gt: start } },
      { "payroll.clockInAt": { $lt: endExclusive }, "payroll.clockOutAt": { $gt: start } },
    ],
  };
}

module.exports = { needsClockRuleReview, suggestedPayroll, payrollSchedule, payrollDayShares, payrollDays,
  auditPayrollPauses, buildPayrollOverlapQuery, payrollConflicts, payrollOverlapMessage };
