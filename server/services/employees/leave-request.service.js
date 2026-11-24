const { DateTime } = require("luxon");
const { ABSENCE_TYPES, ABSENCE_DURATIONS } = require("./planning-absence.service");

const ZONE = "Europe/Paris";
const bounds = { full: ["00:00", "23:59:59"], morning: ["00:00", "12:00"], afternoon: ["12:00", "23:59:59"] };

function civilInstant(day, time) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      typeof time !== "string" || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const local = DateTime.fromISO(`${day}T${time}`, { zone: ZONE });
  if (!local.isValid || local.toISODate() !== day || local.toFormat("HH:mm") !== time.slice(0, 5) ||
      local.getPossibleOffsets().length !== 1) return null;
  return local.toJSDate();
}

function readLeaveRequest(body = {}) {
  const type = body.type ?? "full";
  const absenceType = body.absenceType || null;
  if (!ABSENCE_DURATIONS.includes(type) || (absenceType && !ABSENCE_TYPES.includes(absenceType)) ||
      (body.note != null && (typeof body.note !== "string" || body.note.length > 1000))) return null;
  let start, end;
  if (body.startDate !== undefined || body.endDate !== undefined) {
    if (["morning", "afternoon"].includes(type) && body.startDate !== body.endDate) return null;
    const times = type === "custom" ? [body.startTime, body.endTime] : bounds[type];
    start = civilInstant(body.startDate, times[0]);
    end = civilInstant(body.endDate, times[1]);
  } else {
    // Older employee clients submit absolute instants.
    if (![body.start, body.end].every((value) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value))) return null;
    const from = DateTime.fromISO(body.start, { setZone: true });
    const to = DateTime.fromISO(body.end, { setZone: true });
    if (!from.isValid || !to.isValid) return null;
    if (["morning", "afternoon"].includes(type) && from.setZone(ZONE).toISODate() !== to.setZone(ZONE).toISODate()) return null;
    start = from.toJSDate();
    end = to.toJSDate();
  }
  if (!start || !end || !(end > start)) return null;
  return { start, end, type, absenceType, note: body.note?.trim() || "" };
}

function canTransitionLeave(from, to, manager) {
  if (!manager) return from === "pending" && to === "canceled";
  return (from === "pending" && ["approved", "rejected", "canceled"].includes(to)) ||
    (from === "approved" && to === "canceled");
}

module.exports = { readLeaveRequest, canTransitionLeave };
