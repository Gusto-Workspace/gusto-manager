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

    // --- Contexte service / plat ---
    serviceArea: { type: String, required: true }, // ex: "Pass 1", "Salle"
    serviceId: { type: String, index: true }, // identifiant interne du service (batch, horaire…)
    plateId: { type: String, index: true }, // identifiant plat/assiette/lot
    dishName: { type: String }, // nom du plat (nouveau)
    servingMode: {
      // comment c'est servi (nouveau)
      type: String,
      enum: [
        "pass",
        "buffet-hot",
        "buffet-cold",
        "table",
        "delivery",
        "takeaway",
        "room-service",
        "catering",
        "other",
      ],
      default: "pass",
    },
    serviceType: {
      // chaud ou froid (nouveau)
      type: String,
      enum: ["hot", "cold", "unknown"],
      default: "unknown",
    },

    // --- Mesure ---
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },

    // --- Divers ---
    note: String,

    // Snapshot auteur (comme réception)
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "service_temperature" }
);

serviceTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ServiceTemperature ||
  mongoose.model("ServiceTemperature", serviceTemperatureSchema);
