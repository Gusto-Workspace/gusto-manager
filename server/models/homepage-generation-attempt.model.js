const mongoose = require("mongoose");

// Recovery journal only. No binary/base64 and no selectable official homepage.
const imageCheckpoint = {
  cloudinaryPublicId: String,
  secureUrl: String,
  sha256: String,
};
const chapterSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  status: { type: String, enum: ["pending", "generating", "persisted", "failed"], required: true },
  selectedMomentIds: [String],
  selectedAssetIds: [String],
  openaiRequestId: String,
  uncertain: { type: Boolean, default: false },
  error: { code: String, httpStatus: Number },
  ...imageCheckpoint,
}, { _id: false });
const schema = new mongoose.Schema({
  generationId: { type: String, required: true, unique: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  directionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  styleFrameId: { type: mongoose.Schema.Types.ObjectId, required: true },
  directionSlot: String,
  directionVersion: Number,
  // Reserved for a future targeted variation contract; not enabled by this pipeline.
  mode: { type: String, enum: ["initial"], default: "initial" },
  parentGenerationId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["prepared", "running", "failed", "ready", "completed", "abandoned"], required: true },
  blocking: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
  stage: String,
  contractVersion: { type: String, required: true },
  contextHash: { type: String, required: true },
  planHash: { type: String, required: true },
  plan: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  model: String,
  quality: String,
  chapters: [chapterSchema],
  assembled: { status: String, ...imageCheckpoint },
  errorCode: String,
}, { timestamps: true });
// The project operation lock is the first guard; this index also prevents two
// unfinished attempts after a lost lock/acknowledgement.
schema.index({ projectId: 1 }, { unique: true, partialFilterExpression: { blocking: true } });
schema.index({ projectId: 1, createdAt: -1 });
module.exports = mongoose.model("HomepageGenerationAttempt", schema);
