const mongoose = require("mongoose");
const { Schema } = mongoose;

const genericTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    location: { type: String, required: true, index: true }, // ex: "Frigo 1", "Plaque 2"
    locationId: { type: String, index: true }, // id interne
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: { type: String },
    signature: {
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
      at: Date,
      signatureUrl: String,
      hash: String,
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "temperature_generic" }
);

genericTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.TemperatureGeneric ||
  mongoose.model("TemperatureGeneric", genericTemperatureSchema);
