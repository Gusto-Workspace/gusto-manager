// reservation.model.js

const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String },
    numberOfGuests: { type: Number, required: true, min: 1 },
    reservationDate: { type: Date, required: true },
    specialRequests: { type: String },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
      default: "Pending",
    },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ReservationModel = mongoose.model("Reservation", reservationSchema);
module.exports = ReservationModel;
