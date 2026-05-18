function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function parseTimeToMinutes(value) {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((part) => Number(part));

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getMinutesSinceStartOfDay(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 0;
  return value.getHours() * 60 + value.getMinutes();
}

function isSameCalendarDay(left, right) {
  return (
    left instanceof Date &&
    right instanceof Date &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getOpeningDayIndex(date) {
  const weekday = date.getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function getOpeningDay(openingHours, date) {
  return safeArr(openingHours)[getOpeningDayIndex(date)] || null;
}

function getDayCursor(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeMealPeriods(periods = []) {
  return Array.from(
    new Set(
      safeArr(periods)
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value === "lunch" || value === "dinner"),
    ),
  );
}

const MEAL_WINDOWS = {
  lunch: { start: 11 * 60, end: 15 * 60 },
  dinner: { start: 18 * 60, end: 23 * 60 + 59 },
};

function getOpeningSegments(slot = {}) {
  const open = parseTimeToMinutes(slot?.open);
  const close = parseTimeToMinutes(slot?.close);

  if (open === null || close === null) return [];
  if (close > open) return [{ start: open, end: close }];

  return [{ start: open, end: 24 * 60 }];
}

function toPositiveNumber(value, fallback = 0) {
  const out = Number(value);
  if (!Number.isFinite(out) || out < 0) return fallback;
  return out;
}

function normalizeMealAllowance(raw = {}) {
  const periods = normalizeMealPeriods(raw?.periods || raw?.mealPeriods);
  const count = Math.max(
    0,
    Math.round(
      toPositiveNumber(
        raw?.count !== undefined ? raw.count : raw?.mealCount,
        periods.length,
      ),
    ),
  );
  const amount = toPositiveNumber(
    raw?.amount !== undefined ? raw.amount : raw?.mealAmount,
    0,
  );
  const source = String(raw?.source || "").trim();

  return {
    count: count || periods.length || 0,
    amount,
    periods,
    source,
  };
}

function computeMealAllowance({
  start,
  end,
  openingHours = [],
  isLeave = false,
  explicit = null,
} = {}) {
  const explicitAllowance = normalizeMealAllowance(explicit || {});
  if (
    explicitAllowance.count > 0 ||
    explicitAllowance.amount > 0 ||
    explicitAllowance.periods.length > 0
  ) {
    return explicitAllowance;
  }

  if (isLeave) {
    return { count: 0, amount: 0, periods: [], source: "leave" };
  }

  const shiftStart = start instanceof Date ? start : new Date(start);
  const shiftEnd = end instanceof Date ? end : new Date(end);

  if (
    Number.isNaN(shiftStart.getTime()) ||
    Number.isNaN(shiftEnd.getTime()) ||
    shiftEnd <= shiftStart
  ) {
    return { count: 0, amount: 0, periods: [], source: "" };
  }

  const mealPeriods = new Set();
  const dayCursor = getDayCursor(shiftStart);
  const lastDay = getDayCursor(shiftEnd);

  while (dayCursor <= lastDay) {
    const openingDay = getOpeningDay(openingHours, dayCursor);
    const daySlots = openingDay?.isClosed ? [] : safeArr(openingDay?.hours);

    if (daySlots.length > 0) {
      const shiftSegmentStart = isSameCalendarDay(dayCursor, shiftStart)
        ? getMinutesSinceStartOfDay(shiftStart)
        : 0;
      const shiftSegmentEnd = isSameCalendarDay(dayCursor, shiftEnd)
        ? getMinutesSinceStartOfDay(shiftEnd)
        : 24 * 60;

      daySlots.forEach((slot) => {
        getOpeningSegments(slot).forEach((segment) => {
          const effectiveStart = Math.max(shiftSegmentStart, segment.start);
          const effectiveEnd = Math.min(shiftSegmentEnd, segment.end);

          if (effectiveEnd <= effectiveStart) return;

          if (
            rangesOverlap(
              effectiveStart,
              effectiveEnd,
              MEAL_WINDOWS.lunch.start,
              MEAL_WINDOWS.lunch.end,
            )
          ) {
            mealPeriods.add("lunch");
          }

          if (
            rangesOverlap(
              effectiveStart,
              effectiveEnd,
              MEAL_WINDOWS.dinner.start,
              MEAL_WINDOWS.dinner.end,
            )
          ) {
            mealPeriods.add("dinner");
          }
        });
      });
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  const periods = Array.from(mealPeriods);

  return {
    count: periods.length,
    amount: 0,
    periods,
    source: periods.length ? "heuristic" : "",
  };
}

module.exports = {
  computeMealAllowance,
  normalizeMealAllowance,
  normalizeMealPeriods,
};
