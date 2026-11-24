const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  title: String,
  position: String,
  startTime: String,
  endTime: String,
  endDayOffset: Number,
  breakMinutes: Number,
  notes: String,
});
schema.index({ restaurant: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model("PlanningShiftTemplate", schema);
