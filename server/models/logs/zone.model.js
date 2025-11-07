const mongoose = require("mongoose");
const { Schema } = mongoose;

const zoneSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true }, // unicité case-insensitive
    zoneCode: { type: String, trim: true }, // identifiant interne (optionnel)
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    isActive: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "zone" }
);

zoneSchema.pre("save", function (next) {
  this.nameLower = (this.name || "").trim().toLowerCase();
  this.updatedAt = new Date();
  next();
});

zoneSchema.index({ restaurantId: 1, nameLower: 1 }, { unique: true });

module.exports = mongoose.models.Zone || mongoose.model("Zone", zoneSchema);
