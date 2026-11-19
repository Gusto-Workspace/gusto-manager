const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const { TimeClockPin } = require("../../models/time-clock-device.model");
const { isPersonalPin, lookupPin, revealPin } = require("./time-clock-device.service");
const {
  activeProfileId, credentialIsCurrent, PIN_COUNT, provisionMissingClockPin,
  workforceRoster, withClockPinTransaction,
} = require("./time-clock-pin.service");

const enabled = { "options.employees": true };
const memberFields = "restaurantProfiles.restaurant restaurantProfiles._id";
const credentialFields = "restaurant employee profile lookup sealedPin";
const actor = "migration:time-clock-pin-backfill";

async function hasUniquePinIndexes() {
  let indexes;
  try {
    indexes = await TimeClockPin.collection.indexes();
  } catch (error) {
    if (error.code === 26) return false;
    throw error;
  }
  return ["employee", "lookup"].every((field) => indexes.some((index) =>
    index.unique === true && !index.sparse && !index.partialFilterExpression &&
    Object.keys(index.key).join(",") === `restaurant,${field}` &&
    index.key.restaurant === 1 && index.key[field] === 1,
  ));
}

function credentialMatchesSecret(credential) {
  try {
    const pin = revealPin(credential);
    return isPersonalPin(pin) && lookupPin(credential.restaurant, pin) === credential.lookup;
  } catch {
    return false;
  }
}

async function canVerifyExistingSecret() {
  let hasCredentials = false;
  const credentials = TimeClockPin.find({}).select(credentialFields).lean().cursor();
  for await (const credential of credentials) {
    hasCredentials = true;
    if (credentialMatchesSecret(credential)) return true;
  }
  return !hasCredentials;
}

function collectCredentials(credentials) {
  const byEmployee = new Map();
  const lookups = new Set();
  const problems = new Set();

  for (const credential of credentials) {
    const employeeId = String(credential.employee);
    if (byEmployee.has(employeeId) || lookups.has(credential.lookup)) problems.add("credential_collision");
    const valid = credentialMatchesSecret(credential);
    byEmployee.set(employeeId, { profile: credential.profile, valid });
    lookups.add(credential.lookup);
    if (!valid) problems.add("credential_integrity");
  }
  return { byEmployee, available: Math.max(0, PIN_COUNT - lookups.size), problems };
}

async function assign(restaurantId, employeeId) {
  return withClockPinTransaction(async (session) => {
    const restaurant = await Restaurant.findOne({ _id: restaurantId, employees: employeeId, ...enabled })
      .select("employees").session(session).lean();
    if (!restaurant) return "no_longer_eligible";
    const roster = workforceRoster(restaurantId, restaurant);
    const employee = await Employee.findOne({ ...roster, _id: { ...roster._id, $eq: employeeId } })
      .select(memberFields).session(session).lean();
    if (!employee) return "no_longer_eligible";
    return provisionMissingClockPin({
      restaurant: restaurantId, employee: employee._id, profile: activeProfileId(employee, restaurantId),
      changedBy: actor, session,
    });
  });
}

async function runPinBackfill({ apply = false } = {}) {
  const indexesReady = await hasUniquePinIndexes();
  const secretVerified = await canVerifyExistingSecret();
  const totals = {
    restaurants: 0, restaurantsDisabled: 0, eligible: 0, configured: 0,
    missing: 0, planned: 0, assigned: 0, ignored: 0, errors: 0,
  };
  const report = { mode: apply ? "apply" : "dry-run", indexesReady, secretVerified, totals, issues: [] };

  function issue(code, restaurant, employee) {
    totals.errors++;
    report.issues.push({
      code,
      ...(restaurant && { restaurantId: String(restaurant) }),
      ...(employee && { employeeId: String(employee) }),
    });
  }

  if (!indexesReady) issue("missing_unique_indexes");
  if (!secretVerified) issue("secret_verification_failed");
  if (apply && (!indexesReady || !secretVerified)) return report;
  totals.restaurantsDisabled = await Restaurant.countDocuments({ "options.employees": { $ne: true } });
  const restaurants = Restaurant.find(enabled).select("employees").sort({ _id: 1 }).lean().cursor();
  for await (const restaurant of restaurants) {
    const restaurantId = restaurant._id;
    totals.restaurants++;
    try {
      const [employees, credentials] = await Promise.all([
        Employee.find(workforceRoster(restaurantId, restaurant)).select(memberFields).sort({ _id: 1 }).lean(),
        TimeClockPin.find({ restaurant: restaurantId }).select(credentialFields).lean(),
      ]);
      const inventory = collectCredentials(credentials);
      totals.eligible += employees.length;
      totals.ignored += new Set((restaurant.employees || []).map(String)).size - employees.length;
      for (const code of inventory.problems) issue(code, restaurantId);
      let available = inventory.available;

      for (const employee of employees) {
        const stored = inventory.byEmployee.get(String(employee._id));
        if (stored) {
          if (!stored.valid) issue("invalid_credential", restaurantId, employee._id);
          else if (credentialIsCurrent(stored, employee, restaurantId)) totals.configured++;
          else issue("profile_mismatch", restaurantId, employee._id);
          continue;
        }

        totals.missing++;
        if (!secretVerified || inventory.problems.size) {
          issue("assignment_blocked", restaurantId, employee._id);
          continue;
        }
        if (!apply) {
          if (available > 0) {
            totals.planned++;
            available--;
          } else issue("capacity_exhausted", restaurantId, employee._id);
          continue;
        }

        try {
          const outcome = await assign(restaurantId, employee._id);
          if (outcome === "assigned") totals.assigned++;
          else if (outcome === "already_configured") totals.configured++;
          else if (outcome === "no_longer_eligible") totals.ignored++;
          else issue(outcome, restaurantId, employee._id);
        } catch (error) {
          issue(error.code === 11000 ? "credential_collision" : "assignment_failed", restaurantId, employee._id);
        }
      }
    } catch {
      issue("restaurant_inventory_failed", restaurantId);
    }
  }
  return report;
}

module.exports = { runPinBackfill };
