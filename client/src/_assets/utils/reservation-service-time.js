const MINUTES_PER_DAY = 24 * 60;
const DINNER_START_MINUTES = 17 * 60;
const NIGHT_SERVICE_END_MINUTES = 6 * 60;

export function minutesFromHHmm(timeStr) {
  const match = String(timeStr || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesFromReservationServiceTime(timeStr) {
  const minutes = minutesFromHHmm(timeStr);
  if (minutes === null) return null;
  return minutes < NIGHT_SERVICE_END_MINUTES
    ? minutes + MINUTES_PER_DAY
    : minutes;
}

export function getReservationServiceBucket(timeStr) {
  const minutes = minutesFromHHmm(timeStr);
  if (minutes === null) return "lunch";
  return minutes >= DINNER_START_MINUTES || minutes < NIGHT_SERVICE_END_MINUTES
    ? "dinner"
    : "lunch";
}

const COVER_COUNT_STATUSES = new Set([
  "Confirmed",
  "Active",
  "Late",
  "Finished",
]);

export function isReservationCountedInCovers(reservation) {
  return COVER_COUNT_STATUSES.has(String(reservation?.status || ""));
}

export function countReservationCoversByService(reservations = []) {
  return (Array.isArray(reservations) ? reservations : []).reduce(
    (totals, reservation) => {
      if (!isReservationCountedInCovers(reservation)) {
        return totals;
      }

      const bucket = getReservationServiceBucket(reservation?.reservationTime);
      totals[bucket] += Math.max(0, Number(reservation?.numberOfGuests || 0));
      return totals;
    },
    { lunch: 0, dinner: 0 },
  );
}

export function generateReservationTimeOptions(openTime, closeTime, interval = 30) {
  const start = minutesFromHHmm(openTime);
  const rawEnd = minutesFromHHmm(closeTime);
  const step = Number(interval);

  if (start === null || rawEnd === null || start === rawEnd) return [];
  if (!Number.isFinite(step) || step <= 0) return [];

  const end = rawEnd < start ? rawEnd + MINUTES_PER_DAY : rawEnd;
  const times = [];

  for (let minutes = start; minutes <= end; minutes += step) {
    const clockMinutes = minutes % MINUTES_PER_DAY;
    const hour = String(Math.floor(clockMinutes / 60)).padStart(2, "0");
    const minute = String(clockMinutes % 60).padStart(2, "0");
    times.push(`${hour}:${minute}`);
  }

  return times;
}

export function sortReservationTimesByServiceOrder(times = []) {
  return [...new Set(Array.isArray(times) ? times : [])].sort((left, right) => {
    const leftMinutes = minutesFromReservationServiceTime(left);
    const rightMinutes = minutesFromReservationServiceTime(right);
    if (leftMinutes === null) return 1;
    if (rightMinutes === null) return -1;
    return leftMinutes - rightMinutes;
  });
}

export function buildReservationDateTime(dateInput, timeStr) {
  const date = new Date(dateInput);
  const minutes = minutesFromHHmm(timeStr);
  if (Number.isNaN(date.getTime()) || minutes === null) return null;

  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );

  if (minutes < NIGHT_SERVICE_END_MINUTES) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

export function buildReservationServiceRange(dateInput, openTime, closeTime) {
  const date = new Date(dateInput);
  const openMinutes = minutesFromHHmm(openTime);
  const closeMinutes = minutesFromHHmm(closeTime);
  if (
    Number.isNaN(date.getTime()) ||
    openMinutes === null ||
    closeMinutes === null ||
    openMinutes === closeMinutes
  ) {
    return null;
  }

  const startAt = new Date(date);
  const endAt = new Date(date);
  startAt.setHours(Math.floor(openMinutes / 60), openMinutes % 60, 0, 0);
  endAt.setHours(Math.floor(closeMinutes / 60), closeMinutes % 60, 0, 0);
  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);

  return { startAt, endAt };
}
