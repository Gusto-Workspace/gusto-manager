const TimeClockSession = require("../../models/time-clock-session.model");
const Employee = require("../../models/employee.model");
const { payrollConflicts, payrollOverlapMessage, payrollSchedule } = require("./time-clock-payroll.service");

function timeClockConflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

async function lockClockEmployees(restaurant, employees, transaction) {
  const guards = TimeClockSession.db.collection("timeclockwriteguards");
  for (const employee of [...new Set(employees.map(String))].sort()) {
    try {
      // A write to the same guard makes MongoDB retry concurrent transactions even
      // when they are editing different pointage documents.
      await guards.updateOne({ _id: `${restaurant}:${employee}` }, { $inc: { revision: 1 } }, {
        upsert: true, session: transaction,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Two transactions can try to create the first guard at the same time.
      throw Object.assign(timeClockConflict("Le pointage a changé. Réessayez."), { guardCreatedConcurrently: true });
    }
  }
}

async function clockTransaction(operation) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await TimeClockSession.db.transaction(operation);
    } catch (error) {
      if (!error.guardCreatedConcurrently || attempt === 3) throw error;
    }
  }
}

async function assertPayrollIntervals(restaurant, candidates, transaction) {
  const byEmployee = new Map();
  for (const candidate of candidates) {
    const schedule = payrollSchedule(candidate);
    if (!schedule || schedule.absent) continue;
    const employee = String(candidate.employee);
    const group = byEmployee.get(employee) || { candidates: new Map(), start: Infinity, end: -Infinity };
    group.start = Math.min(group.start, +new Date(schedule.clockInAt));
    group.end = Math.max(group.end, +new Date(schedule.clockOutAt));
    group.candidates.set(String(candidate._id), candidate);
    byEmployee.set(employee, group);
  }
  for (const [employee, { start, end, candidates: proposed }] of byEmployee) {
    const siblings = await TimeClockSession.find({
      restaurant, employee, status: "closed", _id: { $nin: [...proposed.keys()] },
      $or: ["", "payroll.", "automaticPayroll."].map((prefix) => ({
        [`${prefix}clockInAt`]: { $lt: new Date(end) },
        [`${prefix}clockOutAt`]: { $gt: new Date(start) },
      })),
    }).select("restaurant employee status clockInAt clockOutAt breaks payroll automaticPayroll").session(transaction).lean();
    const conflicts = payrollConflicts([...siblings, ...proposed.values()]);
    if ([...proposed.keys()].some((id) => conflicts.has(id))) throw timeClockConflict(payrollOverlapMessage);
  }
}

function saveClockSession(session, { raw = false, payroll = false, device = false } = {}) {
  return clockTransaction(async (transaction) => {
    await lockClockEmployees(session.restaurant, [session.employee], transaction);
    if (session.isNew && !await Employee.exists({ _id: session.employee, restaurants: session.restaurant }).session(transaction)) {
      throw timeClockConflict("Ce salarié n’est plus rattaché à cet établissement.");
    }
    if (raw) {
      const selection = { restaurant: session.restaurant, employee: session.employee, _id: { $ne: session._id } };
      const overlap = session.clockOutAt ? {
        clockInAt: { $lt: session.clockOutAt },
        $or: [{ clockOutAt: null }, { clockOutAt: { $gt: session.clockInAt } }],
      } : {
        clockOutAt: { $gt: session.clockInAt },
        ...(!device && { clockInAt: { $lte: session.clockInAt } }),
      };
      if (await TimeClockSession.exists({ ...selection, ...overlap }).session(transaction)) {
        throw timeClockConflict("Ces horaires chevauchent un autre pointage.");
      }
    }
    if (payroll) await assertPayrollIntervals(session.restaurant, [session], transaction);
    return session.save({ session: transaction });
  });
}

module.exports = { assertPayrollIntervals, clockTransaction, lockClockEmployees, saveClockSession, timeClockConflict };
