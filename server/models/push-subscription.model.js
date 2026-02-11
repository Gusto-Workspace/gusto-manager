const mongoose = require("mongoose");

const PushSubscriptionSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    module: {
      type: String,
      enum: ["reservations", "gift_cards"],
      required: true,
      index: true,
    },

    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner" }, // optionnel
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
