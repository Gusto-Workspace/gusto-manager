const ZONE = "Europe/Paris";
const keyFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const DAY = 86_400_000;
const noon = (date) => new Date(`${date}T12:00:00Z`);

export function planningDateKey(value) {
  const instant = new Date(value);
  return Number.isFinite(+instant) ? keyFormat.format(instant) : null;
}

export function isPlanningDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(+noon(value)) && noon(value).toISOString().slice(0, 10) === value;
}

export function offsetDay(key, days) {
  return new Date(+noon(key) + days * DAY).toISOString().slice(0, 10);
}

export function planningRange(date, view = "week") {
  const anchor = noon(date);
  const from = view === "month" ? `${date.slice(0, 7)}-01` : offsetDay(date, -((anchor.getUTCDay() + 6) % 7));
  const to = view === "month" ? new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    : offsetDay(from, 6);
  return { from, to, dates: Array.from({ length: (+noon(to) - +noon(from)) / DAY + 1 }, (_, index) => offsetDay(from, index)) };
}

export function movePersonalPlanning(date, view, direction) {
  if (view !== "month") return offsetDay(date, 7 * direction);
  const anchor = noon(date);
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1)).toISOString().slice(0, 10);
}

export function planningDateLabel(date, locale, options) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: ZONE }).format(noon(date));
}

export function planningTimeLabel(value) {
  return timeFormat.format(new Date(value));
}

function absenceKind(shift) {
  return shift.absenceType || (shift.isLeave || shift.leaveRequestId ||
    /^(congés?|conge)$/i.test(String(shift.title || "").trim()) ? "paid_leave" : null);
}

export function personalShifts(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap((shift) => {
    if (!shift?.start || !shift?.end) return [];
    const start = new Date(shift.start);
    const end = new Date(shift.end);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) return [];
    const startDate = planningDateKey(start);
    const lastDate = planningDateKey(new Date(+end - 1));
    const pause = Math.max(0, Number(shift.breakMinutes) || 0);
    const absence = absenceKind(shift);
    return [{ ...shift, id: shift._id || `${+start}:${+end}`, start, end, startDate, lastDate, pause, absence,
      fullDay: Boolean(absence && (shift.absenceDuration === "full" ||
        (planningTimeLabel(start) === "00:00" && planningTimeLabel(end) === "23:59"))),
      netMinutes: Math.max(0, Math.round((+end - +start) / 60_000) - pause) }];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}

export function shiftsForDate(shifts, date) {
  return shifts.filter((shift) => shift.startDate <= date && shift.lastDate >= date);
}

export function nextPersonalDay(shifts, now = new Date()) {
  const upcoming = shifts.filter((shift) => !shift.absence && shift.end > now);
  if (!upcoming.length) return [];
  const firstDay = upcoming[0].startDate;
  return upcoming.filter((shift) => shift.startDate === firstDay);
}

export function resolvePersonalSection(query) {
  const { tab, planningDate, leave } = query || {};
  if (["planning", "requests", "account", "documents", "hours", "training"].includes(tab)) return tab;
  if (isPlanningDate(planningDate)) return "planning";
  if (leave) return "requests";
  return "home";
}
