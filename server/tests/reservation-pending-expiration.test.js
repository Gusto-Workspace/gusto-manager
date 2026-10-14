const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReservationDateTime,
  capPendingReservationDeadline,
  isPendingReservationExpired,
} = require("../services/reservation-service-time.service");

const reservationDate = new Date("2026-10-16T00:00:00.000Z");
const reservationTime = "19:00";

test("pending deadline is capped at the scheduled reservation time", () => {
  const scheduledStart = buildReservationDateTime(
    reservationDate,
    reservationTime,
  );
  const laterDeadline = new Date(scheduledStart.getTime() + 60 * 60 * 1000);

  assert.equal(
    capPendingReservationDeadline(
      laterDeadline,
      reservationDate,
      reservationTime,
    ).getTime(),
    scheduledStart.getTime(),
  );
});

test("a deadline before the reservation time remains unchanged", () => {
  const scheduledStart = buildReservationDateTime(
    reservationDate,
    reservationTime,
  );
  const earlierDeadline = new Date(scheduledStart.getTime() - 60 * 60 * 1000);

  assert.equal(
    capPendingReservationDeadline(
      earlierDeadline,
      reservationDate,
      reservationTime,
    ).getTime(),
    earlierDeadline.getTime(),
  );
});

test("the until-reservation option uses the reservation time as its deadline", () => {
  assert.equal(
    capPendingReservationDeadline(
      null,
      reservationDate,
      reservationTime,
    ).getTime(),
    buildReservationDateTime(reservationDate, reservationTime).getTime(),
  );
});

test("pending expires at its deadline or, at the latest, at reservation time", () => {
  const scheduledStart = buildReservationDateTime(
    reservationDate,
    reservationTime,
  );
  const earlyDeadline = new Date(scheduledStart.getTime() - 60 * 60 * 1000);

  assert.equal(
    isPendingReservationExpired({
      pendingExpiresAt: earlyDeadline,
      reservationDate,
      reservationTime,
      now: new Date(earlyDeadline.getTime() - 1),
    }),
    false,
  );
  assert.equal(
    isPendingReservationExpired({
      pendingExpiresAt: earlyDeadline,
      reservationDate,
      reservationTime,
      now: earlyDeadline,
    }),
    true,
  );
  assert.equal(
    isPendingReservationExpired({
      pendingExpiresAt: null,
      reservationDate,
      reservationTime,
      now: scheduledStart,
    }),
    true,
  );
});
