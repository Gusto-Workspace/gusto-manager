const mongoose = require("mongoose");
const { Schema } = mongoose;

const microbiologySchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    sampleType: { type: String }, // "surface", "food", "water"
    sampledAt: { type: Date, required: true },
    labName: String,
    labReference: String,
    parameter: String, // ex: "Listeria", "S. aureus"
    result: String,
    unit: String,
    passed: { type: Boolean },
    reportUrl: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

microbiologySchema.index({ restaurantId: 1, sampledAt: -1 });

module.exports =
  mongoose.models.Microbiology ||
  mongoose.model("Microbiology", microbiologySchema);
