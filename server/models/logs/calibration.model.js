const mongoose = require("mongoose");
const { Schema } = mongoose;

const calibrationSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    deviceIdentifier: { type: String, required: true }, // id du thermomètre / sonde
    deviceType: { type: String }, // ex: "thermometer", "probe"
    calibratedAt: { type: Date, required: true },
    nextCalibrationDue: { type: Date },
    method: { type: String }, // ex: "ice point / wet bath"
    certificateUrl: { type: String },
    provider: { type: String },
    notes: String,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

calibrationSchema.index({
  restaurantId: 1,
  deviceIdentifier: 1,
  calibratedAt: -1,
});

module.exports =
  mongoose.models.Calibration ||
  mongoose.model("Calibration", calibrationSchema);
