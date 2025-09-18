const mongoose = require("mongoose");
const { Schema } = mongoose;

const attendanceSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    status: { type: String, enum: ["attended", "absent", "excused"], default: "attended" },
    certificateUrl: String,
    signedAt: Date,
    notes: String,
  },
  { _id: false }
);

const trainingSessionSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    title: { type: String, required: true },
    topic: String, // ex: "Hygiène HACCP", "Allergènes"
    provider: String,
    date: { type: Date, required: true, index: true },
    durationMinutes: Number,
    location: String,
    materialsUrl: String,
    attendees: { type: [attendanceSchema], default: [] }, // store per-employee attendance + cert
    validUntil: Date, // si la formation a une validité
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

trainingSessionSchema.index({ restaurantId: 1, date: -1 });
trainingSessionSchema.index({ "attendees.employeeId": 1 });

module.exports =
  mongoose.models.TrainingSession ||
  mongoose.model("TrainingSession", trainingSessionSchema);
