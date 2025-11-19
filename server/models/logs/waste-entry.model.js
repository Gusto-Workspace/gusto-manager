// models/logs/waste-entry.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String },
  },
  { _id: false }
);

const wasteEntrySchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, default: Date.now, index: true },
    wasteType: {
      type: String,
      enum: [
        "organic",
        "packaging",
        "cooking_oil",
        "glass",
        "paper",
        "hazardous",
        "other",
      ],
      required: true,
      index: true,
    },
    weightKg: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "kg" },
    disposalMethod: {
      type: String,
      enum: [
        "compost",
        "recycle",
        "landfill",
        "incineration",
        "contractor_pickup",
        "other",
      ],
      default: "contractor_pickup",
      index: true,
    },
    contractor: String,
    manifestNumber: String,
    notes: String,

    // ⬇️ Nouveau : objets complets au lieu de simples strings
    attachments: { type: [attachmentSchema], default: [] },

    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "waste_entries" }
);

wasteEntrySchema.index({ restaurantId: 1, date: -1 });
wasteEntrySchema.index({ restaurantId: 1, wasteType: 1, date: -1 });

wasteEntrySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.WasteEntry || mongoose.model("WasteEntry", wasteEntrySchema);
