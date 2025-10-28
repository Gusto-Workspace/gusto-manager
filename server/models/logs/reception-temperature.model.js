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
    receptionId: { type: Schema.Types.ObjectId, ref: "ReceptionDelivery" },

    // Mesure
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

    // Qui a enregistré (snapshot à la création)
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
  },
  { versionKey: false, collection: "reception_temperature" }
);

receptionTemperatureSchema.index({ restaurantId: 1, receivedAt: -1 });
receptionTemperatureSchema.index({
  restaurantId: 1,
  receptionId: 1,
  receivedAt: -1,
});

module.exports =
  mongoose.models.ReceptionTemperature ||
  mongoose.model("ReceptionTemperature", receptionTemperatureSchema);
