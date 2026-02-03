const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    module: { type: String, required: true, index: true },

    type: { type: String, required: true, index: true },

    title: { type: String, required: true },
    message: { type: String, required: true },

    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    link: { type: String, default: "" },

    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ restaurantId: 1, createdAt: -1 });
notificationSchema.index({
  restaurantId: 1,
  module: 1,
  read: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Notification", notificationSchema);
