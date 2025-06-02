// models/VisitCounter.js
const mongoose = require("mongoose");

const monthEntrySchema = new mongoose.Schema(
  {
    period: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const visitCounterSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
    unique: true,
    index: true,
  },
  periods: {
    type: [monthEntrySchema],
    default: [],
  },
});

const VisitCounterModel = mongoose.model("VisitCounter", visitCounterSchema);
module.exports = VisitCounterModel;
