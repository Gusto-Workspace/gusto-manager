const PersonnelInput = require("../../models/personnel-report-input.model");
const TimeClockSession = require("../../models/time-clock-session.model");
const { PlanningDay } = require("../../models/planning-period.model");
const { addDaysToDateKey, getRangeBounds, isValidDateKey, toLocalDateKey } = require("./time-clock.service");

const overlap = (first, second) => +new Date(first.start) < +new Date(second.end) && +new Date(first.end) > +new Date(second.start);
const serviceKey = ({ start, end, absenceType }) => `${+new Date(start)}:${+new Date(end)}:${absenceType || "work"}`;
const sorted = (entries) => entries.sort((left, right) => serviceKey(left).localeCompare(serviceKey(right)));
const compare = (value) => JSON.stringify(value, (_key, entry) => {
  if (!entry || Object.getPrototypeOf(entry) !== Object.prototype) return entry;
  const keys = Object.keys(entry).sort();
  return keys.length ? Object.fromEntries(keys.map((key) => [key, entry[key]])) : undefined;
});
const dayId = (restaurant, profile, kind, date) => `${restaurant}:${profile}:${kind}:${date}`;

function mergeKnown(existing, incoming) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    if (key === "planned") merged.planned ||= value;
    else if (key === "premiums") {
      merged.premiums = mergeKnown(existing.premiums || {}, value);
      if (!merged.premiums) return null;
    } else if (merged[key] == null) merged[key] = value;
    else if (compare(merged[key]) !== compare(value)) return null;
  }
  return merged;
}

function historyIntervalConflict(first, second) {
  if (!overlap(first, second)) return false;
  // An absence starting the following civil day can follow a night service.
  return !(first.absenceDuration === "full" && toLocalDateKey(first.start) > toLocalDateKey(second.start) ||
    second.absenceDuration === "full" && toLocalDateKey(second.start) > toLocalDateKey(first.start));
}

async function readHistoryContext(restaurant, links, period, monthly, session) {
  const profiles = links.map(({ profile }) => profile).filter(Boolean);
  const employees = links.map(({ id }) => id).filter(Boolean);
  const from = monthly.from < period.from ? monthly.from : period.from;
  const to = monthly.to > period.to ? monthly.to : period.to;
  const first = addDaysToDateKey(from, -1);
  const last = addDaysToDateKey(to, 1);
  const bounds = getRangeBounds(first, last);
  const inputs = await PersonnelInput.find({ restaurant, profile: { $in: profiles },
    kind: { $in: ["historicalWork", "leave"] }, date: { $gte: first, $lte: last } }).sort("_id").session(session).lean();
  const locked = await PlanningDay.find({ restaurant, lockedAt: { $type: "date" },
    date: { $gte: first, $lte: last } }).select("date").session(session).lean();
  const clocks = employees.length ? await TimeClockSession.find({ restaurant, employee: { $in: employees },
    $or: ["", "payroll.", "automaticPayroll."].map((prefix) => ({ [`${prefix}clockInAt`]: { $lt: bounds.endExclusive },
      [`${prefix}clockOutAt`]: { $gte: bounds.start } })).concat({ clockOutAt: null, clockInAt: { $lt: bounds.endExclusive } }),
  }).select("employee clockInAt clockOutAt payroll.clockInAt payroll.clockOutAt automaticPayroll.clockInAt automaticPayroll.clockOutAt reviews.type")
    .session(session).lean() : [];
  return { inputs: new Map(inputs.map((input) => [input._id, input])), locked: new Set(locked.map(({ date }) => date)), clocks };
}

function planHistory(person, link, restaurant, monthly, context) {
  const writes = [];
  const conflicts = [];
  const counts = { shifts: 0, absences: 0, duplicateHistory: 0, leaveBalances: 0, monthlySummaries: 0, ignoredHistory: 0 };
  const id = (kind, date) => dayId(restaurant, link?.profile, kind, date);
  const shifts = link?.shifts || [];
  const occupied = [...shifts, ...(link?.leaveRequests || []).filter(({ status }) => status === "approved")];
  const validatedDates = new Set();
  for (const clock of context.clocks) {
    if (String(clock.employee) !== link?.id) continue;
    for (const record of [clock, clock.payroll, clock.automaticPayroll]) {
      if (!record?.clockInAt) continue;
      occupied.push({ start: record.clockInAt, end: record.clockOutAt || new Date() });
      if (clock.reviews?.at(-1)?.type === "validated" && record.clockOutAt) {
        for (let date = toLocalDateKey(record.clockInAt); date <= toLocalDateKey(record.clockOutAt); date = addDaysToDateKey(date, 1)) {
          validatedDates.add(date);
        }
      }
    }
  }
  function skip(date, message) {
    counts.ignoredHistory++;
    if (conflicts.length < 20) conflicts.push({ date, message });
  }
  function write(kind, date, values, existing, suffix = date) {
    writes.push({ kind, date, values, suffix, revision: existing?.revision });
  }
  const protectedDate = (date) => context.locked.has(date) || validatedDates.has(date);
  const locked = ({ start, end }) => protectedDate(toLocalDateKey(start)) || protectedDate(toLocalDateKey(new Date(+new Date(end) - 1)));
  const dayEntries = new Map();
  for (const { date, row, ...entry } of person.history) {
    if (!dayEntries.has(date)) dayEntries.set(date, []);
    dayEntries.get(date).push({ ...entry, row });
  }
  const sourceConflicts = new Set();
  for (const entries of dayEntries.values()) {
    if (entries.length > 48) {
      entries.forEach(({ row }) => sourceConflicts.add(row));
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      for (let next = index + 1; next < entries.length; next++) {
        const other = entries[next];
        if (!historyIntervalConflict(entry, other)) continue;
        const { row, ...first } = entry;
        const { row: otherRow, ...second } = other;
        if (serviceKey(first) === serviceKey(second) && mergeKnown(first, second)) continue;
        sourceConflicts.add(row);
        sourceConflicts.add(otherRow);
      }
    }
  }
  const seen = new Map();
  const days = new Map();
  const historicalKey = (date) => id("historicalWork", date);
  for (const date of dayEntries.keys()) {
    const existing = context.inputs.get(historicalKey(date));
    const services = (existing?.values.services || []).slice();
    const absences = (existing?.values.absences || []).slice();
    days.set(date, { existing, services, absences, changed: false });
    for (const entry of [...services, ...absences]) seen.set(serviceKey(entry), entry);
    // Dates outside the incoming file can hold a service that crosses midnight.
    for (const adjacent of [addDaysToDateKey(date, -1), addDaysToDateKey(date, 1)]) {
      if (dayEntries.has(adjacent)) continue;
      const prior = context.inputs.get(historicalKey(adjacent));
      for (const entry of [...(prior?.values.services || []), ...(prior?.values.absences || [])]) seen.set(serviceKey(entry), entry);
    }
  }
  for (const [date, entries] of dayEntries) {
    const day = days.get(date);
    for (const { row, ...entry } of entries) {
      const key = serviceKey(entry);
      const prior = seen.get(key);
      const merged = prior && mergeKnown(prior, entry);
      if (merged && compare(prior) === compare(merged) && !sourceConflicts.has(row)) {
        counts.duplicateHistory++;
        continue;
      }
      if (sourceConflicts.has(row) || (prior && !merged) || [...seen].some(([otherKey, other]) =>
        otherKey !== key && historyIntervalConflict(entry, other))) {
        skip(date, "Service ou absence en conflit avec un autre horaire ou des valeurs source différentes.");
        continue;
      }
      if (locked(entry) || occupied.some((other) => historyIntervalConflict(entry, other)) ||
          (day.existing && day.existing.values.version !== 2)) {
        skip(date, "Planning verrouillé ou données Gusto déjà présentes sur cet horaire.");
        continue;
      }
      const target = entry.isLeave ? day.absences : day.services;
      if (prior) target[target.findIndex((other) => serviceKey(other) === key)] = merged;
      else target.push(entry);
      seen.set(key, merged || entry);
      day.changed = true;
      counts[entry.isLeave ? "absences" : "shifts"]++;
    }
  }
  for (const [date, { existing, changed, services, absences }] of days) {
    if (changed) write("historicalWork", date, { source: "skello", version: 2, services: sorted(services), absences: sorted(absences) }, existing);
  }
  for (const { kind, date, values } of person.inputs.filter(({ kind }) => kind === "leave")) {
    const existing = context.inputs.get(id(kind, date));
    if (existing) {
      if (compare(existing.values) !== compare(values)) skip(date, "Un solde de congés est déjà enregistré à cette date.");
    } else if (context.locked.has(date)) skip(date, "Solde ignoré sur une date verrouillée.");
    else {
      write(kind, date, values);
      counts.leaveBalances++;
    }
  }
  const suffix = `summary:${monthly.from}:${monthly.to}`;
  const previous = context.inputs.get(id("historicalWork", suffix));
  const values = { source: "skello", version: 2, period: monthly, summary: person.summary };
  if (previous) {
    if (compare(previous.values) !== compare(values)) skip(monthly.to, "Une synthèse différente existe pour cette période source.");
  } else if (!counts.ignoredHistory) {
    write("historicalWork", monthly.to, values, undefined, suffix);
    counts.monthlySummaries++;
  } else {
    skip(monthly.to, "Synthèse non ajoutée car la période contient des données protégées ou des lignes en conflit.");
  }
  return { writes, conflicts, counts };
}

function historicalRecords(records) {
  return (records || []).filter(({ date, values }) => isValidDateKey(date) && values?.source === "skello" && values.version === 2);
}

module.exports = { dayId, historicalRecords, historyIntervalConflict, planHistory, readHistoryContext };
