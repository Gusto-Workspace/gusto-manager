const mongoose = require("mongoose");
const { Schema } = mongoose;

const serviceTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    serviceArea: { type: String, required: true }, // ex "Pass 1", "Salle"
    serviceId: { type: String, index: true },
    plateId: { type: String, index: true },
    location: { type: String },
    locationId: { type: String, index: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
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
  { versionKey: false, collection: "temperature_service" }
);

serviceTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.TemperatureService ||
  mongoose.model("TemperatureService", serviceTemperatureSchema);
