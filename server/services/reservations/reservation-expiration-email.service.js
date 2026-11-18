const crypto = require("crypto");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { sendReservationEmail } = require("./reservations-mailer.service");

const MAX_ATTEMPTS = 8;
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 200;

function eligible(now) {
  const stale = new Date(now.getTime() - LOCK_MAX_AGE_MS);
  return {
    expirationEmailQueuedAt: { $ne: null },
    expirationEmailSentAt: null,
    $and: [
      { $or: [{ status: "Expired" }, { status: "Canceled", "bankHold.status": "expired" }] },
      { $or: [{ expirationEmailAttempts: { $lt: MAX_ATTEMPTS } }, { expirationEmailAttempts: { $exists: false } }] },
      { $or: [
        { expirationEmailStatus: { $in: ["pending", null] }, expirationEmailNextRetryAt: { $in: [null] }, $or: [{ expirationEmailClaimedAt: null }, { expirationEmailClaimedAt: { $lte: stale } }] },
        { expirationEmailStatus: "pending", expirationEmailNextRetryAt: { $lte: now }, expirationEmailClaimedAt: null },
        { expirationEmailStatus: "processing", expirationEmailClaimedAt: { $lte: stale } },
      ] },
    ],
  };
}

async function sendQueuedExpirationEmails() {
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_MAX_AGE_MS);
  // An interruption during the final attempt must not leave an endless lock.
  await ReservationModel.updateMany({
    expirationEmailQueuedAt: { $ne: null }, expirationEmailSentAt: null,
    expirationEmailStatus: "processing", expirationEmailAttempts: { $gte: MAX_ATTEMPTS },
    expirationEmailClaimedAt: { $lte: stale },
  }, { $set: { expirationEmailStatus: "exhausted", expirationEmailClaimedAt: null, expirationEmailLockToken: "", expirationEmailLastError: "Dernière tentative interrompue ; résultat de l’envoi inconnu." } });

  const candidates = await ReservationModel.find(eligible(now)).select("_id expirationEmailIdempotencyKey").limit(BATCH_SIZE);
  for (const candidate of candidates) {
    const claimTime = new Date();
    const token = crypto.randomUUID();
    const key = candidate.expirationEmailIdempotencyKey || crypto.randomUUID();
    const reservation = await ReservationModel.findOneAndUpdate(
      { ...eligible(claimTime), _id: candidate._id, expirationEmailIdempotencyKey: candidate.expirationEmailIdempotencyKey || { $in: [null, ""] } },
      { $set: { expirationEmailStatus: "processing", expirationEmailClaimedAt: claimTime, expirationEmailLockToken: token, expirationEmailIdempotencyKey: key, expirationEmailNextRetryAt: null }, $inc: { expirationEmailAttempts: 1 } },
      { new: true },
    );
    if (!reservation) continue;

    const owned = { _id: reservation._id, expirationEmailStatus: "processing", expirationEmailLockToken: token };
    try {
      const restaurant = await RestaurantModel.findById(reservation.restaurant_id).select("name");
      // Recheck eligibility immediately before contacting Brevo.
      const current = await ReservationModel.findOne({ ...owned, expirationEmailQueuedAt: reservation.expirationEmailQueuedAt, $or: [{ status: "Expired" }, { status: "Canceled", "bankHold.status": "expired" }] });
      if (!current) {
        await ReservationModel.updateOne(owned, { $set: { expirationEmailStatus: "skipped", expirationEmailClaimedAt: null, expirationEmailLockToken: "", expirationEmailLastError: "Réservation non expirée lors de l'envoi." } });
        continue;
      }
      const result = await sendReservationEmail("expired", { reservation: current, restaurant, idempotencyKey: key });
      if (result?.skipped) {
        if (result.reason === "invalid_email") {
          await ReservationModel.updateOne(owned, { $set: { expirationEmailStatus: "skipped", expirationEmailClaimedAt: null, expirationEmailLockToken: "", expirationEmailLastError: "Adresse email absente ou invalide." } });
          continue;
        }
        throw new Error(`Envoi indisponible : ${result.reason || "raison inconnue"}`);
      }
      await ReservationModel.updateOne(owned, { $set: { expirationEmailStatus: "sent", expirationEmailSentAt: new Date(), expirationEmailClaimedAt: null, expirationEmailLockToken: "", expirationEmailNextRetryAt: null, expirationEmailLastError: "" } });
    } catch (error) {
      const message = String(error?.response?.body?.message || error?.message || "Erreur d'envoi").slice(0, 500);
      const code = error?.response?.body?.code;
      if (code === "duplicate_parameter" && /idempotenc/i.test(message)) {
        await ReservationModel.updateOne(owned, { $set: { expirationEmailStatus: "sent", expirationEmailSentAt: new Date(), expirationEmailClaimedAt: null, expirationEmailLockToken: "", expirationEmailNextRetryAt: null, expirationEmailLastError: "Brevo a reconnu la clé d'idempotence d'une tentative précédente." } });
        continue;
      }
      const attempts = Number(reservation.expirationEmailAttempts || 1);
      const exhausted = attempts >= MAX_ATTEMPTS;
      await ReservationModel.updateOne(owned, { $set: {
        expirationEmailStatus: exhausted ? "exhausted" : "pending",
        expirationEmailClaimedAt: null, expirationEmailLockToken: "",
        expirationEmailNextRetryAt: exhausted ? null : new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60 * 1000 * 2 ** (attempts - 1))),
        expirationEmailLastError: message,
      } });
      console.error("[reservation-expiration-email-error]", String(reservation._id), message);
    }
  }
}

module.exports = { sendQueuedExpirationEmails };
