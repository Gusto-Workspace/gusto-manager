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

    // Mesure de température
    value: { type: Number, required: true }, // ex: 4.5
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },

    // Date/heure mesure
    receivedAt: { type: Date, default: Date.now, index: true },

    // Emballage
    packagingCondition: {
      type: String,
      enum: ["ok", "damaged", "wet", "unknown"],
      default: "unknown",
    },

    // Note (optionnelle)
    note: { type: String },

    // Qui a enregistré (ajout automatique coté serveur)
    recordedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { versionKey: false, collection: "temperature_reception" }
);

receptionTemperatureSchema.index({ restaurantId: 1, receivedAt: -1 });
receptionTemperatureSchema.index({
  restaurantId: 1,
  receptionId: 1,
  receivedAt: -1,
});
receptionTemperatureSchema.index({
  restaurantId: 1,
  lineId: 1,
  receivedAt: -1,
});

module.exports =
  mongoose.models.ReceptionTemperature ||
  mongoose.model("ReceptionTemperature", receptionTemperatureSchema);
