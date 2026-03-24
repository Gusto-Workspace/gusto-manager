const ACTIONS = {
  CLOCK_IN: "clock_in",
  BREAK_START: "break_start",
  BREAK_END: "break_end",
  CLOCK_OUT: "clock_out",
};

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundCoord(value) {
  return Math.round(value * 10000) / 10000;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;

  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
}

function toDateKey(value) {
  if (typeof value === "string" && isValidDateKey(value)) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function dateKeyToDate(key) {
  if (!isValidDateKey(key)) return null;

  const date = new Date(`${key}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToDateKey(key, amount) {
  const date = dateKeyToDate(key);
  if (!date) return null;

  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return toDateKey(date);
}

function getWeekRangeFromDateKey(anchorKey) {
  const date = dateKeyToDate(anchorKey);
  if (!date) return null;

  const weekday = date.getUTCDay() || 7;
  const startDate = addDaysToDateKey(anchorKey, -(weekday - 1));
  const endDate = addDaysToDateKey(startDate, 6);

  return { startDate, endDate };
}

function getMonthRangeFromDateKey(anchorKey) {
  const date = dateKeyToDate(anchorKey);
  if (!date) return null;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = toDateKey(new Date(Date.UTC(year, month + 1, 0, 12, 0, 0)));

  return { startDate, endDate };
}

function diffMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function normalizePoint(rawPoint) {
  if (!rawPoint) return null;

  const x = Array.isArray(rawPoint) ? rawPoint[0] : rawPoint.x;
  const y = Array.isArray(rawPoint) ? rawPoint[1] : rawPoint.y;

  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    return null;
  }

  return {
    x: roundCoord(clampNumber(Number(x), 0, 1)),
    y: roundCoord(clampNumber(Number(y), 0, 1)),
  };
}

function dedupeConsecutivePoints(points) {
  const deduped = [];

  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    deduped.push(point);
  }

  return deduped;
}

function normalizeSignaturePayload(rawSignature, signedAt = new Date()) {
  const rawStrokes = Array.isArray(rawSignature)
    ? rawSignature
    : rawSignature?.strokes;

  if (!Array.isArray(rawStrokes)) {
    return { hasSignature: false, strokes: [], signedAt: null };
  }

  const strokes = rawStrokes
    .slice(0, 24)
    .map((rawStroke) => {
      const rawPoints = Array.isArray(rawStroke)
        ? rawStroke
        : rawStroke?.points || [];

      const points = dedupeConsecutivePoints(
        rawPoints
          .slice(0, 180)
          .map(normalizePoint)
          .filter(Boolean),
      );

      if (points.length < 2) return null;

      return { points };
    })
    .filter(Boolean);

  return {
    hasSignature: strokes.length > 0,
    strokes,
    signedAt: strokes.length > 0 ? signedAt : null,
  };
}

function serializeSignature(signature) {
  if (!signature?.hasSignature || !Array.isArray(signature?.strokes)) {
    return null;
  }

  if (!signature.strokes.length) return null;

  return {
    strokes: signature.strokes.map((stroke) => ({
      points: (stroke?.points || []).map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
      })),
    })),
    signedAt: signature.signedAt || null,
  };
}

function findActiveBreak(session) {
  const breaks = Array.isArray(session?.breaks) ? session.breaks : [];

  for (let index = breaks.length - 1; index >= 0; index -= 1) {
    const currentBreak = breaks[index];
    if (currentBreak?.startAt && !currentBreak?.endAt) {
      return currentBreak;
    }
  }

  return null;
}

function getSessionSituation(session) {
  if (!session || session.status === "closed") return "off";
  if (session.status === "on_break") return "on_break";
  return "working";
}

function getAvailableActions(session) {
  if (!session || session.status === "closed") {
    return [ACTIONS.CLOCK_IN];
  }

  if (session.status === "on_break") {
    return [ACTIONS.BREAK_END];
  }

  return [ACTIONS.BREAK_START, ACTIONS.CLOCK_OUT];
}

function computeSessionMetrics(
  session,
  {
    now = new Date(),
    referenceDateKey = toDateKey(now),
  } = {},
) {
  const activeBreak = findActiveBreak(session);

  const completedBreakMinutes = (session?.breaks || []).reduce((total, item) => {
    if (!item?.startAt || !item?.endAt) return total;
    return total + diffMinutes(item.startAt, item.endAt);
  }, 0);

  const activeBreakMinutes = activeBreak
    ? diffMinutes(activeBreak.startAt, now)
    : 0;

  const grossEnd = session?.clockOutAt || now;
  const grossMinutes = diffMinutes(session?.clockInAt, grossEnd);
  const breakMinutes = completedBreakMinutes + activeBreakMinutes;
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  const anomalies = [];

  if (
    session?.clockOutAt &&
    new Date(session.clockOutAt).getTime() < new Date(session.clockInAt).getTime()
  ) {
    anomalies.push("invalid_times");
  }

  if (
    !session?.clockOutAt &&
    session?.businessDate &&
    referenceDateKey &&
    session.businessDate < referenceDateKey
  ) {
    anomalies.push("missing_clock_out");
  }

  if (activeBreak) {
    anomalies.push("open_break");
  }

  if (Math.max(completedBreakMinutes, activeBreakMinutes) > 90) {
    anomalies.push("long_break");
  }

  if (grossMinutes > 12 * 60) {
    anomalies.push("long_shift");
  }

  return {
    grossMinutes,
    breakMinutes,
    workedMinutes,
    activeBreakMinutes,
    activeBreak,
    anomalies: Array.from(new Set(anomalies)),
  };
}

function syncSessionTotals(session, now = new Date()) {
  const metrics = computeSessionMetrics(session, { now });

  session.totals = {
    grossMinutes: metrics.grossMinutes,
    breakMinutes: metrics.breakMinutes,
    workedMinutes: metrics.workedMinutes,
  };

  return session;
}

function serializeEvent(event) {
  return {
    id: event?._id ? String(event._id) : null,
    type: event?.type || "",
    at: event?.at || null,
    actorRole: event?.actorRole || "",
    actorId: event?.actorId || "",
    source: event?.source || "kiosk",
    signature: serializeSignature(event?.signature),
  };
}

function serializeBreak(item, now = new Date()) {
  const isActive = Boolean(item?.startAt && !item?.endAt);
  const durationMinutes = isActive
    ? diffMinutes(item.startAt, now)
    : diffMinutes(item?.startAt, item?.endAt);

  return {
    id: item?._id ? String(item._id) : null,
    startAt: item?.startAt || null,
    endAt: item?.endAt || null,
    durationMinutes,
    isActive,
    startSignature: serializeSignature(item?.startSignature),
    endSignature: serializeSignature(item?.endSignature),
  };
}

function serializeSession(
  session,
  {
    now = new Date(),
    referenceDateKey = toDateKey(now),
  } = {},
) {
  const metrics = computeSessionMetrics(session, { now, referenceDateKey });
  const events = [...(session?.events || [])]
    .sort((left, right) => new Date(left.at) - new Date(right.at))
    .map(serializeEvent);

  const breaks = [...(session?.breaks || [])]
    .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
    .map((item) => serializeBreak(item, now));

  return {
    id: session?._id ? String(session._id) : null,
    businessDate: session?.businessDate || null,
    status: session?.status || "closed",
    situation: getSessionSituation(session),
    availableActions: getAvailableActions(session),
    clockInAt: session?.clockInAt || null,
    clockOutAt: session?.clockOutAt || null,
    employeeSnapshot: session?.employeeSnapshot || {},
    totals: {
      grossMinutes: metrics.grossMinutes,
      breakMinutes: metrics.breakMinutes,
      workedMinutes: metrics.workedMinutes,
    },
    anomalies: metrics.anomalies,
    breaks,
    events,
    lastActionAt: session?.lastActionAt || null,
  };
}

function buildEmptyDaySummary(dateKey) {
  return {
    date: dateKey,
    sessions: [],
    totalGrossMinutes: 0,
    totalBreakMinutes: 0,
    totalWorkedMinutes: 0,
    sessionCount: 0,
    anomalies: [],
  };
}

function groupSessionsByDay(
  sessions,
  {
    now = new Date(),
    referenceDateKey = toDateKey(now),
  } = {},
) {
  const dayMap = new Map();

  for (const session of sessions || []) {
    const serialized = serializeSession(session, { now, referenceDateKey });
    const key = serialized.businessDate || referenceDateKey;
    const current = dayMap.get(key) || buildEmptyDaySummary(key);

    current.sessions.push(serialized);
    current.totalGrossMinutes += serialized.totals.grossMinutes;
    current.totalBreakMinutes += serialized.totals.breakMinutes;
    current.totalWorkedMinutes += serialized.totals.workedMinutes;
    current.sessionCount += 1;
    current.anomalies = Array.from(
      new Set([...(current.anomalies || []), ...(serialized.anomalies || [])]),
    );

    dayMap.set(key, current);
  }

  for (const day of dayMap.values()) {
    day.sessions.sort((left, right) => new Date(left.clockInAt) - new Date(right.clockInAt));
  }

  return dayMap;
}

function buildRangeSummary(dayMap, startDate, endDate) {
  const days = [];
  let cursor = startDate;

  while (cursor && cursor <= endDate) {
    const current = dayMap.get(cursor) || buildEmptyDaySummary(cursor);
    days.push(current);
    cursor = addDaysToDateKey(cursor, 1);
  }

  return {
    startDate,
    endDate,
    days,
    totalGrossMinutes: days.reduce(
      (total, item) => total + item.totalGrossMinutes,
      0,
    ),
    totalBreakMinutes: days.reduce(
      (total, item) => total + item.totalBreakMinutes,
      0,
    ),
    totalWorkedMinutes: days.reduce(
      (total, item) => total + item.totalWorkedMinutes,
      0,
    ),
    totalSessions: days.reduce((total, item) => total + item.sessionCount, 0),
    anomalies: Array.from(new Set(days.flatMap((item) => item.anomalies || []))),
  };
}

function getEmployeeDisplay(employee, restaurantId) {
  const profile = (employee?.restaurantProfiles || []).find(
    (item) => String(item.restaurant) === String(restaurantId),
  );

  const snapshot = profile?.snapshot || {};

  return {
    id: employee?._id ? String(employee._id) : "",
    firstname: snapshot.firstname || employee?.firstname || "",
    lastname: snapshot.lastname || employee?.lastname || "",
    email: snapshot.email || employee?.email || "",
    post: snapshot.post || employee?.post || "",
  };
}

function buildSummaryPayload({
  employee,
  restaurantId,
  anchorDateKey,
  monthSessions = [],
  recentSessions = [],
  activeSession = null,
  now = new Date(),
}) {
  const referenceDateKey = anchorDateKey || toDateKey(now);
  const weekRange = getWeekRangeFromDateKey(referenceDateKey);
  const monthRange = getMonthRangeFromDateKey(referenceDateKey);
  const dayMap = groupSessionsByDay(monthSessions, { now, referenceDateKey });

  return {
    employee: getEmployeeDisplay(employee, restaurantId),
    anchorDate: referenceDateKey,
    state: {
      situation: getSessionSituation(activeSession),
      availableActions: getAvailableActions(activeSession),
      activeSession: activeSession
        ? serializeSession(activeSession, { now, referenceDateKey })
        : null,
    },
    day: dayMap.get(referenceDateKey) || buildEmptyDaySummary(referenceDateKey),
    week: buildRangeSummary(dayMap, weekRange.startDate, weekRange.endDate),
    month: buildRangeSummary(dayMap, monthRange.startDate, monthRange.endDate),
    history: (recentSessions || []).map((session) =>
      serializeSession(session, { now, referenceDateKey }),
    ),
    lastUpdatedAt: now.toISOString(),
  };
}

module.exports = {
  ACTIONS,
  buildSummaryPayload,
  computeSessionMetrics,
  diffMinutes,
  getAvailableActions,
  getEmployeeDisplay,
  getMonthRangeFromDateKey,
  getSessionSituation,
  getWeekRangeFromDateKey,
  isValidDateKey,
  normalizeSignaturePayload,
  serializeSession,
  syncSessionTotals,
  toDateKey,
};
