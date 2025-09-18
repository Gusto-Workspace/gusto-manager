const mongoose = require("mongoose");
const { Schema } = mongoose;

const wasteEntrySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    wasteType: {
      type: String,
      enum: ["organic", "packaging", "cooking_oil", "glass", "paper", "hazardous", "other"],
      required: true,
    },
    weightKg: { type: Number, required: true },
    unit: { type: String, default: "kg" },
    disposalMethod: {
      type: String,
      enum: ["compost", "recycle", "landfill", "incineration", "contractor_pickup", "other"],
      default: "contractor_pickup",
    },
    contractor: String,
    manifestNumber: String,
    notes: String,
    attachments: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

wasteEntrySchema.index({ restaurantId: 1, date: -1 });
wasteEntrySchema.index({ restaurantId: 1, wasteType: 1, date: -1 });

module.exports =
  mongoose.models.WasteEntry || mongoose.model("WasteEntry", wasteEntrySchema);
