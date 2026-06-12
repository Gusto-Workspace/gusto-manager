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

function getReservationHoursSource(restaurant) {
  const parameters = restaurant?.reservationsSettings || {};
  return parameters?.same_hours_as_restaurant
    ? restaurant?.opening_hours
    : parameters?.reservation_hours;
}

function getReservationServicesForDate(restaurant, date) {
  const sourceHours = getReservationHoursSource(restaurant);
  if (!Array.isArray(sourceHours)) return [];

  const jsDay = date.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const dayHours = sourceHours[dayIndex];
  if (!dayHours || dayHours?.isClosed || !Array.isArray(dayHours?.hours)) {
    return [];
  }

  return dayHours.hours
    .map((range) => ({
      startAt: buildLocalDateTime(date, range?.open),
      endAt: buildLocalDateTime(date, range?.close),
    }))
    .filter(
      (range) =>
        range.startAt &&
        range.endAt &&
        range.endAt.getTime() > range.startAt.getTime(),
    );
}

export function getCurrentReservationService(restaurant, now = new Date()) {
  return (
    getReservationServicesForDate(restaurant, now).find(
      (service) => now >= service.startAt && now < service.endAt,
    ) || null
  );
}

export function getReservationServiceClosureState(
  restaurant,
  now = new Date(),
) {
  const parameters = restaurant?.reservationsSettings || {};
  const currentService = getCurrentReservationService(restaurant, now);

  if (!currentService) {
    return {
      currentService: null,
      automatic: false,
      manual: false,
      closed: false,
    };
  }

  const automatic = Boolean(
    parameters?.refuse_public_reservations_during_service,
  );
  const manualUntil = parameters?.manual_service_full_until
    ? new Date(parameters.manual_service_full_until)
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

export function getNextReservationServiceBoundaryAt(
  restaurant,
  now = new Date(),
) {
  const currentService = getCurrentReservationService(restaurant, now);
  if (currentService) return currentService.endAt;

  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);

    const nextService = getReservationServicesForDate(restaurant, date).find(
      (service) => service.startAt.getTime() > now.getTime(),
    );
    if (nextService) return nextService.startAt;
  }

  return null;
}
