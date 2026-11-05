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
  match: { type: String, enum: ["unknown", "recognized", "ambiguous"], default: "unknown" },
  phase: { type: Number, default: 0 },
  answeredAt: Date,
  outcome: String,
  duration: Number,
  sipCompleted: Boolean,
  pushClaimed: { type: Boolean, default: false },
}, { timestamps: true, bufferCommands: false });
schema.index({ restaurantId: 1, createdAt: -1 });
module.exports = mongoose.model("CallSenseCall", schema);
