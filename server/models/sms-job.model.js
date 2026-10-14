const mongoose = require("mongoose");
const { TAKE_AWAY_SMS_EVENTS } = require("../services/sms/take-away-sms-settings.service");
function isReservationReminder() { return this.type === "reservation_reminder"; }
function isTakeAwayNotification() { return String(this.type || "").startsWith("take_away_"); }

const smsJobSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", required: isReservationReminder, index: true },
    takeAwayOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "TakeAwayOrder", required: isTakeAwayNotification },
    eventId: { type: String, required: isTakeAwayNotification, default: "" },
    eventSnapshot: { type: mongoose.Schema.Types.Mixed, required: isTakeAwayNotification, default: null },
    templateSnapshot: { type: String, required: isTakeAwayNotification, default: "" },
    type: { type: String, enum: ["reservation_reminder", ...Object.keys(TAKE_AWAY_SMS_EVENTS).map((key) => `take_away_${key}`)], default: "reservation_reminder" },
    occurrenceKey: { type: String, required: true },
    reservationStartsAt: { type: Date, required: isReservationReminder },
    reservationDateSnapshot: { type: Date, required: isReservationReminder },
    reservationTimeSnapshot: { type: String, required: isReservationReminder },
    phone: { type: String, default: "" },
    destinationCountry: { type: String, default: "" },
    senderId: { type: String, default: "" },
    senderMode: { type: String, default: "" },
    message: { type: String, default: "" },
    scheduledAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["scheduled", "processing", "uncertain", "accepted", "delivered", "failed", "cancelled", "skipped"],
      default: "scheduled",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null, index: true },
    processingStartedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    lockExpiresAt: { type: Date, default: null, index: true },
    providerSubmissionStartedAt: { type: Date, default: null },
    provider: { type: String, default: "smsmode" },
    providerMessageId: { type: String, default: "", index: true },
    providerReference: { type: String, required: true, index: true },
    providerStatusLastCheckedAt: { type: Date, default: null, index: true },
    segmentCount: { type: Number, min: 0, default: 0 },
    billingCredits: { type: Number, min: 0, default: 0 },
    providerCostSnapshot: { type: Number, min: 0, default: null },
    includedCreditsApplied: { type: Number, min: 0, default: 0 },
    overageCredits: { type: Number, min: 0, default: 0 },
    overageUnitPriceSnapshot: { type: Number, min: 0, default: 0.1 },
    overageAmountSnapshot: { type: Number, min: 0, default: 0 },
    usagePeriodId: { type: mongoose.Schema.Types.ObjectId, ref: "SmsUsagePeriod", default: null },
    usageState: { type: String, enum: ["none", "reserved", "consumed", "released"], default: "none" },
    stripeUsageState: { type: String, enum: ["not_required", "pending", "reported", "uncertain", "failed"], default: "not_required" },
    stripeUsageIdentifier: { type: String, default: "", index: true },
    stripeUsageFirstAttemptAt: { type: Date, default: null },
    stripeUsageReportedAt: { type: Date, default: null },
    stripeUsageEventId: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    skippedAt: { type: Date, default: null },
    failureCode: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    skipReason: { type: String, default: "" },
  },
  { timestamps: true },
);

smsJobSchema.index({ reservationId: 1, type: 1, occurrenceKey: 1 }, { unique: true });
// Keep the historical index unchanged. Take-away occurrence keys include the
// order ID, so null reservationId never causes cross-order collisions.
smsJobSchema.index({ takeAwayOrderId: 1, eventId: 1 }, {
  unique: true, name: "take_away_sms_event_unique",
  partialFilterExpression: { takeAwayOrderId: { $type: "objectId" } },
});
smsJobSchema.index({ status: 1, scheduledAt: 1, nextAttemptAt: 1 });

module.exports = mongoose.model("SmsJob", smsJobSchema);
