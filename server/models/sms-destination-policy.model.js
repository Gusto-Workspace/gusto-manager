const mongoose = require("mongoose");

const smsDestinationPolicySchema = new mongoose.Schema(
  {
    country: { type: String, required: true, uppercase: true, trim: true, unique: true },
    enabled: { type: Boolean, default: false },
    provider: { type: String, enum: ["smsmode"], default: "smsmode" },
    senderMode: {
      type: String,
      enum: ["alpha", "registered_alpha", "numeric", "shortcode", "provider_default"],
      required: true,
    },
    senderRegistrationRequired: { type: Boolean, default: false },
    supportsDlr: { type: Boolean, default: false },
    providerRateHt: { type: Number, min: 0, required: true },
    billingCredits: { type: Number, min: 1, required: true },
    fallbackSender: { type: String, default: "" },
    lastReviewedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SmsDestinationPolicy", smsDestinationPolicySchema);
