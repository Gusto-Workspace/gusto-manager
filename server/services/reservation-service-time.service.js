const MINUTES_PER_DAY = 24 * 60;
const DINNER_START_MINUTES = 17 * 60;
const NIGHT_SERVICE_END_MINUTES = 6 * 60;

function minutesFromHHmm(timeStr) {
  const [hour, minute] = String(timeStr || "00:00").split(":").map(Number);
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

function isOvernightServiceRange(openTime, closeTime) {
  return minutesFromHHmm(closeTime) < minutesFromHHmm(openTime);
}

function minutesFromServiceTime(timeStr) {
  const minutes = minutesFromHHmm(timeStr);
  return minutes < NIGHT_SERVICE_END_MINUTES
    ? minutes + MINUTES_PER_DAY
    : minutes;
}

function getServiceBucketFromTime(reservationTime) {
  const minutes = minutesFromHHmm(reservationTime);
  return minutes >= DINNER_START_MINUTES || minutes < NIGHT_SERVICE_END_MINUTES
    ? "dinner"
    : "lunch";
}

function isTimeWithinServiceRange(time, openTime, closeTime) {
  const candidate = minutesFromHHmm(time);
  const open = minutesFromHHmm(openTime);
  const close = minutesFromHHmm(closeTime);

  if (close === open) return false;
  if (close >= open) return candidate >= open && candidate <= close;

  const normalizedCandidate =
    candidate < open ? candidate + MINUTES_PER_DAY : candidate;
  return (
    normalizedCandidate >= open &&
    normalizedCandidate <= close + MINUTES_PER_DAY
  );
}

function buildReservationDateTime(reservationDateUTC, reservationTime) {
  const date = new Date(reservationDateUTC);
  if (Number.isNaN(date.getTime())) return null;

  const [hour = "00", minute = "00"] = String(reservationTime || "00:00")
    .split(":")
    .map(Number);
  const reservationDateTime = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Number(hour) || 0,
    Number(minute) || 0,
    0,
    0,
  );

  if (hour * 60 + minute < NIGHT_SERVICE_END_MINUTES) {
    reservationDateTime.setDate(reservationDateTime.getDate() + 1);
  }

  return reservationDateTime;
}

function buildServiceRangeDateTimes(serviceDate, openTime, closeTime) {
  const date = new Date(serviceDate);
  if (Number.isNaN(date.getTime())) return null;

  const [openHour, openMinute] = String(openTime || "00:00")
    .split(":")
    .map(Number);
  const [closeHour, closeMinute] = String(closeTime || "00:00")
    .split(":")
    .map(Number);
  if (
    openHour * 60 + openMinute ===
    closeHour * 60 + closeMinute
  ) {
    return null;
  }
  const startAt = new Date(date);
  const endAt = new Date(date);
  startAt.setHours(openHour || 0, openMinute || 0, 0, 0);
  endAt.setHours(closeHour || 0, closeMinute || 0, 0, 0);

  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
  return { startAt, endAt };
}

module.exports = {
  buildReservationDateTime,
  buildServiceRangeDateTimes,
  getServiceBucketFromTime,
  isOvernightServiceRange,
  isTimeWithinServiceRange,
  minutesFromHHmm,
  minutesFromServiceTime,
};
