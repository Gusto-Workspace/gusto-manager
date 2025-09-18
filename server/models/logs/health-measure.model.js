const mongoose = require("mongoose");
const { Schema } = mongoose;

const healthMeasureSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["covid_check", "hygiene_check", "other"],
      default: "other",
    },
    performedAt: { type: Date, default: Date.now },
    performedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    notes: String,
    attachments: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.HealthMeasure ||
  mongoose.model("HealthMeasure", healthMeasureSchema);
