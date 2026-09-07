const {
  buildReservationDateTime,
  minutesFromHHmm,
  minutesFromServiceTime,
} = require("./reservation-service-time.service");

const QUICK_SLOT_CLOSURE_SOURCE = "quick_slot_closure";
const MAX_QUICK_SLOT_CLOSURES_PER_REQUEST = 96;

class QuickSlotClosureError extends Error {
  constructor(message, code = "INVALID_QUICK_SLOT_CLOSURE") {
    super(message);
    this.name = "QuickSlotClosureError";
    this.code = code;
    this.statusCode = 400;
  }
}

function isValidHHmm(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

function normalizeDateKey(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function getExceptionalOpening(parameters, dateKey) {
  const openings = Array.isArray(parameters?.exceptional_openings)
    ? parameters.exceptional_openings
    : [];

  const opening = openings.find(
    (item) => String(item?.date || "").slice(0, 10) === dateKey,
  );

  if (!opening || !Array.isArray(opening.hours) || !opening.hours.length) {
    return null;
  }

  return { day: "exceptional", isClosed: false, hours: opening.hours };
}

function getReservationDayHours(restaurant, dateKey) {
  const parameters = restaurant?.reservationsSettings || {};
  const exceptionalOpening = getExceptionalOpening(parameters, dateKey);
  if (exceptionalOpening) return exceptionalOpening;

  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const jsDay = date.getUTCDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const source = parameters?.same_hours_as_restaurant
    ? restaurant?.opening_hours
    : parameters?.reservation_hours;

  return Array.isArray(source) ? source[dayIndex] || null : null;
}

function formatMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function getConfiguredQuickClosureTimes(restaurant, dateInput) {
  const dateKey = normalizeDateKey(dateInput);
  if (!dateKey) return [];

  const dayHours = getReservationDayHours(restaurant, dateKey);
  if (
    !dayHours ||
    dayHours.isClosed ||
    !Array.isArray(dayHours.hours) ||
    !dayHours.hours.length
  ) {
    return [];
  }

  const rawInterval = Number(restaurant?.reservationsSettings?.interval || 30);
  const interval =
    Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 30;
  const times = [];

  dayHours.hours.forEach((range) => {
    const open = String(range?.open || "").slice(0, 5);
    const close = String(range?.close || "").slice(0, 5);
    if (!isValidHHmm(open) || !isValidHHmm(close)) return;

    const start = minutesFromHHmm(open);
    const rawEnd = minutesFromHHmm(close);
    if (start === rawEnd) return;
    const end = rawEnd < start ? rawEnd + 1440 : rawEnd;

    for (let cursor = start; cursor <= end; cursor += interval) {
      times.push(formatMinutes(cursor));
    }
  });

  return [...new Set(times)].sort(
    (left, right) =>
      minutesFromServiceTime(left) - minutesFromServiceTime(right),
  );
}

function buildQuickSlotClosureRanges({
  restaurant,
  date,
  times,
  note = "",
  now = new Date(),
}) {
  const dateKey = normalizeDateKey(date);
  if (!dateKey) {
    throw new QuickSlotClosureError("Date invalide.", "INVALID_DATE");
  }

  const requestedTimes = [
    ...new Set(
      (Array.isArray(times) ? times : []).map((time) =>
        String(time || "")
          .trim()
          .slice(0, 5),
      ),
    ),
  ];

  if (!requestedTimes.length) {
    throw new QuickSlotClosureError(
      "Sélectionnez au moins un créneau.",
      "NO_SLOT_SELECTED",
    );
  }
  if (requestedTimes.length > MAX_QUICK_SLOT_CLOSURES_PER_REQUEST) {
    throw new QuickSlotClosureError(
      "Trop de créneaux sélectionnés.",
      "TOO_MANY_SLOTS",
    );
  }

  const configuredTimes = new Set(
    getConfiguredQuickClosureTimes(restaurant, dateKey),
  );
  const invalidTimes = requestedTimes.filter(
    (time) => !isValidHHmm(time) || !configuredTimes.has(time),
  );

  if (invalidTimes.length) {
    throw new QuickSlotClosureError(
      "Un ou plusieurs créneaux ne sont pas réservables pour cette date.",
      "SLOT_NOT_CONFIGURED",
    );
  }

  const rawInterval = Number(restaurant?.reservationsSettings?.interval || 30);
  const interval =
    Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 30;
  const reservationDay = new Date(`${dateKey}T00:00:00.000Z`);
  const normalizedNote = String(note || "")
    .trim()
    .slice(0, 500);

  return requestedTimes.map((time) => {
    const startAt = buildReservationDateTime(reservationDay, time);
    const endAt = new Date(startAt.getTime() + interval * 60 * 1000);

    if (endAt <= now) {
      throw new QuickSlotClosureError(
        "Un créneau terminé ne peut plus être fermé.",
        "SLOT_IN_PAST",
      );
    }

    return {
      time,
      startAt,
      endAt,
      allDay: false,
      note: normalizedNote,
      source: QUICK_SLOT_CLOSURE_SOURCE,
    };
  });
}

function isDepartureCoveredByRange(startAt, range) {
  const departure = new Date(startAt).getTime();
  const rangeStart = new Date(range?.startAt).getTime();
  const rangeEnd = new Date(range?.endAt).getTime();

  return (
    Number.isFinite(departure) &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    departure >= rangeStart &&
    departure < rangeEnd
  );
}

module.exports = {
  MAX_QUICK_SLOT_CLOSURES_PER_REQUEST,
  QUICK_SLOT_CLOSURE_SOURCE,
  QuickSlotClosureError,
  buildQuickSlotClosureRanges,
  getConfiguredQuickClosureTimes,
  isDepartureCoveredByRange,
  normalizeDateKey,
};
