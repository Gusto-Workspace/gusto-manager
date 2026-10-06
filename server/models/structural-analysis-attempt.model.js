const mongoose = require("mongoose");

// Separate from the active reference: rejected paid responses remain inspectable
// after subsequent attempts, without bloating library payloads.
const schema = new mongoose.Schema({
  referenceId: { type: mongoose.Schema.Types.ObjectId, ref: "StructuralReference", required: true, index: true },
  generationId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["running", "received", "validation_failed", "validated", "applied", "failed"], required: true },
  rawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  parsedResult: { type: mongoose.Schema.Types.Mixed, default: null },
  captureSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  validationError: { type: mongoose.Schema.Types.Mixed, default: null },
  receivedAt: Date,
  appliedAt: Date,
}, { timestamps: true });
module.exports = mongoose.model("StructuralAnalysisAttempt", schema);
