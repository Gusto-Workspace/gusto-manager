const mongoose = require("mongoose");

// One immutable commercial observation for each inbound parent call. The
// child SID is evidence, never a second billable communication.
const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  callId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  parentSid: { type: String, required: true },
  childSid: { type: String, required: true },
  // An unmatched historical observation remains in review without inventing a period.
  stripeCustomerId: String,
  subscriptionId: String,
  periodStart: Date,
  periodEnd: Date,
  occurredAt: { type: Date, required: true },
  seconds: { type: Number, required: true, min: 1 },
  minutes: { type: Number, required: true, min: 1 },
  identifier: { type: String, required: true, unique: true },
  state: { type: String, enum: ["verified", "sending", "sent", "review", "resolved"], default: "verified" },
  firstAttemptAt: Date,
  leaseUntil: Date,
  sentAt: Date,
  lastError: String,
  resolution: { type: String, enum: ["excluded", "manual"] },
  resolvedAt: Date,
  resolvedBy: String,
}, { timestamps: true, bufferCommands: false });
schema.index({ restaurantId: 1, periodStart: -1, state: 1 });
module.exports = mongoose.model("CallSenseConsumption", schema);
