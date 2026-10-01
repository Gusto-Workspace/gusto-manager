const mongoose = require("mongoose");

const designReferenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    source: { type: String, default: "" },
    active: { type: Boolean, default: true },
    manualTags: { type: [String], default: [] },
    visualTags: { type: [String], default: [] },
    businessTags: { type: [String], default: [] },
    useCount: { type: Number, default: 0 },
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    characteristics: { type: mongoose.Schema.Types.Mixed, default: null },
    sectionInspirations: { type: mongoose.Schema.Types.Mixed, default: null },
    referenceType: {
      type: String,
      enum: [
        "raw_webpage",
        "webpage_in_presentation",
        "design_case_study",
        "other",
      ],
    },
    artifactTypes: { type: [String], default: [] },
    analyzedAt: { type: Date, default: null },
    analyzing: { type: Boolean, default: false },
    analysisStartedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DesignReference", designReferenceSchema);
