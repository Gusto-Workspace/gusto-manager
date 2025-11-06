// server/models/logs/cooking-equipment.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const cookingEquipmentSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true },
    equipmentCode: { type: String, trim: true },
    location: { type: String, trim: true },
    locationCode: { type: String, trim: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    isActive: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "cooking_equipment" }
);

cookingEquipmentSchema.pre("save", function (next) {
  this.nameLower = (this.name || "").trim().toLowerCase();
  this.updatedAt = new Date();
  next();
});

cookingEquipmentSchema.index({ restaurantId: 1, nameLower: 1 }, { unique: true });

module.exports =
  mongoose.models.CookingEquipment ||
  mongoose.model("CookingEquipment", cookingEquipmentSchema);
