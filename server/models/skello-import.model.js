const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  fingerprint: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  scope: { type: String, enum: ["month", "weeks"], required: true },
  source: { type: String, default: "skello" },
  status: { type: String, enum: ["complete", "failed", "removed"], required: true },
  summary: { type: mongoose.Schema.Types.Mixed, required: true },
  manifest: { type: mongoose.Schema.Types.Mixed, select: false },
  actor: { type: String, required: true },
  removedBy: String,
  removedAt: Date,
}, { timestamps: true });

schema.index({ restaurant: 1, fingerprint: 1 }, { unique: true });
schema.index({ restaurant: 1, status: 1, from: 1, to: 1 });

module.exports = mongoose.model("SkelloImport", schema);
