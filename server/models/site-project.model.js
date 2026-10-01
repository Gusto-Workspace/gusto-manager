const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const assetSchema = new mongoose.Schema(
  {
    ...imageSchema.obj,
    role: { type: String, default: "other" },
    signature: { type: Boolean, default: false },
    name: { type: String, default: "" },
  },
  { timestamps: true },
);

const existingWebsiteContextSchema = new mongoose.Schema(
  {
    sourceUrl: String,
    summary: String,
    offerings: [String],
    distinctiveFacts: [String],
    practicalInformation: [String],
    analyzedAt: Date,
  },
  { _id: false },
);

const directionSchema = new mongoose.Schema(
  {
    name: String,
    concept: String,
    artisticIntent: String,
    layoutPrinciples: String,
    typographyDirection: String,
    colorDirection: String,
    photographyDirection: String,
    signatureElements: [String],
    sectionIdeas: [String],
    whyItFitsRestaurant: String,
    differenceFromOtherDirections: String,
    referencesUsed: [
      { type: mongoose.Schema.Types.ObjectId, ref: "DesignReference" },
    ],
    imageGenerationPrompt: String,
  },
  { timestamps: true },
);

const generationSchema = new mongoose.Schema(
  {
    directionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    parentGenerationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userPrompt: { type: String, default: "" },
    generatedPrompt: { type: String, required: true },
    image: { type: imageSchema, required: true },
    model: String,
  },
  { timestamps: true },
);

const siteProjectSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    brief: {
      city: String,
      restaurantType: String,
      description: String,
      story: String,
      positioning: String,
      target: String,
      particularities: String,
      existingWebsite: String,
      notes: String,
      services: [String],
    },
    existingWebsiteContext: {
      type: existingWebsiteContextSchema,
      default: null,
    },
    creativeSettings: {
      creativity: { type: Number, min: 0, max: 100, default: 50 },
      styles: { type: [String], default: [] },
      gustoSimilarity: { type: Number, min: 0, max: 100, default: 50 },
      visualDensity: { type: Number, min: 0, max: 100, default: 50 },
      compositionFreedom: { type: Number, min: 0, max: 100, default: 50 },
    },
    assets: [assetSchema],
    selectedReferences: [
      { type: mongoose.Schema.Types.ObjectId, ref: "DesignReference" },
    ],
    directions: [directionSchema],
    generations: [generationSchema],
    selectedDirection: { type: mongoose.Schema.Types.ObjectId, default: null },
    selectedGeneration: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedGeneration: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: [
        "draft",
        "brief_ready",
        "analyzing",
        "directions_ready",
        "generating",
        "exploration",
        "approved",
      ],
      default: "draft",
    },
    operation: { type: String, default: "" },
    operationStartedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SiteProject", siteProjectSchema);
