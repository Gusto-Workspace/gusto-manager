const mongoose = require("mongoose");

// The built-in unique _id index exists even when autoIndex is disabled.
// Keep receipts indefinitely: a late manual replay must remain harmless.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    objectId: { type: String, required: true },
    leaseOwner: { type: String, default: "" },
    leaseUntil: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    handled: { type: Boolean, default: null },
    attempts: { type: Number, default: 0 },
    lastErrorCode: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TakeAwayStripeEvent", schema);
