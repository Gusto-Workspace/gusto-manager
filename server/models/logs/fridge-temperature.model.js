const mongoose = require("mongoose");
const { Schema } = mongoose;

const recordedBySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["owner", "employee"], required: true },
    firstName: { type: String },
    lastName: { type: String },
  },
  { _id: false }
);

const fridgeSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    fridgeCode: { type: String, trim: true },
    location: { type: String, trim: true },
    locationCode: { type: String, trim: true },
    sensorIdentifier: { type: String, trim: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
  },
  { _id: false }
);

const fridgeTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Référence vers l’enceinte “référentiel”
    fridgeRef: {
      type: Schema.Types.ObjectId,
      ref: "Fridge",
      required: true,
      index: true,
    },

    // Snapshot de l’enceinte au moment du relevé
    fridge: { type: fridgeSnapshotSchema, required: true },

    // Mesure
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" }, // unité de la mesure
    doorState: {
      type: String,
      enum: ["open", "closed", "unknown"],
      default: "closed",
    },

    recordedBy: { type: recordedBySchema, required: true }, // snapshot auteur
    note: { type: String },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "fridge_temperature" }
);

fridgeTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });
fridgeTemperatureSchema.index({ restaurantId: 1, fridgeRef: 1, createdAt: -1 });

module.exports =
  mongoose.models.FridgeTemperature ||
  mongoose.model("FridgeTemperature", fridgeTemperatureSchema);
