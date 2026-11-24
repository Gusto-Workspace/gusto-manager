const { DateTime } = require("luxon");
const { parseXlsxSheets } = require("../dish-card-import.service");
const { plannedMinutes, readWorkDetails } = require("./planning-shift.service");
const { validateValues } = require("./personnel-report-pay.service");

const zone = "Europe/Paris";
const text = (value) => String(value ?? "").trim();
const key = (value) => text(value).normalize("NFKD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ");
const rounded = (value) => Math.round(value * 100) / 100;
const validNumber = (value) => typeof value === "number" && Number.isFinite(value);
const present = (value) => !["", "-", "—"].includes(text(value));
const workbookEpoch = DateTime.utc(1899, 12, 30);
const absences = new Map([
  ["repos hebdomadaire", ["weekly_rest", "Repos hebdomadaire"]],
  ["conge paye", ["paid_leave", "Congé payé"]],
  ["conge sans solde", ["unpaid_leave", "Congé sans solde"]],
  ["ecole - cfa", ["apprenticeship", "École - CFA"]],
  ["arret maladie", ["sick_leave", "Arrêt maladie"]],
  ["repos compensateur", ["compensatory_rest", "Repos compensateur"]],
  ["jour ferie", ["public_holiday", "Jour férié"]],
  ["rtt", ["rtt", "RTT"]],
]);
const contracts = new Map([
  ["cdi", "CDI"], ["cdd", "CDD"], ["extra", "Extra"], ["apprenti", "Apprenti"],
  ["alternance", "Alternance"], ["stage", "Stage"], ["interim", "Intérim"],
  ["saisonnier", "Saisonnier"], ["contrat professionnel", "Contrat professionnel"],
]);
const premiumNames = {
  complement: "Heures complémentaires", extra: "Heures supplémentaires exceptionnelles",
  structural: "Heures supplémentaires structurelles", night: "Heures de nuit", sunday: "Heures du dimanche",
  holiday: "Heures fériées", premiums: "Heures majorées", normal: "Heures normales",
};

function premiumLabel(field) {
  const [kind, rate] = field.split(":");
  return `${premiumNames[kind]}${rate ? ` ${rate} %` : ""}`;
}

function sourcePremiums(read, row, columns) {
  const values = {};
  for (const column of columns) {
    const title = key(column).replace(/^(dont|total) /, "");
    const prefix = /^(heures (?:comp\.|complementaires|supp\. exceptionnelles|supp\. structurelles|supplementaires exceptionnelles|supplementaires structurelles|de nuit|du dimanche|j\. feries?|jours? feries?|feriees|majorees|normales))(?=\s|$)/.exec(title)?.[1];
    if (!prefix) continue;
    const names = ["comp", "exceptionnelles", "structurelles", "nuit", "dimanche", "feri", "majorees", "normales"];
    const kind = Object.keys(premiumNames)[names.findIndex((name) => prefix.includes(name))];
    const rate = /(?:^|[ (])(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(title)?.[1]?.replace(",", ".");
    const hours = read(row, key(column));
    if (kind && validNumber(hours) && hours >= 0 && hours <= 1512) values[rate == null ? kind : `${kind}:${+rate}`] = Math.round(hours * 60);
  }
  return values;
}

function sourceNumber(read, row, columns, limit, scale = 1) {
  for (const column of columns) {
    const number = read(row, column);
    if (validNumber(number) && number >= 0 && number <= limit) return scale === 60 ? Math.round(number * scale) : rounded(number);
  }
  return null;
}
const knownPosts = new Map([
  "Serveur", "Serveuse", "Dessert Plonge", "Chef de rang", "Commis de cuisine", "Chef Cuisinier",
  "Barman", "Barmaid", "Chef de partie", "Apprenti mineur salle", "Direction", "Cuisinier", "Plongeur",
].map((value) => [key(value), value]));
const weekdaysAndMonths = /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) (\d{1,2}) ([a-z]+)$/;
const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
  "septembre", "octobre", "novembre", "decembre"];

class SkelloImportError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function dateOnly(value) {
  if (validNumber(value) && value >= 61 && value < 110000) {
    return workbookEpoch.plus({ days: Math.floor(value) }).toISODate();
  }
  const input = text(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(input);
  const iso = match ? `${match[3].length === 2 ? "20" : ""}${match[3]}-${match[2]}-${match[1]}` : input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return DateTime.fromISO(iso, { zone }).toISODate();
}

function wallTime(value) {
  if (validNumber(value) && value >= 0 && value < 110000) {
    const seconds = Math.round((value % 1) * 86400);
    return DateTime.fromMillis(seconds * 1000, { zone: "UTC" }).toFormat("HH:mm:ss");
  }
  const match = /^(\d{1,2})[h:](\d{2})(?::(\d{2}))?$/.exec(key(value));
  if (match && +match[1] < 24 && +match[2] < 60 && +(match[3] || 0) < 60) {
    return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
  }
  return null;
}

function interval(startValue, endValue, date) {
  const startTime = wallTime(startValue);
  const endTime = wallTime(endValue);
  if (!startTime || !endTime) return null;
  const fullDate = (value) => (validNumber(value) && value >= 61 ? dateOnly(value) : null);
  const startDate = fullDate(startValue) || date;
  const nextDate = DateTime.fromISO(date, { zone }).plus({ days: 1 }).toISODate();
  const endDate = fullDate(endValue) || (endTime <= startTime ? nextDate : date);
  const start = DateTime.fromISO(`${startDate}T${startTime}`, { zone });
  const end = DateTime.fromISO(`${endDate}T${endTime}`, { zone });
  if (startDate !== date || !start.isValid || !end.isValid ||
      start.toFormat("HH:mm:ss") !== startTime || end.toFormat("HH:mm:ss") !== endTime ||
      start.getPossibleOffsets().length !== 1 || end.getPossibleOffsets().length !== 1 ||
      end <= start || end.diff(start, "hours").hours > 24) return null;
  return { start: start.toJSDate(), end: end.toJSDate() };
}

function schemaFor(row) {
  const columns = new Map(row.map((name, index) => [key(name), index]));
  return (record, name) => record[columns.get(name)];
}

function findHeader(rows, required) {
  const index = rows.findIndex((row) => required.every((name) => row.some((cell) => key(cell) === name)));
  if (index < 0) throw new SkelloImportError("Les en-têtes du rapport RH Skello sont incomplets.");
  return { read: schemaFor(rows[index]), header: rows[index], rows: rows.slice(index + 1), firstRow: index + 2 };
}

function identity(firstname, lastname, payrollCode) {
  if (!present(firstname) || !present(lastname)) return null;
  return { name: JSON.stringify([key(firstname), key(lastname)]), code: present(payrollCode) ? key(payrollCode) : null };
}

function clockEvidence(ficheRows, from, to) {
  const index = ficheRows.findIndex((row, rowIndex) => [6, 7, 8].every((column) => key(row[column]) === "detail planning") &&
    ["debut", "fin", "pause (h)"].every((label, column) => key(ficheRows[rowIndex + 1]?.[column + 6]) === label));
  if (index < 0) throw new SkelloImportError("L’onglet Fiche employés doit identifier les horaires du Détail Planning.");
  const calendar = new Map();
  for (let date = DateTime.fromISO(from, { zone }); date.toISODate() <= to; date = date.plus({ days: 1 })) {
    calendar.set(`${date.day}:${months[date.month - 1]}`, date.toISODate());
  }
  const rows = new Map();
  for (const row of ficheRows) {
    const day = weekdaysAndMonths.exec(key(row[0]));
    const date = day && calendar.get(`${Number(day[1])}:${day[2]}`);
    const start = wallTime(row[6]);
    const end = wallTime(row[7]);
    if (!date || !start || !end || !validNumber(row[8])) continue;
    const fingerprint = [date, start, end, row[8], key(row[1])].join("|");
    rows.set(fingerprint, (rows.get(fingerprint) || 0) + 1);
  }
  return rows;
}

function monthRanges(sheets, fiche) {
  const source = fiche.rows.flatMap((row) => row.slice(0, 1)).map(text)
    .map((value) => /total\s+période\s*\((\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})\)/i.exec(value))
    .filter(Boolean);
  const ranges = new Map(source.map((match) => [match[0], { from: dateOnly(match[1]), to: dateOnly(match[2]) }]));
  const monthly = [...ranges.values()][0];
  if (ranges.size !== 1 || !monthly.from || !monthly.to || monthly.to < monthly.from) {
    throw new SkelloImportError("La période exacte doit apparaître dans le total de la Fiche employés.");
  }
  const from = DateTime.fromISO(monthly.from, { zone });
  const to = DateTime.fromISO(monthly.to, { zone });
  if (to.diff(from, "days").days > 62) throw new SkelloImportError("Sélectionnez un export Skello couvrant au plus 63 jours.");
  const summary = sheets.find(({ name }) => key(name) === `${from.toFormat("dd-MM")} - ${to.toFormat("dd-MM")}`);
  if (!summary) throw new SkelloImportError("La synthèse datée ne correspond pas à la période de la Fiche employés.");
  const first = from.startOf("week");
  const last = to.endOf("week");
  const weeks = [];
  for (let week = first; week <= last; week = week.plus({ weeks: 1 })) weeks.push({ year: week.weekYear, week: week.weekNumber });
  return { monthly, complete: { from: first.toISODate(), to: last.toISODate() }, summary, weeks };
}

function translateAbsence(label, start, end, date) {
  const type = absences.get(key(label));
  if (!type) return null;
  if (key(start) === "toute la journee" && !present(end)) {
    const day = DateTime.fromISO(date, { zone });
    return { start: day.toJSDate(), end: day.set({ hour: 23, minute: 59 }).toJSDate(), title: "",
      isLeave: true, absenceType: type[0], absenceDuration: "full" };
  }
  const range = interval(start, end, date);
  return range && { ...range, title: "", isLeave: true, absenceType: type[0], absenceDuration: "custom" };
}

function leaveValues(read, row) {
  const currentBalance = validNumber(read(row, "n : solde des conges payes"))
    ? "n : solde des conges payes" : "n : solde de conges payes";
  return Object.fromEntries([
    ["previousAcquired", "n-1 : conges payes acquis"], ["previousUsed", "n-1 : conges payes poses"],
    ["previousBalance", "n-1 : solde de conges payes"], ["currentAcquired", "n : conges payes acquis"],
    ["currentUsed", "n : conges payes poses"], ["currentBalance", currentBalance],
    ["leaveAvailable", "conges disponibles"],
  ].map(([name, source]) => {
    const raw = read(row, source);
    const checked = validNumber(raw) && validateValues("leave", { [name]: rounded(raw) });
    return [name, checked ? checked[name] : null];
  }));
}

function analyzeSkelloWorkbook(buffer, scope = "weeks", { workforce = false } = {}) {
  if (!["weeks", "month"].includes(scope)) throw new SkelloImportError("Choisissez une période d’import.");
  let sheets;
  try {
    sheets = parseXlsxSheets(buffer, { storedValuesOnly: true });
  } catch {
    throw new SkelloImportError("Classeur XLSX illisible ou non pris en charge. Utilisez l’export Excel Skello d’origine, en valeurs.");
  }
  const sheet = (name) => sheets.find((entry) => key(entry.name) === name);
  const fiche = sheet("fiche employes");
  const details = sheet("details");
  if (!fiche || !details) throw new SkelloImportError("Le classeur doit contenir « Fiche employés » et « Détails ».");
  if (details.rows.length > 15000) throw new SkelloImportError("Le classeur dépasse 15 000 lignes de détail.");
  const { monthly, complete, summary, weeks } = monthRanges(sheets, fiche);
  const period = scope === "month" ? monthly : complete;
  const evidence = clockEvidence(fiche.rows, complete.from, complete.to);
  const roster = findHeader(summary.rows, ["prenom", "nom", "type de contrat", "volume horaire hebdomadaire (h)*"]);
  const daySections = workforce ? summary.rows.flatMap((row, index) =>
    row.some((cell) => key(cell) === "nombre de jour contrat (j)") &&
      ["prenom", "nom", "type de contrat"].every((label) => row.some((cell) => key(cell) === label)) ? [index] : []) : [];
  const rosterRows = [
    ...roster.rows.slice(0, daySections.length ? daySections[0] - roster.firstRow + 1 : roster.rows.length)
      .map((row, index) => ({ row, read: roster.read, header: roster.header, rowNumber: roster.firstRow + index, inDays: false })),
    ...daySections.flatMap((headerIndex, index) => {
      const header = summary.rows[headerIndex];
      const read = schemaFor(header);
      return summary.rows.slice(headerIndex + 1, daySections[index + 1])
        .map((row, offset) => ({ row, read, header, rowNumber: headerIndex + offset + 2, inDays: true }));
    }),
  ];
  const detail = findHeader(details.rows, ["prenom", "nom", "date", "travail / absence", "debut", "fin", "pause (h)"]);
  const monthlyAbsences = sheet("absences employes");
  const balances = sheet("solde conges");
  const people = [];
  const byCode = new Map();
  const byName = new Map();
  const postAliases = new Map();
  const issues = new Map();
  let conflicts = 0;
  const note = (reason, row, conflict = false) => {
    const issue = issues.get(reason) || { reason, count: 0, rows: [] };
    if (row && issue.rows.length < 8) issue.rows.push(row);
    issue.count++;
    issues.set(reason, issue);
    if (conflict) conflicts++;
  };
  function safePost(post) {
    const normalized = key(post);
    if (!present(post)) return "";
    if (knownPosts.has(normalized)) return knownPosts.get(normalized);
    if (!postAliases.has(normalized)) postAliases.set(normalized, `Poste de test ${postAliases.size + 1}`);
    return postAliases.get(normalized);
  }
  function findPerson(read, row) {
    const source = identity(read(row, "prenom"), read(row, "nom"), read(row, "matricule de paie"));
    if (!source) return null;
    if (source.code && byCode.has(source.code)) {
      const person = byCode.get(source.code);
      return person.source.name === source.name ? person : null;
    }
    const names = byName.get(source.name) || [];
    return names.length === 1 && (!source.code || !names[0].source.code) ? names[0] : null;
  }
  const monthlyTotals = { worked: 0, pause: 0, days: 0 };
  for (const { row, read, header, rowNumber, inDays } of rosterRows) {
    const type = contracts.get(key(read(row, "type de contrat")));
    const volume = inDays ? null : read(row, "volume horaire hebdomadaire (h)*");
    const source = identity(read(row, "prenom"), read(row, "nom"), read(row, "matricule de paie"));
    if (!source || !type || (!inDays && (!validNumber(volume) || volume <= 0 || volume > 168))) {
      if (source && (type || present(volume))) note("Contrat ou volume hors du format reconnu", rowNumber, true);
      continue;
    }
    if (source.code && byCode.has(source.code)) {
      note("Matricule en double dans la synthèse", rowNumber, true);
      continue;
    }
    const number = (name) => validNumber(read(row, name)) ? rounded(read(row, name)) : null;
    const start = dateOnly(read(row, "date de debut de contrat"));
    const end = dateOnly(read(row, "date de fin de contrat"));
    const contract = validateValues("contract", { contractEnd: end,
      monthlyContractHours: workforce ? null : number("volume horaire mensuel (h)"),
      hourlyRate: workforce ? null : number("taux horaire brut moyen (€)"),
      grossSalary: workforce ? null : number("salaire mensuel brut (€)") });
    if (!contract || (start && end && end < start)) {
      note("Données contractuelles incompatibles", rowNumber, true);
      continue;
    }
    const person = { source, order: people.length + 1, type, volume, start,
      post: workforce ? text(read(row, "intitule poste")).slice(0, 120) : safePost(read(row, "intitule poste")),
      contract, shifts: [], inputs: [], meals: new Map() };
    if (workforce) {
      const firstname = text(read(row, "prenom"));
      const lastname = text(read(row, "nom"));
      const payrollCode = source.code ? text(read(row, "matricule de paie")) : "";
      if (firstname.length > 120 || lastname.length > 120 || payrollCode.length > 64 ||
          /\p{Cc}/u.test(firstname + lastname + payrollCode + person.post)) {
        throw new SkelloImportError("Une identité, un matricule ou un poste dépasse le format accepté.");
      }
      person.identity = { firstname, lastname, payrollCode };
      person.history = [];
      person.fieldIssues = {};
      if (inDays) person.fieldIssues.weeklyHours = "Contrat exprimé en jours, sans équivalent en heures dans Gusto.";
      person.establishments = new Set();
      for (const [field, column] of Object.entries({
        monthlyContractHours: "volume horaire mensuel (h)", hourlyRate: "taux horaire brut moyen (€)",
        grossSalary: "salaire mensuel brut (€)", transport: "cout transport employeur (€)", archiveNote: "note d archivage",
      })) {
        const raw = read(row, column);
        if (!present(raw)) continue;
        // The export labels this as an average. It does not prove the contractual base rate.
        if (field === "hourlyRate" && validNumber(raw) && raw > 0) {
          const checked = validateValues("contract", { hourlyRate: rounded(raw) });
          if (checked?.hourlyRate > 0) {
            person.historicalHourlyRate = checked.hourlyRate;
            person.fieldIssues[field] = "Taux moyen repris dans la synthèse source. Le taux contractuel reste à vérifier.";
            continue;
          }
        }
        const value = field === "archiveNote" ? text(raw) : validNumber(raw) ? rounded(raw) : null;
        const checked = value !== null && validateValues("contract", { [field]: value });
        if (checked && (field === "transport" || field === "archiveNote" || checked[field] > 0)) contract[field] = checked[field];
        else person.fieldIssues[field] = raw === 0
          ? "Zéro écarté pour cette donnée de rémunération."
          : "Valeur source hors du format accepté.";
      }
      const baseRate = read(row, "taux horaire brut (€)");
      if (present(baseRate)) {
        const checked = validNumber(baseRate) && baseRate > 0 && validateValues("contract", { hourlyRate: rounded(baseRate) });
        if (checked?.hourlyRate > 0) {
          contract.hourlyRate = checked.hourlyRate;
          delete person.fieldIssues.hourlyRate;
        } else person.fieldIssues.hourlyRate = "Taux horaire explicite invalide ou nul.";
      }
      if (present(read(row, "date de debut de contrat")) && !start) person.fieldIssues.dateOnPost = "Date de début invalide.";
      if (present(read(row, "date de fin de contrat")) && !end) person.fieldIssues.contractEnd = "Date de fin invalide.";
      const startOfMonth = DateTime.fromISO(monthly.from, { zone }).startOf("month");
      const fullMonth = monthly.from === startOfMonth.toISODate() && monthly.to === startOfMonth.endOf("month").toISODate();
      person.variables = {};
      for (const [field, amount, description] of [["bonus", "primes (€)", "description des primes"],
        ["advance", "avances (€)", "description des avances"]]) {
        const raw = read(row, amount);
        if (!present(raw) || raw === 0) continue;
        const value = validNumber(raw) ? rounded(raw) : null;
        const checked = value !== null && value !== 0 && validateValues("variables", { [field]: value });
        const label = `${field}Label`;
        if (!fullMonth || !checked) {
          person.fieldIssues[field] = !fullMonth ? "La période ne couvre pas un mois de paie complet."
            : "Montant ou signe source incompatible avec le champ Gusto.";
          continue;
        }
        person.variables[field] = checked[field];
        const rawLabel = read(row, description);
        if (present(rawLabel)) {
          const checkedLabel = typeof rawLabel === "string" && validateValues("variables", { [label]: rawLabel });
          if (checkedLabel?.[label]) person.variables[label] = checkedLabel[label];
          else person.fieldIssues[label] = "Libellé hors du format accepté.";
        }
      }
      person.summary = {
        contract: { ...contract, start, type, weeklyHours: volume },
        ...(person.historicalHourlyRate != null && { averageHourlyRate: person.historicalHourlyRate }),
        ...(contract.hourlyRate != null && { baseHourlyRateExplicit: true }),
        premiums: sourcePremiums(read, row, header),
        worked: sourceNumber(read, row, ["heures travaillees retenues (h)", "heures travaillees (h)"], 1512, 60),
        paid: sourceNumber(read, row, ["heures remunerees (h)", "heures payees (h)"], 1512, 60),
        mealsDue: sourceNumber(read, row, ["repas dus"], 1000),
        mealsTaken: sourceNumber(read, row, ["avantages nature"], 1000),
      };
    }
    people.push(person);
    if (source.code) byCode.set(source.code, person);
    byName.set(source.name, [...(byName.get(source.name) || []), person]);
    monthlyTotals.worked += number("heures travaillees (h)") || 0;
    monthlyTotals.pause += number("total pause (h)") || 0;
    monthlyTotals.days += number("jours travailles (j)") || 0;
  }
  if (!people.length || people.length > 200) throw new SkelloImportError("La synthèse doit contenir entre 1 et 200 contrats reconnus.");
  const venues = new Set();
  const counts = { employees: people.length, shifts: 0, punches: 0, pauses: 0, absences: 0,
    contracts: people.length, mealDays: 0, leaveBalances: 0, outside: 0, absenceSummary: 0,
    sourceShifts: 0, sourceAbsences: 0, historicalLate: 0 };
  const sourceTotals = { worked: 0, pause: 0, days: 0, mealsDue: 0, mealsTaken: 0 };
  const shiftTotals = { netMinutes: 0, pauseMinutes: 0 };
  const reportCandidates = [];
  for (const [index, row] of detail.rows.entries()) {
    const read = detail.read;
    const rowNumber = detail.firstRow + index;
    const date = dateOnly(read(row, "date"));
    const kind = key(read(row, "travail / absence"));
    if (!kind && !date) continue;
    const venue = key(read(row, "shift / absence effectue a"));
    if (present(venue)) venues.add(venue);
    if (!date || date < complete.from || date > complete.to ||
      (validNumber(read(row, "n° semaine")) && read(row, "n° semaine") !== DateTime.fromISO(date, { zone }).weekNumber)) {
      note("Date ou semaine ISO incompatible avec le classeur", rowNumber, true);
      continue;
    }
    const person = findPerson(read, row);
    if (workforce && person && present(read(row, "etablissement principal"))) {
      person.establishments.add(text(read(row, "etablissement principal")));
    }
    if (date < period.from || date > period.to) {
      counts.outside++;
      continue;
    }
    if (kind === "travail") {
      counts.sourceShifts++;
      sourceTotals.pause += Number(read(row, "pause (h)")) || 0;
      sourceTotals.worked += Number(read(row, "heures travaillees (h)")) || 0;
      sourceTotals.days += Number(read(row, "jours travailles (j)")) || 0;
      sourceTotals.mealsDue += Number(read(row, "repas dus")) || 0;
      sourceTotals.mealsTaken += Number(read(row, "avantages nature")) || 0;
    } else if (kind === "absence") {
      counts.sourceAbsences++;
    }
    if (!person) {
      note("Salarié absent ou rapprochement ambigu", rowNumber, true);
      continue;
    }
    const label = read(row, "nom du poste / type d absence");
    const begin = read(row, "debut");
    const finish = read(row, "fin");
    if (kind === "absence") {
      const shift = translateAbsence(label, begin, finish, date);
      if (!shift) {
        note("Absence sans motif ou durée compatible", rowNumber);
        continue;
      }
      person.shifts.push({ ...shift, sourceRow: rowNumber });
      if (workforce) person.history.push({ ...shift, date, row: rowNumber,
        employerPaidAbsence: sourceNumber(read, row, ["absences indemnisees par l employeur (h)"], 24, 60),
        thirdPartyPaidAbsence: sourceNumber(read, row, ["absences indemnisees par un tiers (h)"], 24, 60),
        unpaidAbsence: sourceNumber(read, row, ["absences non indemnisees (h)"], 24, 60),
        absenceMealsDue: sourceNumber(read, row, ["repas dus"], 10),
      });
      continue;
    }
    if (kind !== "travail") {
      note("Type de ligne absent ou inconnu", rowNumber);
      continue;
    }
    const pause = read(row, "pause (h)");
    const range = interval(begin, finish, date);
    const signature = [date, wallTime(begin), wallTime(finish), pause, key(label)].join("|");
    if (!range) {
      note("Horaire invalide ou ambigu au changement d’heure", rowNumber, true);
      continue;
    }
    const hasPlanningEvidence = Boolean(evidence.get(signature));
    const position = workforce ? text(label).slice(0, 120) || person.post
      : hasPlanningEvidence ? safePost(label) : knownPosts.get(key(label)) || person.post;
    const breakMinutes = validNumber(pause) && Math.abs(pause * 60 - Math.round(pause * 60)) < 0.5
      ? Math.round(pause * 60) : null;
    const work = readWorkDetails({ position, breakMinutes }, null, range.start, range.end);
    if (!work) {
      note("Pause ou durée de shift incompatible", rowNumber, true);
      continue;
    }
    const due = read(row, "repas dus");
    const taken = read(row, "avantages nature");
    const mealCount = Number.isInteger(due) && due >= 0 && due <= 10 ? due : 0;
    if (workforce) {
      const worked = sourceNumber(read, row, ["heures travaillees retenues (h)", "heures travaillees (h)"], 24, 60);
      const paid = sourceNumber(read, row, ["heures remunerees (h)", "heures payees (h)"], 24, 60);
      const premiums = sourcePremiums(read, row, detail.header);
      const paidBreak = sourceNumber(read, row, ["pause remuneree (h)", "pause deduite pour la paie (h)"], 24, 60);
      if (hasPlanningEvidence || worked !== null || paid !== null || Object.keys(premiums).length) {
        person.history.push({ ...range, date, row: rowNumber, position, planned: hasPlanningEvidence,
          breakMinutes, worked, paid, paidBreak, premiums,
          late: sourceNumber(read, row, ["retard (h)"], 24, 60),
          mealsDue: Number.isInteger(due) && due >= 0 && due <= 10 ? due : null,
          mealsTaken: Number.isInteger(taken) && taken >= 0 && taken <= 10 ? taken : null });
        if (!hasPlanningEvidence) note("Heures source reprises, horaire planifié non confirmé dans la Fiche employés", rowNumber);
      }
    }
    if (!hasPlanningEvidence) {
      if (!workforce || person.history.at(-1)?.row !== rowNumber) {
        note("Horaire présent dans Détails uniquement, absent du Détail Planning", rowNumber, true);
      }
      if (date < monthly.from || date > monthly.to) {
        reportCandidates.push({ reason: "outsideMonthlyPlanning", order: person.order, date, row: rowNumber, ...range, breakMinutes, position,
          taken: Number.isInteger(taken) && taken >= 0 && taken <= 10 ? taken : null });
      }
      continue;
    }
    evidence.set(signature, evidence.get(signature) - 1);
    const lateHours = read(row, "retard (h)");
    let lateMinutes = null;
    if (date >= monthly.from && date <= monthly.to && present(lateHours) && lateHours !== 0) {
      const minutes = Math.round(lateHours * 60);
      if (validNumber(lateHours) && minutes > 0 && minutes <= 1440) lateMinutes = minutes;
      else note("Durée du retard historique incompatible", rowNumber);
    }
    person.shifts.push({ ...range, ...work, mealCount, title: position || "Travail", sourceRow: rowNumber, date, taken, lateMinutes });
  }
  if (venues.size > 1) throw new SkelloImportError("Ce classeur mélange plusieurs établissements. Utilisez un export par établissement.");
  for (const person of people) {
    if (workforce) {
      const [establishment] = person.establishments;
      if (person.establishments.size === 1 && establishment.length <= 120 && !/\p{Cc}/u.test(establishment)) {
        person.primaryEstablishment = establishment;
      } else if (person.establishments.size) {
        person.fieldIssues.primaryEstablishment = "Établissement principal contradictoire ou hors du format accepté.";
      }
      delete person.establishments;
    }
    person.shifts.sort((a, b) => a.start - b.start);
    const ignored = new Set();
    const lateByDate = new Map();
    for (let index = 0; index < person.shifts.length; index++) {
      const first = person.shifts[index];
      for (const second of person.shifts.slice(index + 1)) {
        if (second.start >= first.end) break;
        // A civil-day absence can follow a service assigned to the previous planning day.
        if (!first.absenceType && second.absenceDuration === "full" &&
            first.date < DateTime.fromJSDate(second.start, { zone }).toISODate()) continue;
        ignored.add(first.sourceRow);
        ignored.add(second.sourceRow);
      }
    }
    person.shifts = person.shifts.filter((shift) => {
      if (ignored.has(shift.sourceRow)) {
        if (!workforce) note("Créneau écarté avec les autres créneaux qui le chevauchent", shift.sourceRow, true);
        if (!shift.absenceType) {
          const { date, start, end, breakMinutes, position, taken } = shift;
          reportCandidates.push({ reason: "overlap", order: person.order, date, row: shift.sourceRow, start, end, breakMinutes, position,
            taken: Number.isInteger(taken) && taken >= 0 && taken <= 10 ? taken : null });
        }
        return false;
      }
      if (shift.absenceType) {
        counts.absences++;
      } else {
        counts.shifts++;
        if (shift.breakMinutes) counts.pauses++;
        shiftTotals.netMinutes += plannedMinutes(shift.start, shift.end, shift.breakMinutes);
        shiftTotals.pauseMinutes += shift.breakMinutes;
        if (Number.isInteger(shift.taken) && shift.taken >= 0 && shift.taken <= 10) {
          person.meals.set(shift.date, (person.meals.get(shift.date) || 0) + shift.taken);
        }
        if (shift.lateMinutes != null) {
          const events = lateByDate.get(shift.date) || [];
          events.push({ start: shift.start, end: shift.end, minutes: shift.lateMinutes });
          lateByDate.set(shift.date, events);
          counts.historicalLate++;
        }
      }
      delete shift.date;
      delete shift.sourceRow;
      delete shift.taken;
      delete shift.lateMinutes;
      return true;
    });
    person.inputs.push({ kind: "contract", date: "-", values: person.contract });
    for (const [date, events] of lateByDate) person.inputs.push({ kind: "historicalLate", date, values: { events } });
    for (const [date, taken] of person.meals) {
      const values = validateValues("meals", { taken });
      if (values) {
        person.inputs.push({ kind: "meals", date, values });
        counts.mealDays++;
      }
    }
    delete person.meals;
    delete person.contract;
  }
  if (monthlyAbsences) {
    counts.absenceSummary = findHeader(monthlyAbsences.rows, ["type absence", "date de debut", "date de fin"])
      .rows.filter((row) => present(row[3])).length;
  }
  if (balances) {
    const balance = findHeader(balances.rows, ["nom", "prenom", "conges disponibles"]);
    const pending = new Map();
    for (const row of balance.rows) {
      if (!present(balance.read(row, "prenom"))) continue;
      const person = findPerson(balance.read, row);
      const values = leaveValues(balance.read, row);
      const rawDate = ["date du solde", "date de solde", "solde au"].map((column) => balance.read(row, column)).find(present);
      const date = workforce && rawDate !== undefined ? dateOnly(rawDate) : monthly.to;
      if (!person || !date || !values || !Object.values(values).some((value) => value != null)) {
        note("Solde de congés non rapproché ou incompatible");
        if (workforce && person) person.fieldIssues.leave = !date ? "Date du solde source invalide." : "Solde hors du format accepté.";
        continue;
      }
      const id = `${person.order}:${date}`;
      const previous = pending.get(id);
      if (!previous) pending.set(id, { person, date, values, conflict: false });
      else if (workforce && JSON.stringify(previous.values) !== JSON.stringify(values)) {
        previous.conflict = true;
        person.fieldIssues.leave = "Plusieurs soldes différents figurent à la même date.";
        note("Soldes de congés contradictoires à la même date");
      }
    }
    for (const { person, date, values, conflict } of pending.values()) {
      if (conflict) continue;
      person.inputs.push({ kind: "leave", date, values });
      counts.leaveBalances++;
    }
  }
  for (const person of people) delete person.source;
  if (!workforce && !counts.shifts && !counts.absences) throw new SkelloImportError("Aucune donnée de planning détaillée exploitable pour cette période.");
  return { people, reportCandidates, preview: {
    sheets: [
      { name: "Synthèse datée", rows: roster.rows.length },
      { name: "Fiche employés", rows: fiche.rows.length },
      { name: "Détails", rows: detail.rows.length },
      ...(monthlyAbsences ? [{ name: "Absences Employés", rows: counts.absenceSummary }] : []),
      ...(balances ? [{ name: "Solde Congés", rows: balances.rows.length - 1 }] : []),
    ],
    scope, period, monthly, complete, weeks, counts, conflicts, issues: [...issues.values()],
    sourceTotals: Object.fromEntries(Object.entries(sourceTotals).map(([name, value]) => [name, rounded(value)])),
    monthlyTotals: Object.fromEntries(Object.entries(monthlyTotals).map(([name, value]) => [name, rounded(value)])),
    shiftTotals,
    unsupported: workforce ? [
      "Badgeuse et signatures Gusto : le rapport mensuel ne contient pas les événements natifs. Les heures rémunérées sont reprises uniquement si elles sont chiffrées explicitement.",
      "Les ventilations de synthèse restent attachées à la période source. Une valeur absente ne peut pas être déduite de la synthèse.",
      "Les absences sont reprises depuis Détails. L’onglet Absences Employés sert au contrôle, pour éviter les doublons.",
      "L’annualisation, le compteur d’heures et les avenants exigent des données individuelles datées et complètes. Les totaux de période et les compteurs en jours ne constituent pas des mouvements en heures.",
      "Les coordonnées, données administratives et justificatifs absents restent à compléter. Les notes libres de service et le montant indicatif par repas ne sont pas des champs de paie.",
    ] : [
      "Badgeuse : arrivées, départs, pauses badgées, horaires payés et corrections séparées.",
      "Synthèses, majorations et indemnités calculées : conservées pour comparaison seulement.",
      "Absences Employés : les absences détaillées viennent de Détails, pour éviter un double comptage.",
      "Coordonnées, matricules, notes libres, pièces personnelles et paramètres de l’établissement.",
      "Avenants, primes, avances et transport : aucun mouvement chiffré exploité dans cet import de planning.",
    ],
  } };
}

module.exports = { SkelloImportError, analyzeSkelloWorkbook, normalizeSkelloIdentity: key, premiumLabel };
