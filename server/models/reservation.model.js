const mongoose = require("mongoose");

// sous-schéma pour la table
const tableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    seats: { type: Number, min: 1 },
  },
  { _id: false }
);

const reservationSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String },
    numberOfGuests: { type: Number, required: true, min: 1 },
    reservationDate: { type: Date, required: true },
    reservationTime: { type: String, required: true },
    table: {
      type: tableSchema,
      required: false,
      default: null,
    },
    commentary: { type: String },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Active", "Late", "Finished"],
      default: "Pending",
    },
    manual: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ReservationModel = mongoose.model("Reservation", reservationSchema);
module.exports = ReservationModel;
