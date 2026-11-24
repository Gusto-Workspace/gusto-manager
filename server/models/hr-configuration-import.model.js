const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  actor: { type: String, required: true },
  effect: { type: String, required: true },
  source: { type: mongoose.Schema.Types.Mixed, required: true },
  changes: { type: [mongoose.Schema.Types.Mixed], required: true },
  restoredBy: String,
  restoredAt: Date,
}, { timestamps: true });

schema.index({ restaurant: 1, createdAt: -1 });

module.exports = mongoose.model("HrConfigurationImport", schema);
