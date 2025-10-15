// server/models/logs/non-conformity.model.js
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
      index: true,
    },
    referenceId: String,
    description: String,
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    reportedAt: { type: Date, default: Date.now, index: true },
    correctiveActions: { type: [correctiveActionSchema], default: [] },
    status: {
      type: String,
      enum: ["open", "in_progress", "closed"],
      default: "open",
      index: true,
    },
    attachments: { type: [String], default: [] },

    // métadonnées
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "non_conformity" }
);

nonConformitySchema.index({ restaurantId: 1, status: 1, reportedAt: -1 });

nonConformitySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.NonConformity ||
  mongoose.model("NonConformity", nonConformitySchema);
