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
      index: true,
    },
    performedAt: { type: Date, default: Date.now, index: true },
    notes: String,
    attachments: { type: [String], default: [] },
    createdBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "health_mesures" }
);

healthMeasureSchema.index({ restaurantId: 1, performedAt: -1 });
healthMeasureSchema.index({ restaurantId: 1, type: 1, performedAt: -1 });

healthMeasureSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.HealthMeasure ||
  mongoose.model("HealthMeasure", healthMeasureSchema);
