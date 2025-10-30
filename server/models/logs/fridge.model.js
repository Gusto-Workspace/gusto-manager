const mongoose = require("mongoose");
const { Schema } = mongoose;

const fridgeSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true }, // pour l’unicité case-insensitive
    fridgeCode: { type: String, trim: true }, // ex. identifiant interne
    location: { type: String, trim: true },
    locationCode: { type: String, trim: true },
    sensorIdentifier: { type: String, trim: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    isActive: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "fridge" }
);

fridgeSchema.pre("save", function (next) {
  this.nameLower = (this.name || "").trim().toLowerCase();
  this.updatedAt = new Date();
  next();
});

fridgeSchema.index({ restaurantId: 1, nameLower: 1 }, { unique: true });

module.exports =
  mongoose.models.Fridge || mongoose.model("Fridge", fridgeSchema);
