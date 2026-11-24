export const tableFrame = "overflow-x-auto rounded-2xl border border-darkBlue/10 bg-white";
export const tableHeading = "border-b border-darkBlue/10 bg-lightGrey/70";
export const tableHead = "px-4 py-3 text-xs font-semibold text-darkBlue/70";
export const tableCell = "px-4 py-3 text-sm";
export const tableRow = "hover:bg-lightGrey/40";

const localTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const longDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", dateStyle: "full" });

export function dateLabel(date) {
  return longDate.format(new Date(date + "T12:00:00Z"));
}

export function hours(start, end) {
  return `${start ? localTime.format(new Date(start)) : "—"} – ${end ? localTime.format(new Date(end)) : "…"}`;
}

export function name(employee) {
  return [employee.firstname, employee.lastname].filter(Boolean).join(" ") || "Salarié";
}

export function statusLabel(session) {
  if (session.review) return "Validé";
  if (session.status === "on_break") return "En pause";
  return session.status === "closed" ? "À valider" : "En cours";
}

