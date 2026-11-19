const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const Restaurant = require("../../models/restaurant.model");
const Employee = require("../../models/employee.model");
const Notification = require("../../models/notification.model");
const { PlanningDay, PlanningPublication } = require("../../models/planning-period.model");

const DAY = 86_400_000;
const paris = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
});
const dayKey = (date) => paris.format(new Date(date));
const utcDay = (date) => Date.parse(`${date}T00:00:00Z`);
const key = (epoch) => new Date(epoch).toISOString().slice(0, 10);
const dayId = (restaurant, date) => `${restaurant}:${date}`;
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(utcDay(value)) && key(utcDay(value)) === value;
const planningError = (status, message, details = {}) =>
  Object.assign(new Error(message), { planningStatus: status, ...details });

function periodDates(from, to, max = 31) {
  const count = (utcDay(to) - utcDay(from)) / DAY + 1;
  if (!isDate(from) || !isDate(to) || count < 1 || count > max) {
    throw planningError(400, "Choisissez une période de planning valide.");
  }
  return Array.from({ length: count }, (_, i) => key(utcDay(from) + i * DAY));
}

// Every shift write and lock change touches the same existing document first.
// MongoDB retries a write conflict with a fresh snapshot of the locks.
async function planningFence(restaurant, session) {
  await Restaurant.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(restaurant)) }, { $inc: { planningRevision: 1 } }, { session },
  );
}

async function assertPlanningUnlocked(restaurant, shifts, session) {
  if (!shifts.length) return;
  const intervals = shifts.map(({ start, end }) => ({
    start: dayKey(start), end: dayKey(new Date(+new Date(end) - 1)),
  }));
  const first = intervals.reduce((min, range) => range.start < min ? range.start : min, intervals[0].start);
  const last = intervals.reduce((max, range) => range.end > max ? range.end : max, intervals[0].end);
  const locks = await PlanningDay.find({
    restaurant, date: { $gte: first, $lte: last }, lockedAt: { $ne: null },
  }).select("date").session(session).lean();
  const lock = locks.find(({ date }) => intervals.some(({ start, end }) => date >= start && date <= end));
  if (lock) throw planningError(423, "Cette journée est verrouillée. Déverrouillez-la avant de modifier le planning.", {
    conflictType: "planning_locked", date: lock.date,
  });
}

function withPlanningWrite(restaurant, shifts, write) {
  return mongoose.connection.transaction(async (session) => {
    await planningFence(restaurant, session);
    await assertPlanningUnlocked(restaurant, shifts, session);
    return write(session);
  });
}

async function visiblePlanningShifts(restaurant, employeeId, shifts = []) {
  const unpublishedDates = [...new Set(shifts.filter((shift) => shift.requiresPlanningPublication).map((shift) => dayKey(shift.start)))];
  if (!unpublishedDates.length) return shifts;
  const published = await PlanningDay.find({
    restaurant, date: { $in: unpublishedDates }, publishedEmployees: String(employeeId),
  }).select("date").lean();
  const dates = new Set(published.map(({ date }) => date));
  return shifts.filter((shift) => !shift.requiresPlanningPublication || dates.has(dayKey(shift.start)));
}

async function getPlanningState(restaurant, from, to, eligibleIds) {
  const dates = periodDates(from, to);
  const [records, history] = await Promise.all([
    PlanningDay.find({ restaurant, date: { $in: dates } }).lean(),
    PlanningPublication.find({ restaurant, from: { $lte: to }, to: { $gte: from }, effective: { $ne: false } })
      .select("from to author recipients createdAt").sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const byDay = new Map(records.map((record) => [record.date, record]));
  const roster = new Set(eligibleIds);
  let publishedCount = 0;
  const days = dates.map((date) => {
    const record = byDay.get(date);
    const publishedEmployees = (record?.publishedEmployees || []).filter((id) => roster.has(id));
    publishedCount += publishedEmployees.length;
    return { date, locked: Boolean(record?.lockedAt), publishedEmployees };
  });
  return {
    days, history,
    status: !publishedCount ? "unpublished" : publishedCount === roster.size * days.length ? "published" : "partial",
  };
}

async function setPlanningLock(restaurant, { from, to, locked }, author) {
  const dates = periodDates(from, to);
  if (typeof locked !== "boolean") throw planningError(400, "Verrouillage invalide.");
  await withPlanningWrite(restaurant, [], (session) => PlanningDay.bulkWrite(dates.map((date) => ({
    updateOne: {
      filter: { _id: dayId(restaurant, date) },
      update: { $setOnInsert: { restaurant, date }, $set: {
        lockedAt: locked ? new Date() : null, lockedBy: locked ? author : null,
      } },
      upsert: true,
    },
  })), { session }));
}

async function publishPlanning(restaurant, request, author, recipients) {
  const { from, to, requestId, email, notify } = request;
  const dates = periodDates(from, to, 7);
  if (dates.length !== 1 && (dates.length !== 7 || new Date(utcDay(from)).getUTCDay() !== 1)) {
    throw planningError(400, "Choisissez un jour ou une semaine du lundi au dimanche.");
  }
  if (typeof requestId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId) ||
      typeof email !== "boolean" || typeof notify !== "boolean" || !recipients.length) {
    throw planningError(400, "La demande de publication est invalide.");
  }
  const ids = recipients.map(({ employeeId }) => employeeId);
  const signature = createHash("sha256").update(JSON.stringify([from, to, [...ids].sort(), email, notify])).digest("hex");
  const id = `${restaurant}:${requestId.toLowerCase()}`;
  return withPlanningWrite(restaurant, [], async (session) => {
    const previous = await PlanningPublication.findById(id).session(session).lean();
    if (previous) {
      if (previous.signature !== signature) throw planningError(409, "Cette demande a déjà été utilisée.");
      return { publication: previous, notifications: [] };
    }
    if (!await Restaurant.exists({ _id: restaurant, employees: { $all: ids } }).session(session) ||
        await Employee.countDocuments({ _id: { $in: ids }, restaurants: restaurant, accountType: { $ne: "accountant" } })
          .session(session) !== ids.length) {
      throw planningError(409, "La liste des salariés du restaurant a changé.");
    }
    const grants = await PlanningDay.bulkWrite(dates.map((date) => ({
      updateOne: {
        filter: { _id: dayId(restaurant, date) },
        update: { $setOnInsert: { restaurant, date }, $addToSet: { publishedEmployees: { $each: ids } } },
        upsert: true,
      },
    })), { session });
    const [publication] = await PlanningPublication.create([{
      _id: id, restaurant, from, to, signature, author: author.name, authorId: author.id, authorRole: author.role,
      email, notify, effective: Boolean(grants.modifiedCount || grants.upsertedCount || email || notify),
      recipients: recipients.map(({ employeeId, name, emailAvailable }) => ({
        employeeId, name, emailStatus: !email ? "disabled" : emailAvailable ? "pending" : "skipped",
      })),
    }], { session });
    const notifications = notify ? await Notification.insertMany(ids.map((employeeId) => ({
      restaurantId: restaurant, recipientEmployeeId: employeeId, module: "my_planning", type: "planning_published",
      title: "Planning disponible", message: from === to ? from : `${from} – ${to}`,
      link: `/dashboard/my-space?planningDate=${from}#my-planning`, dedupeKey: `planning:${id}:${employeeId}`,
    })), { session }) : [];
    return { publication: publication.toObject(), notifications };
  });
}

async function deliverPlanningEmails(publication, deliver) {
  for (const { employeeId, emailStatus } of publication.recipients) {
    if (emailStatus !== "pending") continue;
    const filter = { _id: publication._id, recipients: { $elemMatch: { employeeId, emailStatus: "pending" } } };
    const claimed = await PlanningPublication.updateOne(filter, { $set: { "recipients.$.emailStatus": "sending" } });
    if (!claimed.modifiedCount) continue;
    let result;
    try {
      result = await deliver(employeeId) ? "sent" : "skipped";
    } catch (_error) {
      result = "failed";
    }
    await PlanningPublication.updateOne(
      { _id: publication._id, "recipients.employeeId": employeeId },
      { $set: { "recipients.$.emailStatus": result } },
    );
  }
  return PlanningPublication.findById(publication._id).select("from to author recipients createdAt notify email").lean();
}

module.exports = {
  dayKey, periodDates, planningFence, assertPlanningUnlocked, withPlanningWrite, visiblePlanningShifts,
  getPlanningState, setPlanningLock, publishPlanning, deliverPlanningEmails, planningError,
};
