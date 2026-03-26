const mongoose = require("mongoose");

const signaturePointSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const signatureStrokeSchema = new mongoose.Schema(
  {
    points: { type: [signaturePointSchema], default: [] },
  },
  { _id: false },
);

const signatureSchema = new mongoose.Schema(
  {
    hasSignature: { type: Boolean, default: false },
    strokes: { type: [signatureStrokeSchema], default: [] },
    signedAt: { type: Date, default: null },
  },
  { _id: false },
);

const breakSchema = new mongoose.Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0 },
    startSignature: { type: signatureSchema, default: () => ({}) },
    endSignature: { type: signatureSchema, default: () => ({}) },
  },
  { _id: true },
);

const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["clock_in", "break_start", "break_end", "clock_out"],
      required: true,
    },
    at: { type: Date, required: true },
    actorRole: {
      type: String,
      enum: ["owner", "employee", "system"],
      default: "employee",
    },
    actorId: { type: String, default: "" },
    signature: { type: signatureSchema, default: () => ({}) },
    source: {
      type: String,
      enum: ["kiosk", "manager", "employee"],
      default: "kiosk",
    },
  },
  { _id: true },
);

const adjustmentSchema = new mongoose.Schema(
  {
    editedAt: { type: Date, default: Date.now },
    editedByRole: {
      type: String,
      enum: ["owner", "employee", "system"],
      default: "owner",
    },
    editedById: { type: String, default: "" },
    reason: { type: String, default: "" },
    previousClockInAt: { type: Date, default: null },
    previousClockOutAt: { type: Date, default: null },
    clockInAt: { type: Date, default: null },
    clockOutAt: { type: Date, default: null },
  },
  { _id: true },
);

const employeeSnapshotSchema = new mongoose.Schema(
  {
    firstname: { type: String, default: "" },
    lastname: { type: String, default: "" },
    email: { type: String, default: "" },
    post: { type: String, default: "" },
  },
  { _id: false },
);

const totalsSchema = new mongoose.Schema(
  {
    workedMinutes: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    grossMinutes: { type: Number, default: 0 },
  },
  { _id: false },
);

const timeClockSessionSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    employeeSnapshot: { type: employeeSnapshotSchema, default: () => ({}) },
    businessDate: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["open", "on_break", "closed"],
      default: "open",
      index: true,
    },
    clockInAt: { type: Date, required: true },
    clockOutAt: { type: Date, default: null },
    breaks: { type: [breakSchema], default: [] },
    events: { type: [eventSchema], default: [] },
    adjustments: { type: [adjustmentSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    source: {
      type: String,
      enum: ["kiosk", "manager", "employee"],
      default: "kiosk",
    },
    lastActionAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

timeClockSessionSchema.index({
  restaurant: 1,
  employee: 1,
  businessDate: 1,
  clockInAt: -1,
});

timeClockSessionSchema.index({
  restaurant: 1,
  employee: 1,
  status: 1,
  clockInAt: -1,
});

module.exports =
  mongoose.models.TimeClockSession ||
  mongoose.model("TimeClockSession", timeClockSessionSchema);
