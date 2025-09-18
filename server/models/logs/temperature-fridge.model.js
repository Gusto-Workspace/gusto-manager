const mongoose = require("mongoose");
const { Schema } = mongoose;

const fridgeTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    fridgeName: { type: String, required: true, index: true }, // ex "Frigo 1"
    fridgeId: { type: String, index: true }, // id matériel
    location: { type: String }, // optionnel
    locationId: { type: String, index: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    sensorIdentifier: String,
    doorState: {
      type: String,
      enum: ["open", "closed", "unknown"],
      default: "unknown",
    },
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
  { versionKey: false, collection: "temperature_fridge" }
);

fridgeTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.TemperatureFridge ||
  mongoose.model("TemperatureFridge", fridgeTemperatureSchema);
