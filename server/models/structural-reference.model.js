const mongoose = require("mongoose");
const {
  PROFILE_FIELDS,
  MOMENT_FIELDS,
  LAYOUT_MODES,
  RHYTHM_FIELDS,
  EVIDENCE_VIEW_TYPES,
} = require("../services/design-lab/structural-reference.contract");
const requiredText = { type: String, required: true, maxlength: 1200 };
const analysisSchema = new mongoose.Schema(
  {
    overview: requiredText,
    layoutProfile: new mongoose.Schema(
      Object.fromEntries(PROFILE_FIELDS.map((key) => [key, requiredText])),
      { _id: false },
    ),
    rhythmSequence: [
      new mongoose.Schema(
        {
          order: { type: Number, required: true },
          startPercent: { type: Number, min: 0, max: 100, required: true },
          endPercent: { type: Number, min: 0, max: 100, required: true },
          ...Object.fromEntries(
            RHYTHM_FIELDS.map((field) => [field, requiredText]),
          ),
        },
        { _id: false },
      ),
    ],
    sparseMomentsJustification: { type: String, maxlength: 1200 },
    structuralMoments: [
      new mongoose.Schema(
        {
          order: { type: Number, required: true },
          layoutMode: { type: String, enum: LAYOUT_MODES, required: true },
          ...Object.fromEntries(
            MOMENT_FIELDS.map((key) => [key, requiredText]),
          ),
          transferablePrinciples: [String],
          evidence: {
            type: new mongoose.Schema(
              {
                sourceViews: [{ type: String, enum: EVIDENCE_VIEW_TYPES }],
                startPercent: { type: Number, min: 0, max: 100 },
                endPercent: { type: Number, min: 0, max: 100 },
                observation: requiredText,
              },
              { _id: false },
            ),
            default: undefined,
          },
        },
        { _id: false },
      ),
    ],
    signatureStructuralMoves: [String],
    transferablePrinciples: [String],
    avoidCopying: [String],
    suitableFor: [String],
    avoidWhen: [String],
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true },
    sourceType: {
      type: String,
      enum: ["manual_url", "pinterest", "discovery"],
      default: "manual_url",
    },
    sourceUrl: { type: String, required: true },
    originalSiteUrl: String,
    domain: { type: String, required: true },
    active: { type: Boolean, default: true },
    status: {
      type: String,
      enum: [
        "pending",
        "capturing",
        "analyzing",
        "analyzed",
        "error",
        "blocked_by_overlay",
        "blocked_by_popup",
        "incomplete_page_capture",
      ],
      default: "pending",
    },
    manualTags: { type: [String], default: [] },
    captures: [
      new mongoose.Schema(
        {
          type: {
            type: String,
            enum: EVIDENCE_VIEW_TYPES,
            required: true,
          },
          detail: { type: String, enum: ["low", "high"] },
          viewport: { width: Number, height: Number },
          publicId: { type: String, required: true },
          url: { type: String, required: true },
          width: Number,
          height: Number,
          progressPercent: Number,
          sourceRect: {
            top: Number,
            left: Number,
            width: Number,
            height: Number,
          },
        },
        { _id: false },
      ),
    ],
    localMetadata: {
      viewport: { width: Number, height: Number },
      documentWidth: Number,
      documentHeight: Number,
      externalEmbeds: [
        new mongoose.Schema(
          {
            domain: String,
            networkStatus: Number,
            status: String,
            width: Number,
            height: Number,
            x: Number,
            y: Number,
            viewportX: Number,
            viewportY: Number,
            externalEmbedUnavailable: Boolean,
          },
          { _id: false },
        ),
      ],
      largeImages: [
        new mongoose.Schema(
          { x: Number, y: Number, width: Number, height: Number },
          { _id: false },
        ),
      ],
    },
    captureSanitization: {
      type: new mongoose.Schema(
        {
          version: Number,
          consentDetected: Boolean,
          consentAction: { type: String, enum: ["clicked", "removed", "none"] },
          consentLabel: { type: String, maxlength: 120 },
          consentHasBackdrop: Boolean,
          cookieOverlayDetected: Boolean,
          cookieOverlayDismissed: Boolean,
          consentMethod: String,
          popupDetected: Boolean,
          popupDismissed: Boolean,
          popupActions: [
            new mongoose.Schema(
              {
                type: { type: String, enum: ["non_structural_popup"] },
                method: {
                  type: String,
                  enum: ["click", "escape", "dom_fallback"],
                },
                hasBackdrop: Boolean,
                success: Boolean,
              },
              { _id: false },
            ),
          ],
          blockingOverlayDetected: Boolean,
          qualityPassed: Boolean,
          sanitizedAt: Date,
          blockingOverlays: [
            new mongoose.Schema(
              {
                tag: String,
                id: String,
                className: String,
                position: String,
                zIndex: Number,
                areaRatio: Number,
                reason: String,
                frame: String,
              },
              { _id: false },
            ),
          ],
        },
        { _id: false },
      ),
      default: null,
    },
    captureCoverage: {
      type: new mongoose.Schema(
        {
          version: Number,
          strategy: String,
          captureStrategy: { type: String, enum: ["continuous", "sampled"] },
          totalHeight: Number,
          viewportHeight: Number,
          complete: Boolean,
          reachedEnd: Boolean,
          distinctViews: Boolean,
          overviewKind: String,
          scrollMotionDetected: Boolean,
          reason: String,
          capturedAt: Date,
          // Bounded numeric geometry and selected summaries only. Descriptors,
          // rejected candidates and images remain diagnostic artifacts locally.
          storyboard: mongoose.Schema.Types.Mixed,
          observationSelection: mongoose.Schema.Types.Mixed,
          positions: [
            new mongoose.Schema(
              {
                role: { type: String, enum: EVIDENCE_VIEW_TYPES },
                position: Number,
                visibleRangePx: [Number],
                progressPercent: Number,
                stabilized: Boolean,
                signature: String,
              },
              { _id: false },
            ),
          ],
        },
        { _id: false },
      ),
      default: null,
    },
    analysis: { type: analysisSchema, default: null },
    analyzedAt: { type: Date, default: null },
    operationToken: { type: String, default: "", select: false },
    operationStartedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);
schema.set("toJSON", {
  transform: (_doc, value) => {
    delete value.operationToken;
    return value;
  },
});
module.exports = mongoose.model("StructuralReference", schema);
