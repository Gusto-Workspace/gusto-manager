const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  action: { type: String, required: true },
  actorId: { type: String, default: "" },
  attemptId: { type: String, default: "" },
  reference: { type: String, default: "" },
  at: { type: Date, default: Date.now },
}, { bufferCommands: false });
schema.index({ restaurantId: 1, at: -1 });
module.exports = mongoose.model("CallSenseBillingAudit", schema);
