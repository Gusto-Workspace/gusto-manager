const cron = require("node-cron");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { sendReservationEmail } = require("../reservations-mailer.service");
const {
  createReservationManageToken,
} = require("../reservation-manage-token.service");
const {
  createPerfRun,
  finishPerfRun,
  perfNowMs,
} = require("../perf-diagnostics.service");

const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 50;

function getPublicWebsiteOrigin(website) {
  const raw = String(website || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch (_) {
    try {
      return new URL(`https://${raw}`).origin;
    } catch (error) {
      return "";
    }
  }
}

function buildReservationManageUrl({ website, reservationId }) {
  const origin = getPublicWebsiteOrigin(website);
  const id = String(reservationId || "").trim();

  if (!origin || !id) return "";
  const token = createReservationManageToken(id);
  if (!token) return "";
  return `${origin}/reservations/${id}/manage?token=${encodeURIComponent(token)}`;
}

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
  const perfRun = createPerfRun("reservationReminder24h");
  const perfMetrics = {
    candidateCount: 0,
    processedCount: 0,
    modifiedCount: 0,
    skippedCount: 0,
    lockMissCount: 0,
    errorCount: 0,
    mongoMs: 0,
    emailCalls: 0,
    emailTotalMs: 0,
  };
  const now = new Date();
  let runFailed = false;

  try {
    const candidatesQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
    const candidates = await ReservationModel.find({
      status: "Confirmed",
      reminder24hSentAt: null,
      reminder24hDueAt: { $ne: null, $lte: now },
      customerEmail: { $exists: true, $ne: "" },
    })
      .sort({ reminder24hDueAt: 1 })
      .limit(BATCH_SIZE);
    if (perfRun.enabled) {
      perfMetrics.mongoMs += perfNowMs() - candidatesQueryStartedAt;
      perfMetrics.candidateCount = candidates.length;
    }

    if (!candidates.length) return;

    for (const candidate of candidates) {
      const lockStartedAt = perfRun.enabled ? perfNowMs() : 0;
      const locked = await lockReservationForReminder(candidate._id);
      if (perfRun.enabled) {
        perfMetrics.mongoMs += perfNowMs() - lockStartedAt;
      }
      if (!locked) {
        if (perfRun.enabled) perfMetrics.lockMissCount += 1;
        continue;
      }
      if (perfRun.enabled) perfMetrics.processedCount += 1;

      try {
        if (!looksDue(locked.reminder24hDueAt)) {
          const releaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
          await releaseReminderLock(locked._id);
          if (perfRun.enabled) {
            perfMetrics.mongoMs += perfNowMs() - releaseStartedAt;
            perfMetrics.skippedCount += 1;
          }
          continue;
        }

        const restaurantQueryStartedAt = perfRun.enabled ? perfNowMs() : 0;
        const restaurant = await RestaurantModel.findById(
          locked.restaurant_id,
        ).select("name website reservationsSettings.email_templates");
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - restaurantQueryStartedAt;
        }

        const restaurantName = restaurant?.name || "Restaurant";
        const actionUrl = buildReservationManageUrl({
          website: restaurant?.website,
          reservationId: locked._id,
        });

        const emailStartedAt = perfRun.enabled ? perfNowMs() : 0;
        if (perfRun.enabled) perfMetrics.emailCalls += 1;
        let result;
        try {
          result = await sendReservationEmail("reminder24h", {
            reservation: locked,
            restaurantName,
            restaurant,
            actionUrl,
          });
        } finally {
          if (perfRun.enabled) {
            perfMetrics.emailTotalMs += perfNowMs() - emailStartedAt;
          }
        }

        if (result?.skipped) {
          console.log("[reservation-reminder-skip]", {
            reservationId: String(locked._id),
            reason: result.reason,
          });

          const releaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
          await releaseReminderLock(locked._id);
          if (perfRun.enabled) {
            perfMetrics.mongoMs += perfNowMs() - releaseStartedAt;
            perfMetrics.skippedCount += 1;
          }
          continue;
        }

        const markStartedAt = perfRun.enabled ? perfNowMs() : 0;
        await markReminderSent(locked._id);
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - markStartedAt;
          perfMetrics.modifiedCount += 1;
        }
      } catch (e) {
        if (perfRun.enabled) perfMetrics.errorCount += 1;
        console.error(
          "[reservation-reminder-error]",
          String(locked?._id),
          e?.response?.body || e,
        );

        const releaseStartedAt = perfRun.enabled ? perfNowMs() : 0;
        await releaseReminderLock(locked._id);
        if (perfRun.enabled) {
          perfMetrics.mongoMs += perfNowMs() - releaseStartedAt;
        }
      }
    }
  } catch (error) {
    runFailed = true;
    if (perfRun.enabled) perfMetrics.errorCount += 1;
    throw error;
  } finally {
    finishPerfRun(perfRun, {
      ...perfMetrics,
      failed: runFailed,
    });
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
