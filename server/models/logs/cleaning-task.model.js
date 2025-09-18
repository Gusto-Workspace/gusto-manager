const mongoose = require("mongoose");
const { Schema } = mongoose;

const cleaningTaskSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    zone: { type: String, required: true },
    zoneId: { type: String },
    description: { type: String },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "on_demand"],
      default: "daily",
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee" },
    done: { type: Boolean, default: false },
    doneAt: Date,
    proofUrls: { type: [String], default: [] }, // plusieurs preuves possible
    productUsed: String,
    productFDSUrl: String,
    signature: {
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
      at: Date,
      signatureUrl: String,
      hash: String,
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

cleaningTaskSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.CleaningTask ||
  mongoose.model("CleaningTask", cleaningTaskSchema);
