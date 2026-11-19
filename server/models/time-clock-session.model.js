const mongoose = require("mongoose");

function normalizeTimeClockSourceValue(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "employee";

  return "kiosk";
}

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

const adjustmentBreakSchema = new mongoose.Schema(
  {
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0 },
  },
  { _id: false },
);

const payrollPauseSchema = new mongoose.Schema({
  date: { type: String, required: true },
  minutes: { type: Number, required: true, min: 0 },
}, { _id: false });

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
    clientMutationId: { type: String, default: "" },
    deviceId: String,
    deviceProof: String,
    receivedAt: Date,
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
    isNote: Boolean,
    reset: { type: Boolean, default: undefined },
    previousAbsent: { type: Boolean, default: undefined },
    absent: { type: Boolean, default: undefined },
    previousMealCount: Number,
    mealCount: Number,
    previousPauseMinutesByDay: { type: [payrollPauseSchema], default: undefined },
    pauseMinutesByDay: { type: [payrollPauseSchema], default: undefined },
    previousClockInAt: { type: Date, default: null },
    previousClockOutAt: { type: Date, default: null },
    clockInAt: { type: Date, default: null },
    clockOutAt: { type: Date, default: null },
    previousBreaks: { type: [adjustmentBreakSchema], default: [] },
    breaks: { type: [adjustmentBreakSchema], default: [] },
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

const payrollSchema = new mongoose.Schema(
  {
    clockInAt: { type: Date, required: true },
    clockOutAt: { type: Date, required: true },
    breaks: { type: [adjustmentBreakSchema], default: [] },
    pauseMinutesByDay: { type: [payrollPauseSchema], default: undefined },
    usePlannedPause: Boolean,
    absent: { type: Boolean, default: false },
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

const reviewSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  actorId: { type: String, required: true },
  actorRole: { type: String, enum: ["owner", "employee"], required: true },
  type: { type: String, enum: ["validated", "reopened"], required: true },
});

const mealAllowanceSchema = new mongoose.Schema(
  {
    count: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
    periods: { type: [String], default: [] },
    source: { type: String, default: "" },
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
    payroll: { type: payrollSchema, default: undefined },
    payrollAdjustments: { type: [adjustmentSchema], default: undefined },
    reviews: { type: [reviewSchema], default: [] },
    activeSlot: Boolean,
    mutationKeys: { type: [String], default: undefined },
    totals: { type: totalsSchema, default: () => ({}) },
    mealAllowance: { type: mealAllowanceSchema, default: () => ({}) },
    mealCountOverride: { type: Number, min: 0 },
    source: {
      type: String,
      enum: ["kiosk", "manager", "employee"],
      default: "kiosk",
    },
    lastActionAt: { type: Date, default: Date.now },
  },
  { timestamps: true, optimisticConcurrency: true },
);

timeClockSessionSchema.index(
  { restaurant: 1, employee: 1, activeSlot: 1 },
  { unique: true, partialFilterExpression: { activeSlot: true } },
);
timeClockSessionSchema.index({ mutationKeys: 1 }, { unique: true, sparse: true });
timeClockSessionSchema.index({ restaurant: 1, "events.at": 1 });
timeClockSessionSchema.index({ restaurant: 1, "adjustments.editedAt": 1 });
timeClockSessionSchema.index({ restaurant: 1, "payrollAdjustments.editedAt": 1 });
timeClockSessionSchema.index({ restaurant: 1, "payroll.clockInAt": 1 });
timeClockSessionSchema.index({ restaurant: 1, "reviews.at": 1 });

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

timeClockSessionSchema.pre("validate", function (next) {
  this.source = normalizeTimeClockSourceValue(this.source);
  next();
});

module.exports =
  mongoose.models.TimeClockSession ||
  mongoose.model("TimeClockSession", timeClockSessionSchema);
