import { normalizeSearchText } from "./time-clock.utils.js";

export function shiftDate(date, amount) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + amount);
  return instant.toISOString().slice(0, 10);
}

export function weekRange(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const from = shiftDate(date, 1 - weekday);
  return { from, to: shiftDate(from, 6) };
}

export function validRange({ from, to }) {
  const validDate = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key || "") &&
    Number.isFinite(Date.parse(`${key}T12:00:00Z`)) && shiftDate(key, 0) === key;
  return validDate(from) && validDate(to) && from <= to && to <= shiftDate(from, 30);
}

export function searchStaff(roster, query) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return roster.filter(({ firstname, lastname, post }) => {
    const text = normalizeSearchText(`${firstname || ""} ${lastname || ""} ${post || ""}`);
    return terms.every((term) => text.includes(term));
  });
}

export function groupClockServices(day, now = Date.now()) {
  const payroll = new Map((day.payroll || []).map((item) => [item.id, item]));
  const rows = day.sessions.map((session) => {
    const paid = payroll.get(session.id);
    payroll.delete(session.id);
    return { key: session.id, session, paid };
  });
  const available = day.shifts.filter((shift) => !shift.absence && !shift.reportedAbsent);
  for (const row of rows) {
    if (row.session.shiftId !== undefined) {
      const index = available.findIndex((shift) => shift.id === row.session.shiftId);
      if (index >= 0) [row.shift] = available.splice(index, 1);
      continue;
    }
    const { clockInAt, clockOutAt } = row.session;
    const start = Date.parse(clockInAt);
    const end = clockOutAt ? Date.parse(clockOutAt) : Math.max(start + 1, now);
    let best = -1;
    let bestOverlap = 0;
    for (const [index, shift] of available.entries()) {
      const overlap = Math.min(end, Date.parse(shift.end)) - Math.max(start, Date.parse(shift.start));
      if (overlap > bestOverlap) {
        best = index;
        bestOverlap = overlap;
      }
    }
    if (best >= 0) [row.shift] = available.splice(best, 1);
  }
  const detached = [...payroll.values()].map((paid) => ({ key: paid.id, paid }));
  const scheduled = [...available, ...day.shifts.filter((item) => item.reportedAbsent)]
    .map((shift) => ({ key: shift.id, shift }));
  return [...rows, ...detached, ...scheduled].sort((a, b) => {
    const start = (row) => Date.parse(row.shift?.start || row.session?.timings?.startAt || row.session?.clockInAt || row.paid?.timings?.startAt);
    return start(a) - start(b);
  });
}

export function summarizeServiceReviews(days) {
  const reviews = new Map();

  for (const day of days || []) {
    for (const session of day.sessions) {
      if (session.status === "closed") reviews.set(`session:${session.id}`, Boolean(session.review));
    }
    for (const payroll of day.payroll || []) {
      const key = `session:${payroll.id}`;
      if (!reviews.has(key)) reviews.set(key, Boolean(payroll.validated));
    }
    for (const shift of day.shifts) {
      if (shift.reportedAbsent) reviews.set(`shift:${shift.id}:${day.date}`, Boolean(shift.absenceValidated));
    }
  }
  return {
    reviewableCount: reviews.size,
    reviewedCount: [...reviews.values()].filter(Boolean).length,
  };
}

export function employeeWeek(days) {
  const services = [];
  const absences = [];
  for (const day of days || []) {
    const shifts = day.shifts.filter((shift) => !shift.absence);
    for (const shift of day.shifts) {
      if (shift.absence) absences.push({ date: day.date, shift });
    }
    if (shifts.length || day.sessions.length || day.payroll?.length) services.push({ ...day, shifts });
  }
  return { services, absences, ...summarizeServiceReviews(services) };
}

export function filterServices(services, filter, now = Date.now()) {
  return services.filter(({ shift, session, paid }) => {
    if (filter === "missing") return shift && !session && !paid && !shift.reportedAbsent && Date.parse(shift.end) <= now;
    if (filter === "absent") return shift?.reportedAbsent || paid?.absent;
    if (filter === "active") return session && session.status !== "closed";
    if (filter === "unreviewed") return session ? session.status === "closed" && !session.review
      : (paid && !paid.validated) || (shift?.reportedAbsent && !shift.absenceValidated);
    if (filter === "anomalies") return session?.anomalies?.length;
    return true;
  });
}
