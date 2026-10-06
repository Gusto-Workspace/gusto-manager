const mongoose = require("mongoose");
const { activeDirections, validateDirectionVersions } = require("../services/design-lab/direction-versioning.service");

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
    benchmarkExcluded: { type: Boolean, default: false },
    name: { type: String, default: "" },
  },
  { timestamps: true },
);

const existingWebsiteContextSchema = new mongoose.Schema(
  {
    restaurantSummary: String,
    story: String,
    positioning: String,
    cuisine: String,
    chef: String,
    team: String,
    services: [String],
    specialties: [String],
    values: [String],
    notableFacts: [String],
    location: String,
    contact: {
      address: String,
      phone: String,
      email: String,
    },
    openingHours: String,
    usefulContent: [String],
    sourcePages: [
      new mongoose.Schema({ url: String, pageType: String }, { _id: false }),
    ],
    pagesDiscovered: Number,
    pagesFailed: Number,
    analyzedAt: Date,
  },
  { _id: false },
);

const styleFrameSchema = new mongoose.Schema(
  {
    image: { type: imageSchema, required: true },
    prompt: { type: String, required: true },
    model: String,
    size: String,
    generationId: String,
    mode: { type: String, enum: ["new_proposal", "refine"] },
    styleFrameCoverage: mongoose.Schema.Types.Mixed,
    inputs: [{
      _id: false,
      kind: { type: String, enum: ["CLIENT_ASSET", "VISUAL_REFERENCE", "CURRENT_STYLE_FRAME_TO_REFINE"] },
      frameId: mongoose.Schema.Types.ObjectId,
      assetId: mongoose.Schema.Types.ObjectId,
      referenceId: mongoose.Schema.Types.ObjectId,
      name: String,
      role: String,
      principles: [String],
    }],
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const directionSchema = new mongoose.Schema(
  {
    slot: { type: String, enum: ["A", "B", "C", null], default: null },
    version: { type: Number, min: 1, default: null },
    status: { type: String, enum: ["active", "archived", "legacy_unassigned"], default: "legacy_unassigned" },
    generationId: { type: String, default: null },
    replacesDirectionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    engineVersion: { type: String, enum: ["v2"], default: "v2" },
    name: String,
    concept: String,
    artisticIntent: String,
    whyItFitsRestaurant: String,
    differenceFromOtherDirections: String,
    referencesUsed: [
      { type: mongoose.Schema.Types.ObjectId, ref: "DesignReference" },
    ],
    brandSystem: { type: mongoose.Schema.Types.Mixed, required: true },
    visualSystem: { type: mongoose.Schema.Types.Mixed, required: true },
    siteInformationArchitecture: { type: mongoose.Schema.Types.Mixed, required: true },
    qualityWarnings: { type: [{
      _id: false,
      code: { type: String, required: true },
      fieldPath: { type: String, required: true },
      message: { type: String, required: true },
    }], default: [] },
    styleFrames: { type: [styleFrameSchema], default: [] },
    approvedStyleFrameId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

const generationSchema = new mongoose.Schema(
  {
    generationId: { type: String, default: null },
    engineVersion: { type: String, enum: ["v2"], default: "v2" },
    directionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    styleFrameId: { type: mongoose.Schema.Types.ObjectId, required: true },
    parentGenerationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userPrompt: { type: String, default: "" },
    generatedPrompt: { type: String, required: true },
    image: { type: imageSchema, required: true },
    model: String,
    assetsUsed: [{
      _id: false,
      assetId: { type: mongoose.Schema.Types.ObjectId, required: true },
      name: String,
      role: String,
      signature: Boolean,
    }],
    generationStrategy: {
      type: {
        type: String,
        enum: ["single", "vertical_chapters"],
      },
      overlapPx: { type: Number, default: 0 },
      homepageBlueprint: mongoose.Schema.Types.Mixed,
      segments: [{
        _id: false,
        index: Number,
        width: Number,
        height: Number,
        sections: [String],
        sectionIds: [String],
        assetIds: [mongoose.Schema.Types.ObjectId],
      }],
    },
    outputDimensions: { width: Number, height: Number },
  },
  { timestamps: true },
);

const approvedReferenceSchema = new mongoose.Schema(
  {
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: String,
    image: imageSchema,
    visualTags: { type: [String], default: [] },
    analysis: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);

const approvalSnapshotSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: String,
    slug: String,
    brief: mongoose.Schema.Types.Mixed,
    existingWebsiteContext: mongoose.Schema.Types.Mixed,
    creativeSettings: mongoose.Schema.Types.Mixed,
    assets: { type: [assetSchema], default: [] },
    direction: { type: directionSchema, required: true },
    styleFrame: { type: styleFrameSchema, default: null },
    generation: { type: generationSchema, required: true },
    referencesUsed: { type: [approvedReferenceSchema], default: [] },
    approvedAt: { type: Date, default: null },
  },
  { _id: false },
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
      brandContinuity: { type: String, enum: ["reinvent", "evolve", "preserve"], default: "reinvent" },
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
    // Internal paid-call recovery state; never a selectable official direction.
    directionGenerationCheckpoint: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    generations: [generationSchema],
    selectedDirection: { type: mongoose.Schema.Types.ObjectId, default: null },
    selectedGeneration: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedGeneration: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedAt: { type: Date, default: null },
    approvedSnapshot: { type: approvalSnapshotSchema, default: null },
    approvalHistory: { type: [approvalSnapshotSchema], default: [] },
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
    operationStage: { type: String, enum: ["", "territories", "expanding", "saving"], default: "" },
    operationStartedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

siteProjectSchema.pre("validate", function validateApproval(next) {
  try { validateDirectionVersions(this.directions); }
  catch (error) { this.invalidate("directions", error.message); }
  const activeIds = new Set(activeDirections(this).map((direction) => String(direction._id)));
  if (this.selectedDirection && !activeIds.has(String(this.selectedDirection)))
    this.invalidate("selectedDirection", "La sélection doit viser une version principale active.");
  const selectedGeneration = this.generations.id(this.selectedGeneration);
  if (this.selectedGeneration && (!selectedGeneration || !activeIds.has(String(selectedGeneration.directionId))))
    this.invalidate("selectedGeneration", "La maquette sélectionnée doit appartenir à une version principale active.");
  if (selectedGeneration && String(selectedGeneration.directionId) !== String(this.selectedDirection))
    this.invalidate("selectedGeneration", "La maquette sélectionnée doit correspondre à la direction sélectionnée.");
  const hasApproval = Boolean(
    this.approvedGeneration || this.approvedAt || this.approvedSnapshot,
  );
  if (this.status === "approved") {
    if (!this.approvedGeneration || !this.approvedAt || !this.approvedSnapshot)
      this.invalidate(
        "approvedSnapshot",
        "Une maquette approuvée exige une génération, une date et un snapshot.",
      );
    else if (
      String(this.approvedSnapshot.projectId) !== String(this._id) ||
      String(this.approvedSnapshot.generation?._id) !==
        String(this.approvedGeneration) ||
      this.approvedSnapshot.approvedAt?.getTime() !== this.approvedAt.getTime()
    )
      this.invalidate(
        "approvedSnapshot",
        "Le snapshot final ne correspond pas à l'approbation courante.",
      );
  } else if (hasApproval) {
    this.invalidate(
      "approvedSnapshot",
      "Réouvrez le projet avant de reprendre le travail.",
    );
  }
  next();
});

siteProjectSchema.set("toObject", {
  transform: (_doc, value) => { delete value.directionGenerationCheckpoint; return value; },
});
siteProjectSchema.set("toJSON", {
  transform: (_doc, value) => {
    delete value.directionGenerationCheckpoint;
    value.directions = activeDirections(value);
    const ids = new Set(value.directions.map((direction) => String(direction._id)));
    value.generations = (value.generations || []).filter((generation) => ids.has(String(generation.directionId)));
    return value;
  },
});

module.exports = mongoose.model("SiteProject", siteProjectSchema);
