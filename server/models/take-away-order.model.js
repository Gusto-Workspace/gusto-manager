const mongoose = require("mongoose");

const orderAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, default: "" },
    line2: { type: String, default: "" },
    zipCode: { type: String, default: "" },
    city: { type: String, default: "" },
    country: { type: String, default: "France" },
    instructions: { type: String, default: "" },
  },
  { _id: false },
);

const orderOptionSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    price: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const orderItemSchema = new mongoose.Schema(
  {
    lineId: { type: String, default: "" },
    refusedQuantity: { type: Number, min: 0, default: 0 },
    catalogItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sourceType: {
      type: String,
      enum: ["dish", "menu", "drink", "wine", "custom"],
      default: "custom",
    },
    sourceItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    categoryName: { type: String, default: "" },
    unitPrice: { type: Number, min: 0, required: true },
    quantity: { type: Number, min: 1, max: 99, required: true },
    options: { type: [orderOptionSchema], default: [] },
    optionsTotal: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, required: true },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const takeAwayOrderSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    customerFirstName: { type: String, required: true, trim: true },
    customerLastName: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: "", trim: true },
    customerPhone: { type: String, default: "", trim: true },
    fulfillmentMode: {
      type: String,
      enum: ["pickup", "delivery"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
        "canceled",
        "rejected",
      ],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["not_required", "pending", "paid", "failed", "refunded"],
      default: "not_required",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "on_site"],
      default: "on_site",
    },
    scheduledFor: { type: Date, required: true, index: true },
    confirmationDeadlineAt: { type: Date, default: null, index: true },
    confirmationRequired: { type: Boolean, default: false },
    preparationTimeMinutesSnapshot: { type: Number, min: 0, default: 0 },
    slotId: { type: String, required: true, index: true },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, min: 0, required: true },
    deliveryFee: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, required: true },
    // Original prices/quantities stay immutable; decisions and money movements
    // are recorded separately, including for orders upgraded on first refusal.
    financialVersion: { type: Number, default: 0 },
    financialRevision: { type: Number, default: 0 },
    refundedAmountCents: { type: Number, min: 0, default: 0 },
    remainingAmountCents: { type: Number, min: 0, default: null },
    refundLeaseOwner: { type: String, default: "" },
    refundLeaseUntil: { type: Date, default: null },
    adjustments: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            requestKey: { type: String, required: true },
            payloadHash: { type: String, required: true },
            type: {
              type: String,
              enum: ["partial_rejection", "termination"],
              required: true,
            },
            targetStatus: { type: String, default: "" },
            reason: { type: String, default: "" },
            actorId: { type: String, default: "" },
            emailEnabled: { type: Boolean, default: true },
            lines: { type: [mongoose.Schema.Types.Mixed], default: [] },
            amountCents: { type: Number, min: 0, required: true },
            state: {
              type: String,
              enum: [
                "not_required",
                "queued",
                "pending",
                "succeeded",
                "failed",
                "uncertain",
              ],
              required: true,
            },
            attempt: { type: Number, default: 0 },
            stripeRefundId: { type: String, default: "" },
            stripeRefundStatus: { type: String, default: "" },
            submittedAt: { type: Date, default: null },
            nextAttemptAt: { type: Date, default: null },
            lastError: { type: String, default: "" },
            createdAt: { type: Date, required: true },
            updatedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    businessEvents: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            type: { type: String, required: true },
            operationId: { type: String, default: "" },
            createdAt: { type: Date, required: true },
            snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
            smsProcessedAt: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    currency: { type: String, default: "eur" },
    deliveryAddress: { type: orderAddressSchema, default: () => ({}) },
    deliveryZoneId: { type: String, default: "" },
    customerNote: { type: String, default: "" },
    restaurantNote: { type: String, default: "" },
    stripePaymentIntentId: { type: String, default: "", index: true },
    stripeRefundId: { type: String, default: "", index: true },
    stripeRefundStatus: { type: String, default: "" },
    refundTargetStatus: {
      type: String,
      enum: ["", "canceled", "rejected"],
      default: "",
    },
    source: {
      type: String,
      enum: ["public", "dashboard"],
      default: "public",
      index: true,
    },
    publicAccessTokenHash: {
      type: String,
      default: "",
      select: false,
    },
    idempotencyKey: { type: String, default: "", index: true },
    idempotencyPayloadHash: { type: String, default: "" },
    paymentExpiresAt: { type: Date, default: null, index: true },
    paidAt: { type: Date, default: null },
    // Hiding an order never removes its financial records or Stripe linkage.
    deletedAt: { type: Date, default: null, index: true },
    paymentFailedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    restaurantNotifiedAt: { type: Date, default: null },
    crmRecordedAt: { type: Date, default: null },
    activationEffectsPending: { type: Boolean, default: false },
    pendingCrmPrevStatus: { type: String, default: "" },
    pendingCrmNextStatus: { type: String, default: "" },
    pendingCrmAdjustmentIds: { type: [String], default: [] },
    pendingCustomerEmailEvents: {
      type: [String],
      default: [],
      select: false,
    },
    customerEmailEventsSent: {
      type: [String],
      default: [],
      select: false,
    },
    // A crash/uncertain provider response requires reconciliation, never an
    // automatic second email. The sent marker is claimed before the API call.
    customerEmailEventsInFlight: { type: [String], default: [], select: false },
    customerEmailEventsUncertain: { type: [String], default: [], select: false },
    securityVersion: { type: Number, default: 0 },
    confirmedAt: { type: Date, default: null },
    preparingAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    outForDeliveryAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

takeAwayOrderSchema.index({ restaurant_id: 1, scheduledFor: 1 });
takeAwayOrderSchema.index({ restaurant_id: 1, deletedAt: 1, _id: -1 });
takeAwayOrderSchema.index({ status: 1, confirmationDeadlineAt: 1 });
takeAwayOrderSchema.index({ financialVersion: 1, "adjustments.state": 1 });
takeAwayOrderSchema.index(
  { restaurant_id: 1, idempotencyKey: 1 },
  {
    unique: true,
    // $ne is not accepted in a MongoDB partial index filter.
    partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } },
  },
);

module.exports = mongoose.model("TakeAwayOrder", takeAwayOrderSchema);
