const { createHash, createHmac } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Restaurant = require("../../models/restaurant.model");
const Input = require("../../models/personnel-report-input.model");
const Import = require("../../models/hr-configuration-import.model");
const { addDaysToDateKey, isValidDateKey, toLocalDateKey } = require("./time-clock.service");
const { validateValues } = require("./personnel-report-pay.service");
const { FORMAT, VERSION, kinds, disabledRules, HrConfigurationError, readHrConfiguration, portableValues, storageDate, confirmRule } = require("./hr-configuration-format.service");

const audience = "gusto-hr-configuration";
const secret = () => createHmac("sha256", process.env.JWT_SECRET).update(audience + "/v1").digest();
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const futureDate = () => addDaysToDateKey(toLocalDateKey(new Date()), 1);
const stale = () => new HrConfigurationError("Les réglages ont changé. Relancez l’aperçu avant de confirmer.", 409);
async function destination(restaurantId, session, ownerId) {
  if (typeof restaurantId !== "string" || !mongoose.isObjectIdOrHexString(restaurantId)) {
    throw new HrConfigurationError("Restaurant de destination invalide.");
  }
  const restaurant = await Restaurant.findById(restaurantId).select("name owner_id options.employees +hrConfigurationRevision").session(session).lean();
  if (!restaurant) throw new HrConfigurationError("Restaurant introuvable.", 404);
  if (ownerId && String(restaurant.owner_id) !== ownerId) throw new HrConfigurationError("Accès réservé au propriétaire de ce restaurant.", 403);
  if (restaurant.options?.employees !== true) throw new HrConfigurationError("Le module Gestion du personnel doit être actif.", 409);
  return restaurant;
}

const target = (restaurant) => ({ id: String(restaurant._id), name: restaurant.name });
const scope = (restaurant) => ({ restaurant: restaurant._id, employee: null, profile: null });

function settings(restaurant, session) {
  return Input.find({ ...scope(restaurant), kind: { $in: kinds } }).select("kind date values revision").sort({ date: -1, _id: 1 }).session(session).lean();
}

function currentAt(records, kind, date) {
  return records.find((item) => item.kind === kind && item.date <= date);
}

function describeValues(kind, item) {
  return item ? portableValues(kind, item.values) : null;
}

function publicImport(batch) {
  return { id: String(batch._id), effect: batch.effect, source: batch.source, createdAt: batch.createdAt, restoredAt: batch.restoredAt,
    kinds: batch.changes.map(({ kind }) => kind), effects: Object.fromEntries(batch.changes.map(({ kind, effect }) => [kind, effect || batch.effect])),
    canRestore: !batch.restoredAt && batch.effect >= futureDate() };
}

async function listImports(restaurantId, ownerId) {
  const restaurant = await destination(restaurantId, undefined, ownerId);
  const batches = await Import.find({ restaurant: restaurant._id }).sort({ createdAt: -1 }).limit(15).lean();
  return { target: target(restaurant), minimumDate: futureDate(), batches: batches.map(publicImport) };
}

async function exportConfiguration(restaurantId) {
  const restaurant = await destination(restaurantId);
  const records = await settings(restaurant);
  const today = toLocalDateKey(new Date());
  const rules = Object.fromEntries(kinds.map((kind) => {
    // Report weeks are selected by their Monday and monthly meal settings by their month.
    const date = kind === "rules" ? today.slice(0, 7) : today;
    const current = currentAt(records, kind, date);
    const values = describeValues(kind, current);
    const financial = kind === "rules" && values?.amount != null;
    return [kind, {
      status: values ? financial ? "to_confirm" : "confirmed" : "unavailable",
      origin: { system: "gusto", path: "Rapport RH → Paramètres", consultedOn: today },
      values,
      note: financial ? "Valeur financière à confirmer pour le restaurant de destination."
        : values ? `Réglage enregistré${current.date === "-" ? "" : ` depuis ${current.date}`}.` : "Aucun réglage collectif exportable à cette date.",
    }];
  }));
  return readHrConfiguration({ format: FORMAT, version: VERSION, metadata: { source: "gusto", establishment: restaurant.name, collectedOn: today },
    rules, observations: [], questions: [] });
}

async function exportBackup({ restaurantId, batchId }) {
  const restaurant = await destination(restaurantId);
  if (!mongoose.isObjectIdOrHexString(batchId)) throw new HrConfigurationError("Lot invalide.");
  const batch = await Import.findOne({ _id: batchId, restaurant: restaurant._id }).lean();
  if (!batch) throw new HrConfigurationError("Import introuvable pour ce restaurant.", 404);
  const today = toLocalDateKey(new Date());
  const rules = Object.fromEntries(batch.changes.map(({ kind, previousEffective }) => {
    const values = previousEffective ? describeValues(kind, previousEffective) : disabledRules[kind];
    const financial = kind === "rules" && values?.amount != null;
    return [kind, { status: values ? financial ? "to_confirm" : "confirmed" : "unavailable", values,
      origin: { system: "gusto", path: "Administration → Historique des imports RH", consultedOn: today },
      note: financial ? "Confirmez la valeur financière avant de la rétablir."
        : values ? "Configuration enregistrée avant ce lot." : "Valeur antérieure non exportable." }];
  }));
  return readHrConfiguration({ format: FORMAT, version: VERSION, metadata: { source: "gusto", establishment: restaurant.name, collectedOn: today },
    rules, observations: [], questions: [] });
}

const dateHints = { rules: "Choisissez le premier du mois.", leaveRules: "Choisissez le premier du mois.",
  overtime: "Choisissez un lundi.", hoursRules: "Choisissez un lundi." };
function compareRules(configuration, effects, records) {
  return Object.entries(configuration.rules).map(([kind, rule]) => {
    const effect = effects[kind];
    const date = storageDate(kind, effect);
    const current = currentAt(records, kind, date ?? (kind === "rules" ? effect.slice(0, 7) : effect));
    const exact = date !== null && current?.date === date ? current : null;
    const later = date && date !== "-" && records.findLast((item) => item.kind === kind && item.date > date);
    const previous = describeValues(kind, current);
    if (kind === "absenceRules" && rule.origin.path === "Assistant de configuration RH Gusto" &&
        rule.values && Object.keys(rule.values.categories).length) {
      const categories = { ...previous?.categories };
      for (const [type, proposed] of Object.entries(rule.values.categories)) {
        const prior = categories[type];
        categories[type] = { payer: proposed.payer ?? prior?.payer ?? null, meal: proposed.meal ?? prior?.meal ?? null };
      }
      rule = { ...rule, values: { categories } };
    }
    let action = "apply";
    let reason = later ? `Un autre réglage prendra ensuite effet à la date ${later.date}.` : null;
    const financialReview = kind === "rules" && rule.values?.amount != null && !rule.review;
    const changingCounter = kind === "hoursRules" && rule.origin.path === "Assistant de configuration RH Gusto" && rule.values?.start;
    const changesCounterOpening = changingCounter && previous?.start && previous.start !== rule.values.start;
    const reopensCounter = changingCounter && !previous?.start && records.some((item) =>
      item.kind === kind && item.date < date && item.values?.start);
    if (rule.status !== "confirmed") {
      action = "skipped";
      reason = rule.status === "to_confirm" ? "Confirmation métier requise avant activation." : "Valeur indisponible.";
    } else if (current && !previous) {
      action = "blocked";
      reason = "Le réglage Gusto existant ne peut pas être comparé. Vérifiez-le dans le Rapport RH.";
    } else if (isDeepStrictEqual(previous, rule.values)) {
      action = "unchanged";
      reason = "Même réglage à la date choisie.";
    } else if (changesCounterOpening) {
      action = "blocked";
      reason = "Un compteur est déjà ouvert. Conservez son premier lundi pour préserver le cumul existant.";
    } else if (reopensCounter) {
      action = "blocked";
      reason = "Un compteur a déjà été utilisé. Vérifiez les soldes d’ouverture dans le Rapport RH avant de reprendre le suivi.";
    } else if (financialReview) {
      action = "blocked";
      reason = "Confirmez la valeur financière pour le restaurant de destination.";
    } else if (date === null) {
      action = "blocked";
      reason = dateHints[kind];
    }
    return { kind, date, effect, previousDate: current?.date ?? null, previous, rule, action, reason, financialReview,
      snapshot: { current, later }, exact };
  });
}

function makePlan({ restaurant, configuration, effects, records }) {
  const comparison = compareRules(configuration, effects, records);
  const stamp = digest({ target: target(restaurant), revision: restaurant.hrConfigurationRevision ?? 0,
    configuration, effects, state: comparison.map(({ snapshot, action }) => ({ snapshot, action })) });
  return { stamp, comparison };
}

function inputFile(input, effect, dates) {
  const configuration = readHrConfiguration(input);
  const names = Object.keys(configuration.rules);
  if (dates !== undefined && (!dates || typeof dates !== "object" || Array.isArray(dates) ||
    Object.keys(dates).some((kind) => !names.includes(kind)))) throw new HrConfigurationError("Dates d’effet invalides.");
  const effects = Object.fromEntries(names.map((kind) => [kind, dates?.[kind] ?? effect]));
  if (Object.values(effects).some((date) => !isValidDateKey(date) || date < futureDate())) {
    throw new HrConfigurationError("Choisissez une date d’effet à partir de demain, en heure de Paris.");
  }
  return { configuration, effects };
}

async function previewImport({ restaurantId, actor, ownerId, configuration: input, effect, effects: dates }) {
  const { configuration, effects } = inputFile(input, effect, dates);
  const restaurant = await destination(restaurantId, undefined, ownerId);
  const { stamp, comparison } = makePlan({ restaurant, configuration, effects, records: await settings(restaurant) });
  const token = comparison.some(({ action }) => action === "apply")
    ? jwt.sign({ restaurantId, actor, stamp }, secret(), { audience, expiresIn: "20m", algorithm: "HS256" }) : null;
  return { target: target(restaurant), effect, effects, token, metadata: configuration.metadata,
    rules: comparison.map(({ snapshot: _snapshot, exact: _exact, ...item }) => item),
    observations: configuration.observations, questions: configuration.questions };
}

async function reviewRule({ restaurantId, configuration, review }) {
  await destination(restaurantId);
  if (!review || typeof review !== "object") throw new HrConfigurationError("Validation de la règle manquante.");
  return confirmRule(configuration, review, toLocalDateKey(new Date()));
}

function checkedToken(token, restaurantId, actor) {
  let claims;
  try {
    claims = jwt.verify(token, secret(), { audience, algorithms: ["HS256"] });
  } catch {
    throw new HrConfigurationError("Aperçu manquant ou expiré. Relancez la comparaison.", 409);
  }
  if (claims.restaurantId !== restaurantId || claims.actor !== actor) throw stale();
  return claims;
}

async function lock(restaurant, session) {
  const result = await Restaurant.updateOne({ _id: restaurant._id,
    hrConfigurationRevision: restaurant.hrConfigurationRevision ?? { $exists: false } },
  { $inc: { hrConfigurationRevision: 1 } }, { session, timestamps: false });
  if (result.modifiedCount !== 1) throw stale();
}

async function transaction(work) {
  await Promise.all([Input.init(), Import.init()]);
  try {
    return await mongoose.connection.transaction(work);
  } catch (error) {
    if (error.code === 11000) throw stale();
    if (error.code === 20 || error.code === 263) throw new HrConfigurationError("Le stockage ne permet pas cet import transactionnel.", 503);
    throw error;
  }
}

async function applyImport({ restaurantId, actor, ownerId, beforeApply, configuration: input, effect, effects: dates, token, confirmed }) {
  if (confirmed !== true) throw new HrConfigurationError("Confirmez explicitement l’import de cette configuration RH.");
  const { configuration, effects } = inputFile(input, effect, dates);
  const claims = checkedToken(token, restaurantId, actor);
  return transaction(async (session) => {
    inputFile(configuration, effect, effects);
    const restaurant = await destination(restaurantId, session, ownerId);
    const { stamp, comparison } = makePlan({ restaurant, configuration, effects, records: await settings(restaurant, session) });
    if (stamp !== claims.stamp) throw stale();
    const pending = comparison.filter(({ action }) => action === "apply");
    if (!pending.length) throw stale();
    if (beforeApply) await beforeApply(session);
    await lock(restaurant, session);
    const changes = [];
    for (const { kind, date, effect, rule, exact, snapshot } of pending) {
      const id = exact?._id || `${restaurantId}:restaurant:${kind}:${date}`;
      const values = validateValues(kind, rule.values, date);
      const revision = (exact?.revision ?? 0) + 1;
      if (exact) {
        const result = await Input.updateOne({ ...scope(restaurant), _id: id, revision: exact.revision },
          { $set: { values, revision, updatedBy: actor } }, { session });
        if (result.modifiedCount !== 1) throw stale();
      } else {
        await Input.create([{ _id: id, restaurant: restaurant._id, kind, date, values, revision, updatedBy: actor }], { session });
      }
      changes.push({ id, kind, date, effect, origin: rule.origin, review: rule.review, before: exact && { values: exact.values, revision: exact.revision },
        previousEffective: snapshot.current && { date: snapshot.current.date, values: snapshot.current.values }, after: { values, revision } });
    }
    const [batch] = await Import.create([{ restaurant: restaurant._id, actor, effect: changes.map((item) => item.effect).sort()[0],
      source: configuration.metadata, changes }], { session });
    return { target: target(restaurant), batch: publicImport(batch), skipped: comparison.filter(({ action }) => action !== "apply")
      .map(({ kind, action, reason }) => ({ kind, action, reason })) };
  });
}

async function restoreImport({ restaurantId, batchId, actor, ownerId, confirmed }) {
  if (confirmed !== true || !mongoose.isObjectIdOrHexString(batchId)) throw new HrConfigurationError("Confirmez le lot à restaurer.");
  return transaction(async (session) => {
    const restaurant = await destination(restaurantId, session, ownerId);
    const batch = await Import.findOne({ _id: batchId, restaurant: restaurant._id }).session(session);
    if (!batch) throw new HrConfigurationError("Import introuvable pour ce restaurant.", 404);
    if (!publicImport(batch).canRestore) throw new HrConfigurationError("Ce lot est déjà restauré ou sa date d’effet a commencé.", 409);
    await lock(restaurant, session);
    for (const { id, kind, date, before, after } of batch.changes) {
      const selector = { ...scope(restaurant), _id: id, kind, date, revision: after.revision };
      const current = await Input.findOne(selector).session(session).lean();
      if (!current || !isDeepStrictEqual(current.values, after.values)) throw stale();
      const result = before
        ? await Input.updateOne(selector, { $set: { values: before.values, updatedBy: actor }, $inc: { revision: 1 } }, { session })
        : await Input.deleteOne(selector, { session });
      if ((before ? result.modifiedCount : result.deletedCount) !== 1) throw stale();
    }
    batch.restoredBy = actor;
    batch.restoredAt = new Date();
    await batch.save({ session });
    return { target: target(restaurant), batch: publicImport(batch) };
  });
}

module.exports = { listImports, exportConfiguration, exportBackup, previewImport, reviewRule, applyImport, restoreImport, destination, futureDate };
