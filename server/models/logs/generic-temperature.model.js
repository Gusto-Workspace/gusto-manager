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
    note: { type: String },
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "temperature_generic" }
);

genericTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.GenericTemperature ||
  mongoose.model("GenericTemperature", genericTemperatureSchema);
