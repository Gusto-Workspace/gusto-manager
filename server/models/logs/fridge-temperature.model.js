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
    fridgeName: { type: String, required: true, index: true },
    fridgeId: { type: String, index: true },
    location: { type: String },
    locationId: { type: String, index: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    sensorIdentifier: String,
    doorState: {
      type: String,
      enum: ["open", "closed", "unknown"],
      default: "unknown",
    },
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    note: String,

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "fridge_temperature" }
);

fridgeTemperatureSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.FridgeTemperature ||
  mongoose.model("FridgeTemperature", fridgeTemperatureSchema);
