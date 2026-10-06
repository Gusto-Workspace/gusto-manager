const mongoose = require("mongoose");

const screenshotSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const visualAnalysisSchema = new mongoose.Schema(
  {
    structure: String,
    hero: String,
    composition: String,
    rhythm: String,
    typography: String,
    photography: String,
    colors: String,
    originality: String,
    identity: String,
    usefulPatterns: { type: [String], default: [] },
  },
  { _id: false, strict: true },
);

const pageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    pathname: String,
    label: String,
    pageType: String,
    screenshot: { type: screenshotSchema, required: true },
    visualTags: { type: [String], default: [] },
    analysis: { type: visualAnalysisSchema, required: true },
    analyzedAt: Date,
  },
  { _id: false },
);

const visualProfileSchema = new mongoose.Schema(
  {
    visualTags: { type: [String], default: [] },
    dominantPatterns: { type: [String], default: [] },
    recurringPatterns: { type: [String], default: [] },
    occasionalPatterns: { type: [String], default: [] },
    patternSupport: {
      type: [new mongoose.Schema({
        label: String,
        key: String,
        pageCount: Number,
        totalPages: Number,
        tier: { type: String, enum: ["dominant", "recurring", "occasional"] },
      }, { _id: false })],
      default: [],
    },
    typographyProfile: String,
    colorProfile: String,
    layoutProfile: String,
    photographyProfile: String,
    rhythmProfile: String,
    signaturePatterns: { type: [String], default: [] },
  },
  { _id: false },
);

const progressSchema = new mongoose.Schema(
  {
    status: { type: String, default: "idle" },
    currentStage: { type: String, default: "" },
    currentPageIndex: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    currentPageLabel: { type: String, default: "" },
    completedPages: { type: Number, default: 0 },
    failedPages: { type: Number, default: 0 },
    capturedPages: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    message: { type: String, default: "" },
  },
  { _id: false },
);

const gustoPortfolioSiteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true, default: "" },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
    active: { type: Boolean, default: true },
    pages: { type: [pageSchema], default: [] },
    visualProfile: { type: visualProfileSchema, default: null },
    captureStats: {
      discovered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    analyzedAt: { type: Date, default: null },
    analyzing: { type: Boolean, default: false },
    progress: { type: progressSchema, default: () => ({}) },
    analysisStartedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

gustoPortfolioSiteSchema.index({ active: 1, analyzedAt: -1 });
module.exports = mongoose.model("GustoPortfolioSite", gustoPortfolioSiteSchema);
