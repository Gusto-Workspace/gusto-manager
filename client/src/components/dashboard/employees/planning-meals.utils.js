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

export function getShiftMealMeta({
  start,
  end,
  openingHours = [],
  isLeave = false,
} = {}) {
  if (isLeave) {
    return { hasMeal: false, mealCount: 0, mealPeriods: [] };
  }

  const shiftStart = start instanceof Date ? start : new Date(start);
  const shiftEnd = end instanceof Date ? end : new Date(end);

  if (
    Number.isNaN(shiftStart.getTime()) ||
    Number.isNaN(shiftEnd.getTime()) ||
    shiftEnd <= shiftStart
  ) {
    return { hasMeal: false, mealCount: 0, mealPeriods: [] };
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
    hasMeal: periods.length > 0,
    mealCount: periods.length,
    mealPeriods: periods,
  };
}
