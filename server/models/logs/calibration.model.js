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
    deviceIdentifier: { type: String, required: true }, // ex: ID du thermomètre / sonde
    deviceType: { type: String }, // ex: "thermometer", "probe"
    calibratedAt: { type: Date, required: true },
    nextCalibrationDue: { type: Date },
    method: { type: String }, // ex: "ice point", "wet bath"
    certificateUrl: { type: String },
    provider: { type: String },
    notes: String,

    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "calibration" }
);

// Indexs utiles
calibrationSchema.index({
  restaurantId: 1,
  deviceIdentifier: 1,
  calibratedAt: -1,
});

calibrationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Calibration ||
  mongoose.model("Calibration", calibrationSchema);
