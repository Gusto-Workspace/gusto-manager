const { DateTime } = require("luxon");
const { packageWorkbook, renderColumnsXml, renderRowXml, columnNumberToLetters, escapeXml } = require("./render-time-clock-export-workbook.service");

const ZONE = "Europe/Paris";
const DATE_FORMAT = 3;
const DECIMAL_FORMAT = 4;
const TIME_FORMAT = 5;
const MAX_DETAIL_ROWS = 40_000;
const LIMIT = "Les cellules vides indiquent une donnée indisponible ou non applicable. Avec la source Pointages validés, seuls les services validés figurent dans les heures travaillées retenues. Le total hebdomadaire est laissé vide si la semaine reste à valider.";

function numberCell(value, style) {
  return Number.isFinite(value) ? { type: "Number", value, style } : null;
}

function dateCell(date) {
  if (!date) return null;
  const milliseconds = Date.parse(`${date}T00:00:00Z`);
  return numberCell(milliseconds / 86_400_000 + 25569, DATE_FORMAT);
}

function timeCell(value) {
  if (!value) return null;
  const date = DateTime.fromJSDate(new Date(value), { zone: ZONE });
  return numberCell((date.hour * 60 + date.minute + date.second / 60) / 1440, TIME_FORMAT);
}

function cell(value, type) {
  switch (type) {
    case "date": return dateCell(value);
    case "minutes": return value == null ? null : numberCell(value / 60, DECIMAL_FORMAT);
    case "hours": case "number": return numberCell(value);
    default: return value ?? null;
  }
}

function renderSheet(sheet) {
  const columns = sheet.widths.map((width, index) => ({ index: index + 1, width }));
  const pane = sheet.freeze
    ? `<pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : "";
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((range) => `<mergeCell ref="${escapeXml(range)}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
${renderColumnsXml(columns)}
<sheetData>${sheet.rows.map(({ cells, style }, index) => renderRowXml(cells, index + 1, style, style === 1 ? 38 : null)).join("")}</sheetData>
${sheet.filter ? `<autoFilter ref="${sheet.filter}"/>` : ""}${merges}
</worksheet>`;
}

const title = (...cells) => ({ cells, style: 2 });
const header = (cells) => ({ cells, style: 1 });
const line = (cells) => ({ cells, style: 0 });
const descriptor = (key, label, type = "text") => ({ key, label, type });
const periodName = (report) => `${report.from.slice(5).split("-").reverse().join("-")} - ${report.to.slice(5).split("-").reverse().join("-")}`;
const dateInRange = (date, report) => report.from <= date && date <= report.to;

function premiumLabel(report, { key, label }) {
  const rule = report.exportRules?.length === 1 ? report.exportRules[0] : null;
  if (!rule) return label;
  const rate = Number(key.match(/\d+$/)?.[0]);
  if (key === `night${rate}`) return rule.planningAttribution
    ? `Heures de Nuit (${rate.toFixed(1)}%) (de ${rule.nightStart}h à ${rule.nightEnd}h)`
    : `Heures de nuit ${rate}% (${rule.nightStart}–${rule.nightEnd})`;
  if (key === `sunday${rate}`) return `Heures du dimanche ${rate}% (de 00:00h à 24:00h)`;
  if (key.startsWith("holidays")) return rule.holidayRate == null ? "Heures Jour Férié (h)" : label;
  if (key.startsWith("complement") && rule.complementFirstRate !== rule.complementLastRate) {
    const sign = rate === rule.complementFirstRate ? "<" : ">";
    const portion = rule.complementBand === 10 ? "1/10" : `${rule.complementBand}%`;
    return `Dont Heures Comp. ${rate}% (${sign} ${portion} vol. hebdo)`;
  }
  const bands = [rule.firstRate, rule.secondRate, rule.lastRate];
  if (Number.isFinite(rate) && new Set(bands).size === bands.length) {
    const index = bands.indexOf(rate);
    const boundaries = [rule.ordinary, rule.firstEnd, rule.secondEnd];
    const qualifier = index === 2 ? `au-delà de ${boundaries[2]}h` : `de ${boundaries[index]}h à ${boundaries[index + 1]}h`;
    if (key.startsWith("extra")) return `Dont Heures Supp. Exceptionnelles ${rate}% (${qualifier})`;
    if (key.startsWith("structural")) return `Dont Heures Supp. Structurelles ${rate}% (${qualifier})`;
  }
  return label;
}

function mealCostLabel(report) {
  return report.mealAmounts?.length === 1 ? `Montant Repas Pris (${report.mealAmounts[0].toFixed(2).replace(/0$/, "")}€/repas)` : "Montant Repas Pris (€)";
}

function premiumGroup(report) {
  return report.groups.find(({ id }) => id === "premium").columns.map((column) =>
    ({ ...column, label: premiumLabel(report, column) }));
}

function specialPremiumKey(column) {
  return /^(holidays|night|sunday)/.test(column.key);
}

function buildSummary(report) {
  const groups = new Map(report.groups.map((group) => [group.id, group]));
  const byKey = new Map([...report.hoursColumns, ...report.groups.flatMap(({ columns }) => columns)].map((col) => [col.key, col]));
  const premiumColumns = premiumGroup(report);
  function order(columns, first) {
    return [...columns].sort((a, b) => first.findIndex((key) => a.key.startsWith(key)) -
      first.findIndex((key) => b.key.startsWith(key)));
  }
  const closedWeeks = report.weeks.filter(({ to }) => to <= report.to);
  const exportWeeks = closedWeeks.length ? closedWeeks : report.weeks;
  const sections = [
    { label: "Salariés", columns: [descriptor("lastname", "Nom"), descriptor("firstname", "Prénom"),
      descriptor("weeklyHours", "Volume Horaire Hebdomadaire (h)*", "hours")] },
    { ...groups.get("contract"), columns: groups.get("contract").columns.map((column) =>
      column.key === "post" ? { ...column, label: "Intitulé Poste" } : column) },
    groups.get("salary"),
    { ...groups.get("time"), label: "Heures travaillées et dépassements", columns: [descriptor("referenceDays", "Jours Travaillés (j)", "number"),
      descriptor("referenceWorked", "Heures travaillées retenues (h)", "minutes"), descriptor("referencePause", "Total pause (h)", "minutes"),
      ...(byKey.has("counterStart") ? [byKey.get("counterStart")] : []),
      ...exportWeeks.map(({ key, label }) => ({ ...byKey.get(key), label: byKey.has("counterStart")
        ? `${label} (Variation compteur)` : `${label} (Heures supp./compl.)` })),
      ...["counterEnd", "counterChanges", "recoveryBalance"].map((key) => byKey.get(key)).filter(Boolean),
      { ...byKey.get("normalHours"), label: "Heures normales (h)" }, descriptor("exceptional", "Heures Supp/Comp Exceptionnelles (h)", "minutes")] },
    { label: "Détail Heures Sup/Comp Majorées Période", columns: order(premiumColumns.filter((col) => !specialPremiumKey(col)), ["extra", "complement", "structural"]) },
    ...(premiumColumns.some(specialPremiumKey) ? [{ label: "Heures Majorées", columns: order(premiumColumns.filter(specialPremiumKey), ["holidays", "night", "sunday"]) }] : []),
    { ...groups.get("compensation"), columns: [byKey.get("bonus"), descriptor("bonusLabel", "Description des Primes"),
      byKey.get("advance"), descriptor("advanceLabel", "Description des Avances"), descriptor("mealCost", mealCostLabel(report), "number"),
      byKey.get("benefits"), byKey.get("mealsDue"), byKey.get("compensation"), { ...byKey.get("transport"), label: "Coût Transport Employeur (€)" },
      ...["mealTickets", "basket"].map((key) => byKey.get(key)).filter(Boolean)] },
    { ...groups.get("absence"), columns: [...groups.get("absence").columns, ...report.absenceDetailColumns
      .filter(({ key }) => !groups.get("absence").columns.some((col) => col.key === key))] },
    ...(groups.has("annual") ? [groups.get("annual")] : []),
  ];
  const columns = sections.flatMap(({ columns }) => columns);
  const groupNames = [];
  const merges = [];
  let start = 1;
  for (const section of sections) {
    groupNames[start - 1] = section.label;
    const end = start + section.columns.length - 1;
    if (start < end) merges.push(`${columnNumberToLetters(start)}2:${columnNumberToLetters(end)}2`);
    start = end + 1;
  }
  const rows = [title("Rapport RH", report.restaurant, "Du", dateCell(report.from), "Au", dateCell(report.to)),
    header(groupNames), header(columns.map(({ label }) => label))];
  for (const row of report.rows) {
    rows.push(line(columns.map(({ key, type }) => cell(row.values[key] ?? row.employee[key], type))));
  }
  rows.push(line([]), line([LIMIT]));
  return { name: periodName(report), rows, merges, freeze: 3, widths: columns.map(({ label }) => Math.min(36, Math.max(15, label.length + 2))) };
}

const FICHE_DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE });
const PERIOD_DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "UTC" });

function absenceSummary(entries) {
  const groups = [];
  const previousByType = new Map();
  for (const absence of entries) {
    if (absence.type === "weekly_rest") continue;
    const previous = previousByType.get(absence.type);
    const nextDate = previous && DateTime.fromISO(previous.endDate, { zone: ZONE }).plus({ days: 1 }).toISODate();
    const mergeable = previous?.unit === absence.unit &&
      (absence.unit === "full" || (absence.type === "sick_leave" && absence.unit === "custom"));
    if (mergeable && nextDate === absence.startDate) {
      previous.endDate = absence.endDate;
      previous.days += absence.days ?? 1;
      if (absence.payrollMinutes != null) previous.payrollMinutes = (previous.payrollMinutes ?? 0) + absence.payrollMinutes;
    } else {
      const entry = { ...absence, days: absence.days ?? (absence.type === "sick_leave" && absence.unit === "custom" ? 1 : null) };
      groups.push(entry);
      previousByType.set(absence.type, entry);
    }
  }
  return groups;
}

function appendEmployeeSheet(sheet, report, item, items, premiums, specialHeaders) {
  const { employee, values, weeklyHours } = item;
  const detailColumns = ["Date", "Poste", "Matricule de paie", "Type de contrat", "Volume horaire (h)", "Établissement",
    "Début", "Fin", "Pause (h)", "Retard (h)", "Note", "Heures Travaillées de la période (h)", "Jours Travaillés (j)",
    "Absences indemnisées par l’employeur (h)", "Absences indemnisées par un tiers (h)", "Absences non indemnisées (h)",
    "Avenants (Type)", "Avenants (Heures en +)"];
  const compensation = ["Primes (€)", "Description des Primes", "Avances (€)", "Description des Avances",
    mealCostLabel(report), "Repas Dûs", "Avantages Nature", "Indemnités Compensatrices", "Coût Transport Employeur (€)"];
  const segments = [["Détail Planning", detailColumns.slice(0, 11)], ["Heures Planning Période", detailColumns.slice(11)],
    ["Total Heures Sup/Comp Majorées Période", premiums.map(({ label }) => label)],
    ["Autres Heures Majorées ou Compensées", specialHeaders], ["Éléments de Rémunération", compensation]];
  sheet.rows.push(line([]), title(`${employee.firstname} ${employee.lastname}`.trim()));
  const group = [];
  let offset = 1;
  for (const [label, columns] of segments) {
    if (!columns.length) continue;
    group[offset - 1] = label;
    if (columns.length > 1) sheet.merges.push(`${columnNumberToLetters(offset)}${sheet.rows.length + 1}:${columnNumberToLetters(offset + columns.length - 1)}${sheet.rows.length + 1}`);
    offset += columns.length;
  }
  const columns = segments.flatMap(([, part]) => part);
  sheet.widths = columns.map((label) => Math.max(15, Math.min(38, label.length + 2)));
  sheet.rows.push(header(group), header(columns));
  const period = [report.from, report.to].map((date) => PERIOD_DATE.format(new Date(date))).join("–");
  sheet.rows.push(title(`Total Période (${period})`, null, null, null, null, null, null, null, cell(values.referencePause, "minutes"),
    cell(values.late, "minutes"), null, cell(values.referenceWorked, "minutes"), numberCell(values.referenceDays),
    null, null, null, null, null, ...premiums.map(({ key }) => cell(values[key], "minutes")),
    ...["holidays", "night", "sunday"].map((key) => cell(values[key], "minutes")),
    numberCell(values.bonus), values.bonusLabel, numberCell(values.advance), values.advanceLabel, numberCell(values.mealCost),
    numberCell(values.mealsDue), numberCell(values.benefits), numberCell(values.compensation), numberCell(values.transport)));
  for (const week of report.weeks) {
    const hours = weeklyHours[week.key];
    const weekItems = items.filter(({ date }) => date >= week.from && date <= week.to);
    if (!weekItems.length && !hours) continue;
    const weekRow = [`Semaine ${week.label.slice(1)} · Heures retenues, absences comprises`, values.post, values.payrollCode,
      values.contractType, numberCell(values.weeklyHours)];
    weekRow[11] = cell(hours?.retainedWeek, "minutes");
    sheet.rows.push(title(...weekRow));
    for (const { date, cells } of weekItems) {
      sheet.rows.push(line([
        FICHE_DATE.format(new Date(`${date}T12:00:00Z`)), cells[10], cells[2], cells[3], cells[4], cells[11],
        ...cells.slice(12, 24), ...premiums.map(() => null), cells[24], cells[25], cells[26],
        null, null, null, null, cells[27], cells[29], cells[28],
      ]));
    }
  }
}

function buildDetails(report) {
  const premiums = premiumGroup(report);
  const specialHeaders = [["holidays", "Heures Jour Férié (h)"], ["night", "Heures de Nuit (h)"], ["sunday", "Heures du dimanche (h)"]]
    .map(([key, fallback]) => premiums.find((column) => column.key.startsWith(key) && !column.unavailable)?.label || fallback);
  const detailHeaders = ["Prénom", "Nom", "Matricule de paie", "Type de contrat", "Temps contractuel", "Heures / jours", "Établissement principal",
    "N° semaine", "Date", "Travail / Absence", "Nom du poste / type d’absence", "Shift / absence effectué à",
    "Début", "Fin", "Pause (h)", "Retard (h)", "Note", "Heures Travaillées (h)", "Jours Travaillés (j)",
    "Absences indemnisées par l’employeur (h)", "Absences indemnisées par un tiers (h)", "Absences non indemnisées (h)",
    "Avenant (Type)", "Avenant (h en+/-)", ...specialHeaders, mealCostLabel(report), "Avantages Nature", "Repas Dûs"];
  const rows = [header(detailHeaders)];
  const employeeSheet = { name: "Fiche employés", rows: [title("Fiche employés", report.restaurant)], widths: [25], merges: [], freeze: 1 };
  const hasHistoricalLate = report.rows.some((item) => item.tardiness?.some(({ source }) => source === "skello"));
  const absenceHeaders = ["Nom", "Prénom", "Matricule de paie", "Type absence", "Date de début", "Date de fin", "Nb heures", "Nb jours"];
  if (hasHistoricalLate) absenceHeaders.push("Source du retard");
  const absenceRows = [header(absenceHeaders)];
  const hours = (value) => cell(value, "minutes");
  const week = (date) => numberCell(DateTime.fromISO(date, { zone: ZONE }).weekNumber);

  for (const item of report.rows) {
    const { employee, values } = item;
    const items = [];
    const lateByShift = new Map((item.tardiness || []).map((record) => [record.shiftId, record]));
    const displayedLate = new Set();
    const collect = ({ date, type, subject, start, end, pause, note, worked, workedDay, late, payer, absenceMinutes, amendment, change, premium, meal, volume }) => {
      items.push({ date, start, cells: [employee.firstname, employee.lastname, values.payrollCode,
        values.contractType, numberCell(volume ?? values.weeklyHours ?? values.monthlyHours),
        volume || values.weeklyHours ? "h / semaine" : values.monthlyHours ? "h / mois" : null,
        item.establishment || report.restaurant, week(date), dateCell(date), type, subject, report.restaurant,
        timeCell(start), timeCell(end), hours(pause), hours(late), note, hours(worked), numberCell(workedDay),
        ...["employer", "thirdParty", "unpaid"].map((value) => payer === value ? hours(absenceMinutes) : null),
        amendment, numberCell(change), hours(premium?.holidays), hours(dateInRange(date, report) ? premium?.night : null), hours(premium?.sunday),
        numberCell(meal?.cost), numberCell(meal?.taken), numberCell(meal?.basis === "monthly" ? meal?.protectedMeals : meal?.due)] });
    };
    const mealsByDate = new Map((item.detailMeals || item.mealDays || []).filter((meal) => meal.due || meal.taken != null).map((meal) => [meal.date, meal]));
    for (const day of item.days || []) {
      const worked = day.effective ?? day.shifts.filter((shift) => !shift.absenceValidated).map((shift) => ({ id: shift.id,
        timings: { startAt: shift.start, endAt: shift.end, breakMinutes: shift.breakMinutes, workedMinutes: shift.plannedMinutes } }));
      worked.forEach(({ id, timings, note }, index) => {
        const session = day.sessions.find((entry) => entry.id === id);
        const shift = day.shifts.find((entry) => entry.id === (session?.shiftId || id));
        const record = lateByShift.get(shift?.id);
        const lateness = record?.date === day.date && !displayedLate.has(record.shiftId) ? record : null;
        if (lateness) displayedLate.add(lateness.shiftId);
        const details = [note?.text || shift?.note?.text, lateness?.source === "skello" && "Retard historique (Skello)"]
          .filter(Boolean).join(" · ");
        collect({ date: day.date, type: "Travail", subject: shift?.position || employee.post,
          start: timings.startAt, end: timings.endAt, pause: timings.breakMinutes, late: lateness?.minutes,
          note: details, worked: timings.workedMinutes, workedDay: 1 / worked.length,
          premium: day.premium?.shiftPremiums?.[id],
          meal: index === worked.length - 1 ? mealsByDate.get(day.date) : null, volume: day.volume });
      });
      if (worked.length) mealsByDate.delete(day.date);
    }
    for (const absence of item.scheduleAbsences || item.absences || []) {
      const meal = mealsByDate.get(absence.startDate);
      collect({ date: absence.startDate, type: "Absence", subject: absence.label, start: absence.start,
        end: absence.end, note: absence.note, payer: absence.payer, absenceMinutes: absence.payrollMinutes, meal });
      if (meal) mealsByDate.delete(absence.startDate);
    }
    for (const absence of absenceSummary(item.absences || [])) {
      absenceRows.push(line([employee.lastname, employee.firstname, values.payrollCode, absence.label,
        dateCell(absence.startDate), dateCell(absence.endDate), hours(absence.payrollMinutes ?? absence.minutes), numberCell(absence.days)]));
    }
    for (const { date, minutes, source } of lateByShift.values()) {
      if (!minutes || !dateInRange(date, report)) continue;
      absenceRows.push(line([employee.lastname, employee.firstname, values.payrollCode, "Retard",
        dateCell(date), dateCell(date), hours(minutes), numberCell(1),
        ...(hasHistoricalLate ? [source === "skello" ? "Historique Skello" : "Pointage validé"] : [])]));
    }
    for (const meal of mealsByDate.values()) collect({ date: meal.date, type: "Repas", meal });
    for (const version of item.amendments || []) collect({ date: version.date, type: "Avenant",
      amendment: version.label || "Modification du volume horaire", change: version.delta, volume: version.weeklyHours });
    items.sort((first, second) => first.date.localeCompare(second.date) || +new Date(first.start) - +new Date(second.start));
    if (rows.length + items.length > MAX_DETAIL_ROWS) {
      const error = new Error("Report details exceed the export limit");
      error.reportLimit = true;
      throw error;
    }
    appendEmployeeSheet(employeeSheet, report, item, items,
      premiums.filter(({ key }) => /^(extra|complement)\d+$/.test(key)).sort((a, b) => Number(a.key.startsWith("complement")) - Number(b.key.startsWith("complement"))),
      specialHeaders);
    rows.push(...items.map(({ cells }) => line(cells)));
  }
  const widths = detailHeaders.map((label) => Math.min(38, Math.max(15, label.length + 2)));
  if (hasHistoricalLate) {
    widths[detailHeaders.indexOf("Note")] = 28;
    employeeSheet.widths[10] = 28;
  }
  return [
    employeeSheet,
    { name: "Détails", rows, widths, freeze: 1, filter: `A1:${columnNumberToLetters(detailHeaders.length)}${rows.length}` },
    { name: "Absences Employés", rows: absenceRows, widths: [25, 23, 19, 28, 17, 17, 13, 13, ...(hasHistoricalLate ? [22] : [])],
      freeze: 1, filter: `A1:${columnNumberToLetters(absenceHeaders.length)}${absenceRows.length}` },
  ];
}

function buildLeaveBalance(report) {
  const columns = ["Nom", "Prénom", "Matricule de paie", "N-1 : Congés payés acquis", "N-1 : Congés payés posés",
    "N-1 : Solde de congés payés", "N : Congés payés acquis", "N : Congés payés posés", "N : Solde des congés payés", "Congés disponibles", "Congés futurs planifiés", "Source du solde"];
  const statuses = { automatic: "Calcul automatique", needsOpening: "Solde d’ouverture requis", missingContract: "Date de prise de poste manquante", unknownDuration: "Durée d’absence à compléter" };
  return {
    name: "Solde Congés",
    widths: columns.map((label) => Math.max(17, label.length + 2)),
    freeze: 1,
    rows: [header(columns), ...report.rows.map(({ employee, values, leaveBalance, leaveStatus }) => line([
      employee.lastname, employee.firstname, values.payrollCode,
      ...["previousAcquired", "previousUsed", "previousBalance", "currentAcquired", "currentUsed", "currentBalance", "leaveAvailable", "scheduled"]
        .map((key) => numberCell(leaveBalance?.[key])), statuses[leaveStatus] || (leaveBalance ? "Saisie datée" : "Compteur indisponible"),
    ])), line([]), line(["Soldes saisis dans la fiche salarié si le compteur automatique est désactivé."])],
  };
}

function buildPersonnelReportWorkbook(report) {
  const sheets = [buildSummary(report), ...buildDetails(report), buildLeaveBalance(report)];
  return packageWorkbook(sheets, renderSheet);
}

module.exports = { buildPersonnelReportWorkbook };
