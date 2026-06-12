export const RESERVATION_SEATS_FILTER_OPTIONS = [0, 2, 4, 6, 8, 10, 12];

export function matchesReservationGuestsFilter(reservation, minSeatsFilter) {
  const minGuests = Math.max(0, Number(minSeatsFilter || 0));
  if (!minGuests) return true;
  return Number(reservation?.numberOfGuests || 0) >= minGuests;
}
