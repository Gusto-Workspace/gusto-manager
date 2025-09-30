const mongoose = require("mongoose");
const { Schema } = mongoose;

const preheatTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Libellé libre (ex "Four 1", "Friteuse 1")
    location: { type: String, required: true },

    // Identifiants
    equipmentId: { type: String, index: true },
    locationId: { type: String, index: true },

    // Mesure
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    phase: { type: String, default: "preheat" },

    // Note (optionnelle)
    note: String,

    // Qui a enregistré (snapshot)
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "preheat_temperature" }
);

preheatTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PreheatTemperature ||
  mongoose.model("PreheatTemperature", preheatTemperatureSchema);
