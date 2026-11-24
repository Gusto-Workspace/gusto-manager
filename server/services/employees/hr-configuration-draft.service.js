const { isDeepStrictEqual } = require("node:util");
const Draft = require("../../models/hr-configuration-draft.model");
const Input = require("../../models/personnel-report-input.model");
const { isValidDateKey, toLocalDateKey } = require("./time-clock.service");
const { validAbsences } = require("./personnel-report-counters.service");
const { FORMAT, VERSION, kinds, definitions, disabledRules, portableValues, HrConfigurationError } = require("./hr-configuration-format.service");
const { destination, futureDate, previewImport, applyImport } = require("./hr-configuration-import.service");

const originPath = "Assistant de configuration RH Gusto";
const isRecord = (value) => value && Object.getPrototypeOf(value) === Object.prototype;
const booleans = ["enhanced", "structuralMonthly", "countHolidays", "plannedNightGross", "excludeHolidays", "preserveCarry"];
const numbers = ["roundMinutes", "ordinary", "firstEnd", "secondEnd", "firstRate", "secondRate", "lastRate", "complementBand",
  "complementFirstRate", "complementLastRate", "workdays", "paidLeaveDays", "nightRate", "sundayRate", "holidayRate", "referenceMonth", "quantity", "amount"];
const nullable = ["paidLeaveDays", "nightRate", "sundayRate", "holidayRate", "amount", "planningAttribution", "weekdays"];
const choices = {
  source: ["planning", "validated", "hybrid"], planningAttribution: ["shiftStart"], pause: ["clocked", "plannedMinimum", "plannedFallback"],
  unit: ["workdays", "businessDays"], mode: ["combined", "indemnities", "tickets", "basket"], basis: ["days", "monthly", "service", "criteria"],
};

function validAnswer(key, value) {
  if (value === null) return nullable.includes(key);
  if (booleans.includes(key) || key === "reviewCategories") return typeof value === "boolean";
  if (numbers.includes(key)) return Number.isFinite(value) && value >= 0 && value <= 1_000_000;
  if (Object.hasOwn(choices, key)) return choices[key].includes(value);
  if (["earlyIn", "lateIn", "earlyOut", "lateOut"].includes(key)) return ["planned", "clocked"].includes(value);
  if (["assimilated", "creditedAbsences"].includes(key)) return validAbsences(value);
  if (key === "weekdays") return Array.isArray(value) && value.length <= 7 && new Set(value).size === value.length &&
    value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  if (key === "categories") return isDeepStrictEqual(portableValues("absenceRules", { categories: value }), { categories: value });
  if (key === "criteria") return Array.isArray(value) && value.length <= 5 && value.every((item) =>
    isRecord(item) && Object.keys(item).length === 4 && ["start", "end"].every((name) => item[name] === null ||
      (typeof item[name] === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item[name]))) &&
    ["minimum", "maximum"].every((name) => item[name] === null || (Number.isInteger(item[name]) && item[name] >= 0 && item[name] <= 1_000_000)));
  if (key === "start") return isValidDateKey(value);
  if (key === "startMonth") return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && isValidDateKey(`${value}-01`);
  return ["nightStart", "nightEnd"].includes(key) && typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateDraft({ families, step, revision, effects = {} }) {
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isInteger(step) || step < 0 || step > kinds.length ||
      !isRecord(families) || !isRecord(effects) || Object.entries(effects).some(([kind, date]) => !kinds.includes(kind) ||
        !isValidDateKey(date))) throw new HrConfigurationError("Brouillon de configuration RH invalide.");
  for (const [kind, family] of Object.entries(families)) {
    if (!Object.hasOwn(definitions, kind) || !isRecord(family) || Object.keys(family).length !== 2 ||
        !["on", "off", "unknown", null].includes(family.mode) || !isRecord(family.answers)) {
      throw new HrConfigurationError("Famille de questions RH invalide.");
    }
    for (const [key, response] of Object.entries(family.answers)) {
      const allowed = (key !== "enabled" && definitions[kind].includes(key)) || (kind === "absenceRules" && key === "reviewCategories");
      if (!allowed || !isRecord(response) || (response.status === "to_confirm" ? Object.keys(response).length !== 1 :
        response.status !== "confirmed" || Object.keys(response).length !== 2 || !validAnswer(key, response.value))) {
        throw new HrConfigurationError("Réponse de configuration RH invalide.");
      }
    }
  }
}

function questionnaireRule(kind, family) {
  if (!family?.mode) return { status: "unconfigured", missing: 1 };
  if (family.mode === "unknown") return { status: "to_confirm", missing: 1 };
  if (family.mode === "off") return { status: "not_applicable", values: disabledRules[kind], missing: 0 };
  const answers = Object.fromEntries(Object.entries(family.answers).filter(([, answer]) => answer.status === "confirmed")
    .map(([key, answer]) => [key, answer.value]));
  let required = definitions[kind].filter((key) => key !== "enabled");
  let values = { ...answers };
  if (kind === "clockRules" || kind === "overtime") values.enabled = true;
  if (kind === "overtime") {
    if (answers.source && answers.source !== "planning") {
      required = required.filter((key) => key !== "planningAttribution");
      values.planningAttribution = null;
    }
    if (answers.nightRate === null) {
      required = required.filter((key) => !["nightStart", "nightEnd", "plannedNightGross"].includes(key));
      Object.assign(values, { nightStart: null, nightEnd: null, plannedNightGross: false });
    }
  }
  if (kind === "rules") {
    required = ["mode"];
    if (answers.mode === "basket") required.push("amount");
    else if (answers.mode) {
      required.push("basis");
      if (answers.mode === "combined") required.push("amount");
      if (["days", "monthly"].includes(answers.basis)) required.push("quantity");
      if (answers.basis === "criteria") required.push("criteria");
    }
    values = Object.fromEntries(required.filter((key) => Object.hasOwn(answers, key)).map((key) => [key, answers[key]]));
  }
  if (kind === "absenceRules") {
    required = ["categories", "reviewCategories"];
    values = { categories: answers.categories };
  }
  const missing = required.filter((key) => !Object.hasOwn(answers, key) || (key === "reviewCategories" && answers[key] !== true)).length;
  if (missing) return { status: "to_confirm", missing };
  const normalized = portableValues(kind, values);
  return normalized ? { status: "confirmed", values: normalized, missing: 0 } :
    { status: "to_confirm", missing: 1, invalid: true };
}

function assessment(draft) {
  return Object.fromEntries(kinds.map((kind) => [kind, questionnaireRule(kind, draft?.families[kind])]));
}

async function draftOverview({ restaurantId, ownerId }) {
  const restaurant = await destination(restaurantId, undefined, ownerId);
  const [draft, records] = await Promise.all([
    Draft.findById(restaurant._id).lean(),
    Input.find({ restaurant: restaurant._id, employee: null, profile: null, kind: { $in: kinds } })
      .select("kind date values").sort({ date: -1 }).lean(),
  ]);
  const active = {};
  const planned = {};
  const today = toLocalDateKey(new Date());
  for (const record of records) {
    if (!portableValues(record.kind, record.values)) continue;
    const cutoff = record.kind === "rules" ? today.slice(0, 7) : today;
    const result = record.date <= cutoff ? active : planned;
    if (!Object.hasOwn(result, record.kind)) result[record.kind] = { date: record.date, ...(record.kind === "hoursRules" &&
      { start: record.values.start }) };
  }
  return { target: { id: String(restaurant._id), name: restaurant.name }, minimumDate: futureDate(),
    revision: draft?.revision || 0, step: draft?.step || 0, families: draft?.families || {}, effects: draft?.effects || {},
    statuses: Object.fromEntries(Object.entries(assessment(draft)).map(([kind, { status, missing, invalid }]) => [kind, { status, missing, invalid }])),
    active, planned, needsSetup: kinds.some((kind) => !active[kind] && !planned[kind]) };
}

const staleDraft = () => new HrConfigurationError("Ce brouillon a changé dans une autre session. Rechargez-le avant de poursuivre.", 409);

async function saveDraft({ restaurantId, ownerId, draft }) {
  if (!draft || typeof draft !== "object") throw new HrConfigurationError("Brouillon manquant.");
  validateDraft(draft);
  const restaurant = await destination(restaurantId, undefined, ownerId);
  const previous = await Draft.findById(restaurant._id).select("intents").lean();
  const intents = Object.fromEntries(Object.entries(draft.families).filter(([, item]) => item.mode === "on")
    .map(([kind]) => [kind, previous?.intents?.[kind] || futureDate()]));
  try {
    const changed = await Draft.updateOne({ _id: restaurant._id, revision: draft.revision },
      { $set: { step: draft.step, families: draft.families, intents, effects: draft.effects || {} }, $inc: { revision: 1 } },
      { upsert: draft.revision === 0 });
    if (!changed.modifiedCount && !changed.upsertedCount) throw staleDraft();
    return draftOverview({ restaurantId, ownerId });
  } catch (error) {
    if (error.code === 11000) throw staleDraft();
    throw error;
  }
}

async function manualPlan(args) {
  const restaurant = await destination(args.restaurantId, undefined, args.ownerId);
  const draft = await Draft.findById(restaurant._id).lean();
  if (!draft || draft.revision !== args.revision) throw staleDraft();
  const date = toLocalDateKey(draft.updatedAt);
  const rules = Object.fromEntries(Object.entries(assessment(draft)).map(([kind, result]) => {
    const confirmed = Boolean(result.values);
    return [kind, { status: confirmed ? "confirmed" : "to_confirm",
      origin: { system: "gusto", path: originPath, consultedOn: date }, values: result.values || null,
      note: result.status === "not_applicable" ? "Dispositif déclaré non applicable par le restaurant."
        : confirmed ? "Choix confirmés dans le questionnaire." : "Réponses à compléter. Les réglages en vigueur seront conservés.",
      ...(confirmed && { review: { on: date, reason: "Choix explicites du restaurant dans le questionnaire." } }) }];
  }));
  return { ...args, configuration: { format: FORMAT, version: VERSION, metadata: { source: "gusto", establishment: restaurant.name, collectedOn: date },
    rules, observations: [], questions: [] } };
}

async function previewDraft(args) {
  return previewImport(await manualPlan(args));
}

async function applyDraft(args) {
  const plan = await manualPlan(args);
  return applyImport({ ...plan, beforeApply: async (session) => {
    const lock = await Draft.updateOne({ _id: args.restaurantId, revision: args.revision }, { $inc: { applications: 1 } },
      { session, timestamps: false });
    if (!lock.modifiedCount) throw staleDraft();
  } });
}

module.exports = { originPath, questionnaireRule, draftOverview, saveDraft, previewDraft, applyDraft };
