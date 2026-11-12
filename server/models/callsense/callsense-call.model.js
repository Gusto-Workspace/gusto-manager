const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  accountSid: { type: String, required: true },
  callSid: { type: String, required: true, unique: true },
  childCallSid: String,
  from: String,
  to: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  customerName: String,
  customerFirstName: String,
  customerLastName: String,
  match: { type: String, enum: ["unknown", "recognized", "ambiguous"], default: "unknown" },
  phase: { type: Number, default: 0 },
  answeredAt: Date,
  outcome: String,
  duration: Number,
  sipCompleted: Boolean,
  sipFinalStatus: String,
  pushClaimed: { type: Boolean, default: false },
  missedPushClaimed: { type: Boolean, default: false },
  missedReadAt: { type: Date, default: null },
  incomingReceived: Boolean,
  sipResponseCode: String,
  billingState: { type: String, enum: ["complete", "review"], default: null },
  billingReviewReason: String,
  recoveredFromTwilio: { type: Boolean, default: false },
  billingNextCheckAt: Date,
}, { timestamps: true, bufferCommands: false });
schema.index({ restaurantId: 1, createdAt: -1, _id: -1 });
schema.index({ restaurantId: 1, outcome: 1, missedReadAt: 1 });
module.exports = mongoose.model("CallSenseCall", schema);
