// server/models/logs/oil-change.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const oilChangeSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    fryerId: { type: String },
    performedAt: { type: Date, default: Date.now, required: true, index: true },

    litersRemoved: Number,

    newOilBatch: {
      batchNumber: String,
      supplier: String,
    },

    // --- Qualité / suivi
    tpmPercent: Number, // Total Polar Materials (%)
    filteredBeforeChange: { type: Boolean, default: false },
    colorIndex: String,
    odorCheck: String,
    oilBrand: String,

    qualityNotes: String,
    disposalDocumentUrl: String,

    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
  },
  { versionKey: false, collection: "oil_change" }
);

// Index utiles
oilChangeSchema.index({ restaurantId: 1, performedAt: -1 });
oilChangeSchema.index({ restaurantId: 1, fryerId: 1, performedAt: -1 });

module.exports =
  mongoose.models.OilChange || mongoose.model("OilChange", oilChangeSchema);
