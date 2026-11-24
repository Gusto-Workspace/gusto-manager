const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const Employee = require("../../models/employee.model");
const PlanningAction = require("../../models/planning-action.model");
const { resolvePlanningAbsence } = require("./planning-absence.service");
const { assertPlanningUnlocked, planningFence } = require("./planning-period.service");
const { readWorkDetails } = require("./planning-shift.service");
const { enqueueEmployeeAssetDeletions } = require("./employee-asset-deletion.service");

const MAX_SHIFTS = 200;
const DAY = 86_400_000;
const parisClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const parisWall = (date) => parisClock.format(date).replace(" ", "T");
const civil = (date) => Date.parse(`${date}T00:00:00Z`);
const key = (date) => new Date(date).toISOString().slice(0, 10);
const idString = (value) => String(value ?? "");
const validId = (value) => typeof value === "string" && /^[\da-f]{24}$/.test(value);
const objectId = (value) => new mongoose.Types.ObjectId(value);
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(civil(value)) && key(civil(value)) === value;
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function failure(status, message, details = {}) {
  return Object.assign(new Error(message), { planningStatus: status, ...details });
}

function shiftClockToDate(clock, date, original) {
  const wall = `${date}T${clock}`;
  if (original && parisWall(original) === wall) return new Date(original);
  const utc = Date.parse(`${wall}Z`);
  for (const hours of [2, 1]) {
    const candidate = new Date(utc - hours * 3_600_000);
    if (Number.isFinite(+candidate) && parisWall(candidate) === wall) return candidate;
  }
  return null;
}

function shiftPattern(shift, post) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  if (!Number.isFinite(+start) || !(end > start)) throw failure(400, "Les horaires du shift d’origine sont invalides.");
  const [day, startClock] = parisWall(start).split("T");
  const [endDay, endClock] = parisWall(end).split("T");
  return {
    startClock, endClock, nights: (civil(endDay) - civil(day)) / DAY,
    title: shift.title || "",
    position: shift.position ?? post ?? "",
    breakMinutes: shift.breakMinutes ?? 0,
    notes: shift.notes ?? "",
    mealCount: shift.mealCount ?? 0,
    mealPeriods: Array.isArray(shift.mealPeriods) ? shift.mealPeriods : [],
  };
}

function placeShift(pattern, date, original) {
  const start = shiftClockToDate(pattern.startClock, date, original?.start);
  const end = shiftClockToDate(pattern.endClock, key(civil(date) + pattern.nights * DAY), original?.end);
  if (!start || !end || end <= start ||
      !readWorkDetails(pattern, null, start, end)) {
    throw failure(409, `Les horaires ou la pause du shift sont incompatibles avec le ${date}.`, { date });
  }
  return { start, end };
}

function validateEntry(entry, operation) {
  if (!entry || !validId(entry.employeeId) || !validId(entry.shiftId) ||
      (entry.sourceDate !== undefined && (operation !== "copy" || !validDate(entry.sourceDate))) ||
      (operation !== "delete" && (!validId(entry.targetEmployeeId) || !validDate(entry.date)))) {
    throw failure(400, "Un shift ou une destination est invalide.");
  }
}

function verifyLength(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_SHIFTS) {
    throw failure(400, `Sélectionnez entre 1 et ${MAX_SHIFTS} shifts.`);
  }
}

async function loadEmployees(restaurant, rosterIds, employeeIds, session) {
  const ids = [...new Set(employeeIds)].sort();
  if (ids.some((id) => !rosterIds.has(id))) {
    throw failure(404, "Un salarié n’appartient plus à ce restaurant.");
  }
  const employees = await Employee.collection.find({
    _id: { $in: ids.map(objectId) }, restaurants: restaurant,
    accountType: { $ne: "accountant" },
  }, { session, projection: { restaurantProfiles: 1, post: 1, __v: 1 } }).toArray();
  if (employees.length !== ids.length) throw failure(404, "Un salarié n’appartient plus à ce restaurant.");
  return new Map(employees.map((employee) => {
    const profile = (employee.restaurantProfiles || []).find((p) => idString(p.restaurant) === idString(restaurant));
    return [idString(employee._id), {
      employee, profile, removes: new Set(), additions: [], files: [], copiedWork: new Map(),
    }];
  }));
}

function readSource(employees, entry) {
  const holder = employees.get(entry.employeeId);
  const shift = holder?.profile?.shifts?.find(({ _id }) => idString(_id) === entry.shiftId);
  if (!shift) throw failure(409, "Un créneau de la sélection a changé ou a été retiré.");
  if ((entry.start && entry.start !== new Date(shift.start).toISOString()) ||
      (entry.end && entry.end !== new Date(shift.end).toISOString())) {
    throw failure(409, "Les horaires d’un shift de la sélection ont changé.");
  }
  return { holder, shift };
}

function copyShift(pattern, range) {
  const { title, position, breakMinutes, notes, mealCount, mealPeriods } = pattern;
  return {
    _id: new mongoose.Types.ObjectId(), ...range, title, position, breakMinutes, notes,
    requiresPlanningPublication: true,
    mealCount, mealPeriods, isLeave: false, source: "manual",
  };
}

function copyAbsence(shift, { sourceDate, date }) {
  if (!sourceDate) throw failure(400, "Sélectionnez une journée du congé à copier.");
  const dayStart = shiftClockToDate("00:00:00", sourceDate);
  const dayEnd = shiftClockToDate("00:00:00", key(civil(sourceDate) + DAY));
  const originalStart = new Date(shift.start);
  const originalEnd = new Date(shift.end);
  if (!dayStart || !dayEnd || !(originalEnd > dayStart) || !(originalStart < dayEnd)) {
    throw failure(409, "Le congé ne couvre plus la journée sélectionnée.");
  }

  const sourceStart = originalStart < dayStart ? dayStart : originalStart;
  const sourceEnd = originalEnd >= dayEnd ? new Date(+dayEnd - 1) : originalEnd;
  const start = shiftClockToDate(parisWall(sourceStart).slice(11), date, sourceStart);
  const end = shiftClockToDate(parisWall(sourceEnd).slice(11), date, sourceEnd);
  if (start) start.setUTCMilliseconds(sourceStart.getUTCMilliseconds());
  if (end) end.setUTCMilliseconds(sourceEnd.getUTCMilliseconds());
  if (!start || !end || end <= start) {
    throw failure(409, `Les horaires du congé sont incompatibles avec le ${date}.`, { date });
  }

  const absence = resolvePlanningAbsence({}, {
    manualAbsence: true,
    currentShift: shift,
    datesChanged: +sourceStart !== +originalStart || +sourceEnd !== +originalEnd,
  });
  return {
    _id: new mongoose.Types.ObjectId(), start, end, title: "", isLeave: true,
    requiresPlanningPublication: true,
    leaveRequestId: null, ...absence, source: "manual",
  };
}

function overlaps(a, b) {
  return new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start);
}

function preservesSourceOverlap(first, second) {
  return first && second &&
    first.employeeId === second.employeeId && first.sourceDay === second.sourceDay &&
    first.date === second.date && first.shiftId !== second.shiftId &&
    overlaps(first.shift, second.shift);
}

function checkDestinations(employees, isLeaveShift) {
  for (const [employeeId, target] of employees) {
    if (!target.additions.length) continue;
    const candidates = (target.profile?.shifts || []).filter((shift) => !target.removes.has(idString(shift._id)));
    for (const shift of target.additions) {
      const conflict = candidates.find((other) => overlaps(shift, other) &&
        !preservesSourceOverlap(target.copiedWork.get(shift), target.copiedWork.get(other)));
      if (conflict) {
        const date = parisWall(shift.start).slice(0, 10);
        throw failure(409, isLeaveShift(conflict)
          ? `Une absence bloque une destination le ${date}.`
          : `Un shift chevauche une destination le ${date}. Le planning n’a pas été modifié.`, {
          employeeId, date, conflictType: isLeaveShift(conflict) ? "leave_overlap" : "shift_overlap",
        });
      }
      candidates.push(shift);
    }
  }
}

async function writeEmployee(restaurant, target, session) {
  const { employee, profile, removes, additions, files } = target;
  if (!removes.size && !additions.length) return;
  const filter = { _id: employee._id, restaurants: restaurant };
  if (!profile) {
    const newProfile = {
      _id: new mongoose.Types.ObjectId(), restaurant, shifts: additions,
      ...(files.length && { planningFiles: files }),
    };
    await Employee.collection.updateOne(filter, [{
      $set: {
        restaurantProfiles: { $concatArrays: [{ $ifNull: ["$restaurantProfiles", []] }, { $literal: [newProfile] }] },
        __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
      },
    }], { session });
    return;
  }
  const field = "restaurantProfiles.$[profile]";
  const options = { session, arrayFilters: [{ "profile.restaurant": restaurant }] };
  if (removes.size) {
    const identifiers = [...removes].map(objectId);
    await Employee.collection.updateOne(filter, {
      $pull: {
        [`${field}.shifts`]: { _id: { $in: identifiers } },
        [`${field}.planningFiles`]: { shiftId: { $in: identifiers } },
      },
      $inc: { __v: 1 },
    }, options);
  }
  if (additions.length) {
    await Employee.collection.updateOne(filter, {
      $push: {
        [`${field}.shifts`]: { $each: additions },
        ...(files.length && { [`${field}.planningFiles`]: { $each: files } }),
      },
      $inc: { __v: 1 },
    }, options);
  }
}

function summarizeUpdates(employees) {
  return [...employees].map(([employeeId, { profile, removes, additions }]) => ({
    employeeId,
    shifts: [...(profile?.shifts || []).filter((shift) => !removes.has(idString(shift._id))), ...additions],
  }));
}

async function applyPlanningAction(restaurant, rosterIds, body, isLeaveShift) {
  const operation = body?.operation;
  if (!["copy", "move", "delete"].includes(operation) ||
      typeof body.requestId !== "string" || !uuid.test(body.requestId)) {
    throw failure(400, "L’action demandée est invalide.");
  }
  const { entries } = body;
  verifyLength(entries);
  for (const entry of entries) validateEntry(entry, operation);
  const receiptId = `${restaurant}:${body.requestId.toLowerCase()}`;
  const signature = createHash("sha256").update(JSON.stringify({ operation, entries })).digest("hex");

  async function replay(receipt, session) {
    if (receipt.signature !== signature) throw failure(409, "Cet identifiant de demande a déjà été utilisé.");
    // A completed command stays idempotent even if a former employee left in the meantime.
    const ids = receipt.employees.map(idString).filter((id) => rosterIds.has(id));
    return { updates: summarizeUpdates(await loadEmployees(restaurant, rosterIds, ids, session)), jobIds: [], replayed: true };
  }

  try {
    return await mongoose.connection.transaction(async (session) => {
      const receipt = await PlanningAction.findById(receiptId).session(session).lean();
      if (receipt) return replay(receipt, session);
      await planningFence(restaurant, session);
      const employees = await loadEmployees(restaurant, rosterIds, entries.flatMap((entry) =>
        operation === "delete" ? [entry.employeeId] : [entry.employeeId, entry.targetEmployeeId],
      ), session);
      const deletedAssets = [];
      const used = new Set();
      for (const entry of entries) {
        const target = employees.get(entry.targetEmployeeId);
        const { holder, shift } = readSource(employees, entry);
        const moving = operation === "move";
        if (isLeaveShift(shift)) {
          if (operation === "copy") {
            target.additions.push(copyAbsence(shift, entry));
            continue;
          }
          if (moving || shift.leaveRequestId) {
            throw failure(409, "Ce congé se gère depuis les demandes de congés ou son formulaire.");
          }
        }
        if (moving || operation === "delete") {
          if (used.has(entry.shiftId)) throw failure(400, "Un shift ne peut être déplacé ou supprimé qu’une fois.");
          used.add(entry.shiftId);
          if (moving && target === holder && parisWall(shift.start).slice(0, 10) === entry.date) continue;
          holder.removes.add(entry.shiftId);
          const files = (holder.profile.planningFiles || []).filter((file) => idString(file.shiftId) === entry.shiftId);
          if (moving) target.files.push(...files);
          else deletedAssets.push(...files);
        }
        if (operation === "delete") continue;
        const pattern = shiftPattern(shift, holder.profile.snapshot?.post ?? holder.employee.post);
        const range = placeShift(pattern, entry.date, shift);
        if (moving) {
          target.additions.push({ ...shift, ...range, position: pattern.position, requiresPlanningPublication: true });
        } else {
          const copy = copyShift(pattern, range);
          target.copiedWork.set(copy, {
            employeeId: entry.employeeId, shiftId: entry.shiftId, shift,
            sourceDay: parisWall(new Date(shift.start)).slice(0, 10), date: entry.date,
          });
          target.additions.push(copy);
        }
      }
      await assertPlanningUnlocked(restaurant, [...employees.values()].flatMap(({ profile, removes, additions }) => [
        ...(profile?.shifts || []).filter(({ _id }) => removes.has(String(_id))),
        ...additions,
      ]), session);
      checkDestinations(employees, isLeaveShift);
      for (const target of employees.values()) await writeEmployee(restaurant, target, session);
      const jobIds = await enqueueEmployeeAssetDeletions(deletedAssets, session);
      const updates = summarizeUpdates(employees);
      await PlanningAction.create([{
        _id: receiptId, restaurant, kind: "receipt", signature, employees: [...employees.keys()],
      }], { session });
      return { updates, jobIds };
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const receipt = await PlanningAction.findById(receiptId).lean();
    if (!receipt) throw error;
    return replay(receipt);
  }
}

module.exports = { applyPlanningAction };
