const { DateTime } = require("luxon");
const { CommercialProspect: Prospect, CommercialInteraction: Interaction, closedStages } = require("../../models/commercial-prospect.model");

const paris = "Europe/Paris";
const legacyDates = { APPOINTMENT: "nextAppointmentAt", FOLLOW_UP: "nextFollowUpAt" };
const activeAgenda = { archivedAt: null, opposedAt: null };
const activePipeline = { ...activeAgenda, stage: { $nin: ["ACQUIRED", ...closedStages] }, "milestones.acquiredAt": null };
const eventChange = (actorId, action, at = new Date()) => ({ actorId, action, at });
const visibleCalendarActions = { $or: [
  { type: { $ne: "FOLLOW_UP" } }, { state: { $ne: "SCHEDULED" } },
  { prospectId: null }, { "prospect.milestones.acquiredAt": null },
] };

function legacyEvent(prospect, type) {
  const value = prospect[legacyDates[type]];
  const date = DateTime.fromJSDate(value, { zone: paris });
  const allDay = date.toFormat("HH:mm") === "00:00" || value.toISOString().endsWith("T00:00:00.000Z");
  return {
    _id: `legacy:${prospect._id}:${type}`,
    salesOwnerId: prospect.salesOwnerId, prospectId: prospect._id,
    type, startsAt: allDay ? date.startOf("day").toJSDate() : value, allDay, state: "SCHEDULED",
  };
}

async function cancelProspectEvents(prospect, actorId, session, now, types) {
  const changes = eventChange(actorId, "CANCELLED", now);
  await Interaction.updateMany({
    prospectId: prospect._id, state: "SCHEDULED", ...(types && { type: { $in: types } }),
  }, { $set: { state: "CANCELLED", cancelledAt: now }, $push: { eventChanges: changes } }, { session });

  const legacy = [];
  for (const [type, field] of Object.entries(legacyDates)) {
    if ((types && !types.includes(type)) || !prospect[field]) continue;
    const { _id, ...event } = legacyEvent(prospect, type);
    legacy.push({ ...event, state: "CANCELLED", cancelledAt: now, actorId, eventChanges: [changes] });
    prospect.set(field, null);
  }
  if (legacy.length) await Interaction.create(legacy, { session, ordered: true });
}

function nextDate(first, second) {
  if (!first) return second;
  if (!second) return first;
  return first < second ? first : second;
}

async function prospectSchedule(items) {
  if (!items.length) return [];
  const ids = items.map(({ _id }) => _id);
  const now = new Date();
  const today = DateTime.fromJSDate(now, { zone: paris }).startOf("day").toJSDate();
  const next = await Interaction.aggregate([
    { $match: { prospectId: { $in: ids }, salesOwnerId: { $in: items.map(({ salesOwnerId }) => salesOwnerId) }, state: "SCHEDULED", $or: [
      { type: "FOLLOW_UP" }, { type: "APPOINTMENT", startsAt: { $gte: now } },
      { type: "APPOINTMENT", allDay: true, startsAt: { $gte: today } },
    ] } },
    { $group: { _id: { prospect: "$prospectId", owner: "$salesOwnerId", type: "$type" }, startsAt: { $min: "$startsAt" } } },
  ]);
  const dates = new Map(next.map(({ _id, startsAt }) => [`${_id.prospect}:${_id.owner}:${_id.type}`, startsAt]));
  return items.map((item) => {
    const prospect = item.toObject?.() || item;
    return {
      ...prospect,
      ...Object.fromEntries(Object.entries(legacyDates).map(([type, field]) => {
        if (type === "FOLLOW_UP" && prospect.milestones?.acquiredAt) return [field, null];
        const legacy = prospect[field] && legacyEvent(prospect, type);
        const visible = legacy && (type === "FOLLOW_UP" || legacy.startsAt >= (legacy.allDay ? today : now));
        return [field, nextDate(visible && legacy.startsAt, dates.get(`${prospect._id}:${prospect.salesOwnerId}:${type}`))];
      })),
    };
  });
}

function calendarStages(scope, types, range, openOnly = false, prospectId) {
  const overlaps = range.$gte ? { $or: [
    { startsAt: range }, { startsAt: { $lt: range.$gte }, endsAt: { $gt: range.$gte } },
  ] } : {};
  return [
    { $match: {
      ...scope, ...(prospectId && { prospectId }), type: { $in: types },
      startsAt: { $type: "date" }, ...overlaps, ...(openOnly && { state: "SCHEDULED" }),
    } },
    ...types.filter((type) => legacyDates[type]).map((type) => {
      const field = legacyDates[type];
      return { $unionWith: { coll: Prospect.collection.name, pipeline: [
        { $match: { ...scope, ...activeAgenda, ...(prospectId && { _id: prospectId }),
          ...(type === "FOLLOW_UP" && { "milestones.acquiredAt": null }), [field]: { $type: "date", ...range },
        } },
        { $project: { salesOwnerId: 1, prospectId: "$_id", [field]: 1, type: { $literal: type }, allDay: { $or: [
          { $eq: [{ $dateToString: { date: `$${field}`, format: "%H:%M", timezone: paris } }, "00:00"] },
          { $eq: [{ $dateToString: { date: `$${field}`, format: "%H:%M:%S.%L" } }, "00:00:00.000"] },
        ] } } },
      ] } };
    }),
    { $addFields: { startsAt: { $ifNull: ["$startsAt", { $cond: ["$allDay",
      { $dateTrunc: { date: { $ifNull: ["$nextAppointmentAt", "$nextFollowUpAt"] }, unit: "day", timezone: paris } },
      { $ifNull: ["$nextAppointmentAt", "$nextFollowUpAt"] },
    ] }] } } },
  ];
}

function hydrateEvent(item) {
  return item.state ? item : legacyEvent(item, item.type);
}

async function upcomingActions(scope, now, today, tomorrow) {
  const future = { $or: [
    { startsAt: { $gte: now } }, { allDay: true, startsAt: { $gte: today } },
  ] };
  const appointments = { type: "APPOINTMENT", ...future };
  const [result] = await Interaction.aggregate([
    ...calendarStages(scope, [...Object.keys(legacyDates), "DEMO"], {}, true),
    { $lookup: { from: Prospect.collection.name, localField: "prospectId", foreignField: "_id", pipeline: [
      { $match: activeAgenda }, { $project: { restaurantName: 1, "milestones.acquiredAt": 1 } },
    ], as: "prospect" } },
    { $match: { $or: [{ prospectId: null }, { "prospect.0": { $exists: true } }] } },
    { $match: visibleCalendarActions },
    { $sort: { startsAt: 1, _id: 1 } },
    { $facet: {
      appointments: [{ $match: appointments }, { $limit: 5 }],
      demos: [{ $match: { type: "DEMO", ...future } }, { $limit: 5 }],
      followUps: [{ $match: { type: "FOLLOW_UP", startsAt: { $gte: tomorrow } } }, { $limit: 5 }],
      overdue: [{ $match: { type: "FOLLOW_UP", startsAt: { $lt: today } } }, { $limit: 5 }],
      dueToday: [{ $match: { type: "FOLLOW_UP", startsAt: { $gte: today, $lt: tomorrow } } }, { $limit: 5 }],
      upcomingCount: [{ $match: appointments }, { $count: "count" }],
    } },
  ]);
  const { upcomingCount, ...actions } = result;
  return {
    appointments: upcomingCount[0]?.count || 0,
    actions: Object.fromEntries(Object.entries(actions).map(([key, rows]) => [key, rows.map((row) => {
      const event = hydrateEvent(row);
      return {
        _id: row.state ? event._id : event.prospectId, eventId: event._id, prospectId: event.prospectId,
        restaurantName: row.prospect[0]?.restaurantName,
        title: row.title, startsAt: event.startsAt, allDay: event.allDay,
      };
    })])),
  };
}

module.exports = {
  paris, legacyDates, activeAgenda, activePipeline, eventChange, legacyEvent, cancelProspectEvents,
  prospectSchedule, calendarStages, hydrateEvent, upcomingActions, visibleCalendarActions,
};
