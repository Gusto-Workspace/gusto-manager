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
    fryerId: { type: String }, // ou equipmentId
    performedAt: { type: Date, default: Date.now, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    litersRemoved: Number,
    newOilBatch: { batchNumber: String, supplierId: Schema.Types.ObjectId },
    qualityNotes: String,
    disposalDocumentUrl: String,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

oilChangeSchema.index({ restaurantId: 1, performedAt: -1 });

module.exports =
  mongoose.models.OilChange || mongoose.model("OilChange", oilChangeSchema);
