const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: "", trim: true },
    customerPhone: { type: String, default: "", trim: true },

    numberOfGuests: { type: Number, required: true, min: 1 },
    reservationDate: { type: Date, required: true, index: true },
    reservationTime: { type: String, required: true }, // "HH:mm"

    table: {
      tableId: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: "", trim: true },
      seats: { type: Number, min: 1, default: null },

      source: {
        type: String,
        enum: ["configured", "manual"],
        default: "manual",
        index: true,
      },
    },

    commentary: { type: String, default: "" },

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Active",
        "Late",
        "Finished",
        "Canceled",
        "Rejected",
      ],
      default: "Pending",
      index: true,
    },

    source: {
      type: String,
      enum: ["public", "dashboard"],
      default: "public",
    },

    pendingExpiresAt: { type: Date, default: null, index: true },
    activatedAt: { type: Date, default: null, index: true },
    finishedAt: { type: Date, default: null, index: true },
    canceledAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Index utiles
reservationSchema.index({ restaurant_id: 1, reservationDate: 1, status: 1 });
reservationSchema.index({
  restaurant_id: 1,
  reservationDate: 1,
  status: 1,
  pendingExpiresAt: 1,
});
reservationSchema.index({ restaurant_id: 1, status: 1, activatedAt: 1 });
reservationSchema.index({
  restaurant_id: 1,
  reservationDate: 1,
  reservationTime: 1,
});

// ✅ optionnel si tu fais beaucoup de checks de conflit
reservationSchema.index({
  restaurant_id: 1,
  "table.tableId": 1,
  reservationDate: 1,
});

module.exports = mongoose.model("Reservation", reservationSchema);
