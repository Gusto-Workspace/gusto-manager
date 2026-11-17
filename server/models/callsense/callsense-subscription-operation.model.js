const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String, // restaurant ID: the MongoDB primary key serialises mutations
  attemptId: { type: String, required: true },
  subscriptionId: { type: String, default: "" },
  action: { type: String, default: "" },
  kind: { type: String, enum: ["create", "update", "activation", "reconcile"], required: true },
  state: { type: String, enum: ["pending", "uncertain"], default: "pending" },
  startedAt: { type: Date, required: true },
}, { bufferCommands: false });
module.exports = mongoose.model("CallSenseSubscriptionOperation", schema);
