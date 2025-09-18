const mongoose = require("mongoose");
const { Schema } = mongoose;

const receptionTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    receptionId: { type: Schema.Types.ObjectId, ref: "Reception" },
    lineId: { type: String },

    // Mesure de température
    value: { type: Number, required: true }, // ex: 4.5
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },

    // Emballage
    packagingCondition: {
      type: String,
      enum: ["ok", "damaged", "wet", "unknown"],
      default: "unknown",
    },

    // Qui a enregistré
    recordedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: { type: String },

    // Validation
    signature: {
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
      at: Date,
      signatureUrl: String,
      hash: String,
    },

    // Date/heure de mesure
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "temperature_receptions" }
);

receptionTemperatureSchema.index({ restaurantId: 1, receivedAt: -1 });

module.exports =
  mongoose.models.ReceptionTemperature ||
  mongoose.model("ReceptionTemperature", receptionTemperatureSchema);
