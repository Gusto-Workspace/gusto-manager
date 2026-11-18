const arrivalStatuses = ["Confirmed", "Active", "Late"];
const serviceDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
const arrivalTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function canSignalReservationArrival(reservation, now = new Date()) {
  if (!arrivalStatuses.includes(reservation?.status)) return false;

  const { year, month, day, hour } = Object.fromEntries(
    serviceDayFormatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  // In Gusto, departures before 06:00 belong to the previous service day.
  const offset = Number(hour) < 6 ? 1 : 0;
  const serviceDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - offset))
    .toISOString()
    .slice(0, 10);
  return String(reservation.reservationDate || "").slice(0, 10) === serviceDay;
}

export function canShowReservationArrival(reservation) {
  return arrivalStatuses.includes(reservation?.status) && Boolean(reservation.arrivedAt);
}

export function formatReservationArrivalTime(arrivedAt) {
  return arrivalTimeFormatter.format(new Date(arrivedAt)).replace(":", "h");
}

export function mergeReservationArrival(reservation, arrival) {
  if (
    !Number.isSafeInteger(arrival?.arrivalRevision) ||
    arrival.arrivalRevision <= (reservation.arrivalRevision ?? -1)
  ) {
    return reservation;
  }
  return {
    ...reservation,
    arrivedAt: arrival.arrivedAt ?? null,
    arrivalRevision: arrival.arrivalRevision,
  };
}
