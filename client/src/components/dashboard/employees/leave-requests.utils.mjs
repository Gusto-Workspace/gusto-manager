import { normalizePersonnelSearch } from "./employee-directory.utils.mjs";
import { getParisPlanningInstant, parisPlanningDateKey, parisPlanningTime } from "./planning-grid.utils.mjs";

export const leaveStatuses = {
  pending: "En attente", approved: "Approuvée", rejected: "Refusée", canceled: "Annulée",
};
export const leaveDurations = {
  full: "Journée entière", morning: "Demi-journée · matin",
  afternoon: "Demi-journée · après-midi", custom: "Horaires personnalisés",
};
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" });
const instant = (value) => value && Number.isFinite(+new Date(value)) ? new Date(value) : null;

export function leaveDateKey(value) {
  const date = instant(value);
  return date ? parisPlanningDateKey(date) : "";
}

export function leaveDateLabel(value) {
  const date = instant(value);
  return date ? dateFormat.format(date) : "—";
}

export function leavePeriod({ start, end, type }, withTimes = false) {
  const first = instant(start);
  const last = instant(end);
  if (!first || !last) return "—";
  const from = dateFormat.format(first);
  const to = dateFormat.format(last);
  if (withTimes || type === "custom") return `${from} à ${timeFormat.format(first)} → ${to} à ${timeFormat.format(last)}`;
  return from === to ? from : `${from} → ${to}`;
}

export function leaveDuration(request) {
  if (["morning", "afternoon"].includes(request.type)) return "½ journée";
  if (request.type === "custom") {
    const minutes = Math.max(0, Math.round((+new Date(request.end) - +new Date(request.start)) / 60000));
    return Number.isFinite(minutes) ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : "—";
  }
  const begin = Date.parse(leaveDateKey(request.start));
  const end = Date.parse(leaveDateKey(request.end));
  const days = (end - begin) / 86400000 + 1;
  return Number.isFinite(days) && days > 0 ? `${days} ${days === 1 ? "jour" : "jours"}` : "—";
}

export function plannedLeaveDuration(shift) {
  if (shift.absenceDuration) return shift.absenceDuration;
  const start = instant(shift.start);
  const end = instant(shift.end);
  if (!start || !end) return "custom";
  const from = parisPlanningTime(start);
  const to = parisPlanningTime(end);
  if (from === "00:00" && to === "23:59") return "full";
  if (parisPlanningDateKey(start) === parisPlanningDateKey(end)) {
    if (from === "00:00" && to === "12:00") return "morning";
    if (from === "12:00" && to === "23:59") return "afternoon";
  }
  return "custom";
}

export function filterLeaveRequests(requests, { search, category, from, to, employeeId }) {
  const terms = normalizePersonnelSearch(search).split(/\s+/).filter(Boolean);
  return requests.filter(({ person, request }) =>
    (!employeeId || person.id === employeeId) &&
    (!category || (request.absenceType || "unspecified") === category) &&
    terms.every((term) => normalizePersonnelSearch(person.name).includes(term)) &&
    (!from || leaveDateKey(request.end) >= from) &&
    (!to || leaveDateKey(request.start) <= to));
}

export function leaveFormInterval({ startDate, endDate, startTime, endTime, type }) {
  const times = { full: ["00:00", "23:59"], morning: ["00:00", "12:00"], afternoon: ["12:00", "23:59"], custom: [startTime, endTime] };
  const [from, to] = times[type] || [];
  if (!startDate || !endDate || !from || !to) return null;
  const start = getParisPlanningInstant(startDate, from);
  const end = getParisPlanningInstant(endDate, to);
  return start && end && end > start ? { start, end, type } : null;
}

export const conflictKey = (shift) => [String(shift._id), +new Date(shift.start), +new Date(shift.end)].join(":");

export function requestCreationTime(request) {
  const recorded = instant(request.createdAt);
  if (recorded) return +recorded;
  return /^[\da-f]{24}$/i.test(String(request._id)) ? parseInt(String(request._id).slice(0, 8), 16) * 1000 : 0;
}
