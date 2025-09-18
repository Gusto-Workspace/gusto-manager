const mongoose = require("mongoose");
const { Schema } = mongoose;

const pestControlSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    provider: String,
    contractStart: Date,
    contractEnd: Date,
    lastVisitAt: Date,
    nextPlannedVisit: Date,
    reportUrl: String,
    actions: [
      { date: Date, action: String, technician: String, notes: String },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

pestControlSchema.index({ restaurantId: 1, lastVisitAt: -1 });

module.exports =
  mongoose.models.PestControl ||
  mongoose.model("PestControl", pestControlSchema);
