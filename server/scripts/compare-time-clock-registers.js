const { readFileSync } = require("node:fs");
const { getRangeBounds } = require("../services/employees/time-clock.service");

const timings = ["plannedIn", "plannedOut", "clockedIn", "clockedOut", "paidIn", "paidOut"];
const minutes = ["plannedBreak", "clockedBreak", "paidBreak", "paidMinutes", "lateMinutes"];
const flags = ["validated", "absent"];
const lists = ["corrections", "anomalies"];
const fields = [...timings, ...minutes, ...flags, ...lists];
const code = /^[a-z0-9_-]{1,40}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function normalizeField(field, value, label) {
  if (value == null) return null;
  if (timings.includes(field) && typeof value === "string" && timestamp.test(value) &&
    getRangeBounds(value.slice(0, 10), value.slice(0, 10)) && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (minutes.includes(field) && Number.isSafeInteger(value) && value >= 0) return value;
  if (flags.includes(field) && typeof value === "boolean") return value;
  if (lists.includes(field) && Array.isArray(value) && value.every((item) => typeof item === "string" && code.test(item))) {
    return [...new Set(value)].sort();
  }
  throw new Error(`${label}: invalid ${field}`);
}

function indexRegister(register, source, from, to) {
  if (!Array.isArray(register)) throw new Error(`${source}: expected an array of services`);
  const unique = new Map();
  register.forEach((row, index) => {
    const label = `${source}, row ${index + 1}`;
    const { employee, date, service } = row || {};
    if (typeof employee !== "string" || !code.test(employee) || typeof service !== "string" || !code.test(service) ||
      !getRangeBounds(date, date) || date < from || date > to) {
      throw new Error(`${label}: expected pseudonymous employee and service codes and a date in the selected period`);
    }
    const key = `${employee}:${date}:${service}`;
    if (unique.has(key)) throw new Error(`${source}: duplicate service ${key}`);
    unique.set(key, {
      employee, date, service,
      values: Object.fromEntries(fields.map((field) => [field, normalizeField(field, row[field], label)])),
    });
  });
  return unique;
}

function compareTimeClockRegisters({ skello, gusto, from, to }) {
  if (!getRangeBounds(from, to)) throw new Error("Invalid comparison period");
  const expected = indexRegister(skello, "Skello", from, to);
  const observed = indexRegister(gusto, "Gusto", from, to);
  const totals = { skello: 0, gusto: 0, services: 0 };
  const statuses = { matched: 0, different: 0, incomplete: 0, missingSkello: 0, missingGusto: 0 };
  const services = [];
  for (const key of [...new Set([...expected.keys(), ...observed.keys()])].sort()) {
    const left = expected.get(key);
    const right = observed.get(key);
    const { employee, date, service } = left || right;
    const differences = [];
    const unavailable = [];
    if (left && right) {
      for (const field of fields) {
        const skello = left.values[field];
        const gusto = right.values[field];
        if (skello == null || gusto == null) unavailable.push({ field, skello: skello == null, gusto: gusto == null });
        else if (JSON.stringify(skello) !== JSON.stringify(gusto)) differences.push({ field, skello, gusto });
      }
      if (left.values.paidMinutes != null && right.values.paidMinutes != null) {
        totals.skello += left.values.paidMinutes;
        totals.gusto += right.values.paidMinutes;
        totals.services += 1;
      }
    }
    const status = !left ? "missingSkello" : !right ? "missingGusto" : differences.length ? "different" :
      unavailable.length ? "incomplete" : "matched";
    statuses[status] += 1;
    services.push({ employee, date, service, status, differences, unavailable });
  }
  return { from, to, counts: { skello: expected.size, gusto: observed.size, ...statuses }, comparablePaidMinutes: totals, services };
}

if (require.main === module) {
  try {
    const [from, to, skelloPath, gustoPath] = process.argv.slice(2);
    if (!skelloPath || !gustoPath) throw new Error("Usage: node scripts/compare-time-clock-registers.js FROM TO SKELLO.json GUSTO.json");
    const skello = JSON.parse(readFileSync(skelloPath, "utf8"));
    const gusto = JSON.parse(readFileSync(gustoPath, "utf8"));
    console.log(JSON.stringify(compareTimeClockRegisters({ skello, gusto, from, to }), null, 2));
  } catch (error) {
    console.error(error instanceof SyntaxError ? "Invalid JSON in one of the two inputs." : error.message);
    process.exitCode = 1;
  }
}

module.exports = { compareTimeClockRegisters };
