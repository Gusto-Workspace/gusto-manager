const { DateTime } = require("luxon");
const { ABSENCE_TYPES } = require("./planning-absence.service");
const { isValidDateKey } = require("./time-clock.service");

const ZONE = "Europe/Paris";
const civil = (value) => DateTime.fromISO(value, { zone: ZONE });
const amount = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const minutes = (hours) => Math.round(hours * 60);
const defaultAbsenceTypes = [...ABSENCE_TYPES, "unspecified", "reported"];
const payers = ["employer", "thirdParty", "unpaid"];

function validateLedgerInput(kind, values, date) {
  if (kind === "absenceRules") {
    const { categories } = values;
    if (!categories || typeof categories !== "object" || Array.isArray(categories)) return null;
    const entries = Object.entries(categories);
    if (entries.some(([type, rule]) => !defaultAbsenceTypes.includes(type) || !rule ||
      !(rule.payer === null || payers.includes(rule.payer)) || !Number.isInteger(rule.meal) ||
      !amount(rule.meal, 0, 10))) return null;
    return { categories: Object.fromEntries(entries.map(([type, { payer, meal }]) => [type, { payer, meal }])) };
  }
  if (kind === "amendment") {
    if (values.weeklyHours === null) return { weeklyHours: null };
    const { weeklyHours, until = null, label = null } = values;
    if (!amount(weeklyHours, 0.01, 168) || (until !== null && (!isValidDateKey(until) || until < date)) ||
        (label !== null && (typeof label !== "string" || label.length > 120))) return null;
    return { weeklyHours, until, label: label?.trim() || null };
  }
  if (kind === "hoursRules") {
    const { start = null, enhanced = false } = values;
    if (typeof enhanced !== "boolean" || (start !== null && (!isValidDateKey(start) || civil(start).weekday !== 1))) return null;
    return { start, enhanced };
  }
  if (kind === "hoursEntry") {
    const { operation, hours, title = null } = values;
    if (!["adjust", "reset", "paid", "recover", "consumeRecovery"].includes(operation) ||
      !amount(hours, ["adjust", "reset"].includes(operation) ? -5000 : 0.01, 5000) ||
      (title !== null && (typeof title !== "string" || title.length > 120))) return null;
    return { operation, hours, title: title?.trim() || null };
  }
  if (kind === "annual") {
    if (values.target === null) return { target: null };
    const { target, initialized, opening, weeklyLimit = null, includeSunday = true } = values;
    const end = civil(date).plus({ years: 1 }).minus({ days: 1 }).toISODate();
    if (!amount(target, 0.01, 8784) || !isValidDateKey(initialized) || initialized < date || initialized > end ||
      !amount(opening, 0, 8784) || (weeklyLimit !== null && !amount(weeklyLimit, 1, 168)) ||
      typeof includeSunday !== "boolean") return null;
    return { target, initialized, opening, weeklyLimit, includeSunday };
  }
  return null;
}

function effectiveContract(amendments, baseHours, date) {
  return amendments.find((item) => item.date <= date && item.values.weeklyHours != null &&
    (!item.values.until || date <= item.values.until))?.values.weeklyHours ?? baseHours;
}

function contractDayPortion(value, day, weekdays) {
  const index = weekdays.indexOf(day);
  return index < 0 ? 0 : Math.floor(value * (index + 1) / weekdays.length) - Math.floor(value * index / weekdays.length);
}

function planningContractTarget({ from, base, start, end, amendments, weekdays }) {
  let total = 0;
  let covered = false;
  for (let day = civil(from), index = 0; index < 7; day = day.plus({ days: 1 }), index++) {
    const date = day.toISODate();
    if ((start && date < start) || (end && date > end)) continue;
    const volume = effectiveContract(amendments, base, date);
    if (!volume) continue;
    covered = true;
    total += contractDayPortion(minutes(volume), day.weekday, weekdays);
  }
  return covered ? total : null;
}

function annualPeriod(record) {
  const end = civil(record.date).plus({ years: 1 }).minus({ days: 1 }).toISODate();
  return { ...record.values, from: record.date, end };
}

function ledgerStart(filters, inputs) {
  const bounds = [filters.from];
  const counters = inputs.find(({ kind }) => kind === "hoursRules")?.values;
  const leave = inputs.find(({ kind }) => kind === "leaveRules")?.values;
  if (counters?.start && counters.start <= filters.to) bounds.push(counters.start);
  if (leave?.startMonth && `${leave.startMonth}-01` <= filters.to) bounds.push(`${leave.startMonth}-01`);
  for (const item of inputs) {
    if (item.kind !== "annual" || !item.values.target) continue;
    const period = annualPeriod(item);
    if (period.end >= filters.from && period.from <= filters.to) bounds.push(period.initialized);
  }
  return bounds.reduce((earliest, date) => date < earliest ? date : earliest);
}

function ledgerEnd(filters, inputs) {
  return inputs.filter((item) => item.kind === "annual" && item.values.target && item.date <= filters.to)
    .reduce((latest, item) => {
      const { end } = annualPeriod(item);
      return end > latest ? end : latest;
    }, filters.to);
}

function applyHourLedger({ rules, entries, weekData, first, last }) {
  const values = {};
  if (!rules?.start || rules.start > last.to) return values;
  let balance = 0;
  let recovery = 0;
  let changed = 0;
  let complete = true;
  const weekBalances = {};
  const byWeek = new Map();
  const previousSunday = civil(rules.start).minus({ days: 1 }).toISODate();
  for (const item of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const moves = item.values.entries || [item.values];
    if (item.date === previousSunday) {
      for (const move of moves) {
        if (move.operation === "reset") balance = minutes(move.hours);
        if (move.operation === "adjust") balance += minutes(move.hours);
      }
      continue;
    }
    const monday = civil(item.date).startOf("week").toISODate();
    if (!byWeek.has(monday)) byWeek.set(monday, []);
    byWeek.get(monday).push(...moves);
  }
  for (const week of weekData) {
    if (week.from < rules.start || week.from > last.from) continue;
    const visible = week.from >= first.from;
    if (visible && !Object.hasOwn(values, "counterStart")) values.counterStart = complete ? balance : null;
    if (!Number.isFinite(week.delta)) complete = false;
    else if (complete) balance += week.delta + (rules.enhanced ? week.premiumBonus || 0 : 0);
    if (visible) weekBalances[week.key] = Number.isFinite(week.delta) ?
      week.delta + (rules.enhanced ? week.premiumBonus || 0 : 0) : null;
    recovery -= week.recoveryUsed || 0;
    for (const entry of byWeek.get(week.from) || []) {
      const value = minutes(entry.hours);
      if (entry.operation === "reset") {
        if (visible && complete) changed += value - balance;
        balance = value;
        complete = true;
      } else if (entry.operation === "consumeRecovery") {
        recovery -= value;
      } else {
        const delta = entry.operation === "adjust" ? value : -value;
        if (visible) changed += delta;
        if (complete) balance += delta;
        if (entry.operation === "recover") recovery += value;
      }
    }
  }
  if (Object.hasOwn(values, "counterStart")) Object.assign(values, {
    counterEnd: complete ? balance : null, counterChanges: changed, recoveryBalance: recovery, weekBalances,
  });
  return values;
}

function calculateAnnual(period, weekData, to, asOf) {
  if (!period || period.initialized > to || period.initialized > asOf) return {};
  const through = [to, asOf, period.end].sort()[0];
  let realised = minutes(period.opening);
  let paidWeekly = 0;
  const planned = weekData.reduce((sum, { days }) => sum + days.filter(({ date }) =>
    date >= period.initialized && date <= period.end && (period.includeSunday || civil(date).weekday !== 7))
    .reduce((total, day) => total + day.planned, 0), minutes(period.opening));
  for (const week of weekData) {
    const eligible = week.days.filter(({ date }) => date >= period.initialized && date <= through &&
      (period.includeSunday || civil(date).weekday !== 7));
    if (!eligible.length) continue;
    if (!week.complete) return { annualTarget: minutes(period.target), annualPlanned: planned };
    const actual = eligible.reduce((total, { worked, credited }) => total + worked + credited, 0);
    realised += actual;
    if (period.weeklyLimit && week.to <= through) paidWeekly += Math.max(0, actual - minutes(period.weeklyLimit));
  }
  const target = minutes(period.target);
  return { annualTarget: target, annualWorked: realised, annualPlanned: planned, annualWeeklyPaid: paidWeekly,
    annualRemaining: target - realised, annualClosingExtra: through >= period.end ? Math.max(0, realised - target - paidWeekly) : null };
}

module.exports = { validateLedgerInput, defaultAbsenceTypes, effectiveContract, annualPeriod,
  ledgerStart, ledgerEnd, applyHourLedger, calculateAnnual, contractDayPortion, planningContractTarget };
