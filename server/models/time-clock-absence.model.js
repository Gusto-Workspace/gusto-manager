const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const changeSchema = new mongoose.Schema({
  absent: Boolean,
  previousMealCount: Number,
  mealCount: Number,
  validated: Boolean,
  isNote: Boolean,
  at: { type: Date, required: true },
  reason: { type: String, required() { return this.validated == null; } },
  actorId: { type: String, required: true },
  actorRole: { type: String, enum: ["owner", "employee"], required: true },
});

const schema = new mongoose.Schema({
  restaurant: { type: ObjectId, required: true },
  employee: { type: ObjectId, required: true },
  shift: { type: ObjectId, required: true },
  shiftDate: { type: String, required: true },
  absent: { type: Boolean, required: true, default: false },
  mealCount: { type: Number, min: 0 },
  validated: { type: Boolean, default: false },
  revision: { type: Number, required: true },
  changes: { type: [changeSchema], default: [] },
}, { timestamps: true });

schema.index({ restaurant: 1, employee: 1, shift: 1, shiftDate: 1 }, { unique: true });
schema.index({ restaurant: 1, shiftDate: 1 });
schema.index({ restaurant: 1, "changes.at": 1 });

module.exports = mongoose.model("TimeClockAbsence", schema);
