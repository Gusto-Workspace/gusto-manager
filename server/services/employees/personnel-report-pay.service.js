const { DateTime } = require("luxon");
const { computeMealAllowance } = require("./meal-allowance.service");
const { isValidDateKey, toLocalDateKey } = require("./time-clock.service");
const { payrollDayShares } = require("./time-clock-payroll.service");
const { validateOvertimeRules } = require("./personnel-report-overtime.service");
const { validateLeaveRules } = require("./personnel-report-counters.service");
const { validateLedgerInput } = require("./personnel-report-ledgers.service");

const ZONE = "Europe/Paris";
const modes = ["combined", "indemnities", "tickets", "basket"];
const bases = ["service", "criteria", "days", "monthly"];
const contractFields = ["contractEnd", "archiveNote", "hourlyRate", "grossSalary", "monthlyContractHours", "transport"];
const variableFields = ["bonus", "bonusLabel", "advance", "advanceLabel"];
const leaveFields = ["previousAcquired", "previousUsed", "previousBalance", "currentAcquired", "currentUsed", "currentBalance", "leaveAvailable"];
const reportInputScopes = { contract: "fixed", variables: "month", meals: "day", rules: "month", leave: "day", overtime: "week",
  clockRules: "day", leaveRules: "fixed", hoursRules: "fixed", absenceRules: "fixed", amendment: "day", hoursEntry: "day", annual: "day" };
const restaurantInputKinds = ["rules", "overtime", "leaveRules", "hoursRules", "absenceRules", "clockRules"];
const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validInputDate(kind, date) {
  if (typeof date !== "string" || !Object.hasOwn(reportInputScopes, kind)) return false;
  if (reportInputScopes[kind] === "fixed") return date === "-";
  if (reportInputScopes[kind] === "month") return /^\d{4}-\d{2}$/.test(date) && isValidDateKey(`${date}-01`);
  if (reportInputScopes[kind] === "week") return isValidDateKey(date) && DateTime.fromISO(date, { zone: ZONE }).weekday === 1;
  return isValidDateKey(date);
}

function validateValues(kind, values, date) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  if (kind === "overtime") return validateOvertimeRules(values);
  if (kind === "clockRules") {
    if (values.enabled === false) return { enabled: false };
    const { enabled, earlyIn, lateIn, earlyOut, lateOut, roundMinutes, pause } = values;
    if (enabled !== true || ![earlyIn, lateIn, earlyOut, lateOut].every((v) => ["planned", "clocked"].includes(v)) ||
        ![0, 5, 10, 15, 30].includes(roundMinutes) || !["clocked", "plannedMinimum", "plannedFallback"].includes(pause)) return null;
    return { enabled, earlyIn, lateIn, earlyOut, lateOut, roundMinutes, pause };
  }
  if (kind === "leaveRules") return validateLeaveRules(values);
  const definitions = {
    contract: contractFields,
    variables: variableFields,
    meals: ["taken"],
    rules: ["mode", "basis", "quantity", "amount", "criteria"],
    leave: leaveFields,
  };
  if (!Object.hasOwn(definitions, kind)) return validateLedgerInput(kind, values, date);
  if (Object.keys(values).some((key) => !definitions[kind].includes(key))) return null;
  const clean = {};
  for (const key of definitions[kind]) {
    const value = Object.hasOwn(values, key) ? values[key] : null;
    if (value === null) {
      clean[key] = null;
    } else if (key === "criteria") {
      if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
      clean[key] = [];
      for (const criterion of value) {
        if (!criterion || typeof criterion !== "object" || Array.isArray(criterion)) return null;
        const { start = null, end = null, minimum = null, maximum = null } = criterion;
        if ((start !== null || end !== null) && (typeof start !== "string" || typeof end !== "string" ||
            !clockTime.test(start) || !clockTime.test(end) || start === end)) return null;
        if ((!start && minimum === null && maximum === null) ||
            [minimum, maximum].some((bound) => bound !== null && (!Number.isInteger(bound) || bound < 0 || bound > 1500)) ||
            (minimum !== null && maximum !== null && minimum >= maximum)) return null;
        clean[key].push({ start, end, minimum, maximum });
      }
    } else if (key === "mode" || key === "basis") {
      if (!(key === "mode" ? modes : bases).includes(value)) return null;
      clean[key] = value;
    } else if (key === "contractEnd") {
      if (!isValidDateKey(value)) return null;
      clean[key] = value;
    } else if (["archiveNote", "bonusLabel", "advanceLabel"].includes(key)) {
      if (typeof value !== "string" || value.length > 300) return null;
      clean[key] = value.trim() || null;
    } else {
      const integer = ["quantity", "taken"].includes(key);
      const cap = key === "taken" ? 100 : key === "quantity" ? 310 : 1_000_000;
      const minimum = ["advance", "currentBalance", "leaveAvailable"].includes(key) ? -cap : 0;
      const maximum = key === "advance" ? 0 : cap;
      const scaled = value * 100;
      if (!Number.isFinite(value) || value < minimum || value > maximum ||
          (integer ? !Number.isInteger(value) : Math.abs(scaled - Math.round(scaled)) > 0.00001)) return null;
      clean[key] = value;
    }
  }
  if (kind === "rules" && ((clean.mode && clean.mode !== "basket" && !clean.basis) ||
      (["days", "monthly"].includes(clean.basis) && clean.quantity == null) ||
      (clean.basis === "criteria" && !clean.criteria) || (clean.mode === "basket" && clean.amount == null))) return null;
  return clean;
}

function indexReportInputs(inputs) {
  const rules = [];
  const overtime = [];
  let leaveRules;
  let hoursRules;
  let absenceRules;
  const profiles = new Map();
  for (const item of inputs) {
    if (item.kind === "rules") {
      rules.push(item);
      continue;
    }
    if (item.kind === "overtime") {
      overtime.push(item);
      continue;
    }
    if (item.kind === "leaveRules") {
      leaveRules = item.values;
      continue;
    }
    if (item.kind === "hoursRules") {
      hoursRules = item.values;
      continue;
    }
    if (item.kind === "absenceRules") {
      absenceRules = item.values;
      continue;
    }
    const key = String(item.profile);
    if (!profiles.has(key)) profiles.set(key, { contract: {}, variables: [], meals: new Map(), leave: new Map(),
      amendment: [], hoursEntry: [], annual: [], historicalWork: [], historicalLate: [] });
    const profile = profiles.get(key);
    if (item.kind === "contract") profile.contract = item.values;
    if (item.kind === "variables") profile.variables.push(item);
    if (item.kind === "meals") profile.meals.set(item.date, item.values.taken);
    if (item.kind === "leave") profile.leave.set(item.date, item.values);
    if (["amendment", "hoursEntry", "annual", "historicalWork", "historicalLate"].includes(item.kind)) profile[item.kind].push(item);
  }
  const descending = (first, second) => second.date.localeCompare(first.date);
  for (const profile of profiles.values()) {
    profile.amendment.sort(descending);
    profile.annual.sort(descending);
  }
  return { profiles, rules: rules.sort(descending), overtime: overtime.sort(descending), leaveRules, hoursRules, absenceRules };
}

function updateMonthlyVariables(values, records) {
  const variables = [...records].sort((first, second) => first.date.localeCompare(second.date));
  for (const key of ["bonus", "advance"]) {
    const entered = variables.filter(({ values }) => values[key] != null);
    if (!entered.length) continue;
    values[key] = entered.reduce((sum, item) => sum + Math.round(item.values[key] * 100), 0) / 100;
    values[`${key}Label`] = entered.map(({ values }) => values[`${key}Label`]).filter(Boolean).join(" · ");
  }
}

function countMealCriteria(date, shifts, payroll, criteria) {
  const work = [...shifts.map((shift) => ({ start: shift.start, end: shift.end, duration: shift.plannedMinutes })),
    ...payroll.map(({ clockInAt, clockOutAt, workedMinutes }) => ({ start: clockInAt, end: clockOutAt, duration: workedMinutes }))];
  const minutes = work.reduce((sum, interval) => sum + interval.duration, 0);
  if (!minutes) return 0;
  return criteria.filter(({ start, end, minimum, maximum }) => {
    if ((minimum !== null && minutes <= minimum) || (maximum !== null && minutes >= maximum)) return false;
    if (!start) return true;
    const from = DateTime.fromISO(`${date}T${start}`, { zone: ZONE });
    const stop = DateTime.fromISO(`${date}T${end}`, { zone: ZONE });
    const to = end < start ? stop.plus({ days: 1 }) : stop;
    return work.some((interval) => +new Date(interval.start) < +to && +new Date(interval.end) > +from);
  }).length;
}

function calculateReportMeals({ days, filters, rules, taken, openingHours, start, end, workById,
  absenceMeals = new Map(), requiresValidatedWork = () => false }) {
  const calculation = new Map();
  const monthly = new Map();
  const validatedShifts = new Set(days.flatMap((day) => day.sessions
    .filter((session) => session.shiftId && session.review)
    .map(({ shiftId }) => shiftId)));
  const payrollByStart = new Map();
  const uniquePayroll = new Map(days.flatMap((day) => day.payroll.filter((item) => item.validated && !item.absent)
    .map((item) => [item.id, item])));
  for (const item of uniquePayroll.values()) {
    const date = toLocalDateKey(item.clockInAt);
    if (!date || date < filters.from || date > filters.to) continue;
    const workedMinutes = payrollDayShares(item).reduce((sum, share) => sum + share.workedMinutes, 0);
    if (!workedMinutes) continue;
    if (!payrollByStart.has(date)) payrollByStart.set(date, []);
    payrollByStart.get(date).push({ clockInAt: item.clockInAt, clockOutAt: item.clockOutAt, workedMinutes });
  }
  let unknownRules = false;
  for (const day of days) {
    if ((start && day.date < start) || (end && day.date > end)) continue;
    const month = day.date.slice(0, 7);
    const rule = rules.find(({ date }) => date <= month)?.values;
    const shifts = requiresValidatedWork(day.date) ? []
      : day.shifts.filter((shift) => !shift.absence && !shift.absenceValidated && !validatedShifts.has(shift.id));
    const payroll = payrollByStart.get(day.date) || [];
    if (!rule?.mode) {
      if (shifts.length || payroll.length || day.sessions.length || taken.has(day.date)) unknownRules = true;
      continue;
    }
    if (!monthly.has(month)) monthly.set(month, { rule, dates: [] });
    monthly.get(month).dates.push(day.date);
    const works = shifts.length > 0 || payroll.length > 0;
    let due = 0;
    if (rule.mode !== "basket" && rule.basis === "days") due = works ? rule.quantity : 0;
    if (rule.mode !== "basket" && rule.basis === "service") {
      due = shifts.reduce((sum, shift) => sum + computeMealAllowance({
        start: shift.start, end: shift.end, openingHours, explicit: workById.get(shift.id),
      }).count, 0) +
        payroll.reduce((sum, item) => sum + computeMealAllowance({
          start: item.clockInAt, end: item.clockOutAt, openingHours,
        }).count, 0);
    }
    if (rule.mode !== "basket" && rule.basis === "criteria") due = countMealCriteria(day.date, shifts, payroll, rule.criteria);
    const protectedMeals = ["combined", "indemnities"].includes(rule.mode) ? (absenceMeals.get(day.date) || 0) : 0;
    calculation.set(day.date, { date: day.date, mode: rule.mode, basis: rule.basis, due: due + protectedMeals, works,
      protectedMeals, taken: taken.get(day.date) ?? null,
      cost: rule.amount != null && taken.get(day.date) != null ? Math.round(rule.amount * 100) * taken.get(day.date) / 100 : null });
  }

  const values = {};
  const mealDays = [...calculation.values()];
  if (unknownRules) return { values, mealDays };

  function accumulate(key, amount) {
    values[key] = amount === null || values[key] === null ? null : (values[key] || 0) + amount;
  }

  for (const [month, { rule, dates }] of monthly) {
    const { mode, basis } = rule;
    const first = `${month}-01`;
    const last = DateTime.fromISO(first, { zone: ZONE }).endOf("month").toISODate();
    const complete = filters.from <= first && filters.to >= last && dates.length === Number(last.slice(-2));
    if (mode === "basket") {
      accumulate("basket", complete ? Math.round(rule.amount * 100) : null);
      continue;
    }
    const entries = dates.map((date) => calculation.get(date));
    const protectedMeals = entries.reduce((sum, entry) => sum + entry.protectedMeals, 0);
    const due = basis === "monthly" ? (complete ? rule.quantity + protectedMeals : null) : entries.reduce((sum, entry) => sum + entry.due, 0);
    accumulate("mealsDue", due);
    if (protectedMeals) accumulate("absenceMealIndemnities", protectedMeals);
    if (mode === "tickets") accumulate("mealTickets", due);
    if (mode === "indemnities") accumulate("compensation", due);
    if (mode === "combined") {
      const expected = entries.filter((entry) => basis === "monthly" ? entry.works : entry.due > entry.protectedMeals);
      const known = expected.every((entry) => entry.taken != null) &&
        (due === protectedMeals || entries.some((entry) => entry.taken != null));
      const actual = known ? entries.reduce((sum, entry) => sum + (entry.taken ?? 0), 0) : null;
      accumulate("benefits", actual);
      accumulate("compensation", due !== null && actual !== null && actual <= due - protectedMeals ? due - actual : null);
      accumulate("mealCost", actual !== null && rule.amount != null ? actual * Math.round(rule.amount * 100) : null);
    }
  }
  for (const key of ["basket", "mealCost"]) {
    if (values[key] != null) values[key] /= 100;
  }
  return { values, mealDays };
}

module.exports = { validInputDate, validateValues, indexReportInputs, updateMonthlyVariables, calculateReportMeals, restaurantInputKinds };
