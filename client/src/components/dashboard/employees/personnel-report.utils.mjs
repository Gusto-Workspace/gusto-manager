import { parisPlanningDateKey } from "./planning-grid.utils.mjs";

const dayMs = 86_400_000;
const dateKey = (value) => value.toISOString().slice(0, 10);
const day = (value) => new Date(`${value}T00:00:00Z`);
const durationFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function reportMonth(value = parisPlanningDateKey(new Date()), offset = 0) {
  const date = day(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + offset;
  return { from: dateKey(new Date(Date.UTC(year, month, 1))), to: dateKey(new Date(Date.UTC(year, month + 1, 0))) };
}

export function isReportPeriod(from, to) {
  if (![from, to].every((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))) return false;
  if (![from, to].every((value) => Number.isFinite(+day(value)) && dateKey(day(value)) === value)) return false;
  const delta = +day(to) - +day(from);
  return delta >= 0 && delta < 92 * dayMs;
}

export function moveReportPeriod({ from, to }, direction) {
  const month = reportMonth(from);
  if (month.from === from && month.to === to) return reportMonth(from, direction);
  const offset = (+day(to) - +day(from) + dayMs) * direction;
  return { from: dateKey(new Date(+day(from) + offset)), to: dateKey(new Date(+day(to) + offset)) };
}

export function reportPeriodLabel({ from, to }) {
  const month = reportMonth(from);
  if (month.from === from && month.to === to) return monthFormatter.format(day(from));
  return `${dateFormatter.format(day(from))} – ${dateFormatter.format(day(to))}`;
}

export function visibleReportColumns(group, expanded) {
  return expanded ? group.columns : [group.summary];
}

export function formatReportWeek({ from, to }) {
  return `${shortDateFormatter.format(day(from))} – ${shortDateFormatter.format(day(to))}`;
}

export function formatReportValue(value, type) {
  if (value == null || value === "") return "—";
  if (type === "decimalHours") return durationFormatter.format(value / 60);
  if (type === "minutes") {
    const minutes = Math.round(Math.abs(value));
    return `${value < 0 ? "−" : ""}${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  }
  if (type === "date") return dateFormatter.format(day(value));
  if (type === "hours") return `${durationFormatter.format(value)} h`;
  if (type === "number") return durationFormatter.format(value);
  return value;
}
