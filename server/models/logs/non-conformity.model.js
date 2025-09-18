const mongoose = require("mongoose");
const { Schema } = mongoose;

const correctiveActionSchema = new Schema(
  {
    action: { type: String, required: true },
    done: { type: Boolean, default: false },
    doneAt: Date,
    doneBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: String,
  },
  { _id: false }
);

const nonConformitySchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["temperature", "hygiene", "reception", "microbiology", "other"],
      default: "other",
    },
    referenceId: String,
    description: String,
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    reportedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    reportedAt: { type: Date, default: Date.now, index: true },
    correctiveActions: { type: [correctiveActionSchema], default: [] },
    status: {
      type: String,
      enum: ["open", "in_progress", "closed"],
      default: "open",
    },
    attachments: { type: [String], default: [] },
  },
  { versionKey: false }
);

nonConformitySchema.index({ restaurantId: 1, status: 1, reportedAt: -1 });

module.exports =
  mongoose.models.NonConformity ||
  mongoose.model("NonConformity", nonConformitySchema);
