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
    quantity: { type: Number, min: 1, required: true },
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
    slotId: { type: String, required: true, index: true },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, min: 0, required: true },
    deliveryFee: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, required: true },
    currency: { type: String, default: "eur" },
    deliveryAddress: { type: orderAddressSchema, default: () => ({}) },
    deliveryZoneId: { type: String, default: "" },
    customerNote: { type: String, default: "" },
    restaurantNote: { type: String, default: "" },
    stripePaymentIntentId: { type: String, default: "", index: true },
    source: {
      type: String,
      enum: ["public", "dashboard"],
      default: "public",
      index: true,
    },
    idempotencyKey: { type: String, default: "", index: true },
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
takeAwayOrderSchema.index(
  { restaurant_id: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string", $ne: "" } },
  },
);

module.exports = mongoose.model("TakeAwayOrder", takeAwayOrderSchema);
