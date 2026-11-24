const { DateTime } = require("luxon");
const { getRangeBounds, toLocalDateKey } = require("./time-clock.service");
const { payrollDayShares } = require("./time-clock-payroll.service");
const { validAbsences, validWeekdays, absenceFractionsByDay } = require("./personnel-report-counters.service");
const { effectiveContract, contractDayPortion } = require("./personnel-report-ledgers.service");

const ZONE = "Europe/Paris";
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hours) => Math.round(hours * 60);
const positiveOverlap = (start, end, from, to) => Math.max(0, (Math.min(+end, +to) - Math.max(+start, +from)) / 60_000);

function validateOvertimeRules(values) {
  const { paidLeaveDays = null } = values;
  if (![null, 5, 6].includes(paidLeaveDays)) return null;
  const leaveBasis = paidLeaveDays === null ? {} : { paidLeaveDays };
  if (values.enabled === false) return { enabled: false, ...leaveBasis };
  const { enabled, source, ordinary, firstEnd, secondEnd, firstRate, secondRate, lastRate,
    complementBand, complementFirstRate, complementLastRate, workdays, creditedAbsences,
    nightStart, nightEnd, nightRate, sundayRate, holidayRate, weekdays,
    planningAttribution = null, plannedNightGross = false, countHolidays = false, structuralMonthly = false } = values;
  const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  if (enabled !== true || !["planning", "validated", "hybrid"].includes(source) ||
      !between(ordinary, 1, 168) || !between(firstEnd, ordinary + 1 / 60, 168) ||
      !between(secondEnd, firstEnd + 1 / 60, 168) ||
      ![firstRate, secondRate, lastRate, complementFirstRate, complementLastRate].every((rate) => Number.isInteger(rate) && between(rate, 0, 500)) ||
      !between(complementBand, 0, 100) || ![5, 6, 7].includes(workdays) || !validAbsences(creditedAbsences) ||
      !validWeekdays(weekdays, workdays) ||
      ![null, "shiftStart"].includes(planningAttribution) || (planningAttribution && source !== "planning") ||
      [plannedNightGross, countHolidays, structuralMonthly].some((option) => typeof option !== "boolean") ||
      ![nightRate, sundayRate, holidayRate].every((rate) => rate === null || (Number.isInteger(rate) && between(rate, 0, 500))) ||
      (nightRate !== null && (typeof nightStart !== "string" || typeof nightEnd !== "string" ||
        !TIME.test(nightStart) || !TIME.test(nightEnd) || nightStart === nightEnd))) return null;
  return { enabled, source, ordinary, firstEnd, secondEnd, firstRate, secondRate, lastRate,
    complementBand, complementFirstRate, complementLastRate, workdays, creditedAbsences: [...new Set(creditedAbsences)],
    nightStart: nightRate === null ? null : nightStart, nightEnd: nightRate === null ? null : nightEnd,
    nightRate, sundayRate, holidayRate, weekdays: weekdays ?? null, ...leaveBasis,
    ...(planningAttribution && { planningAttribution }),
    ...(plannedNightGross && { plannedNightGross }),
    ...(countHolidays && { countHolidays }),
    ...(structuralMonthly && { structuralMonthly }) };
}

function paidLeaveCredits(week, absences, rule, { base, start, end, amendments }, isHoliday) {
  const credits = new Map();
  if (!rule?.paidLeaveDays) return credits;
  const relevant = absences.filter(({ type, startDate, endDate }) =>
    ["paid_leave", "weekly_rest"].includes(type) && startDate <= week.to && endDate >= week.from);
  const eligibility = { weekdays: [1, 2, 3, 4, 5, 6, 7] };
  let fractions = 0;
  let total = 0;
  for (let day = DateTime.fromISO(week.from, { zone: ZONE }); day.toISODate() <= week.to; day = day.plus({ days: 1 })) {
    const date = day.toISODate();
    if ((start && date < start) || (end && date > end)) continue;
    const daily = Math.round(effectiveContract(amendments, base, date) * 60) / rule.paidLeaveDays;
    if (!daily) continue;
    const entries = absenceFractionsByDay(relevant, eligibility, isHoliday, day, day, daily).get(date);
    if (entries?.get("weekly_rest") === 1) continue;
    const fraction = Math.min(entries?.get("paid_leave") || 0, rule.paidLeaveDays - fractions);
    if (!fraction) continue;
    const credit = daily * fraction;
    credits.set(date, Math.round(total + credit) - Math.round(total));
    total += credit;
    fractions += fraction;
  }
  return credits;
}

function overtimeColumns(rules) {
  const columns = new Map();
  function add(kind, rate, name) {
    if (rate !== null) columns.set(`${kind}${rate}`, { key: `${kind}${rate}`, label: `${name} ${rate}% (h)`, type: "minutes" });
  }
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const rate of [rule.firstRate, rule.secondRate, rule.lastRate]) {
      add("extra", rate, "Heures Supp. Exceptionnelles");
      add("structural", rate, "Heures Supp. Structurelles");
    }
    for (const rate of [rule.complementFirstRate, rule.complementLastRate]) add("complement", rate, "Heures Comp.");
    add("night", rule.nightRate, "Heures de nuit");
    add("sunday", rule.sundayRate, "Heures du dimanche");
    if (rule.countHolidays && rule.holidayRate === null) {
      columns.set("holidays", { key: "holidays", label: "Heures Jour Férié (h)", type: "minutes" });
    } else add("holidays", rule.holidayRate, "Heures jours fériés");
  }
  return [...columns.values()];
}

function planningHours(shifts, marked, from, to, byShiftStart = false) {
  const days = new Map();
  for (const [id, shift] of shifts) {
    if (marked.has(id) || +new Date(shift.start) >= +to || +new Date(shift.end) <= +from) continue;
    const schedule = {
      clockInAt: shift.start, clockOutAt: shift.end, absent: false, breaks: [],
      pauseMinutesByDay: [], plannedBreakMinutes: shift.breakMinutes || 0,
    };
    const shares = payrollDayShares(schedule);
    if (byShiftStart && shares.length) {
      shares.splice(0, shares.length, {
        date: toLocalDateKey(shift.start), startAt: shift.start, endAt: shift.end,
        workedMinutes: shares.reduce((sum, item) => sum + item.workedMinutes, 0),
        breakMinutes: shares.reduce((sum, item) => sum + item.breakMinutes, 0),
      });
    }
    for (const timings of shares) {
      if (!days.has(timings.date)) days.set(timings.date, []);
      days.get(timings.date).push({ id, timings, breaks: [], planned: true });
    }
  }
  return days;
}

function payHoursInside(item, from, to) {
  const { startAt, endAt, workedMinutes, breakMinutes } = item.timings;
  const interval = positiveOverlap(startAt, endAt, from, to);
  if (!interval) return 0;
  if (+from <= +startAt && +endAt <= +to) return workedMinutes;
  const actualBreaks = item.breaks.reduce((sum, entry) => sum + positiveOverlap(entry.startAt, entry.endAt, startAt, endAt), 0);
  if (Math.round(actualBreaks) !== breakMinutes) return null;
  const deducted = item.breaks.reduce((sum, entry) => sum + positiveOverlap(entry.startAt, entry.endAt,
    Math.max(+from, +startAt), Math.min(+to, +endAt)), 0);
  return Math.max(0, Math.round(interval - deducted));
}

function premiumMinutesByWindow(item, windows, grossWhenPauseUnscheduled) {
  const values = windows.map(([from, to]) => {
    const paid = payHoursInside(item, from, to);
    return paid === null && item.planned && grossWhenPauseUnscheduled
      ? Math.round(positiveOverlap(item.timings.startAt, item.timings.endAt, from, to)) : paid;
  });
  return values.includes(null) ? null : values.reduce((sum, value) => sum + value, 0);
}

function shiftPremiums(item, date, rule, isHoliday) {
  const { startAt, endAt, workedMinutes } = item.timings;
  const values = {};
  const night = [];
  const sunday = [];
  const holiday = [];
  const startDay = DateTime.fromMillis(+new Date(startAt), { zone: ZONE }).startOf("day");
  for (let day = startDay; +day < +new Date(endAt); day = day.plus({ days: 1 })) {
    const next = day.plus({ days: 1 });
    const dayKey = day.toISODate();
    const holidayActive = rule.countHolidays || rule.holidayRate !== null;
    if (holidayActive && isHoliday(dayKey)) holiday.push([day, next]);
    else if (day.weekday === 7) sunday.push([day, next]);
    if (rule.nightRate === null) continue;
    const start = DateTime.fromISO(`${dayKey}T${rule.nightStart}`, { zone: ZONE });
    const end = DateTime.fromISO(`${dayKey}T${rule.nightEnd}`, { zone: ZONE });
    night.push(...(start < end ? [[start, end]] : [[day, end], [start, next]]));
  }
  if (rule.nightRate !== null) values.night = premiumMinutesByWindow(item, night, rule.plannedNightGross);
  if (rule.sundayRate !== null) values.sunday = rule.planningAttribution
    ? premiumMinutesByWindow(item, sunday, true)
    : DateTime.fromISO(date, { zone: ZONE }).weekday === 7 ? workedMinutes : 0;
  if (rule.countHolidays || rule.holidayRate !== null) values.holidays = rule.planningAttribution
    ? premiumMinutesByWindow(item, holiday, true) : isHoliday(date) ? workedMinutes : 0;
  return values;
}

function absenceCredit(absences, daily, rule, paidLeave, timedSickness) {
  let credited = 0;
  let excluded = 0;
  for (const [type, fraction] of absences || []) {
    if (type === "weekly_rest" || (type === "paid_leave" && paidLeave !== null) || (type === "sick_leave" && timedSickness)) continue;
    const amount = Math.round(fraction * daily);
    if (rule.creditedAbsences.includes(type)) credited = Math.max(credited, amount);
    else excluded = Math.max(excluded, amount);
  }
  if (paidLeave !== null) {
    if (rule.creditedAbsences.includes("paid_leave")) credited = Math.max(credited, paidLeave);
    else excluded = Math.max(excluded, paidLeave);
  }
  if (timedSickness) {
    if (rule.creditedAbsences.includes("sick_leave")) credited = Math.max(credited, timedSickness);
    else excluded = Math.max(excluded, timedSickness);
  }
  return { credited, excluded: Math.min(excluded, Math.max(daily, paidLeave, timedSickness) - credited) };
}

function monthlyStructuralHours(values, weeks, rules, from, to, volume, contractStart, contractEnd, amendments, activeAnnual) {
  const month = DateTime.fromISO(from, { zone: ZONE });
  const ruleAt = (monday) => rules.find(({ date }) => date <= monday)?.values;
  const reportWeeks = weeks.filter((week) => week.from <= to && week.to >= from);
  const rule = ruleAt(reportWeeks[0]?.from);
  if (!rule?.structuralMonthly || !Number.isFinite(values.structural) || activeAnnual || month.day !== 1 ||
      month.endOf("month").toISODate() !== to || (contractStart && contractStart > from) ||
      (contractEnd && contractEnd < to) || reportWeeks.some((week) => ruleAt(week.from) !== rule)) return;
  const contract = effectiveContract(amendments, volume, from);
  for (let day = month.plus({ days: 1 }); day.toISODate() <= to; day = day.plus({ days: 1 })) {
    if (effectiveContract(amendments, volume, day.toISODate()) !== contract) return;
  }
  const known = values.structural;
  const bands = [[rule.ordinary, rule.firstEnd, rule.firstRate], [rule.firstEnd, rule.secondEnd, rule.secondRate],
    [rule.secondEnd, Infinity, rule.lastRate]];
  const fixed = new Map();
  for (const [min, max, rate] of bands) {
    fixed.set(rate, (fixed.get(rate) || 0) + Math.max(0, Math.min(contract, max) - min));
  }
  values.structural = 0;
  for (const [rate, hours] of fixed) {
    const amount = minutes(hours * 52 / 12);
    values[`structural${rate}`] = amount;
    values.structural += amount;
  }
  if (Number.isFinite(values.premiums)) values.premiums += values.structural - known;
}

function calculateOvertime({ days, absences, shifts, weeks, rules, contractMinutes, contractStart, contractEnd,
  amendments = [], trackHours = false, activeAnnual, from, to, isHoliday, leaveCredits = new Map() }) {
  if ((!rules.some(({ values }) => values.enabled) && !trackHours) || (!contractMinutes && !amendments.length)) {
    return { values: {}, weekData: [], daily: new Map() };
  }
  const values = {};
  const weekData = [];
  const dailyPremium = new Map();
  const byDay = new Map(days.map((day) => [day.date, day]));
  const matched = new Set(days.flatMap((day) => day.sessions.filter((item) => item.review && item.shiftId)
    .map((item) => item.shiftId)));
  const absent = new Set(days.flatMap((day) => day.shifts.filter((shift) => shift.absenceValidated).map(({ id }) => id)));
  const { start, endExclusive } = getRangeBounds(weeks[0].from, weeks.at(-1).to);
  const planned = planningHours(shifts, absent, start, endExclusive);
  const assigned = rules.some(({ values }) => values.planningAttribution)
    ? planningHours(shifts, absent, start, endExclusive, true) : null;
  const unavailable = new Set();
  function count(key, value) {
    if (value === null) unavailable.add(key);
    else values[key] = (values[key] || 0) + value;
  }

  for (const week of weeks) {
    const configured = rules.find(({ date }) => date <= week.from)?.values;
    const rule = configured?.enabled ? configured : { enabled: false, source: "hybrid", workdays: 5,
      creditedAbsences: [], paidLeaveDays: configured?.paidLeaveDays };
    if (!rule.enabled && !trackHours) continue;
    if (!contractStart && !rule.planningAttribution) continue;
    const applicable = overtimeColumns([rule]).map(({ key }) => key);
    if ((contractStart && week.to < contractStart) || (contractEnd && week.from > contractEnd)) continue;
    const weekDates = [];
    for (let day = DateTime.fromISO(week.from, { zone: ZONE }); day.toISODate() <= week.to; day = day.plus({ days: 1 })) weekDates.push(day);
    const weekdayOrder = [...(rule.weekdays || Array.from({ length: rule.workdays }, (_, index) => index + 1))].sort((a, b) => a - b);
    const payrollOverlap = rule.source !== "planning" && weekDates.some((day) =>
      byDay.get(day.toISODate())?.payroll.some((item) => item.payrollOverlap));
    const needsValidation = payrollOverlap || (rule.source === "validated" && weekDates.some((day) => {
      const date = day.toISODate();
      return planned.get(date)?.some(({ id }) => !matched.has(id)) ||
        byDay.get(date)?.sessions.some((item) => !item.review);
    }));
    const ordinary = rule.enabled ? minutes(rule.ordinary) : Infinity;
    const bands = [[ordinary, minutes(rule.firstEnd), rule.firstRate],
      [minutes(rule.firstEnd), minutes(rule.secondEnd), rule.secondRate],
      [minutes(rule.secondEnd), Infinity, rule.lastRate]];
    const between = (lower, upper, previous, next) => upper > lower ? Math.max(0, Math.min(upper, next) - Math.max(lower, previous)) : 0;
    const weekAbsences = absences.filter(({ start, end }) =>
      toLocalDateKey(start) <= week.to && toLocalDateKey(end) >= week.from);
    const timedSickness = rule.planningAttribution
      ? absenceFractionsByDay(weekAbsences.filter(({ type, unit }) => type === "sick_leave" && unit === "custom"),
        { weekdays: weekDates.map((day) => day.weekday) }, isHoliday, weekDates[0], weekDates.at(-1), 1500)
      : new Map();
    const weeklyPlanning = rule.planningAttribution ? assigned : planned;
    if (!contractStart && !weekDates.some((day) => weeklyPlanning.has(day.toISODate())) &&
        !weekAbsences.some(({ type }) => type !== "weekly_rest")) continue;
    const effectiveDays = weekDates.flatMap((day) => {
      const date = day.toISODate();
      if (date < contractStart || (contractEnd && date > contractEnd)) return [];
      const volume = effectiveContract(amendments, contractMinutes / 60, date);
      const contractual = minutes(volume);
      const target = contractDayPortion(contractual, day.weekday, weekdayOrder);
      const fallback = weeklyPlanning.get(date) || [];
      const real = byDay.get(date)?.payroll.filter((item) => item.validated && !item.absent && !item.payrollOverlap) || [];
      const native = rule.source === "planning" ? fallback : rule.source === "validated" ? real :
        [...fallback.filter(({ id }) => !matched.has(id)), ...real];
      const items = [...native, ...(byDay.get(date)?.sourceWork || [])];
      const worked = items.reduce((sum, item) => sum + item.timings.workedMinutes, 0);
      const daily = contractual / rule.workdays;
      const eligibleAbsences = absenceFractionsByDay(weekAbsences, { weekdays: weekdayOrder }, isHoliday, day, day, daily);
      const sickMinutes = Math.round((timedSickness.get(date)?.get("sick_leave") || 0) * 1500);
      const { credited, excluded } = absenceCredit(eligibleAbsences.get(date), daily, rule,
        rule.paidLeaveDays ? leaveCredits.get(date) || 0 : null, sickMinutes);
      return [{ day, date, items, worked, credited, excluded, contractual, target,
        timedSickness: sickMinutes,
        recoveryUsed: Math.round((eligibleAbsences.get(date)?.get("compensatory_rest") || 0) * daily),
        planned: fallback.reduce((sum, item) => sum + item.timings.workedMinutes, 0) }];
    });
    const target = effectiveDays.reduce((sum, day) => sum + day.target, 0);
    const volumeKnown = effectiveDays.every((day) => day.contractual > 0);
    const effective = effectiveDays.reduce((sum, { worked, credited }) => sum + worked + credited, 0);
    const annualWeek = activeAnnual && week.from <= activeAnnual.end && week.to >= activeAnnual.from;
    const isPartTime = !annualWeek && effectiveDays.every((day) => day.contractual < ordinary);
    const threshold = annualWeek ? (activeAnnual.weeklyLimit ? minutes(activeAnnual.weeklyLimit) : Infinity) : Math.max(target, ordinary);
    const complementEnd = target + Math.round(target * rule.complementBand / 100);
    const reachesFullTime = rule.enabled && isPartTime && effective >= ordinary;
    const complete = !needsValidation && volumeKnown;
    const recoveryUsed = effectiveDays.reduce((sum, day) => sum + day.recoveryUsed, 0);
    const counterEffective = effectiveDays.reduce((sum, day) => sum + day.worked + day.credited +
      (rule.creditedAbsences.includes("compensatory_rest") ? 0 : day.recoveryUsed), 0);
    const weekResult = { ...week, days: effectiveDays, complete, payrollOverlap, delta: complete ? counterEffective - target : null, recoveryUsed,
      planningAttribution: rule.planningAttribution,
      exceptional: null, premiumBonus: 0 };
    weekData.push(weekResult);
    const visibleWeek = week.from <= to && week.to >= from;
    if (!rule.enabled || !visibleWeek && !trackHours) continue;
    if (!complete || reachesFullTime) {
      if (visibleWeek) for (const key of [...applicable.filter((key) => !complete || key.startsWith("complement")),
        "normalHours", "exceptional", "premiums", ...(!complete ? ["structural"] : [])]) count(key, null);
    }
    if (reachesFullTime) {
      if (visibleWeek) values.overtimeNeedsReview = true;
    }
    if (!complete) continue;
    const breakdown = {
      source: rule.source, target, worked: effectiveDays.reduce((sum, day) => sum + day.worked, 0),
      credited: effectiveDays.reduce((sum, day) => sum + day.credited, 0),
      needsReview: reachesFullTime, bands: {},
    };
    weekResult.breakdown = breakdown;
    let cumulative = 0;
    let excludedCumulative = 0;
    weekResult.exceptional = reachesFullTime ? null : 0;
    let weightedExtra = 0;
    for (const { day, date, items, worked, credited, excluded, contractual } of effectiveDays) {
      const annualCounts = !annualWeek || (date >= activeAnnual.initialized && date <= activeAnnual.end &&
        (activeAnnual.includeSunday || day.weekday !== 7));
      const next = cumulative + (annualCounts ? worked + credited : 0);
      const nextExcluded = excludedCumulative + worked + credited + excluded;
      const dayValues = Object.fromEntries(applicable.map((key) => [key, 0]));
      let exceptional = 0;
      let structural = 0;
      for (const [low, high, rate] of bands) {
        const fixed = annualWeek ? 0 : contractDayPortion(Math.max(0, Math.min(high, contractual) - low), day.weekday, weekdayOrder);
        const extra = isPartTime || !annualCounts ? 0 : between(Math.max(low, threshold), high, cumulative, next);
        dayValues[`structural${rate}`] += fixed;
        dayValues[`extra${rate}`] += extra;
        structural += fixed;
        exceptional += extra;
        weightedExtra += extra * rate / 100;
      }
      if (isPartTime && !reachesFullTime) {
        const low = between(target, complementEnd, cumulative, next);
        const high = between(complementEnd, Infinity, cumulative, next);
        dayValues[`complement${rule.complementFirstRate}`] += low;
        dayValues[`complement${rule.complementLastRate}`] += high;
        exceptional += low + high;
        weightedExtra += (low * rule.complementFirstRate + high * rule.complementLastRate) / 100;
      }
      const normalThreshold = isPartTime ? target : threshold;
      dayValues.normalHours = Math.max(0, between(normalThreshold, Infinity, excludedCumulative, nextExcluded) -
        between(normalThreshold, Infinity, cumulative, next));
      dayValues.structural = structural;
      dayValues.exceptional = exceptional;
      dayValues.premiums = structural + exceptional;
      if (weekResult.exceptional !== null) weekResult.exceptional += exceptional;
      for (const [key, duration] of Object.entries(dayValues)) {
        if (/^(extra|structural|complement)\d+$/.test(key) && duration > 0) {
          breakdown.bands[key] = (breakdown.bands[key] || 0) + duration;
        }
      }
      const visibleDay = date >= from && date <= to;
      if (visibleDay || (visibleWeek && rule.planningAttribution)) {
        const premiums = new Map(items.map((item) => [item.id, shiftPremiums(item, date, rule, isHoliday)]));
        const premiumTotal = (key, column) => {
          const duration = [...premiums.values()].map((value) => value[key]);
          dayValues[column] = dayValues[key] = duration.includes(null) ? null : duration.reduce((sum, value) => sum + value, 0);
        };
        if (rule.nightRate !== null) premiumTotal("night", `night${rule.nightRate}`);
        if (rule.sundayRate !== null) premiumTotal("sunday", `sunday${rule.sundayRate}`);
        if (rule.countHolidays || rule.holidayRate !== null) premiumTotal("holidays", rule.holidayRate === null ? "holidays" : `holidays${rule.holidayRate}`);
        dailyPremium.set(date, { ...dayValues, exceptional: reachesFullTime ? null : exceptional,
          shiftPremiums: Object.fromEntries(premiums) });
        if (visibleDay && rule.planningAttribution && week.to > to) {
          for (const key of Object.keys(dayValues)) {
            if (/^(extra|complement)\d+$/.test(key) || key === "exceptional") delete dayValues[key];
          }
          dayValues.normalHours = 0;
          dayValues.premiums = structural;
        }
        if (visibleDay) for (const [key, value] of Object.entries(dayValues)) count(key, value);
      }
      cumulative = next;
      excludedCumulative = nextExcluded;
    }
    weekResult.premiumBonus = Math.round(weightedExtra);
  }
  for (const key of unavailable) values[key] = null;
  monthlyStructuralHours(values, weeks, rules, from, to, contractMinutes / 60, contractStart, contractEnd, amendments, activeAnnual);
  return { values, weekData, daily: dailyPremium };
}

module.exports = { validateOvertimeRules, overtimeColumns, calculateOvertime, paidLeaveCredits };
