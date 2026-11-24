const mongoose = require("mongoose");

const daySchema = new mongoose.Schema({
  _id: String,
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },
  publishedEmployees: [String],
  lockedAt: Date,
  lockedBy: String,
});
daySchema.index({ restaurant: 1, date: 1 });

const recipientSchema = new mongoose.Schema({
  employeeId: String,
  name: String,
  emailStatus: String,
}, { _id: false });

const publicationSchema = new mongoose.Schema({
  _id: String,
  restaurant: { type: mongoose.Schema.Types.ObjectId, required: true },
  from: String,
  to: String,
  signature: String,
  author: String,
  authorId: String,
  authorRole: String,
  effective: Boolean,
  notify: Boolean,
  email: Boolean,
  recipients: [recipientSchema],
}, { timestamps: true });
publicationSchema.index({ restaurant: 1, from: 1, createdAt: -1 });

module.exports = {
  PlanningDay: mongoose.model("PlanningDay", daySchema),
  PlanningPublication: mongoose.model("PlanningPublication", publicationSchema),
};
