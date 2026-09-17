const mongoose = require("mongoose");

const smsUsagePeriodSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    stripeSubscriptionId: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    includedCredits: { type: Number, default: 100 },
    reservedCredits: { type: Number, min: 0, default: 0 },
    consumedCredits: { type: Number, min: 0, default: 0 },
    includedCreditsConsumed: { type: Number, min: 0, default: 0 },
    overageCredits: { type: Number, min: 0, default: 0 },
    overageAmount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

smsUsagePeriodSchema.index(
  { restaurantId: 1, stripeSubscriptionId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true },
);

module.exports = mongoose.model("SmsUsagePeriod", smsUsagePeriodSchema);
