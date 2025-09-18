const mongoose = require("mongoose");
const { Schema } = mongoose;

const postheatTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    location: { type: String, required: true },
    locationId: { type: String, index: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    recipeId: { type: Schema.Types.ObjectId, ref: "Recipe" },
    batchId: String,
    phase: { type: String, default: "postheat" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: String,
    signature: {
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
      at: Date,
      signatureUrl: String,
      hash: String,
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "temperature_postheat" }
);

postheatTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.TemperaturePostheat ||
  mongoose.model("TemperaturePostheat", postheatTemperatureSchema);
