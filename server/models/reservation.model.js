const mongoose = require("mongoose");
const { normalizeNamePart } = require("../services/name-normalization.service");

const TableSchema = new mongoose.Schema(
  {
    tableIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    name: { type: String, default: "" },
    seats: { type: Number, default: 0 },
    source: { type: String, enum: ["configured", "manual"], default: "manual" },
  },
  { _id: false },
);

const BankHoldSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },

    flow: {
      type: String,
      enum: ["none", "immediate", "scheduled"],
      default: "none",
    },

    amountPerPerson: { type: Number, default: 0 },
    amountTotal: { type: Number, default: 0 },
    currency: { type: String, default: "eur" },

    status: {
      type: String,
      enum: [
        "none",
        "setup_pending",
        "card_saved",
        "authorization_pending",
        "authorization_scheduled",
        "authorized",
        "captured",
        "released",
        "failed",
        "expired",
      ],
      default: "none",
      index: true,
    },

    stripeCustomerId: { type: String, default: "" },
    stripePaymentMethodId: { type: String, default: "" },

    checkoutSessionId: { type: String, default: "" },
    setupIntentId: { type: String, default: "" },
    paymentIntentId: { type: String, default: "" },

    authorizationScheduledFor: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    cardCollectedAt: { type: Date, default: null },
    authorizedAt: { type: Date, default: null },
    capturedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    processingLockedAt: { type: Date, default: null },

    lastError: { type: String, default: "" },
  },
  { _id: false },
);

const WaitlistOfferSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ["waiting", "offered", "accepted", "declined", "expired"],
      default: "waiting",
      index: true,
    },
    offeredAt: { type: Date, default: null },
    offerExpiresAt: { type: Date, default: null, index: true },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    tokenHash: { type: String, default: "", index: true },
    tokenExpiresAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
  },
  { _id: false },
);

const ReservationSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // ✅ NEW (split)
    customerFirstName: { type: String, default: "", trim: true },
    customerLastName: { type: String, default: "", trim: true },

    customerEmail: { type: String, default: "", trim: true },
    customerPhone: { type: String, default: "", trim: true },

    // lien fiche client
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    numberOfGuests: { type: Number, required: true },
    reservationDate: { type: Date, required: true, index: true },
    reservationTime: { type: String, required: true },
    commentary: { type: String, default: "" },

    table: { type: TableSchema, default: null },

    status: {
      type: String,
      enum: [
        "AwaitingBankHold",
        "Waitlist",
        "Pending",
        "Confirmed",
        "Active",
        "Late",
        "Finished",
        "Canceled",
        "Rejected",
        "NoShow",
      ],
      default: "Pending",
      index: true,
    },

    source: { type: String, default: "public" },
    pendingExpiresAt: { type: Date, default: null },

    bankHold: { type: BankHoldSchema, default: () => ({}) },
    waitlistOffer: { type: WaitlistOfferSchema, default: () => ({}) },

    reminder24hDueAt: { type: Date, default: null, index: true },
    reminder24hSentAt: { type: Date, default: null, index: true },
    reminder24hLockedAt: { type: Date, default: null, index: true },

    activatedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },

    idempotencyKey: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

ReservationSchema.pre("validate", function (next) {
  this.customerFirstName = normalizeNamePart(this.customerFirstName);
  this.customerLastName = normalizeNamePart(this.customerLastName);

  if (!this.customerFirstName && !this.customerLastName) {
    this.invalidate(
      "customerFirstName",
      "Un prénom ou un nom client est requis.",
    );
  }

  next();
});

// ✅ Virtual compat (emails / notifs)
ReservationSchema.virtual("customerName").get(function () {
  const fn = String(this.customerFirstName || "").trim();
  const ln = String(this.customerLastName || "").trim();
  return `${fn} ${ln}`.trim();
});

ReservationSchema.index({
  "bankHold.status": 1,
  "bankHold.authorizedAt": 1,
});

ReservationSchema.index({
  restaurant_id: 1,
  reservationDate: 1,
});

ReservationSchema.index({
  restaurant_id: 1,
  reservationDate: 1,
  reservationTime: 1,
  status: 1,
  "waitlistOffer.state": 1,
  createdAt: 1,
  _id: 1,
});

ReservationSchema.set("toJSON", { virtuals: true });
ReservationSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Reservation", ReservationSchema);
