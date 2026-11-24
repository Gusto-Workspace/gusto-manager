const { DateTime } = require("luxon");
const { addDaysToDateKey, diffMinutes, getRangeBounds, isValidDateKey, toLocalDateKey } = require("./time-clock.service");
const { buildRegisterRows, isPlannedAbsence } = require("./time-clock-register.service");
const { indexReportInputs, updateMonthlyVariables, calculateReportMeals } = require("./personnel-report-pay.service");
const { overtimeColumns, calculateOvertime, paidLeaveCredits } = require("./personnel-report-overtime.service");
const { calculateLeaveCounter, absenceFractionsByDay } = require("./personnel-report-counters.service");
const { applyHourLedger, calculateAnnual, annualPeriod, effectiveContract, ledgerStart, ledgerEnd, contractDayPortion } = require("./personnel-report-ledgers.service");
const { plannedMinutes, readWorkDetails } = require("./planning-shift.service");
const { isFrenchPublicHoliday } = require("../excel/render-time-clock-export-workbook.service");
const { ruleAt } = require("./personnel-report-rule-dates.service");
const { historicalRecords, historyIntervalConflict } = require("./skello-history.service");
const { premiumLabel } = require("./skello-workbook.service");

const MAX_DAYS = 92;
const ZONE = "Europe/Paris";
const absenceLabels = {
  weekly_rest: "Repos hebdomadaire", paid_leave: "Congé payé", unpaid_leave: "Congé sans solde",
  sick_leave: "Maladie", authorized_absence: "Absence autorisée", unauthorized_absence: "Absence injustifiée",
  work_accident: "Accident du travail", commuting_accident: "Accident de trajet", maternity_leave: "Congé maternité",
  paternity_leave: "Congé paternité", parental_leave: "Congé parental", adoption_leave: "Congé adoption",
  family_event: "Événement familial", child_sick_leave: "Enfant malade", training: "Formation", apprenticeship: "École - CFA",
  public_holiday: "Jour férié", compensatory_rest: "Repos compensateur", rtt: "RTT", other: "Autre",
  unspecified: "Non précisé", reported: "Absence pointage validée",
};
const column = (key, label, type = "text", options = {}) => ({ key, label, type, ...options });
const missing = (key, label, type = "text") => column(key, label, type, { unavailable: true });
const sumColumn = (key, label, type = "minutes") => column(key, label, type, { total: true });
const normalizeSearch = (value) => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const standardAbsenceTypes = ["paid_leave", "apprenticeship", "weekly_rest"];
const allWeekdays = [1, 2, 3, 4, 5, 6, 7];
const holidayCache = new Map();
function reportHoliday(date) {
  if (!holidayCache.has(date)) holidayCache.set(date, isFrenchPublicHoliday(new Date(`${date}T12:00:00`)));
  return holidayCache.get(date);
}
const hoursColumns = [
  sumColumn("planned", "Heures planifiées"), sumColumn("draft", "Dont non publiées"),
  sumColumn("plannedBreak", "Total Pause (h)"), sumColumn("gross", "Pointées brutes"),
  sumColumn("clockBreak", "Pause pointée"), sumColumn("worked", "Pointées nettes"),
  sumColumn("paidBreak", "Pause déduite pour la paie"), sumColumn("paid", "Heures rémunérées"),
  sumColumn("delta", "Écart rémunéré / prévu"), sumColumn("workedDays", "Jours pointés", "number"),
];
const absenceColumns = [
  sumColumn("absenceCount", "Événements", "number"), sumColumn("absenceDays", "Jours calendaires", "number"),
  sumColumn("absenceMinutes", "Absences à horaires (h)"),
];

function validateReportFilters(query, validId) {
  const { from, to, employeeId = "", search = "", post = "" } = query;
  if (![from, to, employeeId, search, post].every((value) => typeof value === "string") ||
      !isValidDateKey(from) || !isValidDateKey(to) || to < from || to > addDaysToDateKey(from, MAX_DAYS - 1) ||
      (employeeId && !validId(employeeId)) || search.length > 120 || post.length > 120) return null;
  return { from, to, employeeId, search: normalizeSearch(search), post: normalizeSearch(post) };
}

function sumKnown(values) {
  const present = values.filter(Number.isFinite);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function weekFor(date) {
  const day = DateTime.fromISO(date, { zone: ZONE });
  return { key: `${day.weekYear}-W${day.weekNumber}`, label: `S${day.weekNumber}`, from: day.startOf("week").toISODate(), to: day.endOf("week").toISODate() };
}

function listWeeks(from, to) {
  const weeks = [];
  let date = from;
  while (date <= to) {
    const week = weekFor(date);
    weeks.push(week);
    date = addDaysToDateKey(week.to, 1);
  }
  return weeks;
}

function absenceColumn(type) {
  return sumColumn(`absence:${type}`, absenceLabels[type] || absenceLabels.unspecified, "number");
}

function reportGroups(weeks, rules, absenceTypes, activeOvertime, counters, annual, to, sourceColumns) {
  const appliedOvertime = overtimeColumns(activeOvertime);
  const hasOvertime = activeOvertime.some((rule) => rule.enabled);
  const usesRetainedServices = activeOvertime.some(({ planningAttribution, enabled, source }) =>
    planningAttribution || (enabled && source === "validated"));
  return [
    { id: "contract", label: "Données Contractuelles", summary: column("contractType", "Type de contrat"), columns: [
      column("payrollCode", "Matricule de paie"), column("contractType", "Type de Contrat"), column("post", "Intitulé du poste"),
      column("contractStart", "Date de début de contrat", "date", { hint: "Date de prise de poste renseignée dans la fiche salarié" }),
      column("contractEnd", "Date de fin de Contrat", "date"), column("archiveNote", "Note d’archivage"),
    ] },
    { id: "salary", label: "Données Salariales", summary: column("monthlyHours", "Volume mensuel", "hours"), columns: [
      column("monthlyHours", "Volume Horaire Mensuel (h)", "hours"),
      column("hourlyRate", "Taux Horaire Brut Moyen (€)", "number"), column("grossSalary", "Salaire Mensuel Brut (€)", "number"),
    ] },
    { id: "time", label: "Planning et heures retenues", summary: counters
      ? column("counterEnd", "Compteur fin de période", "minutes", { edit: "hoursEntry" })
      : usesRetainedServices ? sumColumn("referenceWorked", "Heures retenues") : sumColumn("planned", "Heures planifiées"), columns: [
      usesRetainedServices
        ? { ...sumColumn("referencePause", "Total Pause (h)"), decimal: true, hint: "Pauses des services retenus pendant la période sélectionnée" }
        : { ...hoursColumns[2], decimal: true, hint: "Somme des pauses planifiées sur la période" },
      ...(counters ? [column("counterStart", "Compteur début de période", "minutes")] : []),
      ...weeks.map((week) => ({ ...sumColumn(week.key, week.label), week, decimal: true,
        weekLabel: "Heures retenues, absences comprises",
        hint: week.to <= to ? "Heures retenues selon la source configurée et absences prises en compte du lundi au dimanche"
          : "Étends la période jusqu’au dimanche pour afficher le total de cette semaine" })),
      ...(counters ? [column("counterEnd", "Compteur fin de période", "minutes", { edit: "hoursEntry" }),
        column("counterChanges", "Modifications du compteur", "minutes", { edit: "hoursEntry" }),
        column("recoveryBalance", "Solde repos compensateur", "minutes", { edit: "hoursEntry" })] : []),
      hasOvertime ? column("normalHours", "Heures normales", "minutes") : missing("normalHours", "Heures normales", "minutes"),
    ] },
    { id: "premium", label: "Heures majorées",
      summary: hasOvertime ? column("premiums", "Heures majorées", "minutes") : missing("premiums", "Heures majorées", "minutes"),
      columns: hasOvertime ? [column("structural", "Total Heures Supp. Structurelles (h)", "minutes"), ...appliedOvertime] : [
      ...[
        ["complement10", "Heures Comp. 10%"], ["complement25", "Heures Comp. 25%"],
        ["extra10", "Heures Supp. Exceptionnelles 10%"], ["extra20", "Heures Supp. Exceptionnelles 20%"], ["extra50", "Heures Supp. Exceptionnelles 50%"],
        ["structural", "Total Heures Supp. Structurelles"], ["structural10", "Heures Supp. Structurelles 10%"],
        ["structural20", "Heures Supp. Structurelles 20%"], ["structural50", "Heures Supp. Structurelles 50%"],
        ["night", "Heures de Nuit 0%"], ["sunday", "Heures du Dimanche 50%"], ["holidays", "Heures J. Fériés"],
      ].map(([key, label]) => missing(key, `${label} (h)`, "minutes")),
    ] },
    { id: "absence", label: "Total Absences Période", summary: sumColumn("absenceCount", "Événements", "number"), columns: [
      ...standardAbsenceTypes.map(absenceColumn),
      column("late", "Retard", "minutes", { hint: "Retard établi par un pointage validé ou repris de l’export historique Skello" }),
      ...absenceTypes.filter((type) => !standardAbsenceTypes.includes(type)).map(absenceColumn),
    ] },
    { id: "compensation", label: "Éléments de Rémunération", summary: sumColumn("mealsDue", "Repas Dûs", "number"), columns: [
      column("bonus", "Primes (€)", "number", { edit: "variables" }), column("advance", "Avances (€)", "number", { edit: "variables" }),
      sumColumn("mealsDue", "Repas Dûs", "number"),
      column("benefits", "Avantages Nature", "number", { edit: "meals" }),
      column("compensation", "Indemnités Compensatrices", "number"),
      column("transport", "Coût de Transport (€)", "number"),
      ...(rules.some(({ values }) => values.mode === "tickets") ? [column("mealTickets", "Titres-restaurant", "number")] : []),
      ...(rules.some(({ values }) => values.mode === "basket") ? [column("basket", "Prime panier (€)", "number")] : []),
    ] },
    { id: "leave", label: "Soldes de congés", summary: column("leaveAvailable", "Jours disponibles", "number"), columns: [
      column("previousAcquired", "N−1 · Acquis", "number"), column("previousUsed", "N−1 · Pris", "number"),
      column("previousBalance", "N−1 · Solde", "number"), column("currentAcquired", "N · Acquis", "number"),
      column("currentUsed", "N · Pris", "number"), column("currentBalance", "N · Solde", "number"),
      column("scheduled", "Congés planifiés", "number"), column("leaveAvailable", "Jours disponibles", "number"),
    ] },
    ...(sourceColumns.length ? [{ id: "skello", label: "Historique importé · Skello", summary: sourceColumns[0], columns: sourceColumns }] : []),
    ...(annual ? [{ id: "annual", label: "Annualisation", summary: column("annualRemaining", "Heures restant à réaliser", "minutes"), columns: [
      column("annualTarget", "Objectif annuel", "minutes"), column("annualPlanned", "Total planifié sur le cycle", "minutes"),
      column("annualWorked", "Réalisé", "minutes"), column("annualRemaining", "Heures restant à réaliser", "minutes"),
      column("annualWeeklyPaid", "Heures payées au seuil haut", "minutes"), column("annualClosingExtra", "Heures supplémentaires à la clôture", "minutes"),
    ] }] : []),
  ];
}

function reportAbsence(type, duration, start, end, bounds, note = "") {
  const lo = Math.max(+new Date(start), +bounds.start);
  const hi = Math.min(+new Date(end), +bounds.endExclusive);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  const startDate = toLocalDateKey(new Date(lo));
  const endDate = toLocalDateKey(new Date(hi - 1));
  const localTime = (value) => DateTime.fromMillis(+new Date(value), { zone: ZONE }).toFormat("HH:mm");
  const sameDay = toLocalDateKey(start) === toLocalDateKey(end);
  const inferred = localTime(start) === "00:00" && localTime(end) === "23:59" ? "full"
    : sameDay && localTime(start) === "00:00" && localTime(end) === "12:00" ? "morning"
      : sameDay && localTime(start) === "12:00" && localTime(end) === "23:59" ? "afternoon" : "custom";
  const unit = duration || inferred;
  return {
    type, label: absenceLabels[type] || absenceLabels.unspecified, start: new Date(lo), end: new Date(hi),
    startDate, endDate, note, unit,
    minutes: unit === "custom" ? diffMinutes(new Date(lo), new Date(hi)) : null,
    days: unit === "full" ? (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1 :
      ["morning", "afternoon"].includes(unit) ? 0.5 : null,
  };
}

function collectAbsences(profile, workById, days, bounds) {
  const result = [];
  const covered = new Set();
  const requests = new Map((profile.leaveRequests || []).map((request) => [String(request._id), request]));
  for (const shift of profile.shifts || []) {
    if (!isPlannedAbsence(shift)) continue;
    const requestId = shift.leaveRequestId ? String(shift.leaveRequestId) : "";
    const request = requests.get(requestId);
    if (request && request.status !== "approved") continue;
    if (requestId && covered.has(requestId)) continue;
    if (requestId) covered.add(requestId);
    const entry = reportAbsence(shift.absenceType || request?.absenceType || "unspecified", shift.absenceDuration || request?.type,
      request?.start || shift.start, request?.end || shift.end, bounds, shift.notes || request?.note);
    if (entry) result.push(entry);
  }
  for (const [id, request] of requests) {
    if (request.status !== "approved" || covered.has(id)) continue;
    const entry = reportAbsence(request.absenceType || "unspecified", request.type, request.start, request.end, bounds, request.note);
    if (entry) result.push(entry);
  }
  for (const day of days) {
    for (const shift of day.shifts) {
      if (!shift.absenceValidated || !workById.has(shift.id)) continue;
      const entry = reportAbsence("reported", "custom", shift.start, shift.end, bounds, shift.note?.text);
      if (entry) result.push(entry);
    }
  }
  return result.sort((first, second) => +first.start - +second.start);
}

function dayHours(day, shifts, workById, published) {
  const hours = {};
  if (shifts.length) {
    hours.planned = day.plannedMinutes;
    hours.plannedBreak = shifts.reduce((sum, shift) => sum + shift.breakMinutes, 0);
    hours.draft = published ? 0 : shifts.reduce((sum, shift) =>
      sum + (workById.get(shift.id)?.requiresPlanningPublication ? shift.plannedMinutes : 0), 0);
  }
  if (day.sessions.length) {
    hours.gross = day.sessions.reduce((sum, item) => sum + item.timings.grossMinutes, 0);
    hours.clockBreak = day.breakMinutes;
    hours.worked = day.workedMinutes;
    hours.workedDays = Number(day.sessions.some((item) => item.timings.grossMinutes > 0));
  }
  if (day.payroll.length) {
    hours.paid = day.payroll.reduce((sum, item) => sum + item.timings.workedMinutes, 0);
    hours.paidBreak = day.payroll.reduce((sum, item) => sum + item.timings.breakMinutes, 0);
  }
  for (const [key, property] of [["paid", "paid"], ["paidBreak", "paidBreak"]]) {
    const value = sumKnown((day.sourceServices || []).map((service) => service[property]));
    if (value !== null) hours[key] = (hours[key] || 0) + value;
  }
  return hours;
}

function addHours(totals, hours) {
  for (const [key, value] of Object.entries(hours)) totals[key] = (totals[key] || 0) + value;
}

function addDelta(hours, provisional) {
  if (hours.requiresCorrection) { hours.paid = null; hours.paidBreak = null; }
  hours.delta = !provisional && Number.isFinite(hours.paid) && Number.isFinite(hours.planned) ? hours.paid - hours.planned : null;
}

function reportTardiness(days, workById, records, batch) {
  const matched = new Map();
  const validatedAbsences = new Set(days.flatMap((day) => day.shifts
    .filter((shift) => shift.absenceValidated).map((shift) => shift.id)));
  for (const day of days) {
    for (const session of day.sessions) {
      const shift = workById.get(session.shiftId);
      if (session.review && shift && !matched.has(session.shiftId) && !validatedAbsences.has(session.shiftId) &&
          toLocalDateKey(shift.start) === day.date && toLocalDateKey(session.clockInAt) === day.date) {
        matched.set(session.shiftId, { shiftId: session.shiftId, date: day.date,
          minutes: Math.max(0, diffMinutes(shift.start, session.clockInAt)), source: "clock" });
      }
    }
  }
  const dates = new Set(days.map(({ date }) => date));
  for (const { date, values } of records || []) {
    if (!batch || values?.source !== "skello" || values.batch !== String(batch) ||
        !dates.has(date) || !Array.isArray(values.events)) continue;
    for (const event of values.events) {
      if (!event || !Number.isInteger(event.minutes) || event.minutes <= 0 || event.minutes > 1440 ||
          matched.has(event.shiftId) || validatedAbsences.has(event.shiftId)) continue;
      const shift = workById.get(event.shiftId);
      if (!shift || toLocalDateKey(shift.start) !== date ||
          +new Date(shift.start) !== +new Date(event.start) || +new Date(shift.end) !== +new Date(event.end)) continue;
      matched.set(event.shiftId, { shiftId: event.shiftId, date, minutes: event.minutes, source: "skello" });
    }
  }
  return [...matched.values()];
}

function prepareAbsencePayroll(absences, rules, amendments, hours, overtime, leaveCredits) {
  const absenceMeals = new Map();
  const allocatedLeave = new Set();
  const detail = absences.flatMap((absence) => {
    const segments = [];
    for (let date = absence.startDate; date <= absence.endDate; date = addDaysToDateKey(date, 1)) {
      const rule = ruleAt(rules, date)?.values.categories?.[absence.type];
      const payer = rule?.payer || null;
      if (segments.at(-1)?.payer !== payer) segments.push({ startDate: date, payer, paid: 0 });
      const segment = segments.at(-1);
      segment.endDate = date;
      const day = DateTime.fromISO(date, { zone: ZONE });
      const week = day.startOf("week").toISODate();
      const timing = overtime.find((record) => record.date <= week)?.values;
      const workdays = timing?.workdays || 5;
      const weekdays = timing?.weekdays ?? Array.from({ length: workdays }, (_, index) => index + 1);
      if (rule?.meal) absenceMeals.set(date, Math.max(rule.meal, absenceMeals.get(date) || 0));
      if (absence.type === "paid_leave" && timing?.paidLeaveDays) {
        if (!allocatedLeave.has(date) && leaveCredits.has(date)) {
          segment.paid += leaveCredits.get(date);
          allocatedLeave.add(date);
        }
        continue;
      }
      if (absence.unit !== "custom" && !weekdays.includes(day.weekday)) continue;
      const base = effectiveContract(amendments, hours, date);
      if (absence.unit === "custom") {
        const bounds = getRangeBounds(date, date);
        segment.paid += diffMinutes(new Date(Math.max(+absence.start, +bounds.start)), new Date(Math.min(+absence.end, +bounds.endExclusive)));
      } else if (base) {
        const fractions = absenceFractionsByDay([absence], { weekdays }, reportHoliday, day, day, base * 60 / workdays);
        segment.paid += Math.round((fractions.get(date)?.get(absence.type) || 0) * base * 60 / workdays);
      }
    }
    return segments.map(({ startDate, endDate, payer, paid }) => {
      const boundaries = getRangeBounds(startDate, endDate);
      const interval = segments.length > 1
        ? reportAbsence(absence.type, absence.unit, absence.start, absence.end, boundaries, absence.note) : absence;
      return { ...interval, payer, payrollMinutes: paid || null };
    });
  });
  return { absenceMeals, detail };
}

function weeklyAbsencePayers(week, absences, rules, amendments, hours, overtime, leaveCredits) {
  const relevant = absences.filter((entry) => entry.type !== "weekly_rest" &&
    entry.startDate <= week.to && entry.endDate >= week.from).map((entry) => ({
    ...entry, startDate: entry.startDate < week.from ? week.from : entry.startDate,
    endDate: entry.endDate > week.to ? week.to : entry.endDate,
  }));
  const { detail } = prepareAbsencePayroll(relevant, rules, amendments, hours, overtime, leaveCredits);
  const totals = { employer: 0, thirdParty: 0, incomplete: false };
  for (const absence of detail) {
    if (absence.payer === "unpaid") continue;
    if (!absence.payer || absence.payrollMinutes == null) totals.incomplete = true;
    else totals[absence.payer] += absence.payrollMinutes;
  }
  return totals;
}

function weeklyPlanningCoverage(week, absences, workedDates, rule, { base, start, end, amendments }, leaveCredits) {
  const first = DateTime.fromISO(week.from, { zone: ZONE });
  const last = DateTime.fromISO(week.to, { zone: ZONE });
  const days = allWeekdays.map((_, index) => first.plus({ days: index }));
  const scheduledAbsences = absences.filter((absence) => absence.startDate <= week.to && absence.endDate >= week.from);
  const rest = absenceFractionsByDay(scheduledAbsences.filter(({ type }) => type === "weekly_rest"),
    { weekdays: allWeekdays }, reportHoliday, first, last, 0);
  const observedDays = days.filter((day) => rest.get(day.toISODate())?.get("weekly_rest") !== 1);
  const documentedWeek = observedDays.length > 0 && observedDays.length < days.length && observedDays.every((day) => {
    const date = day.toISODate();
    return workedDates.has(date) || scheduledAbsences.some((absence) =>
      absence.type !== "weekly_rest" && absence.unit === "full" && absence.startDate <= date && absence.endDate >= date);
  });
  // When no days are set, a fully documented week can identify the roster's rest days.
  const useObservedDays = documentedWeek && (!rule?.workdays || observedDays.length === rule.workdays);
  const weekdays = [...(rule?.weekdays || (useObservedDays ? observedDays.map(({ weekday }) => weekday)
    : allWeekdays.slice(0, rule?.workdays || 5)))].sort((a, b) => a - b);
  const eligible = new Set(["paid_leave", ...(rule?.creditedAbsences ?? ["apprenticeship"])]);
  const creditedAbsences = scheduledAbsences.filter(({ type }) => type !== "weekly_rest" &&
    !(type === "paid_leave" && rule?.paidLeaveDays) && eligible.has(type))
    .map((absence) => ({ ...absence, type: "credited" }));
  let target = 0;
  let credited = 0;
  let known = false;
  for (const day of days) {
    const date = day.toISODate();
    if ((start && date < start) || (end && date > end)) continue;
    const volume = effectiveContract(amendments, base, date);
    if (!volume) continue;
    known = true;
    const portion = contractDayPortion(Math.round(volume * 60), day.weekday, weekdays);
    target += portion;
    const paidLeave = leaveCredits.get(date) || 0;
    const fraction = portion && rest.get(date)?.get("weekly_rest") !== 1 && creditedAbsences.length
      ? absenceFractionsByDay(creditedAbsences, { weekdays }, reportHoliday, day, day, portion).get(date)?.get("credited") || 0
      : 0;
    credited += Math.max(paidLeave, Math.round(portion * fraction));
  }
  return { target: known ? target : null, credited };
}

function verifiedReportHistory(records, employee, profile, registerDays, rules) {
  const byDate = new Map();
  if (!records?.length || !employee?.historicalImport) return byDate;
  const occupied = [...(profile.shifts || []), ...(profile.leaveRequests || []).filter(({ status }) => status === "approved"),
    ...registerDays.flatMap(({ sessions }) =>
    sessions.filter(({ clockOutAt }) => clockOutAt).map(({ clockInAt, clockOutAt }) => ({ start: clockInAt, end: clockOutAt })))];
  const overlaps = (start, end, items) => items.some((item) => +new Date(item.start) < +end && +new Date(item.end) > +start);
  for (const { date, values } of records) {
    if (values?.source !== "skello" || values.batch !== String(employee.historicalImport) ||
        !isValidDateKey(date) || !Array.isArray(values.services) || !values.services.length || values.services.length > 12) continue;
    const rule = rules.find(({ date: monday }) => monday <= weekFor(date).from)?.values;
    if (!rule?.planningAttribution) continue;
    const services = [];
    let hasOverlap = false;
    for (const [index, service] of values.services.entries()) {
      if (!service) break;
      const start = new Date(service.start);
      const end = new Date(service.end);
      const work = readWorkDetails({ position: service.position, breakMinutes: service.breakMinutes }, null, start, end);
      if (!work || toLocalDateKey(start) !== date || overlaps(start, end, occupied) ||
          services.some((item) => +item.start === +start && +item.end === +end)) break;
      hasOverlap ||= overlaps(start, end, services);
      services.push({ ...work, id: `historical:${date}:${index}`, start, end,
        plannedMinutes: plannedMinutes(start, end, work.breakMinutes),
        ...(values.overlapVerified === true && { note: { text: "Horaires retenus concomitants dans la source Skello" } }) });
    }
    if (services.length !== values.services.length || hasOverlap !== (values.overlapVerified === true)) continue;
    const taken = Number.isInteger(values.taken) && values.taken >= 0 && values.taken <= 100 ? values.taken : null;
    byDate.set(date, { services, taken, hasOverlap });
    occupied.push(...services);
  }
  return byDate;
}

function projectSkelloHistory(records, profile, days) {
  const occupied = [...(profile.shifts || []), ...(profile.leaveRequests || []).filter(({ status }) => status === "approved"),
    ...days.flatMap(({ sessions, payroll }) => [...sessions, ...payroll].map((item) => ({
      start: item.clockInAt, end: item.clockOutAt || new Date(),
    })))];
  const daily = new Map();
  const summaries = [];
  const absenceShifts = [];
  for (const { date, values } of historicalRecords(records)) {
    if (values.summary) { summaries.push(values); continue; }
    const accepted = (entry) => toLocalDateKey(entry.start) === date && !occupied.some((other) => historyIntervalConflict(entry, other));
    const services = (values.services || []).filter(accepted).map((item, index) => ({
      ...item, id: `skello:${date}:${index}`, source: "skello",
      plannedMinutes: item.planned ? plannedMinutes(new Date(item.start), new Date(item.end), item.breakMinutes) : null,
    }));
    const absences = (values.absences || []).filter(accepted);
    absenceShifts.push(...absences.map((entry, index) => ({ ...entry, _id: `skello-absence:${date}:${index}`, notes: "Absence historique (Skello)" })));
    if (services.length || absences.length) daily.set(date, services);
  }
  return {
    daily, summaries, absenceShifts,
    days: days.map((day) => {
      const sourceServices = daily.get(day.date);
      if (!sourceServices) return day;
      const sourcePlanning = sourceServices.filter((item) => item.planned);
      return { ...day, sourceServices, shifts: [...day.shifts, ...sourcePlanning],
        plannedMinutes: day.plannedMinutes + sourcePlanning.reduce((total, { plannedMinutes }) => total + plannedMinutes, 0) };
    }),
  };
}

function skelloTimings(item) {
  const minutes = item.worked ?? item.paid ?? item.plannedMinutes;
  return { id: item.id, source: "skello", timings: {
    startAt: item.start, endAt: item.end, workedMinutes: minutes, breakMinutes: item.breakMinutes,
  }, breaks: [], planned: item.planned };
}

const sourceHours = { worked: "Heures travaillées", paid: "Heures rémunérées" };
const sourceMeals = { mealsDue: "Repas dus", mealsTaken: "Avantages en nature" };

function sourceTotals(history, from, to, columns) {
  const visible = [...history.daily].filter(([date]) => date >= from && date <= to);
  const summaries = history.summaries.filter(({ period }) => period.from >= from && period.to <= to)
    .sort((left, right) => Number(right.period.from.endsWith("-01")) - Number(left.period.from.endsWith("-01")) ||
      left.period.from.localeCompare(right.period.from));
  const values = {};
  function add(key, label, field, type) {
    const selected = [];
    for (const { period, summary } of summaries) {
      if (field(summary) != null && !selected.some((item) => item.period.to >= period.from && item.period.from <= period.to)) {
        selected.push({ period, amount: field(summary) });
      }
    }
    const uncovered = visible.filter(([date]) => !selected.some(({ period }) => date >= period.from && date <= period.to));
    const amount = sumKnown([...selected.map(({ amount }) => amount), ...uncovered.flatMap(([, services]) => services.map(field))]);
    if (amount === null) return;
    const id = `skello:${key}`;
    values[id] = amount;
    columns.set(id, sumColumn(id, `${label} · Skello`, type));
  }
  for (const [key, label] of Object.entries(sourceHours)) add(key, label, (entry) => entry[key], "minutes");
  for (const [key, label] of Object.entries(sourceMeals)) add(key, label, (entry) => entry[key], "number");
  const absences = history.absenceShifts.filter(({ start }) => {
    const date = toLocalDateKey(start);
    return date >= from && date <= to;
  });
  for (const [key, label, type] of [
    ["employerPaidAbsence", "Absences indemnisées par l’employeur", "minutes"],
    ["thirdPartyPaidAbsence", "Absences indemnisées par un tiers", "minutes"],
    ["unpaidAbsence", "Absences non indemnisées", "minutes"],
    ["absenceMealsDue", "Repas dus sur absence", "number"],
  ]) {
    const amount = sumKnown(absences.map((entry) => entry[key]));
    if (amount === null) continue;
    const id = `skello:${key}`;
    values[id] = amount;
    columns.set(id, sumColumn(id, `${label} · Skello`, type));
  }
  const premiums = new Set([...summaries.flatMap(({ summary }) => Object.keys(summary.premiums || {})),
    ...visible.flatMap(([, services]) => services.flatMap((entry) => Object.keys(entry.premiums || {})))]);
  for (const key of premiums) add(`premium:${key}`, premiumLabel(key), (entry) => entry.premiums?.[key], "minutes");
  const latest = summaries.reduce((current, entry) => !current || entry.period.to > current.period.to ? entry : current, null)?.summary;
  const contract = latest?.contract;
  if (contract?.weeklyHours != null) {
    values["skello:weeklyHours"] = contract.weeklyHours;
    columns.set("skello:weeklyHours", column("skello:weeklyHours", "Volume horaire hebdomadaire · Skello", "hours"));
  }
  const average = latest?.averageHourlyRate ??
    (!latest?.baseHourlyRateExplicit && contract?.hourlyRate > 0 ? contract.hourlyRate : null);
  if (average != null) {
    values["skello:averageHourlyRate"] = average;
    columns.set("skello:averageHourlyRate", column("skello:averageHourlyRate", "Taux horaire brut moyen (€) · Skello", "number"));
  }
  return values;
}

function addSkelloMeals(meals, sourceDays) {
  const entries = new Map(meals.mealDays.map((meal) => [meal.date, meal]));
  for (const { date, sourceServices } of sourceDays) {
    const due = sumKnown((sourceServices || []).map(({ mealsDue }) => mealsDue));
    const taken = sumKnown((sourceServices || []).map(({ mealsTaken }) => mealsTaken));
    if (due === null && taken === null) continue;
    const prior = entries.get(date);
    entries.set(date, { ...prior, date, source: "skello", due: sumKnown([prior?.due, due]), taken: sumKnown([prior?.taken, taken]) });
    if (due !== null && prior?.basis !== "monthly") meals.values.mealsDue = (meals.values.mealsDue || 0) + due;
    if (taken !== null) meals.values.benefits = (meals.values.benefits || 0) + taken;
  }
  return { ...meals, mealDays: [...entries.values()].sort((left, right) => left.date.localeCompare(right.date)) };
}

function buildPersonnelReport({ restaurant, restaurantId, employees, sessions, attendance, planningDays, filters,
  inputs = [], detail = false, asOf = toLocalDateKey(new Date()) }) {
  const { from, to } = filters;
  const { profiles, rules, overtime, leaveRules, hoursRules, absenceRules } = indexReportInputs(inputs);
  const bounds = getRangeBounds(from, to);
  const weeks = listWeeks(from, to);
  const activeOvertime = [...new Set(weeks.map((week) => overtime.find(({ date }) => date <= week.from)?.values).filter(Boolean))];
  const useOvertime = activeOvertime.some((rule) => rule.enabled);
  const detailedIsoWeeks = detail && activeOvertime.some((rule) => rule.planningAttribution);
  const detailStart = detailedIsoWeeks ? weeks[0].from : from;
  const detailEnd = detailedIsoWeeks ? weeks.at(-1).to : to;
  const counterActive = weeks.some((week) => {
    const start = ruleAt(hoursRules, week.from)?.values.start;
    return start && start <= week.from;
  });
  const annualActive = inputs.some((item) => item.kind === "annual" && item.values.target && item.date <= to && annualPeriod(item).end >= from);
  const calculationWeeks = listWeeks(ledgerStart(filters, inputs), ledgerEnd(filters, inputs));
  const overtimeBounds = getRangeBounds(calculationWeeks[0].from, calculationWeeks.at(-1).to);
  const weekByDate = new Map();
  const validatedWeeks = new Set();
  for (const week of weeks) {
    const rule = overtime.find(({ date }) => date <= week.from)?.values;
    if (rule?.enabled && rule.source === "validated") validatedWeeks.add(week.key);
    for (let date = week.from; date <= week.to; date = addDaysToDateKey(date, 1)) weekByDate.set(date, week.key);
  }
  const requiresValidatedWork = (date) => validatedWeeks.has(weekByDate.get(date));
  const publication = new Map(planningDays.map(({ date, publishedEmployees }) => [date, new Set((publishedEmployees || []).map(String))]));
  const sources = new Map(employees.map((employee) => [String(employee._id), {
    employee,
    profile: (employee.restaurantProfiles || []).find((profile) => String(profile.restaurant) === String(restaurantId)) || {},
  }]));
  const register = buildRegisterRows({
    employees, sessions, absences: attendance, restaurantId,
    startDate: calculationWeeks[0].from, endDate: calculationWeeks.at(-1).to,
    openingHours: restaurant.opening_hours,
  }).filter(({ employee, former, days }) => !former || sources.has(employee.id) ||
    days.some((day) => day.date >= from && day.date <= to && (day.sessions.length || day.payroll.length)));
  const options = register.map(({ employee, former }) => ({ ...employee, former }));
  const selected = register.filter(({ employee }) =>
    (!filters.employeeId || employee.id === filters.employeeId) &&
    (!filters.post || normalizeSearch(employee.post) === filters.post) &&
    (!filters.search || normalizeSearch(`${employee.firstname} ${employee.lastname} ${employee.lastname} ${employee.firstname} ${employee.post} ${sources.get(employee.id)?.profile.employment?.payrollCode || ""}`).includes(filters.search)));
  const encountered = new Set(standardAbsenceTypes);
  const sourceColumns = new Map();
  const rows = selected.map(({ employee, days: nativeDays, former }) => {
    const source = sources.get(employee.id);
    const profile = source?.profile || {};
    const employment = profile.employment || {};
    const payrollInput = profiles.get(String(profile._id));
    const imported = projectSkelloHistory(payrollInput?.historicalWork, profile, nativeDays);
    const registerDays = imported.days;
    const days = registerDays.filter((day) => day.date >= from && day.date <= to);
    const reportProfile = { ...profile, shifts: [...(profile.shifts || []), ...imported.absenceShifts] };
    const amendments = payrollInput?.amendment || [];
    const sourceSummary = imported.summaries.filter(({ period }) => period.from <= from && period.to >= to)
      .sort((left, right) => right.period.to.localeCompare(left.period.to))[0]?.summary;
    const sourceContract = sourceSummary?.contract || {};
    const contract = Object.fromEntries(Object.entries(payrollInput?.contract || {}).filter(([key]) =>
      !payrollInput.contractEffectiveDates?.[key] || payrollInput.contractEffectiveDates[key] <= from));
    for (const [key, value] of Object.entries(sourceContract)) {
      if (key === "hourlyRate" && !sourceSummary.baseHourlyRateExplicit) continue;
      if (!["start", "type", "weeklyHours"].includes(key) && value != null && contract[key] == null) contract[key] = value;
    }
    const scopedStart = profile.snapshot?.dateOnPost;
    const start = (scopedStart === undefined ? source?.employee.dateOnPost : scopedStart) || sourceContract.start;
    const workById = new Map((profile.shifts || []).filter((shift) => !isPlannedAbsence(shift)).map((shift) => [String(shift._id), shift]));
    const tardiness = [...reportTardiness(days, workById, payrollInput?.historicalLate, source?.employee.historicalImport),
      ...days.flatMap(({ date, sourceServices }) => (sourceServices || []).filter(({ late }) => late > 0)
        .map(({ id, late }) => ({ shiftId: id, date, minutes: late, source: "skello" })))];
    const historical = verifiedReportHistory(payrollInput?.historicalWork, source?.employee, profile, nativeDays, overtime);
    const reportWork = new Map([...workById, ...[...historical.values()].flatMap(({ services }) => services.map((item) => [item.id, item]))]);
    const absences = collectAbsences(reportProfile, workById, days, bounds);
    const baseWeekly = employment.contractualUnit === "week" ? employment.contractualValue || sourceContract.weeklyHours || 0
      : employment.contractualUnit === "month" ? 0 : sourceContract.weeklyHours || 0;
    const absencesByType = {};
    for (const entry of absences) {
      encountered.add(entry.type);
      absencesByType[entry.type] = (absencesByType[entry.type] || 0) + 1;
    }
    const values = {
      post: employee.post || null,
      payrollCode: employment.payrollCode || null, contractType: employment.contractType || sourceContract.type || null,
      contractStart: typeof start === "string" && isValidDateKey(start) ? start : start ? toLocalDateKey(start) : null,
      ...contract,
      weeklyHours: effectiveContract(amendments, baseWeekly, to) || null,
      monthlyHours: employment.contractualUnit === "month" && employment.contractualValue > 0
        ? employment.contractualValue : contract.monthlyContractHours ?? null,
      absenceCount: absences.length, absenceDays: sumKnown(absences.map((entry) => entry.days)),
      absenceMinutes: sumKnown(absences.map((entry) => entry.minutes)),
      late: sumKnown(tardiness.map(({ minutes }) => minutes)),
      ...sourceTotals(imported, from, to, sourceColumns),
    };
    const contractDates = { base: baseWeekly, start: values.contractStart, end: values.contractEnd, amendments };
    const fullWeekAbsences = collectAbsences(reportProfile, workById, registerDays, overtimeBounds);
    const leaveCredits = new Map();
    if (overtime.some(({ values: timing }) => timing.paidLeaveDays)) {
      for (const week of calculationWeeks) {
        const rule = overtime.find(({ date }) => date <= week.from)?.values;
        for (const [date, credit] of paidLeaveCredits(week, fullWeekAbsences, rule, contractDates, reportHoliday)) {
          leaveCredits.set(date, credit);
        }
      }
    }
    const { absenceMeals, detail: absenceDetails } = prepareAbsencePayroll(absences, absenceRules, amendments, baseWeekly, overtime, leaveCredits);
    const reportDay = (day) => ({ ...day, shifts: [...day.shifts, ...(historical.get(day.date)?.services || [])] });
    const mealDay = (day) => {
      const prepared = reportDay(day);
      return { ...prepared, shifts: prepared.shifts.filter(({ source }) => source !== "skello") };
    };
    const taken = new Map([...historical].filter(([, item]) => item.taken != null).map(([date, item]) => [date, item.taken]));
    for (const [date, count] of payrollInput?.meals || []) taken.set(date, count);
    updateMonthlyVariables(values, (payrollInput?.variables || []).filter(({ date }) =>
      date >= from.slice(0, 7) && date <= to.slice(0, 7)));
    const { values: meals, mealDays } = addSkelloMeals(calculateReportMeals({
      days: days.map(mealDay), filters, rules, taken, openingHours: restaurant.opening_hours,
      start: values.contractStart, end: values.contractEnd, workById: reportWork, absenceMeals, requiresValidatedWork,
    }), days);
    Object.assign(values, meals);
    const weeklyHours = {};
    const fullWeekPlanned = new Map();
    const workedDates = new Set();
    for (const day of registerDays) {
      const week = weekByDate.get(day.date);
      if (!week || !day.shifts.length) continue;
      fullWeekPlanned.set(week, (fullWeekPlanned.get(week) ?? 0) + day.plannedMinutes);
      if (day.plannedMinutes > 0) workedDates.add(day.date);
    }
    const historicalWeekMinutes = new Map();
    const sourceWeekAdjustment = new Map();
    const historicalWeekOverlaps = new Set();
    for (const [date, { services, hasOverlap }] of historical) {
      const week = weekByDate.get(date);
      if (!week) continue;
      workedDates.add(date);
      if (hasOverlap) historicalWeekOverlaps.add(week);
      historicalWeekMinutes.set(week, (historicalWeekMinutes.get(week) || 0) +
        services.reduce((sum, service) => sum + service.plannedMinutes, 0));
    }
    for (const day of registerDays) {
      const week = weekByDate.get(day.date);
      if (!week || !day.sourceServices?.length) continue;
      const retained = day.sourceServices.reduce((total, service) => total + (skelloTimings(service).timings.workedMinutes ?? 0), 0);
      const planned = day.sourceServices.reduce((total, service) => total + (service.plannedMinutes ?? 0), 0);
      if (retained) workedDates.add(day.date);
      historicalWeekMinutes.set(week, (historicalWeekMinutes.get(week) || 0) + retained);
      sourceWeekAdjustment.set(week, (sourceWeekAdjustment.get(week) || 0) - planned);
    }
    let provisional = false;
    for (const day of days) {
      const shifts = day.shifts.filter((shift) => !shift.absence);
      if (shifts.length || day.sessions.length || day.payroll.length || day.sourceServices?.length) {
        const hours = dayHours(day, shifts, workById, publication.get(day.date)?.has(employee.id));
        const week = weekByDate.get(day.date);
        const weekly = weeklyHours[week] ??= { provisional: false };
        weekly.provisional ||= day.sessions.some(({ status }) => status !== "closed");
        if (day.payroll.some((item) => item.requiresCorrection)) {
          weekly.requiresCorrection = true;
          values.requiresCorrection = true;
        }
        if (day.payroll.some((item) => item.payrollOverlap)) values.payrollOverlap = true;
        provisional ||= weekly.provisional;
        addHours(values, hours);
        addHours(weekly, hours);
      }
    }
    if (values.plannedBreak == null && days.some((day) => day.shifts.length)) values.plannedBreak = 0;
    addDelta(values, provisional);
    for (const hours of Object.values(weeklyHours)) {
      addDelta(hours, hours.provisional);
    }
    const weeklyMinutes = values.weeklyHours == null ? 0 : Math.round(values.weeklyHours * 60);
    const activeAnnual = (payrollInput?.annual || []).filter((item) => item.values.target).map(annualPeriod)
      .find((item) => item.from <= to && item.end >= from);
    const trackHours = (counterActive && employment.contractType?.toLowerCase() !== "extra") || Boolean(activeAnnual);
    const overtimeResult = calculateOvertime({ days: registerDays.map((day) => ({ ...day,
      sourceWork: day.sourceServices?.map(skelloTimings).filter(({ timings }) => timings.workedMinutes != null),
    })),
      absences: useOvertime || trackHours ? fullWeekAbsences : [],
      shifts: reportWork, weeks: trackHours ? calculationWeeks : weeks, rules: overtime, contractMinutes: Math.round(baseWeekly * 60),
      contractStart: values.contractStart, contractEnd: values.contractEnd, amendments, trackHours: true, activeAnnual,
      from, to, isHoliday: reportHoliday, leaveCredits });
    Object.assign(values, overtimeResult.values);
    if (overtimeResult.weekData.some((week) => week.payrollOverlap)) values.payrollOverlap = true;
    const workedWeeks = new Map(overtimeResult.weekData.map((week) => [week.key, week]));
    const ledger = trackHours && counterActive && employment.contractType?.toLowerCase() !== "extra"
      ? applyHourLedger({ versions: hoursRules, entries: payrollInput?.hoursEntry || [], weekData: overtimeResult.weekData,
        first: weeks[0], last: weeks.at(-1) }) : {};
    const { weekBalances, ...counter } = ledger;
    Object.assign(values, counter, calculateAnnual(activeAnnual, overtimeResult.weekData, to, asOf));
    const effectiveDays = new Map(overtimeResult.weekData.flatMap((week) => week.complete ? week.days.map((day) => [day.date, day]) : []));
    const retainedServices = (day) => {
      const effectiveDay = effectiveDays.get(day.date);
      if (effectiveDay) return effectiveDay.items;
      if (day.payroll.some((item) => item.payrollOverlap)) return [];
      const validated = day.payroll.filter((item) => item.validated);
      const source = (day.sourceServices || []).map(skelloTimings).filter(({ timings }) => timings.workedMinutes != null);
      if (validated.length || requiresValidatedWork(day.date)) return [...validated.filter((item) => !item.absent), ...source];
      if (source.length) return [...day.shifts.filter((shift) => shift.source !== "skello" && !shift.absence && !shift.absenceValidated)
        .map((shift) => ({ id: shift.id, timings: { startAt: shift.start, endAt: shift.end,
          workedMinutes: shift.plannedMinutes, breakMinutes: shift.breakMinutes } })), ...source];
      return undefined;
    };
    const actualWork = days.map((day) => {
      const retained = retainedServices(day);
      if (retained) return retained.map((item) => item.timings);
      return day.shifts.filter((shift) => !shift.absence && !shift.absenceValidated)
        .map((shift) => ({ workedMinutes: shift.plannedMinutes, breakMinutes: shift.breakMinutes }));
    });
    values.referenceWorked = values.payrollOverlap ? null : actualWork.flat().reduce((sum, item) => sum + item.workedMinutes, 0);
    values.referencePause = values.payrollOverlap ? null : actualWork.flat().reduce((sum, item) => sum + item.breakMinutes, 0);
    values.referenceDays = values.payrollOverlap ? null : actualWork.filter((entry) => entry.some((item) => item.workedMinutes > 0)).length;
    for (const week of weeks) {
      const worked = workedWeeks.get(week.key);
      // The complete week sets the threshold. Only additions inside the report are exported.
      const visibleDays = [...(worked?.days || [])].filter(({ date }) => from <= date && to >= date);
      const exceptional = worked?.exceptional == null || (worked.planningAttribution && week.to > to) ? null : visibleDays
        .reduce((sum, { date }) => sum + (overtimeResult.daily.get(date)?.exceptional || 0), 0);
      values[week.key] = counterActive ? weekBalances?.[week.key] ?? null : exceptional;
      if (worked) Object.assign(weeklyHours[week.key] ??= {}, { exceptional, ...(worked.breakdown && { breakdown: worked.breakdown }), counterVariation: weekBalances?.[week.key] ?? null });
      if (week.to <= to) {
        const plannedWeek = fullWeekPlanned.get(week.key) ?? 0;
        const history = historicalWeekMinutes.get(week.key) ?? 0;
        const timedSickness = worked?.days.reduce((sum, day) => sum + day.timedSickness, 0) ?? 0;
        const rule = overtime.find(({ date }) => date <= week.from)?.values;
        const { target, credited } = weeklyPlanningCoverage(week, fullWeekAbsences, workedDates, rule, contractDates, leaveCredits);
        const strictlyValidated = validatedWeeks.has(week.key);
        const validatedTotal = strictlyValidated && worked?.complete
          ? worked.days.reduce((sum, day) => sum + day.worked + day.credited, 0) : null;
        const sourceAdjustment = sourceWeekAdjustment.get(week.key) || 0;
        if (fullWeekPlanned.has(week.key) || credited || history || timedSickness || validatedTotal > 0) {
          Object.assign(weeklyHours[week.key] ??= {}, {
            plannedWeek,
            contractWeek: target,
            paidAbsences: weeklyAbsencePayers(week, fullWeekAbsences, absenceRules, amendments, baseWeekly, overtime, leaveCredits),
            plannedWeekCredit: credited,
            retainedWeek: worked?.payrollOverlap ? null : strictlyValidated ? validatedTotal : plannedWeek + history + sourceAdjustment + credited + timedSickness,
            ...(history && { historicalWeek: history }),
            ...(timedSickness && { timedSicknessWeek: timedSickness }),
            ...(historicalWeekOverlaps.has(week.key) && { historicalOverlap: true }),
            plannedWeekSurplus: target != null && plannedWeek + history + sourceAdjustment + credited > target
              ? plannedWeek + history + sourceAdjustment + credited - target : null,
          });
        }
      }
    }
    const counterFrom = values.contractStart && calculationWeeks[0].from;
    const leaveResult = calculateLeaveCounter({
      versions: leaveRules, snapshots: payrollInput?.leave, contractStart: values.contractStart, contractEnd: values.contractEnd,
      reportEnd: to, asOf, absences: counterFrom && counterFrom <= to
        ? collectAbsences(reportProfile, workById, [], getRangeBounds(counterFrom, to)) : [],
      shifts: [...reportProfile.shifts, ...[...imported.daily.values()].flat().filter(({ planned }) => planned)],
      contractMinutes: weeklyMinutes, isHoliday: reportHoliday,
      validatedWorkDays: registerDays.filter((day) => day.payroll.some((item) =>
        item.validated && !item.absent && !item.payrollOverlap && item.timings.workedMinutes > 0)).map(({ date }) => date),
    });
    const sourceLeave = payrollInput?.skelloLeave.has(to) && payrollInput.leave.get(to);
    const leaveBalance = sourceLeave ? { ...leaveResult.balance,
      ...Object.fromEntries(Object.entries(sourceLeave).filter(([, value]) => value != null)) } : leaveResult.balance;
    const leaveStatus = sourceLeave ? "skello" : leaveResult.status;
    Object.assign(values, leaveBalance);
    const detailDays = detail ? registerDays.filter((day) => day.date >= detailStart && day.date <= detailEnd).map(reportDay)
      .filter((day) => day.sourceServices?.length || day.shifts.some((shift) => !shift.absence) || day.sessions.length || day.payroll.length) : [];
    const schedule = detailedIsoWeeks
      ? prepareAbsencePayroll(collectAbsences(reportProfile, workById, registerDays, getRangeBounds(detailStart, detailEnd)),
        absenceRules, amendments, baseWeekly, overtime, leaveCredits) : null;
    const detailRange = registerDays.filter(({ date }) => date >= detailStart && date <= detailEnd);
    const detailMeals = schedule && addSkelloMeals(calculateReportMeals({
      days: detailRange.map(mealDay),
      filters: { from: detailStart, to: detailEnd }, rules, taken, openingHours: restaurant.opening_hours,
      start: values.contractStart, end: values.contractEnd, workById: reportWork, absenceMeals: schedule.absenceMeals, requiresValidatedWork,
    }), detailRange).mealDays;
    return { employee, former, provisional, values, weeklyHours, absencesByType, mealDays, leaveBalance, leaveStatus,
      ...(detail && { establishment: employment.primaryEstablishment, tardiness,
        days: detailDays.map((day) => ({ ...day, shifts: day.shifts.filter((shift) => !shift.absence),
          premium: overtimeResult.daily.get(day.date),
          effective: retainedServices(day),
          volume: effectiveContract(amendments, baseWeekly, day.date) || null })),
        absences: absenceDetails, scheduleAbsences: schedule?.detail || absenceDetails,
        ...(detailMeals && { detailMeals }), amendments: amendments.filter(({ date }) => date >= from && date <= to)
          .map((item) => ({ ...item.values, date: item.date, delta: item.values.weeklyHours -
            effectiveContract(amendments, baseWeekly, addDaysToDateKey(item.date, -1)) })).filter(({ weeklyHours }) => weeklyHours != null) }) };
  });
  const absenceTypes = [...encountered].sort((first, second) => (absenceLabels[first] || first).localeCompare(absenceLabels[second] || second, "fr"));
  for (const row of rows) {
    for (const type of absenceTypes) row.values[`absence:${type}`] = row.absencesByType[type] || 0;
    delete row.absencesByType;
  }
  const availableRules = rules.filter(({ date }) => date >= from.slice(0, 7) && date <= to.slice(0, 7));
  const previousRule = rules.find(({ date }) => date < from.slice(0, 7));
  const activeMealRules = previousRule && !availableRules.some(({ date }) => date === from.slice(0, 7)) ? [...availableRules, previousRule] : availableRules;
  const groups = reportGroups(weeks, activeMealRules,
    absenceTypes, activeOvertime, counterActive, annualActive, to, [...sourceColumns.values()]);
  const absenceDetailColumns = [...absenceColumns, ...absenceTypes.map(absenceColumn)];
  const counted = [...groups.flatMap(({ columns }) => columns), ...hoursColumns, ...absenceDetailColumns];
  const totals = Object.fromEntries(counted.filter(({ total }) => total)
    .map(({ key }) => [key, sumKnown(rows.map(({ values }) => values[key]))]));
  if (rows.some(({ values }) => values.requiresCorrection)) {
    for (const key of ["paid", "paidBreak", "delta"]) totals[key] = null;
  }
  return { from, to, restaurant: restaurant.name || "Restaurant", weeks, groups, hoursColumns, absenceDetailColumns, options, rows, totals,
    ...(detail && { exportRules: activeOvertime.filter((rule) => rule.enabled),
      mealAmounts: [...new Set(activeMealRules.map(({ values }) => values.amount).filter(Number.isFinite))] }) };
}

module.exports = { buildPersonnelReport, validateReportFilters, listWeeks, MAX_DAYS };
