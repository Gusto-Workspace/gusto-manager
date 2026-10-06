const mongoose = require("mongoose");

// Separate recovery journal: neither a direction nor an official Style Frame.
const schema = new mongoose.Schema({
  generationId: { type: String, required: true, unique: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  directionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  mode: { type: String, enum: ["new_proposal", "refine"], required: true },
  status: { type: String, enum: ["prepared", "running", "uploaded", "failed", "completed"], required: true },
  stage: String,
  planHash: String,
  directionSnapshotHash: String,
  selectedMomentIds: [String],
  selectedClientAssetIds: [String],
  selectedReferenceIds: [String],
  currentFrameId: String,
  refinementFeedback: { type: String, maxlength: 1500, default: "", select: false },
  // Needed for a manual retry/recovery with exactly the same inputs. Never exposed.
  plan: { type: mongoose.Schema.Types.Mixed, select: false },
  model: String,
  quality: String,
  openaiRequestId: String,
  errorCategory: String,
  httpStatus: Number,
  openaiErrorType: String,
  openaiErrorCode: String,
  cloudinaryPublicId: String,
  secureUrl: String,
}, { timestamps: true });
schema.index({ projectId: 1, directionId: 1, createdAt: -1 });
module.exports = mongoose.model("StyleFrameGenerationAttempt", schema);
