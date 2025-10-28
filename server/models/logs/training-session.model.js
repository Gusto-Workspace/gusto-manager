const mongoose = require("mongoose");
const { Schema } = mongoose;

const attendanceSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    status: {
      type: String,
      enum: ["attended", "absent"],
      default: "attended",
    },
    certificateUrl: String,
    signedAt: Date,
    notes: String,
  },
  { _id: false }
);

const trainingSessionSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    topic: String, // ex: "Hygiène HACCP", "Allergènes"
    provider: String,
    date: { type: Date, required: true, index: true },
    durationMinutes: Number,
    location: String,
    materialsUrl: String,
    attendees: { type: [attendanceSchema], default: [] }, // présence + certificat par salarié
    validUntil: Date, // si la formation a une validité / expiration
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
  { versionKey: false, collection: "training_sessions" }
);

trainingSessionSchema.index({ restaurantId: 1, date: -1 });
trainingSessionSchema.index({ "attendees.employeeId": 1 });

trainingSessionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.TrainingSession ||
  mongoose.model("TrainingSession", trainingSessionSchema);
