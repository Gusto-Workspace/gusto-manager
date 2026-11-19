const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ["receipt"], required: true },
  signature: String,
  employees: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
}, { timestamps: true });

module.exports = mongoose.model("PlanningAction", schema);
