const { isDeepStrictEqual } = require("node:util");
const { validInputDate, validateValues } = require("./personnel-report-pay.service");
const { isValidDateKey } = require("./time-clock.service");

const FORMAT = "gusto.hr-configuration";
const VERSION = 1;
const definitions = {
  clockRules: ["enabled", "earlyIn", "lateIn", "earlyOut", "lateOut", "roundMinutes", "pause"],
  overtime: ["enabled", "source", "ordinary", "firstEnd", "secondEnd", "firstRate", "secondRate", "lastRate",
    "complementBand", "complementFirstRate", "complementLastRate", "workdays", "creditedAbsences", "weekdays", "paidLeaveDays",
    "nightStart", "nightEnd", "nightRate", "sundayRate", "holidayRate", "planningAttribution", "plannedNightGross", "countHolidays", "structuralMonthly"],
  rules: ["mode", "basis", "quantity", "amount", "criteria"],
  leaveRules: ["startMonth", "referenceMonth", "unit", "excludeHolidays", "preserveCarry", "assimilated", "weekdays"],
  absenceRules: ["categories"],
  hoursRules: ["start", "enhanced"],
};
const kinds = Object.keys(definitions);
const disabledRules = {
  clockRules: { enabled: false }, overtime: { enabled: false, paidLeaveDays: null },
  rules: { mode: null, basis: null, quantity: null, amount: null, criteria: null },
  leaveRules: { startMonth: null }, absenceRules: { categories: {} }, hoursRules: { start: null, enhanced: false },
};
const datedSamples = { clockRules: "2026-01-05", overtime: "2026-01-05", rules: "2026-01",
  hoursRules: "2026-01-05", absenceRules: "2026-01-01", leaveRules: "2026-01-01" };
const statuses = ["confirmed", "to_confirm", "unavailable"];
const systems = ["skello", "gusto"];

class HrConfigurationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const record = (value) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max &&
  !/\p{Cc}|\b[\da-f]{24}\b|[^\s@]+@[^\s@]+\.[^\s@]+/iu.test(value);
const dateKey = (value) => typeof value === "string" && isValidDateKey(value);
const list = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
const optionalText = (value, max) => value === null || text(value, max);
const origin = (value) => exactKeys(value, ["system", "path", "consultedOn"]) && systems.includes(value.system) &&
  text(value.path, 180) && dateKey(value.consultedOn);
const observationValue = (value) => value === null || typeof value === "boolean" || Number.isFinite(value) || text(value, 400);

function portableValues(kind, values) {
  if (!record(values)) return null;
  const normalized = validateValues(kind, values, datedSamples[kind] || "-");
  if (!normalized) return null;
  if (kind !== "overtime") return normalized;
  const { paidLeaveDays = null, ...rest } = normalized;
  if (!rest.enabled) return { ...rest, paidLeaveDays };
  return { planningAttribution: null, plannedNightGross: false, countHolidays: false, structuralMonthly: false, ...rest, paidLeaveDays };
}

function strictValues(kind, values) {
  if (!record(values)) return false;
  let fields = definitions[kind];
  if (kind === "overtime" && values.enabled === false) fields = ["enabled", "paidLeaveDays"];
  if (kind === "clockRules" && values.enabled === false) fields = ["enabled"];
  if (kind === "leaveRules" && values.startMonth === null) fields = ["startMonth"];
  if (!exactKeys(values, fields)) return false;
  // Comparing the canonical form also rejects unexpected nested members, coercion and discarded values.
  return isDeepStrictEqual(portableValues(kind, values), values);
}

function readHrConfiguration(value) {
  if (!exactKeys(value, ["format", "version", "metadata", "rules", "observations", "questions"]) || value.format !== FORMAT) {
    throw new HrConfigurationError("Structure de configuration RH invalide.");
  }
  if (value.version !== VERSION) throw new HrConfigurationError("Version de configuration RH non prise en charge.");
  const { metadata, rules, observations, questions } = value;
  if (!exactKeys(metadata, ["source", "establishment", "collectedOn"]) || !systems.includes(metadata.source) ||
      !text(metadata.establishment, 180) || !dateKey(metadata.collectedOn) || !record(rules) || !Object.keys(rules).length) {
    throw new HrConfigurationError("Métadonnées ou familles de règles RH invalides.");
  }
  for (const [kind, rule] of Object.entries(rules)) {
    const keys = ["status", "origin", "values", "note"];
    if (record(rule) && Object.hasOwn(rule, "review")) keys.push("review");
    if (!Object.hasOwn(definitions, kind) || !exactKeys(rule, keys) ||
        !statuses.includes(rule.status) || !origin(rule.origin) || rule.origin.consultedOn > metadata.collectedOn ||
        !optionalText(rule.note, 800) || (rule.status !== "confirmed" && rule.note === null) ||
        (Object.hasOwn(rule, "review") && (rule.status !== "confirmed" || !exactKeys(rule.review, ["on", "reason"]) ||
          !dateKey(rule.review.on) || !text(rule.review.reason, 500))) ||
        (rule.values === null ? rule.status === "confirmed" : rule.status === "unavailable" || !strictValues(kind, rule.values))) {
      throw new HrConfigurationError(`Famille RH invalide ou incomplète (${Object.hasOwn(definitions, kind) ? kind : "inconnue"}).`);
    }
  }
  if (!list(observations, 100, (item) => exactKeys(item, ["id", "label", "status", "origin", "value", "gusto", "note"]) &&
      typeof item.id === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(item.id) && text(item.label, 140) && statuses.includes(item.status) &&
      origin(item.origin) && item.origin.consultedOn <= metadata.collectedOn && observationValue(item.value) &&
      optionalText(item.gusto, 180) && optionalText(item.note, 800) &&
      (item.status === "confirmed" ? item.value !== null : item.note !== null)) ||
      new Set(observations.map(({ id }) => id)).size !== observations.length || !list(questions, 30, (item) => text(item, 500))) {
    throw new HrConfigurationError("Observations ou questions de configuration RH invalides.");
  }
  return value;
}

function storageDate(kind, effect) {
  const date = kind === "rules" ? effect.slice(0, 7) : effect;
  return validInputDate(kind, date) && (kind !== "rules" || effect.endsWith("-01")) ? date : null;
}

function confirmRule(input, { kind, values, reason, confirmed }, on) {
  const configuration = readHrConfiguration(input);
  const rule = configuration.rules[kind];
  if (!Object.hasOwn(configuration.rules, kind) ||
      (rule.status === "confirmed" && !(kind === "rules" && rule.values?.amount != null && !rule.review)) ||
      confirmed !== true || !text(reason, 500) ||
      !record(values) || Object.keys(values).some((field) => !definitions[kind].includes(field))) {
    throw new HrConfigurationError("Renseignez et justifiez la règle avant de la confirmer.");
  }
  const normalized = portableValues(kind, values);
  if (!normalized ||
    (kind === "absenceRules" && !strictValues(kind, values)) ||
    (kind === "rules" && values.criteria != null && !isDeepStrictEqual(values.criteria, normalized.criteria))) {
    throw new HrConfigurationError("Vérifiez les valeurs de la règle proposée.");
  }
  return readHrConfiguration({ ...configuration, rules: { ...configuration.rules, [kind]:
    { ...rule, status: "confirmed", values: normalized, review: { on, reason } } } });
}

module.exports = { FORMAT, VERSION, kinds, definitions, disabledRules, HrConfigurationError, readHrConfiguration, portableValues, storageDate, confirmRule };
