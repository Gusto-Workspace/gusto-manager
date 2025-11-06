// server/models/logs/preheat-temperature.model.js
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

const equipmentSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    equipmentCode: { type: String, trim: true },
    location: { type: String, trim: true },
    locationCode: { type: String, trim: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
  },
  { _id: false }
);

const preheatTemperatureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // référence vers CookingEquipment
    deviceRef: {
      type: Schema.Types.ObjectId,
      ref: "CookingEquipment",
      required: true,
      index: true,
    },

    // snapshot appareil
    device: { type: equipmentSnapshotSchema, required: true },

    // mesure
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    phase: {
      type: String,
      enum: ["preheat", "hot-holding"],
      default: "preheat",
      index: true,
    },

    recordedBy: { type: recordedBySchema, required: true },
    note: { type: String },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "preheat_temperature" }
);

preheatTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });
preheatTemperatureSchema.index({
  restaurantId: 1,
  deviceRef: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.PreheatTemperature ||
  mongoose.model("PreheatTemperature", preheatTemperatureSchema);
