const mongoose = require("mongoose");

const takeAwaySlotLockSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    slotId: { type: String, required: true, index: true },
    owner: { type: String, default: "" },
    lockedUntil: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

takeAwaySlotLockSchema.index({ restaurant_id: 1, slotId: 1 }, { unique: true });

module.exports = mongoose.model("TakeAwaySlotLock", takeAwaySlotLockSchema);
