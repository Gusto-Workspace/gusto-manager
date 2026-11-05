const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true },
  enabled: { type: Boolean, default: false },
  accountSid: { type: String, required: true },
  twilioNumber: { type: String, required: true, unique: true },
  sipUri: { type: String, required: true },
}, { timestamps: true, bufferCommands: false });

module.exports = mongoose.model("CallSenseConfig", schema);
