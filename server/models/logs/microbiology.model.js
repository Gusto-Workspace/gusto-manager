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

    // Échantillon
    sampleType: {
      type: String,
      enum: ["surface", "food", "water"],
      required: true,
      index: true,
    },
    sampledAt: { type: Date, required: true, index: true },
    analysedAt: { type: Date },
    samplingPoint: { type: String },
    productName: { type: String },
    lotNumber: { type: String },

    // Labo
    labName: { type: String },
    labReference: { type: String },
    method: { type: String },
    detectionLimit: { type: String },
    criterion: { type: String },

    // Résultat
    parameter: { type: String },
    result: { type: String },
    unit: { type: String },
    passed: { type: Boolean },

    // Traçabilité
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    // Pièces & notes
    reportUrl: { type: String },
    notes: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "microbiology" }
);

microbiologySchema.index({ restaurantId: 1, sampledAt: -1 });

microbiologySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Microbiology ||
  mongoose.model("Microbiology", microbiologySchema);
