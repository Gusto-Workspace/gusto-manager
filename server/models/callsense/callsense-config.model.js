const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true },
  enabled: { type: Boolean, default: false },
  accountSid: { type: String, required: true },
  twilioNumber: { type: String, required: true, unique: true },
  sipUri: { type: String, required: true },
  // Secrets are never returned by ordinary queries or embedded in Restaurant.
  encryptedAuthToken: { type: String, select: false },
  commercial: {
    subscribed: { type: Boolean, default: false },
    stripePriceId: { type: String, default: "" },
    includedMinutes: { type: Number, min: 0, default: 0 },
    meteringEnabled: { type: Boolean, default: false },
    meteringFrom: Date,
    stripeSubscriptionId: { type: String, default: "" },
    stripeStatus: { type: String, default: "" },
    periodStart: Date,
    periodEnd: Date,
  },
  provisioningStatus: { type: String, enum: ["unconfigured", "preparing", "compliance_pending", "hardware_pending", "ready_for_test", "active", "incident", "suspended"], default: "unconfigured" },
  phoneNumberSid: { type: String, sparse: true, unique: true },
  sipDomain: String,
  sipDomainSid: { type: String, sparse: true, unique: true },
  terminalType: { type: String, enum: ["softphone", "HT813", "other"], default: "softphone" },
  regulatoryBundleSid: String,
  activatedAt: Date,
  reconciliation: {
    cursor: Date,
    leaseId: String,
    leaseUntil: Date,
    anomalies: [{ callSid: String, startedAt: Date, reason: String }],
    lastError: String,
  },
  managedByOnboarding: { type: Boolean, default: false },
  securityEvents: [{ action: String, actorId: String, at: Date }],
}, { timestamps: true, bufferCommands: false });

module.exports = mongoose.model("CallSenseConfig", schema);
