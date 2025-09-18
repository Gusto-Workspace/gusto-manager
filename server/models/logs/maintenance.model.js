const mongoose = require("mongoose");
const { Schema } = mongoose;

const maintenanceSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    equipment: { type: String, required: true }, // ex "Friteuse 1"
    equipmentId: { type: String }, // id interne si besoin
    type: {
      type: String,
      enum: ["oil_change", "filter_change", "inspection", "repair", "other"],
      default: "oil_change",
    },
    performedAt: { type: Date, required: true, default: Date.now, index: true },
    nextDue: Date,
    usedBatchId: String,
    quantity: Number,
    unit: String,
    provider: String,
    notes: String,
    proofUrls: { type: [String], default: [] },
    signature: {
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
      at: Date,
      signatureUrl: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

maintenanceSchema.index({ restaurantId: 1, equipment: 1, performedAt: -1 });

module.exports =
  mongoose.models.Maintenance ||
  mongoose.model("Maintenance", maintenanceSchema);
