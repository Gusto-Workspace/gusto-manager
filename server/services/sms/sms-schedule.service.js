const { DateTime } = require("luxon");

const DEFAULT_TIMEZONE = "Europe/Paris";

function getRestaurantTimezone(restaurant) {
  const candidate = String(restaurant?.timezone || "").trim();
  return DateTime.local().setZone(candidate).isValid ? candidate : DEFAULT_TIMEZONE;
}

function reservationDateTime(reservation, restaurant) {
  const day = DateTime.fromJSDate(new Date(reservation.reservationDate), { zone: "utc" }).toFormat("yyyy-MM-dd");
  const time = String(reservation.reservationTime || "").slice(0, 5);
  const value = DateTime.fromFormat(`${day} ${time}`, "yyyy-MM-dd HH:mm", {
    zone: getRestaurantTimezone(restaurant),
  });
  return value.isValid ? value : null;
}

function computeSmsSchedule({ reservation, restaurant, delayMinutes, now = new Date() }) {
  const startsLocal = reservationDateTime(reservation, restaurant);
  if (!startsLocal) return { skipReason: "invalid_reservation_datetime" };
  const nowLocal = DateTime.fromJSDate(now).setZone(startsLocal.zoneName);
  if (startsLocal <= nowLocal) return { skipReason: "too_late", reservationStartsAt: startsLocal.toUTC().toJSDate() };

  let scheduledLocal = startsLocal.minus({ minutes: Math.max(1, Number(delayMinutes || 1440)) });
  const dayStart = scheduledLocal.startOf("day").plus({ hours: 8 });
  const dayEnd = scheduledLocal.startOf("day").plus({ hours: 21 });
  if (scheduledLocal < dayStart) scheduledLocal = dayStart;
  if (scheduledLocal > dayEnd) scheduledLocal = dayEnd;
  if (scheduledLocal < nowLocal) scheduledLocal = nowLocal;
  if (scheduledLocal.hour < 8) scheduledLocal = scheduledLocal.startOf("day").plus({ hours: 8 });
  if (scheduledLocal.hour >= 21 && scheduledLocal.minute > 0) {
    scheduledLocal = scheduledLocal.plus({ days: 1 }).startOf("day").plus({ hours: 8 });
  }
  if (scheduledLocal >= startsLocal) {
    return { skipReason: "too_late", reservationStartsAt: startsLocal.toUTC().toJSDate() };
  }
  return {
    scheduledAt: scheduledLocal.toUTC().toJSDate(),
    reservationStartsAt: startsLocal.toUTC().toJSDate(),
    timezone: startsLocal.zoneName,
  };
}

module.exports = { DEFAULT_TIMEZONE, computeSmsSchedule, getRestaurantTimezone, reservationDateTime };
