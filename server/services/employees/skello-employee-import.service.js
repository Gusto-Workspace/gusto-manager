const { createHash, createHmac } = require("node:crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { DateTime } = require("luxon");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const PersonnelInput = require("../../models/personnel-report-input.model");
const SkelloImport = require("../../models/skello-import.model");
const { analyzeSkelloWorkbook, normalizeSkelloIdentity, SkelloImportError } = require("./skello-workbook.service");
const { dayId, planHistory, readHistoryContext } = require("./skello-history.service");
const { lockClockEmployees } = require("./time-clock-write.service");
const { clockPinWriteProblem, provisionInitialClockPin, withClockPinTransaction } = require("./time-clock-pin.service");
const { toLocalDateKey } = require("./time-clock.service");

const mode = "workforce";
const audience = "gusto-skello-employees";
const zone = "Europe/Paris";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const planHash = (value) => hash(JSON.stringify(value));
const signingKey = () => createHmac("sha256", process.env.JWT_SECRET).update(audience).digest();
const nameKey = ({ firstname, lastname }) => JSON.stringify([firstname, lastname].map(normalizeSkelloIdentity));
const recheck = "Le rapprochement a changé. Vérifiez un nouvel aperçu avant de confirmer.";
const profilePath = "restaurantProfiles.$[profile].";

function batchView(batch) {
  return batch && {
    id: String(batch._id), mode, status: batch.status, actor: batch.actor,
    period: { from: batch.from, to: batch.to }, summary: batch.summary, createdAt: batch.createdAt,
  };
}

async function readTarget(id, session = null) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new SkelloImportError("Restaurant invalide.", 400);
  const restaurant = await Restaurant.findById(id).select("name employees options.employees").session(session).lean();
  if (!restaurant) throw new SkelloImportError("Restaurant introuvable.", 404);
  if (restaurant.options?.employees !== true) {
    throw new SkelloImportError("La gestion du personnel doit être active pour ce restaurant.", 409);
  }
  return restaurant;
}

async function readRoster(restaurant, session = null) {
  const id = String(restaurant._id);
  const activeIds = new Set((restaurant.employees || []).map(String));
  const employees = await Employee.find({
    historicalImport: { $exists: false },
    accountType: { $in: ["employee", null] },
    $or: [
      { _id: { $in: restaurant.employees || [] }, restaurants: restaurant._id },
      { "restaurantProfiles.restaurant": restaurant._id },
    ],
  }).select("firstname lastname post dateOnPost restaurants restaurantProfiles._id restaurantProfiles.restaurant restaurantProfiles.archivedAt restaurantProfiles.erasure.at restaurantProfiles.snapshot.firstname restaurantProfiles.snapshot.lastname restaurantProfiles.snapshot.post restaurantProfiles.snapshot.dateOnPost restaurantProfiles.employment restaurantProfiles.shifts restaurantProfiles.leaveRequests +restaurantProfiles.skelloPayrollCode +restaurantProfiles.skelloNameKey")
    .sort("_id").session(session).lean();
  return employees.map((employee) => {
    const profiles = (employee.restaurantProfiles || []).filter((entry) => String(entry.restaurant) === id);
    const profile = profiles.length === 1 ? profiles[0] : null;
    const scopedStart = profile?.snapshot?.dateOnPost;
    const start = scopedStart === undefined ? employee.dateOnPost : scopedStart;
    return {
      id: String(employee._id), profile: profile?._id ? String(profile._id) : "",
      firstname: profile?.snapshot?.firstname || employee.firstname,
      lastname: profile?.snapshot?.lastname || employee.lastname,
      payrollCode: profile?.employment?.payrollCode || "",
      sourceCode: profile?.skelloPayrollCode || "",
      sourceNameKey: profile?.skelloNameKey || "",
      start: start ? toLocalDateKey(start) : null,
      post: profile?.snapshot?.post || employee.post || "",
      employment: profile?.employment,
      shifts: profile?.shifts,
      leaveRequests: profile?.leaveRequests,
      archivedAt: profile?.archivedAt,
      erased: Boolean(profile?.erasure?.at),
      active: Boolean(profile?._id && !profile.archivedAt && activeIds.has(String(employee._id)) &&
        employee.restaurants?.some((entry) => String(entry) === id)),
    };
  });
}

function readWorkbook(buffer, scope) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new SkelloImportError("Choisissez un rapport XLSX Skello.", 400);
  const parsed = analyzeSkelloWorkbook(buffer, scope, { workforce: true });
  const fingerprint = hash(Buffer.concat([Buffer.from(`skello-workforce/v3\0${scope}\0`), buffer]));
  return { ...parsed, fingerprint };
}

function readChoices(rawChoices, people) {
  let entries;
  try { entries = JSON.parse(rawChoices); } catch { /* format error below */ }
  if (!Array.isArray(entries) || entries.length !== people.length) {
    throw new SkelloImportError("Choisissez une action pour chaque ligne reconnue.", 400);
  }
  const choices = new Map();
  for (const entry of entries) {
    const { order, destination, keepExisting = false, creationReviewed = false } = entry || {};
    if (!Number.isInteger(order) || order < 1 || order > people.length || choices.has(order) ||
        typeof keepExisting !== "boolean" || typeof creationReviewed !== "boolean" || typeof destination !== "string" ||
        (!["create", "skip"].includes(destination) && !/^[a-f\d]{24}$/.test(destination))) {
      throw new SkelloImportError("Rapprochement invalide.", 400);
    }
    choices.set(order, { destination, keepExisting, creationReviewed });
  }
  return people.map(({ order }) => choices.get(order));
}

function reconcile(people, roster, choices) {
  const destinations = new Set();
  const nameCounts = new Map();
  for (const { identity } of people) {
    const name = nameKey(identity);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  return people.map((person, index) => {
    const destination = choices?.[index].destination;
    const code = normalizeSkelloIdentity(person.identity.payrollCode);
    const name = nameKey(person.identity);
    const sourceNameKey = hash(name);
    const names = roster.filter((entry) => entry.sourceNameKey === sourceNameKey || nameKey(entry) === name);
    const codes = code ? roster.filter((entry) => [entry.sourceCode, normalizeSkelloIdentity(entry.payrollCode)].includes(code)) : [];
    const conflictingIdentity = codes.length > 0 && names.length > 0 && !codes.some((entry) => names.includes(entry));
    const candidates = (conflictingIdentity ? [] : codes.length ? codes : names).filter((entry) => entry.profile && !entry.erased &&
      (entry.active || entry.archivedAt) &&
      (!code || [entry.sourceCode, normalizeSkelloIdentity(entry.payrollCode)]
        .filter(Boolean).every((existing) => existing === code)));
    const canCreate = code ? !codes.length && names.every((entry) => entry.sourceCode || normalizeSkelloIdentity(entry.payrollCode))
      : !names.length && nameCounts.get(name) === 1;
    const creationBlockedReason = canCreate ? null : conflictingIdentity
      ? "Le nom et le matricule renvoient à deux dossiers différents. Vérifiez les identités dans l’annuaire."
      : !code && nameCounts.get(name) > 1
      ? "Plusieurs lignes du classeur portent ce nom. Un matricule est nécessaire pour distinguer ces dossiers."
      : "Un dossier correspondant existe déjà dans cet établissement. Vérifiez le rapprochement.";
    const target = candidates.find((entry) => entry.id === destination);
    let error = "";
    if (destination === "create" && !canCreate) {
      error = creationBlockedReason;
    } else if (destination === "create" && !choices[index].creationReviewed) {
      error = "Confirmez la vérification de l’identité et du contrat avant de créer le dossier.";
    } else if (destination && !["create", "skip"].includes(destination) && (!target || destinations.has(destination))) {
      error = "Rattachement ambigu, déjà choisi ou indisponible dans ce restaurant.";
    }
    if (target) destinations.add(destination);
    const { firstname, lastname, payrollCode } = person.identity;
    return {
      order: person.order, firstname, lastname, payrollCode, post: person.post, type: person.type, volume: person.volume,
      start: person.start, end: person.inputs.find(({ kind }) => kind === "contract")?.values.contractEnd,
      canCreate, creationBlockedReason,
      candidates: candidates.map(({ id, firstname, lastname, payrollCode, archivedAt }) => ({ id, firstname, lastname, payrollCode, archived: Boolean(archivedAt) })),
      error,
    };
  });
}

async function reviewHistory(people, roster, choices, rows, restaurant, preview, session = null) {
  if (!choices || rows.some(({ error }) => error)) return [];
  const rosterById = new Map(roster.map((entry) => [entry.id, entry]));
  const selected = choices.map(({ destination }) => rosterById.get(destination));
  const balanceDates = people.flatMap(({ inputs }, index) => choices[index].destination === "skip" ? [] :
    inputs.filter(({ kind }) => kind === "leave").map(({ date }) => date));
  const context = await readHistoryContext(restaurant, selected.filter(Boolean), preview.period, preview.monthly, balanceDates, session);
  return choices.map(({ destination }, index) => destination === "skip" ? null :
    planHistory(people[index], selected[index], restaurant, preview.monthly, context));
}

const rosterSignature = (roster) => planHash(roster.map(({ shifts: _shifts, leaveRequests: _leaveRequests, ...member }) => member));
const canApplyHistory = (choices, history) => history.every((plan, index) => !plan?.conflicts.length || choices[index].keepExisting);

function summarize(choices, history) {
  const counts = { created: 0, linked: 0, skipped: 0 };
  const historyCounts = {};
  const individual = { imported: 0, preserved: 0, ignored: 0 };
  for (const [index, { destination }] of choices.entries()) {
    counts[destination === "create" ? "created" : destination === "skip" ? "skipped" : "linked"]++;
    const plan = history[index];
    if (!plan) continue;
    for (const [key, value] of Object.entries(plan.counts)) historyCounts[key] = (historyCounts[key] || 0) + value;
    for (const { field, status } of plan.individual) {
      if (field !== "identity") individual[status]++;
    }
  }
  return { counts, history: historyCounts, individual };
}

function claimsFor(restaurant, actor, fingerprint, scope, choices) {
  return { target: String(restaurant._id), database: mongoose.connection.name, actor, fingerprint, scope, choices: planHash(choices) };
}

async function listSkelloEmployees(restaurantId) {
  const restaurant = await readTarget(restaurantId);
  const batches = await SkelloImport.find({ restaurant: restaurant._id, mode }).sort({ createdAt: -1 }).limit(30).lean();
  return { target: { id: String(restaurant._id), name: restaurant.name }, batches: batches.map(batchView) };
}

async function previewSkelloEmployees({ restaurantId, actor, buffer, scope, choices: supplied }) {
  const restaurant = await readTarget(restaurantId);
  const { people, preview, fingerprint } = readWorkbook(buffer, scope);
  const choices = supplied === undefined ? null : readChoices(supplied, people);
  const [roster, existing] = await Promise.all([
    readRoster(restaurant),
    SkelloImport.findOne({ restaurant: restaurant._id, fingerprint, mode, status: "complete" }).lean(),
  ]);
  const rows = reconcile(people, roster, choices);
  const history = existing ? [] : await reviewHistory(people, roster, choices, rows, restaurant._id, preview);
  for (const [index, plan] of history.entries()) {
    if (plan) {
      rows[index].history = { counts: plan.counts, conflicts: plan.conflicts };
      rows[index].individual = plan.individual;
    }
  }
  const state = existing ? "alreadyImported" : !choices ? "choose" : rows.some(({ error }) => error) ? "blocked"
    : choices.every(({ destination }) => destination === "skip") ? "empty" : "ready";
  const token = state === "ready"
    ? jwt.sign({ ...claimsFor(restaurant, actor, fingerprint, scope, choices), roster: rosterSignature(roster), history: planHash(history) }, signingKey(),
      { expiresIn: "15m", audience, algorithm: "HS256" })
    : null;
  return { period: preview.period, monthly: preview.monthly, rows, token, issues: preview.issues,
    unsupported: preview.unsupported, alreadyImported: Boolean(existing), state, batch: batchView(existing),
    ...(token && { summary: summarize(choices, history), requiresProtectionConfirmation: !canApplyHistory(choices, history) }) };
}

async function applySkelloEmployees({ restaurantId, actor, buffer, scope, choices: supplied, token, confirmed, acceptProtected }) {
  if (confirmed !== "true") throw new SkelloImportError("Confirmez le rapprochement et l’établissement.", 400);
  const restaurant = await readTarget(restaurantId);
  const { people, preview, fingerprint } = readWorkbook(buffer, scope);
  const choices = readChoices(supplied, people);
  let claims;
  try { claims = jwt.verify(token, signingKey(), { audience, algorithms: ["HS256"] }); } catch {
    throw new SkelloImportError("L’aperçu a expiré. Vérifiez un nouveau rapprochement.", 409);
  }
  if (Object.entries(claimsFor(restaurant, actor, fingerprint, scope, choices)).some(([key, value]) => claims[key] !== value)) {
    throw new SkelloImportError(recheck, 409);
  }
  await Promise.all([SkelloImport.init(), PersonnelInput.init()]);
  const targetId = restaurant._id;
  try {
    return await withClockPinTransaction(async (session) => {
      // Serialize changes to the destination roster with imports and other membership writes.
      const fenced = await Restaurant.updateOne({ _id: targetId, "options.employees": true }, { $inc: { __v: 1 } }, { session });
      if (!fenced.matchedCount) throw new SkelloImportError(recheck, 409);
      const previous = await SkelloImport.findOne({ restaurant: targetId, fingerprint, mode, status: "complete" }).session(session).lean();
      if (previous) return { alreadyImported: true, batch: batchView(previous) };
      const current = await readTarget(restaurantId, session);
      const roster = await readRoster(current, session);
      const rows = reconcile(people, roster, choices);
      if (claims.roster !== rosterSignature(roster) || rows.some(({ error }) => error)) throw new SkelloImportError(recheck, 409);
      await lockClockEmployees(targetId, choices.map(({ destination }) => destination).filter(mongoose.isObjectIdOrHexString), session);
      const history = await reviewHistory(people, roster, choices, rows, targetId, preview, session);
      if (claims.history !== planHash(history)) throw new SkelloImportError(recheck, 409);
      if (acceptProtected !== "true" && !canApplyHistory(choices, history)) {
        throw new SkelloImportError("Confirmez que les données Gusto seront conservées et que les éléments signalés seront écartés.", 400);
      }

      const summary = summarize(choices, history);
      const created = [];
      const links = [];
      const operations = [];
      for (const [index, row] of rows.entries()) {
        const { destination } = choices[index];
        if (destination === "skip") continue;
        const code = normalizeSkelloIdentity(row.payrollCode);
        const sourceName = hash(nameKey(row));
        const plan = history[index];
        const profileFields = { ...plan.profileFields };
        if (profileFields["snapshot.dateOnPost"]) {
          profileFields["snapshot.dateOnPost"] = DateTime.fromISO(profileFields["snapshot.dateOnPost"], { zone }).toJSDate();
        }
        let employeeId = destination;
        let profileId;
        if (destination === "create") {
          const { firstname, lastname, end } = row;
          const extract = (prefix) => Object.fromEntries(Object.entries(profileFields)
            .filter(([path]) => path.startsWith(prefix)).map(([path, value]) => [path.slice(prefix.length), value]));
          const snapshot = { firstname, lastname, ...extract("snapshot.") };
          const archived = end && end < toLocalDateKey(new Date());
          const [employee] = await Employee.create([{
            ...snapshot, restaurants: archived ? [] : [targetId],
            restaurantProfiles: [{ restaurant: targetId, snapshot, skelloNameKey: sourceName, ...(code && { skelloPayrollCode: code }),
              ...(archived && { archivedAt: DateTime.fromISO(end, { zone }).endOf("day").toJSDate() }),
              employment: extract("employment.") }],
          }], { session });
          employeeId = employee._id;
          profileId = employee.restaurantProfiles[0]._id;
          if (!archived) {
            await provisionInitialClockPin({
              restaurant: targetId, employee: employeeId, profile: String(profileId), changedBy: actor, session,
            });
            created.push(employee._id);
          }
        } else {
          profileId = roster.find(({ id }) => id === destination).profile;
          const updated = await Employee.updateOne({
            _id: destination, restaurantProfiles: { $elemMatch: { _id: profileId, restaurant: targetId, "erasure.at": null } },
          }, {
            $inc: { __v: 1 },
            $set: { [`${profilePath}skelloNameKey`]: roster.find(({ id }) => id === destination).sourceNameKey || sourceName,
              ...(code && { [`${profilePath}skelloPayrollCode`]: code }),
              ...Object.fromEntries(Object.entries(profileFields).map(([path, value]) => [`${profilePath}${path}`, value])) },
          }, { session, arrayFilters: [{ "profile._id": profileId }] });
          if (!updated.matchedCount) throw new SkelloImportError(recheck, 409);
        }
        const inputs = [];
        for (const { kind, date, suffix, values, revision, skelloEffectiveDates } of plan.writes) {
          const _id = dayId(targetId, profileId, kind, suffix);
          inputs.push(_id);
          const fields = { values, ...(skelloEffectiveDates && { skelloEffectiveDates }), updatedBy: actor };
          operations.push(revision === undefined ? { insertOne: { document: { _id, restaurant: targetId,
            employee: employeeId, profile: profileId, kind, date, source: "skello", revision: 1, ...fields } } } :
            { updateOne: { filter: { _id, revision }, update: { $set: fields, $inc: { revision: 1 } } } });
        }
        links.push({ order: row.order, employee: employeeId, profile: profileId, action: destination === "create" ? "create" : "link", inputs });
      }
      if (created.length) {
        await Restaurant.updateOne({ _id: targetId }, { $addToSet: { employees: { $each: created } } }, { session });
      }
      if (operations.length) {
        const stored = await PersonnelInput.bulkWrite(operations, { session });
        if (stored.insertedCount + stored.matchedCount !== operations.length) throw new SkelloImportError(recheck, 409);
      }
      const [batch] = await SkelloImport.create([{
        restaurant: targetId, fingerprint, mode, scope, ...preview.period, status: "complete", actor,
        summary: { ...summary, issues: preview.issues, unsupported: preview.unsupported,
          historyConflicts: [...new Set(history.flatMap((plan) => plan?.conflicts.map(({ message }) => message) || []))] }, manifest: { links },
      }], { session });
      return { alreadyImported: false, batch: batchView(batch) };
    });
  } catch (error) {
    if (error instanceof SkelloImportError) throw error;
    const pinProblem = clockPinWriteProblem(error);
    if (pinProblem) throw new SkelloImportError(pinProblem.message, 409);
    const previous = await SkelloImport.findOne({ restaurant: targetId, fingerprint, mode, status: "complete" }).lean().catch(() => null);
    if (previous) return { alreadyImported: true, batch: batchView(previous) };
    throw new SkelloImportError("L’import n’a pas abouti. Relancez l’aperçu avant de réessayer.", 503);
  }
}

module.exports = { listSkelloEmployees, previewSkelloEmployees, applySkelloEmployees };
