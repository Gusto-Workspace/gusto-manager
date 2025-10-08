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

    fryerId: { type: String }, // identifiant friteuse/équipement
    performedAt: { type: Date, default: Date.now, required: true, index: true },

    litersRemoved: Number,

    newOilBatch: {
      batchNumber: String,
      supplier: String,
    },

    // --- Qualité / suivi
    tpmPercent: Number, // Total Polar Materials (%)
    filteredBeforeChange: { type: Boolean, default: false },
    colorIndex: String, // ex: claire / dorée / ambrée / foncée ...
    odorCheck: String, // ex: neutre / ok / rance / acide ...
    oilBrand: String, // marque de l’huile neuve

    qualityNotes: String, // notes libres
    disposalDocumentUrl: String, // justificatif d’élimination

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
