const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String, // restaurant ID: the MongoDB primary key serialises mutations
  attemptId: { type: String, required: true },
  kind: { type: String, enum: ["create", "update"], required: true },
  state: { type: String, enum: ["pending", "uncertain"], default: "pending" },
  startedAt: { type: Date, required: true },
}, { bufferCommands: false });
module.exports = mongoose.model("CallSenseSubscriptionOperation", schema);
