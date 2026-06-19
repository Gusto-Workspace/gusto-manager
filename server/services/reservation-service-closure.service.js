function isValidHHmm(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

function buildLocalDateTime(baseDate, time) {
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
    return null;
  }
  if (!isValidHHmm(time)) return null;

  const [hours, minutes] = String(time).split(":").map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function normalizeReservationDateKey(value) {
  if (!value) return "";

  const stringValue = String(value).trim();
  const dateMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesFromHHmm(timeStr) {
  const [hour, minute] = String(timeStr || "00:00")
    .split(":")
    .map(Number);
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

function getReservationExceptionalOpeningForDate(parameters, date) {
  const dateKey = normalizeReservationDateKey(date);
  if (!dateKey) return null;

  const openings = Array.isArray(parameters?.exceptional_openings)
    ? parameters.exceptional_openings
    : [];

  const opening = openings.find(
    (item) => normalizeReservationDateKey(item?.date) === dateKey,
  );

  if (!opening || !Array.isArray(opening.hours)) return null;

  const hours = opening.hours.filter(
    (range) =>
      isValidHHmm(range?.open) &&
      isValidHHmm(range?.close) &&
      minutesFromHHmm(range.open) < minutesFromHHmm(range.close),
  );

  if (!hours.length) return null;
  return { day: "exceptional", isClosed: false, hours };
}

function getReservationHoursSource(restaurant, parameters = null) {
  const settings = parameters || restaurant?.reservationsSettings || {};
  return settings?.same_hours_as_restaurant
    ? restaurant?.opening_hours
    : settings?.reservation_hours;
}

function getCurrentReservationService({
  restaurant,
  parameters = null,
  now = new Date(),
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;

  const sourceHours = getReservationHoursSource(restaurant, parameters);

  const exceptionalOpening = getReservationExceptionalOpeningForDate(
    parameters || restaurant?.reservationsSettings || {},
    now,
  );
  const jsDay = now.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const dayHours =
    exceptionalOpening ||
    (Array.isArray(sourceHours) ? sourceHours[dayIndex] : null);

  if (!dayHours || dayHours?.isClosed || !Array.isArray(dayHours?.hours)) {
    return null;
  }

  for (const range of dayHours.hours) {
    const startAt = buildLocalDateTime(now, range?.open);
    const endAt = buildLocalDateTime(now, range?.close);
    if (!startAt || !endAt || endAt <= startAt) continue;

    if (now >= startAt && now < endAt) {
      return {
        startAt,
        endAt,
        open: String(range.open),
        close: String(range.close),
      };
    }
  }

  return null;
}

function getReservationServiceClosureState({
  restaurant,
  parameters = null,
  now = new Date(),
}) {
  const settings = parameters || restaurant?.reservationsSettings || {};
  const currentService = getCurrentReservationService({
    restaurant,
    parameters: settings,
    now,
  });

  if (!currentService) {
    return {
      currentService: null,
      automatic: false,
      manual: false,
      closed: false,
    };
  }

  const automatic = Boolean(
    settings?.refuse_public_reservations_during_service,
  );
  const manualUntil = settings?.manual_service_full_until
    ? new Date(settings.manual_service_full_until)
    : null;
  const manualUntilMs = manualUntil?.getTime();
  const manual = Boolean(
    Number.isFinite(manualUntilMs) &&
      manualUntilMs > now.getTime() &&
      manualUntilMs <= currentService.endAt.getTime() &&
      manualUntilMs > currentService.startAt.getTime(),
  );

  return {
    currentService,
    automatic,
    manual,
    closed: automatic || manual,
  };
}

function buildPublicReservationServiceBlockedRange({
  restaurant,
  parameters = null,
  now = new Date(),
}) {
  const state = getReservationServiceClosureState({
    restaurant,
    parameters,
    now,
  });
  if (!state.closed || !state.currentService) return null;

  return {
    startAt: state.currentService.startAt,
    endAt: state.currentService.endAt,
    allDay: false,
    note: "Service complet",
    createdAt: now,
  };
}

function isPublicReservationBlockedByCurrentService({
  restaurant,
  parameters = null,
  candidateDateTime,
  occupancyMs = 0,
  now = new Date(),
}) {
  if (
    !(candidateDateTime instanceof Date) ||
    Number.isNaN(candidateDateTime.getTime())
  ) {
    return false;
  }

  const state = getReservationServiceClosureState({
    restaurant,
    parameters,
    now,
  });
  if (!state.closed || !state.currentService) return false;

  const candidateEnd = new Date(
    candidateDateTime.getTime() + Math.max(1, Number(occupancyMs) || 0),
  );

  return (
    candidateDateTime.getTime() <= state.currentService.endAt.getTime() &&
    candidateEnd.getTime() > state.currentService.startAt.getTime()
  );
}

module.exports = {
  buildPublicReservationServiceBlockedRange,
  getCurrentReservationService,
  getReservationServiceClosureState,
  isPublicReservationBlockedByCurrentService,
};
