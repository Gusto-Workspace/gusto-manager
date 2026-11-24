const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  employee: mongoose.Schema.Types.ObjectId,
  profile: mongoose.Schema.Types.ObjectId,
  kind: { type: String, enum: ["contract", "variables", "meals", "rules", "leave", "overtime", "leaveRules",
    "hoursRules", "clockRules", "absenceRules", "amendment", "hoursEntry", "annual", "historicalWork", "historicalLate"], required: true },
  date: { type: String, required: true },
  values: { type: mongoose.Schema.Types.Mixed, required: true },
  source: { type: String, enum: ["skello"] },
  skelloEffectiveDates: { type: mongoose.Schema.Types.Mixed },
  revision: { type: Number, required: true },
  updatedBy: { type: String, required: true },
}, { timestamps: true });

schema.index({ restaurant: 1, kind: 1, date: 1 });
schema.index({ employee: 1, restaurant: 1 });

module.exports = mongoose.model("PersonnelReportInput", schema);
