import {
  getReservationServiceClock,
  getReservationServiceDateKey,
} from "./reservation-service-time";

const arrivalStatuses = ["Confirmed", "Late"];
const arrivalTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function canSignalReservationArrival(reservation, now = new Date()) {
  if (!arrivalStatuses.includes(reservation?.status)) return false;

  const { dateKey } = getReservationServiceClock(now);
  return getReservationServiceDateKey(reservation.reservationDate) === dateKey;
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
