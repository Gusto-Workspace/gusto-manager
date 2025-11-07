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

    // --- Équipement (clarifié) ---
    equipmentName: { type: String, required: true, index: true }, // ex: "Four 1", "Combi Vapeur 2"
    equipmentId: { type: String, index: true }, // identifiant interne optionnel

    // --- Emplacement (optionnel) ---
    location: { type: String },
    locationId: { type: String, index: true },

    // --- Mesure (sortie de chauffe) ---
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },

    // Type de mesure (clarifie le contexte “équipement”, pas le plat)
    probeType: {
      type: String,
      enum: ["core", "surface", "ambient", "oil", "other"], // cœur produit, surface plaque, air enceinte, huile friteuse, autre
      default: "core",
      index: true,
    },

    // Phase liée à l’équipement (pas le service)
    phase: {
      type: String,
      enum: ["postheat", "reheat", "hot-holding"], // fin de cuisson, remise en T°, maintien chaud
      default: "postheat",
      index: true,
    },

    // Divers
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
  { versionKey: false, collection: "postheat_temperature" }
);

postheatTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });
postheatTemperatureSchema.index({
  restaurantId: 1,
  equipmentName: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.PostheatTemperature ||
  mongoose.model("PostheatTemperature", postheatTemperatureSchema);
