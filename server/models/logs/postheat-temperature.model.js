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
    location: { type: String, required: true },
    equipmentId: { type: String, index: true },
    locationId: { type: String, index: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ["°C", "°F"], default: "°C" },
    phase: { type: String, default: "postheat" },
    note: String,
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

module.exports =
  mongoose.models.PostheatTemperature ||
  mongoose.model("PostheatTemperature", postheatTemperatureSchema);
