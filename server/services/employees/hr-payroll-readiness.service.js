const { DateTime } = require("luxon");
const Draft = require("../../models/hr-configuration-draft.model");
const Input = require("../../models/personnel-report-input.model");
const { toLocalDateKey, addDaysToDateKey } = require("./time-clock.service");
const { isPlannedAbsence } = require("./time-clock-register.service");
const { portableValues } = require("./hr-configuration-format.service");

const labels = { clockRules: "Pointeuse et pauses", overtime: "Heures supplémentaires et majorations",
  leaveRules: "Congés payés", absenceRules: "Payeur des absences", rules: "Repas et indemnités" };
const writeConcern = "Paramètre à confirmer";
const messageFor = (issues) => `${writeConcern} · ${issues.map(({ message }) => message).join(" · ")}`;

async function payrollReadiness(restaurantId, transaction) {
  const draft = await Draft.findById(restaurantId).select("intents").session(transaction).lean();
  const intents = draft?.intents || {};
  const kinds = Object.keys(labels).filter((kind) => intents[kind]);
  if (!kinds.length) return null;
  const versions = await Input.find({ restaurant: restaurantId, employee: null, profile: null, kind: { $in: kinds } })
    .select("kind date values").sort({ date: -1 }).session(transaction).lean();
  function missing(kind, day, absenceType) {
    if (!intents[kind] || !day || day < intents[kind]) return false;
    const cutoff = kind === "rules" ? day.slice(0, 7) : kind === "overtime"
      ? DateTime.fromISO(day, { zone: "Europe/Paris" }).startOf("week").toISODate() : day;
    const rule = versions.find((item) => item.kind === kind && item.date <= cutoff);
    if (!rule || !portableValues(kind, rule.values)) return true;
    if (kind === "absenceRules" && absenceType) {
      const categories = rule.values.categories;
      return Object.keys(categories).length > 0 && !categories[absenceType]?.payer;
    }
    return false;
  }
  return { missing };
}

function missingClockRule(readiness, session) {
  return Boolean(readiness && session.status === "closed" && session.reviews?.at(-1)?.type !== "validated" &&
    !session.payroll && !session.clockRule?.enabled && readiness.missing("clockRules", toLocalDateKey(session.clockInAt)));
}

function clockIssues(readiness, sessions, from, to) {
  return sessions.some((item) => {
    const start = toLocalDateKey(item.clockInAt);
    const end = toLocalDateKey(item.clockOutAt);
    return start <= to && end >= from && missingClockRule(readiness, item);
  }) ? [{ kind: "clockRules", message: labels.clockRules }] : [];
}

function reportIssues(readiness, { report, employees, sessions, attendance, restaurantId, from, to }) {
  if (!readiness) return [];
  const selected = new Set(report.rows.map(({ employee }) => employee.id));
  const blocked = new Set(clockIssues(readiness, sessions.filter((item) => selected.has(String(item.employee))), from, to).map(({ kind }) => kind));
  function work(day) {
    if (readiness.missing("overtime", day)) blocked.add("overtime");
    if (readiness.missing("rules", day)) blocked.add("rules");
  }
  function absence(start, end, type) {
    const last = end < to ? end : to;
    for (let day = start > from ? start : from; day && day <= last; day = addDaysToDateKey(day, 1)) {
      if (readiness.missing("absenceRules", day, type)) blocked.add("absenceRules");
      if (type === "paid_leave" && readiness.missing("leaveRules", day)) blocked.add("leaveRules");
    }
  }
  for (const item of sessions) {
    const day = toLocalDateKey(item.clockInAt);
    if (item.status === "closed" && selected.has(String(item.employee)) && day >= from && day <= to) work(day);
  }
  for (const employee of employees) {
    if (!selected.has(String(employee._id))) continue;
    const profile = employee.restaurantProfiles?.find((entry) => String(entry.restaurant) === String(restaurantId));
    const requests = new Map((profile?.leaveRequests || []).map((item) => [String(item._id), item]));
    for (const shift of profile?.shifts || []) {
      const day = toLocalDateKey(shift.start);
      if (!isPlannedAbsence(shift)) {
        if (day >= from && day <= to) work(day);
        continue;
      }
      const request = requests.get(String(shift.leaveRequestId));
      if (!request || request.status === "approved") absence(day, toLocalDateKey(shift.end), shift.absenceType || request?.absenceType || "unspecified");
    }
    for (const request of requests.values()) {
      if (request.status === "approved") absence(toLocalDateKey(request.start), toLocalDateKey(request.end), request.absenceType || "unspecified");
    }
  }
  for (const mark of attendance) {
    if (mark.absent && mark.validated && selected.has(String(mark.employee))) absence(mark.shiftDate, mark.shiftDate, "reported");
  }
  return [...blocked].map((kind) => ({ kind, message: labels[kind] }));
}

module.exports = { payrollReadiness, reportIssues, clockIssues, missingClockRule, messageFor };
