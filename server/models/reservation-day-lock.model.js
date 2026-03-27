const mongoose = require("mongoose");

const ReservationDayLockSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    reservationDate: { type: Date, required: true, index: true },
    owner: { type: String, default: "" },
    lockedUntil: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

ReservationDayLockSchema.index(
  { restaurant_id: 1, reservationDate: 1 },
  { unique: true },
);

module.exports = mongoose.model("ReservationDayLock", ReservationDayLockSchema);
