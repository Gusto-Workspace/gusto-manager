const { DateTime } = require("luxon");
const { ABSENCE_TYPES } = require("./planning-absence.service");
const { toLocalDateKey } = require("./time-clock.service");
const { isPlannedAbsence } = require("./time-clock-register.service");

const ZONE = "Europe/Paris";
const civil = (key) => DateTime.fromISO(key, { zone: ZONE });
const normalize = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const defaultAcquisition = ["paid_leave", "work_accident", "commuting_accident", "maternity_leave", "paternity_leave",
  "adoption_leave", "family_event", "training", "apprenticeship", "public_holiday", "compensatory_rest", "rtt"];
const dateKey = (value) => value ? toLocalDateKey(value) : null;

function validAbsences(value) {
  return Array.isArray(value) && value.every((type) => ABSENCE_TYPES.includes(type));
}

function validWeekdays(value, count) {
  return value == null || (Array.isArray(value) && new Set(value).size === count && value.length === count &&
    value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7));
}

function validateLeaveRules(values) {
  const { startMonth, referenceMonth, unit, excludeHolidays, preserveCarry, assimilated, weekdays } = values;
  if (startMonth === null) return { startMonth: null };
  if (typeof startMonth !== "string" || !/^\d{4}-\d{2}$/.test(startMonth) || !civil(startMonth).isValid ||
      !Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12 ||
      !["workdays", "businessDays"].includes(unit) || typeof excludeHolidays !== "boolean" ||
      typeof preserveCarry !== "boolean" || !validAbsences(assimilated) ||
      !validWeekdays(weekdays, unit === "businessDays" ? 6 : 5)) return null;
  return { startMonth, referenceMonth, unit, excludeHolidays, preserveCarry,
    assimilated: [...new Set(assimilated)], weekdays: weekdays ?? null };
}

function referenceStart(day, month) {
  const boundary = day.set({ month, day: 1 });
  return boundary > day ? boundary.minus({ years: 1 }) : boundary;
}

function isExcludedDay(day, rules, isHoliday) {
  const allowed = rules.weekdays?.includes(day.weekday) ?? day.weekday <= (rules.unit === "businessDays" ? 6 : 5);
  return !allowed || (rules.excludeHolidays && isHoliday(day.toISODate()));
}

function absenceDayFraction({ full, morning, afternoon, intervals, midday }, contractDayMinutes) {
  if (full || (morning && afternoon)) return 1;
  const half = (Number(morning) + Number(afternoon)) / 2;
  if (!intervals.length) return half;
  let duration = 0;
  let cursor = -Infinity;
  intervals.sort(([a], [b]) => a - b);
  for (const [left, right] of intervals) {
    const start = Math.max(left, cursor, morning ? midday : -Infinity);
    const end = Math.min(right, afternoon ? midday : Infinity);
    if (end <= start) continue;
    duration += end - start;
    cursor = end;
  }
  if (!duration) return half;
  return contractDayMinutes > 0 ? Math.min(1, half + duration / 60_000 / contractDayMinutes) : null;
}

function absenceFractionsByDay(absences, rules, isHoliday, from, to, contractDayMinutes) {
  const entries = new Map();
  for (const { type, start, end, unit } of absences) {
    const first = DateTime.fromJSDate(start, { zone: ZONE });
    const last = DateTime.fromJSDate(end, { zone: ZONE });
    const endDay = last.minus({ milliseconds: 1 }).startOf("day");
    for (let day = first.startOf("day") < from ? from : first.startOf("day");
      day <= to && day <= endDay; day = day.plus({ days: 1 })) {
      if (isExcludedDay(day, rules, isHoliday)) continue;
      const date = day.toISODate();
      const entry = entries.get(date) || new Map();
      const parts = entry.get(type) || { full: false, morning: false, afternoon: false, intervals: [], midday: +day.set({ hour: 12 }) };
      if (["full", "morning", "afternoon"].includes(unit)) parts[unit] = true;
      else parts.intervals.push([Math.max(+first, +day), Math.min(+last, +day.plus({ days: 1 }))]);
      entry.set(type, parts);
      entries.set(date, entry);
    }
  }
  for (const entry of entries.values()) {
    for (const [type, parts] of entry) entry.set(type, absenceDayFraction(parts, contractDayMinutes));
  }
  return entries;
}

function rollBuckets(bucket, preserveCarry) {
  const carry = preserveCarry ? Math.max(0, bucket.previousBalance) : 0;
  // Round entitlements at the annual close, while keeping daily and monthly accrual unrounded.
  const rounding = Math.ceil(bucket.currentAcquired - 1e-8) - bucket.currentAcquired;
  const closingBalance = bucket.currentBalance + rounding;
  const debt = Math.max(0, -closingBalance);
  return {
    previousAcquired: bucket.currentAcquired + rounding + carry,
    previousUsed: Math.max(0, bucket.currentUsed - debt),
    previousBalance: Math.max(0, closingBalance) + carry,
    currentAcquired: 0, currentUsed: debt, currentBalance: -debt,
  };
}

function calculateLeaveCounter({ rules, snapshots, contractStart, contractEnd, reportEnd, asOf, absences, shifts,
  validatedWorkDays = [], contractMinutes, isHoliday }) {
  if (!rules?.startMonth) return { balance: snapshots?.get(reportEnd), status: "unconfigured" };
  if (!contractStart) return { status: "missingContract" };

  const activation = civil(`${rules.startMonth}-01`);
  const start = civil(contractStart);
  const reportDate = civil(reportEnd);
  const cutoff = contractEnd && contractEnd < reportEnd ? civil(contractEnd) : reportDate;
  const accruedUntil = cutoff.toISODate() > asOf ? civil(asOf) : cutoff;
  if (accruedUntil < activation || accruedUntil < start) return { balance: snapshots?.get(reportEnd), status: "outside" };
  const baseline = [...(snapshots || [])]
    .filter(([date, values]) => date >= contractStart && date <= accruedUntil.toISODate() &&
      ["previousBalance", "currentBalance"].every((key) => Number.isFinite(values[key])))
    .sort(([a], [b]) => b.localeCompare(a))[0];
  if (start < activation && (!baseline || baseline[0] < activation.minus({ days: 1 }).toISODate())) {
    return { status: "needsOpening" };
  }

  const initial = baseline ? civil(baseline[0]) : start.minus({ days: 1 });
  const from = initial.plus({ days: 1 });
  const opening = baseline?.[1] || {};
  const bucket = {
    previousAcquired: opening.previousAcquired ?? (opening.previousBalance ?? 0) + (opening.previousUsed ?? 0),
    previousUsed: opening.previousUsed ?? 0, previousBalance: opening.previousBalance ?? 0,
    currentAcquired: opening.currentAcquired ?? (opening.currentBalance ?? 0) + (opening.currentUsed ?? 0),
    currentUsed: opening.currentUsed ?? 0, currentBalance: opening.currentBalance ?? 0,
  };
  let balances = bucket;
  const work = new Set([...validatedWorkDays, ...shifts.filter((shift) => !isPlannedAbsence(shift)).map(({ start }) => dateKey(start))]);
  const daysPerWeek = rules.unit === "businessDays" ? 6 : 5;
  const absenceDays = absenceFractionsByDay(absences, rules, isHoliday, from, cutoff, contractMinutes / daysPerWeek);
  const allowed = new Set(rules.assimilated || defaultAcquisition);
  let incomplete = false;
  let cycle = referenceStart(baseline ? initial : from, rules.referenceMonth).toISODate();
  const acquiredThrough = accruedUntil.toISODate();
  const activeMonths = new Set([...work].filter((date) => date && date >= from.toISODate() && date <= acquiredThrough)
    .map((date) => date.slice(0, 7)));

  for (let month = from.startOf("month"); month <= accruedUntil; month = month.plus({ months: 1 })) {
    const nextCycle = referenceStart(month, rules.referenceMonth).toISODate();
    if (cycle !== nextCycle) {
      balances = rollBuckets(balances, rules.preserveCarry);
      cycle = nextCycle;
    }
    const eligibleDates = [];
    const monthEnd = month.endOf("month").startOf("day");
    let monthDays = 0;
    for (let day = month; day <= monthEnd; day = day.plus({ days: 1 })) {
      if (isExcludedDay(day, rules, isHoliday)) continue;
      monthDays++;
      if (day >= from && day <= cutoff) eligibleDates.push(day.toISODate());
    }
    const hasActivity = eligibleDates.some((date) => date <= acquiredThrough && (work.has(date) ||
      [...(absenceDays.get(date)?.keys() || [])].some((type) => allowed.has(type) || type === "sick_leave"))) ||
      activeMonths.has(month.toISODate().slice(0, 7));
    let earned = 0;
    for (const date of eligibleDates) {
      const dayAbsences = absenceDays.get(date) || new Map();
      if (dayAbsences.get("paid_leave") === null ||
          (date <= acquiredThrough && [...dayAbsences].some(([type, fraction]) => fraction === null && !allowed.has(type)))) incomplete = true;
      if (hasActivity && date <= acquiredThrough) {
        const sick = dayAbsences.get("sick_leave") ?? 0;
        const blocked = Math.max(0, ...[...dayAbsences].filter(([type]) => type !== "sick_leave" && type !== "weekly_rest" && !allowed.has(type))
          .map(([, amount]) => amount ?? 0));
        earned += Math.max(0, 1 - blocked - sick * 0.2);
      }
      if (date <= acquiredThrough) {
        const taken = dayAbsences.get("paid_leave") ?? 0;
        const previous = Math.min(Math.max(0, balances.previousBalance), taken);
        balances.previousUsed += previous;
        balances.previousBalance -= previous;
        balances.currentUsed += taken - previous;
        balances.currentBalance -= taken - previous;
      }
    }
    const acquired = monthDays ? earned / monthDays * (daysPerWeek === 6 ? 2.5 : 25 / 12) : 0;
    balances.currentAcquired += acquired;
    balances.currentBalance += acquired;
  }
  if (incomplete) return { status: "unknownDuration" };

  let scheduled = 0;
  for (const [date, types] of absenceDays) {
    if (types.get("paid_leave") === null) return { status: "unknownDuration" };
    if (date > asOf) scheduled += types.get("paid_leave") ?? 0;
  }
  return { status: "automatic", balance: {
    ...Object.fromEntries(Object.entries(balances).map(([key, value]) => [key, normalize(value)])),
    leaveAvailable: normalize(balances.previousBalance + balances.currentBalance - scheduled),
    scheduled: normalize(scheduled),
  } };
}

module.exports = { validateLeaveRules, calculateLeaveCounter, validWeekdays, validAbsences, absenceFractionsByDay };
