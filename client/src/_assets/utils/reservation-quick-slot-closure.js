import { format } from "date-fns";
import {
  buildReservationDateTime,
  generateReservationTimeOptions,
  getReservationServiceBucket,
  sortReservationTimesByServiceOrder,
} from "./reservation-service-time";

export const QUICK_SLOT_CLOSURE_SOURCE = "quick_slot_closure";

export function getReservationDayHoursForDate({ restaurant, date }) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const parameters = restaurant?.reservationsSettings || {};
  const dateKey = format(date, "yyyy-MM-dd");
  const exceptionalOpening = (
    Array.isArray(parameters.exceptional_openings)
      ? parameters.exceptional_openings
      : []
  ).find((item) => String(item?.date || "").slice(0, 10) === dateKey);

  if (
    exceptionalOpening &&
    Array.isArray(exceptionalOpening.hours) &&
    exceptionalOpening.hours.length
  ) {
    return {
      day: "exceptional",
      isClosed: false,
      hours: exceptionalOpening.hours,
    };
  }

  const jsDay = date.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const source = parameters.same_hours_as_restaurant
    ? restaurant?.opening_hours
    : parameters.reservation_hours;

  return Array.isArray(source) ? source[dayIndex] || null : null;
}

export function isReservationDepartureBlocked({ date, time, ranges = [] }) {
  if (!date || !time) return false;
  const departure = buildReservationDateTime(date, time);
  if (!departure) return false;
  const departureMs = departure.getTime();

  return (Array.isArray(ranges) ? ranges : []).some((range) => {
    const start = new Date(range?.startAt).getTime();
    const end = new Date(range?.endAt).getTime();
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      departureMs >= start &&
      departureMs < end
    );
  });
}

export function buildQuickClosureSlots(restaurant, date, now = new Date()) {
  const dayHours = getReservationDayHoursForDate({ restaurant, date });
  if (
    !dayHours ||
    dayHours.isClosed ||
    !Array.isArray(dayHours.hours) ||
    !dayHours.hours.length
  ) {
    return [];
  }

  const parameters = restaurant?.reservationsSettings || {};
  const rawInterval = Number(parameters.interval || 30);
  const interval =
    Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 30;
  const ranges = Array.isArray(parameters.blocked_ranges)
    ? parameters.blocked_ranges
    : [];
  const times = sortReservationTimesByServiceOrder(
    dayHours.hours.flatMap((range) =>
      generateReservationTimeOptions(range?.open, range?.close, interval),
    ),
  );

  return times.map((time) => {
    const startAt = buildReservationDateTime(date, time);
    const endAt = new Date(startAt.getTime() + interval * 60 * 1000);
    const coveringRanges = ranges.filter((range) => {
      const rangeStart = new Date(range?.startAt).getTime();
      const rangeEnd = new Date(range?.endAt).getTime();
      return (
        Number.isFinite(rangeStart) &&
        Number.isFinite(rangeEnd) &&
        startAt.getTime() >= rangeStart &&
        startAt.getTime() < rangeEnd
      );
    });
    const quickRangeStartingAtSlot = coveringRanges.find((range) => {
      return (
        range?.source === QUICK_SLOT_CLOSURE_SOURCE &&
        new Date(range.startAt).getTime() === startAt.getTime()
      );
    });
    const hasAdvancedCoverage = coveringRanges.some(
      (range) => String(range?._id) !== String(quickRangeStartingAtSlot?._id),
    );

    return {
      time,
      startAt,
      endAt,
      service: getReservationServiceBucket(time),
      closed: coveringRanges.length > 0,
      closureType: coveringRanges.length
        ? quickRangeStartingAtSlot && !hasAdvancedCoverage
          ? "quick"
          : "advanced"
        : null,
      reopenableRange:
        quickRangeStartingAtSlot && !hasAdvancedCoverage
          ? quickRangeStartingAtSlot
          : null,
      coveringRanges,
      past: endAt <= now,
    };
  });
}
