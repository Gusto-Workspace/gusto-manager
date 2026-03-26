const cron = require("node-cron");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { sendReservationEmail } = require("../reservations-mailer.service");

const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 50;

function looksDue(d) {
  return (
    d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() <= Date.now()
  );
}

async function lockReservationForReminder(reservationId) {
  const now = new Date();
  const expiredLock = new Date(now.getTime() - LOCK_MAX_AGE_MS);

  return ReservationModel.findOneAndUpdate(
    {
      _id: reservationId,
      status: "Confirmed",
      reminder24hSentAt: null,
      reminder24hDueAt: { $ne: null, $lte: now },
      $or: [
        { reminder24hLockedAt: null },
        { reminder24hLockedAt: { $lt: expiredLock } },
      ],
    },
    {
      $set: { reminder24hLockedAt: now },
    },
    { new: true },
  );
}

async function markReminderSent(reservationId) {
  await ReservationModel.updateOne(
    { _id: reservationId },
    {
      $set: {
        reminder24hSentAt: new Date(),
      },
      $unset: {
        reminder24hLockedAt: 1,
      },
    },
  );
}

async function releaseReminderLock(reservationId) {
  await ReservationModel.updateOne(
    { _id: reservationId },
    {
      $unset: {
        reminder24hLockedAt: 1,
      },
    },
  );
}

async function runReservationReminder24h() {
  const now = new Date();

  const candidates = await ReservationModel.find({
    status: "Confirmed",
    reminder24hSentAt: null,
    reminder24hDueAt: { $ne: null, $lte: now },
    customerEmail: { $exists: true, $ne: "" },
  })
    .sort({ reminder24hDueAt: 1 })
    .limit(BATCH_SIZE);

  if (!candidates.length) return;

  for (const candidate of candidates) {
    const locked = await lockReservationForReminder(candidate._id);
    if (!locked) continue;

    try {
      if (!looksDue(locked.reminder24hDueAt)) {
        await releaseReminderLock(locked._id);
        continue;
      }

      const restaurant = await RestaurantModel.findById(
        locked.restaurant_id,
      ).select("name reservationsSettings.email_templates");

      const restaurantName = restaurant?.name || "Restaurant";

      const result = await sendReservationEmail("reminder24h", {
        reservation: locked,
        restaurantName,
        restaurant,
      });

      if (result?.skipped) {
        console.log("[reservation-reminder-skip]", {
          reservationId: String(locked._id),
          reason: result.reason,
        });

        await releaseReminderLock(locked._id);
        continue;
      }

      await markReminderSent(locked._id);
    } catch (e) {
      console.error(
        "[reservation-reminder-error]",
        String(locked?._id),
        e?.response?.body || e,
      );

      await releaseReminderLock(locked._id);
    }
  }
}

cron.schedule(
  "*/5 * * * *",
  () => {
    runReservationReminder24h().catch((err) =>
      console.error("Reservation reminder échoué ❌", err),
    );
  },
  { timezone: "Europe/Paris" },
);

console.log(
  "Reservation reminders programmés toutes les 5 minutes (Europe/Paris)",
);

module.exports = runReservationReminder24h;
