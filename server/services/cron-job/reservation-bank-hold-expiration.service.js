require("dotenv").config();
const cron = require("node-cron");
const mongoose = require("mongoose");
const ReservationModel = require("../../models/reservation.model");
const RestaurantModel = require("../../models/restaurant.model");
const { sendReservationEmail } = require("../reservations-mailer.service");

// toutes les 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();

    const reservations = await ReservationModel.find({
      status: "Pending",
      "bankHold.enabled": true,
      "bankHold.status": { $in: ["setup_pending", "authorization_pending"] },
      "bankHold.expiresAt": { $ne: null, $lte: now },
    });

    for (const reservation of reservations) {
      reservation.status = "Canceled";
      reservation.canceledAt = new Date();
      reservation.bankHold.status = "expired";
      reservation.bankHold.lastError =
        "Validation de l’empreinte bancaire non effectuée dans le délai imparti.";

      reservation.reminder24hDueAt = null;
      reservation.reminder24hSentAt = null;
      reservation.reminder24hLockedAt = null;

      await reservation.save();

      try {
        const restaurant = await RestaurantModel.findById(
          reservation.restaurant_id,
        ).select("name");

        await sendReservationEmail("canceled", {
          reservation,
          restaurantName: restaurant?.name || "Restaurant",
        });
      } catch (mailErr) {
        console.error(
          "[bank-hold-expiration-email-error]",
          reservation?._id?.toString?.(),
          mailErr?.response?.body || mailErr,
        );
      }

      console.log("[bank-hold-expired-canceled]", {
        reservationId: String(reservation._id),
      });
    }
  } catch (error) {
    console.error("[bank-hold-expiration-cron-error]", error);
  }
});
