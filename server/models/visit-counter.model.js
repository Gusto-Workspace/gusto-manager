// models/VisitCounter.js
const mongoose = require("mongoose");

const visitCounterSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
    index: true,
  },
  period: {
    // format "YYYY-MM" pour un compteur mensuel
    type: String,
    required: true,
    index: true,
  },
  count: {
    type: Number,
    default: 0,
  },
});

// garantie qu'on n'a qu'un seul document par (restaurant, period)
visitCounterSchema.index({ restaurant: 1, period: 1 }, { unique: true });

const VisitCounterModel = mongoose.model("VisitCounter", visitCounterSchema);
module.exports = VisitCounterModel;
