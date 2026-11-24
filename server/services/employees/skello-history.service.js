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
    else if (Object.getPrototypeOf(value) === Object.prototype && ["premiums", "contract"].includes(key)) {
      merged[key] = mergeKnown(existing[key] || {}, value);
      if (!merged[key]) return null;
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

async function readHistoryContext(restaurant, links, period, monthly, balanceDates, session) {
  const profiles = links.map(({ profile }) => profile).filter(Boolean);
  const employees = links.map(({ id }) => id).filter(Boolean);
  const from = monthly.from < period.from ? monthly.from : period.from;
  const to = monthly.to > period.to ? monthly.to : period.to;
  const first = addDaysToDateKey(from, -1);
  const last = addDaysToDateKey(to, 1);
  const bounds = getRangeBounds(first, last);
  const inputs = await PersonnelInput.find({ restaurant, profile: { $in: profiles }, $or: [
    { kind: "historicalWork", date: { $gte: first, $lte: last } },
    { kind: "variables", date: monthly.from.slice(0, 7) },
    { kind: { $in: ["leave", "contract"] } },
  ] }).sort("_id").session(session).lean();
  const locked = await PlanningDay.find({ restaurant, lockedAt: { $type: "date" },
    $or: [{ date: { $gte: first, $lte: last } }, { date: { $in: [...new Set(balanceDates)] } }] })
    .select("date").session(session).lean();
  const manualLeave = new Map();
  for (const input of inputs) {
    if (input.kind !== "leave" || input.source === "skello" || !Object.values(input.values || {}).some((value) => value != null)) continue;
    const profile = String(input.profile);
    if (!manualLeave.has(profile)) manualLeave.set(profile, []);
    manualLeave.get(profile).unshift(input.date);
  }
  const clocks = employees.length ? await TimeClockSession.find({ restaurant, employee: { $in: employees },
    $or: ["", "payroll.", "automaticPayroll."].map((prefix) => ({ [`${prefix}clockInAt`]: { $lt: bounds.endExclusive },
      [`${prefix}clockOutAt`]: { $gte: bounds.start } })).concat({ clockOutAt: null, clockInAt: { $lt: bounds.endExclusive } }),
  }).select("employee clockInAt clockOutAt payroll.clockInAt payroll.clockOutAt automaticPayroll.clockInAt automaticPayroll.clockOutAt reviews.type")
    .session(session).lean() : [];
  return { inputs: new Map(inputs.map((input) => [input._id, input])), manualLeave, locked: new Set(locked.map(({ date }) => date)), clocks };
}

function planIndividual(person, link, monthly, context, id, write) {
  const today = toLocalDateKey(new Date());
  const historical = "Période ou contrat distinct du contrat courant. Valeur réservée à la synthèse source.";
  const fields = [];
  const profileFields = {};
  const { fieldIssues = {} } = person;
  const { values: contract } = person.inputs.find(({ kind }) => kind === "contract");
  const savedContract = context.inputs.get(id("contract", "-"));
  const incompatibleDates = Boolean(
    (link?.start && person.start && link.start !== person.start) ||
    (link?.start && contract.contractEnd && contract.contractEnd < link.start) ||
    (person.start && savedContract?.values.contractEnd && person.start > savedContract.values.contractEnd),
  );
  const coversCurrentContract = !incompatibleDates && monthly.from <= today && today <= monthly.to &&
    !(person.start && person.start > today) && !(contract.contractEnd && contract.contractEnd < today) &&
    !(savedContract?.values.contractEnd && savedContract.values.contractEnd < today) && !link?.archivedAt &&
    !fieldIssues.dateOnPost && !fieldIssues.contractEnd;
  const newArchived = !link && contract.contractEnd && contract.contractEnd < today;
  const record = (field, status, value, reason, date) => fields.push({
    field, status, ...(value != null && { value }), ...(reason && { reason }), ...(date && { date }),
  });
  function useField(field, existing, value, allow, date) {
    if (existing !== null && existing !== undefined && existing !== "") {
      record(field, "preserved", existing, "Valeur déjà enregistrée dans Gusto.", date);
    } else if (value == null || value === "") {
      record(field, "ignored", field === "hourlyRate" ? person.historicalHourlyRate : null,
        fieldIssues[field] || "Valeur absente du classeur.", date);
    } else if (!allow) {
      record(field, "ignored", value, Object.hasOwn(contract, field) ? historical : "Période ou contrat distinct du contrat courant.", date);
    } else {
      record(field, "imported", value, null, date);
      return true;
    }
    return false;
  }
  const employment = link?.employment || {};
  if (link) record("identity", "preserved", null, "Identité du dossier rapproché conservée.");
  else record("identity", "imported", null, "Nouveau dossier salarié, sans création d’accès.");
  for (const [field, path, existing, incoming, allow] of [
    ["payrollCode", "employment.payrollCode", employment.payrollCode, person.identity.payrollCode, true],
    ["post", "snapshot.post", link?.post, person.post, !link || coversCurrentContract],
    ["dateOnPost", "snapshot.dateOnPost", link?.start, person.start, !link || coversCurrentContract],
    ["contractType", "employment.contractType", employment.contractType, person.type, !link || coversCurrentContract],
    ["primaryEstablishment", "employment.primaryEstablishment", employment.primaryEstablishment, person.primaryEstablishment, !link || coversCurrentContract],
  ]) {
    if (useField(field, existing, incoming, allow)) profileFields[path] = incoming;
  }
  if (employment.contractualUnit && employment.contractualUnit !== "week") {
    record("weeklyHours", "preserved", null, "Volume contractuel et unité Gusto conservés.");
  } else if (useField("weeklyHours", employment.contractualUnit === "week" ? employment.contractualValue : employment.contractualValue || null,
    person.volume, !link || coversCurrentContract)) {
    profileFields["employment.contractualValue"] = person.volume;
    profileFields["employment.contractualUnit"] = "week";
  }
  const values = { ...savedContract?.values };
  const effective = { ...savedContract?.skelloEffectiveDates };
  let changed = false;
  for (const [field, incoming] of Object.entries(contract)) {
    // The monthly gross and hourly rates observed in an old report stay on that period.
    const allow = coversCurrentContract || (newArchived && ["contractEnd", "archiveNote"].includes(field));
    if (useField(field, values[field], incoming, allow)) {
      values[field] = incoming;
      effective[field] = monthly.from;
      changed = true;
    }
  }
  if (changed) write("contract", "-", values, savedContract, "-", effective);
  const month = monthly.from.slice(0, 7);
  const savedVariables = context.inputs.get(id("variables", month));
  const variables = { ...savedVariables?.values };
  let variablesChanged = false;
  for (const field of ["bonus", "advance"]) {
    const label = `${field}Label`;
    const amountImported = useField(field, variables[field], person.variables?.[field], true, month);
    if (amountImported) {
      variables[field] = person.variables[field];
      variablesChanged = true;
    }
    if (person.variables?.[label] && !amountImported && variables[label] == null) {
      record(label, "ignored", null, "Le montant associé n’est pas repris.", month);
    } else if (useField(label, variables[label], person.variables?.[label], amountImported, month)) {
      variables[label] = person.variables[label];
      variablesChanged = true;
    }
  }
  if (variablesChanged) write("variables", month, variables, savedVariables);
  for (const [field, reason] of [
    ["annual", "Début de cycle, objectif, reprise des heures, seuil et inclusion du dimanche non établis par le rapport."],
    ["hoursEntry", "Aucun solde en heures daté ni mouvement individuel signé et identifiable."],
    ["amendment", "Les indicateurs d’avenant ne donnent pas de date d’effet et de nouveau volume contractuel vérifiables."],
    ["administrative", "Coordonnées, adresse, sécurité sociale, contact d’urgence et justificatifs absents du format."],
  ]) record(field, "ignored", null, reason);
  return { fields, profileFields };
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
  function write(kind, date, values, existing, suffix = date, skelloEffectiveDates) {
    writes.push({ kind, date, values, suffix, revision: existing?.revision, skelloEffectiveDates });
  }
  const { fields: individual, profileFields } = planIndividual(person, link, monthly, context, id, write);
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
  const balances = person.inputs.filter(({ kind }) => kind === "leave");
  if (!balances.length || person.fieldIssues.leave) individual.push({
    field: "leave", status: "ignored", reason: person.fieldIssues.leave || "Aucun solde de congés rapproché dans le classeur.",
  });
  for (const { kind, date, values } of balances) {
    const existing = context.inputs.get(id(kind, date));
    const manualDate = context.manualLeave.get(link?.profile)?.find((record) => record <= date);
    const incomplete = values.currentBalance == null || values.previousBalance == null;
    const outcome = (status, reason, shown = values) => individual.push({ field: kind, status, date, value: shown, reason });
    if (existing) {
      const merged = existing.source === "skello" && (!manualDate || manualDate > date) && mergeKnown(existing.values, values);
      if (merged && compare(merged) !== compare(existing.values) && !context.locked.has(date)) {
        write(kind, date, merged, existing);
        counts.leaveBalances++;
        outcome("imported", "Solde source complété à la même date.", merged);
      } else {
        outcome("preserved", "Solde déjà enregistré à cette date.", existing.values);
      }
    } else if (manualDate && manualDate <= date) {
      outcome("preserved", `Solde Gusto saisi au ${manualDate}, maintenu comme base du compteur.`, null);
    } else if (context.locked.has(date)) {
      outcome("ignored", "La date du solde est verrouillée.");
    } else {
      write(kind, date, values);
      counts.leaveBalances++;
      outcome("imported", incomplete ? "Solde partiel conservé dans l’historique. Il manque un solde N ou N−1 pour ouvrir le compteur."
        : date > toLocalDateKey(new Date()) ? "Solde programmé à la date indiquée." : null);
    }
  }
  const suffix = `summary:${monthly.from}:${monthly.to}`;
  const previous = context.inputs.get(id("historicalWork", suffix));
  const values = { source: "skello", version: 2, period: monthly, summary: person.summary };
  if (previous) {
    const merged = mergeKnown(previous.values.summary, values.summary);
    if (!merged) skip(monthly.to, "Une synthèse différente existe pour cette période source.");
    else if (compare(merged) !== compare(previous.values.summary) && !counts.ignoredHistory) {
      write("historicalWork", monthly.to, { ...previous.values, summary: merged }, previous, suffix);
      counts.monthlySummaries++;
    }
  } else if (!counts.ignoredHistory) {
    write("historicalWork", monthly.to, values, undefined, suffix);
    counts.monthlySummaries++;
  } else {
    skip(monthly.to, "Synthèse non ajoutée car la période contient des données protégées ou des lignes en conflit.");
  }
  return { writes, conflicts, counts, individual, profileFields };
}

function historicalRecords(records) {
  return (records || []).filter(({ date, values }) => isValidDateKey(date) && values?.source === "skello" && values.version === 2);
}

module.exports = { dayId, historicalRecords, historyIntervalConflict, planHistory, readHistoryContext };
