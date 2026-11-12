const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String,
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  subscriptionId: { type: String, required: true },
  stripeCustomerId: String,
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
}, { timestamps: true, bufferCommands: false });
module.exports = mongoose.model("CallSenseBillingPeriod", schema);
