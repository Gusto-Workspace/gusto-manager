const mongoose = require("mongoose");

const addressSnapshotSchema = new mongoose.Schema(
  {
    line1: { type: String, default: "" },
    zipCode: { type: String, default: "" },
    city: { type: String, default: "" },
    country: { type: String, default: "France" },
  },
  { _id: false },
);

const restaurantSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    website: { type: String, default: "" },
    address: { type: addressSnapshotSchema, default: () => ({}) },
  },
  { _id: false },
);

const visualSnapshotSchema = new mongoose.Schema(
  {
    visualId: { type: String, default: "" },
    name: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    textColor: { type: String, default: "#000000" },
    textLayout: {
      type: String,
      enum: ["right", "center", "left"],
      default: "right",
    },
    typographyPreset: { type: String, default: "" },
  },
  { _id: false },
);

const validitySnapshotSchema = new mongoose.Schema(
  {
    validity_mode: {
      type: String,
      enum: ["fixed_duration", "until_date"],
      required: true,
    },
    validity_fixed_months: { type: Number, min: 1, max: 60, required: true },
    validity_until_day: { type: Number, min: 1, max: 31, required: true },
    validity_until_month: { type: Number, min: 1, max: 12, required: true },
  },
  { _id: false },
);

const giftSnapshotSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    description: { type: String, default: "" },
    validity: { type: validitySnapshotSchema, required: true },
    visual: { type: visualSnapshotSchema, default: () => ({}) },
  },
  { _id: false },
);

const customerDataSchema = new mongoose.Schema(
  {
    beneficiaryFirstName: { type: String, required: true },
    beneficiaryLastName: { type: String, default: "" },
    sender: { type: String, default: "" },
    sendEmail: { type: String, required: true },
    buyerFirstName: { type: String, default: "" },
    buyerLastName: { type: String, default: "" },
    buyerPhone: { type: String, default: "" },
    comment: { type: String, default: "" },
    hidePrice: { type: Boolean, default: false },
  },
  { _id: false },
);

const fulfillmentStepSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "skipped", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },
    lockToken: { type: String, default: "" },
    nextRetryAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: "" },
    lastError: { type: String, default: "" },
  },
  { _id: false },
);

const giftCardOrderSchema = new mongoose.Schema(
  {
    checkoutId: { type: String, required: true, unique: true, index: true },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    paymentIntentId: { type: String, default: null },
    stripeAccountId: { type: String, default: "" },
    currency: { type: String, default: "eur", required: true },
    amount: { type: Number, min: 1, required: true },
    giftSnapshot: { type: giftSnapshotSchema, required: true },
    restaurantSnapshot: { type: restaurantSnapshotSchema, required: true },
    customerData: { type: customerDataSchema, required: true },
    fallbackImageUrl: { type: String, default: "" },
    requestFingerprint: {
      type: String,
      default: "",
      select: false,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "succeeded", "failed", "canceled"],
      default: "pending",
      index: true,
    },
    finalizationStatus: {
      type: String,
      enum: ["pending", "processing", "finalized", "failed"],
      default: "pending",
      index: true,
    },
    finalizationLockedAt: { type: Date, default: null },
    finalizationLockToken: { type: String, default: "" },
    finalizationAttempts: { type: Number, default: 0 },
    finalizationLastErrorCode: { type: String, default: "" },
    finalizationLastError: { type: String, default: "" },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, default: null },
    purchaseCode: { type: String, default: null },
    validUntil: { type: Date, default: null },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    fulfillment: {
      email: { type: fulfillmentStepSchema, default: () => ({}) },
      notification: { type: fulfillmentStepSchema, default: () => ({}) },
      crm: { type: fulfillmentStepSchema, default: () => ({}) },
    },
    paidAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    expiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

giftCardOrderSchema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: "string" } },
  },
);
giftCardOrderSchema.index(
  { purchaseCode: 1 },
  {
    unique: true,
    partialFilterExpression: { purchaseCode: { $type: "string" } },
  },
);
giftCardOrderSchema.index({ finalizationStatus: 1, finalizationLockedAt: 1 });
giftCardOrderSchema.index({
  "fulfillment.email.status": 1,
  "fulfillment.email.nextRetryAt": 1,
});
giftCardOrderSchema.index({
  "fulfillment.notification.status": 1,
  "fulfillment.notification.nextRetryAt": 1,
});
giftCardOrderSchema.index({
  "fulfillment.crm.status": 1,
  "fulfillment.crm.nextRetryAt": 1,
});
giftCardOrderSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports = mongoose.model("GiftCardOrder", giftCardOrderSchema);
