const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String,
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  periodStart: { type: Date, required: true },
  threshold: { type: Number, required: true, enum: [80, 100] },
  sentAt: Date,
}, { timestamps: true, bufferCommands: false });
module.exports = mongoose.model("CallSenseQuotaAlert", schema);
