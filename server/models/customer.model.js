const mongoose = require("mongoose");

function normEmail(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s || null;
}

function normPhone(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const out = s.replace(/[^\d+]/g, ""); // garde + et chiffres
  return out || null;
}

const customerSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },

    email: { type: String, default: "", trim: true },
    emailNorm: { type: String, default: null, index: true },

    phone: { type: String, default: "", trim: true },
    phoneNorm: { type: String, default: null, index: true },

    tags: { type: [String], default: [] }, // new, very_regular, regular, to_reconquer, lost
    notes: { type: String, default: "" },

    stats: {
      reservationsTotal: { type: Number, default: 0 },
      reservationsCanceled: { type: Number, default: 0 },
      giftCardsBought: { type: Number, default: 0 },
    },

    lastReservationAt: { type: Date, default: null },
    lastGiftCardAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },

    // ✅ mini-historique cappé pour ton drawer (rapide)
    lastReservations: {
      type: [
        {
          reservationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reservation",
          },
          reservationDate: { type: Date },
          reservationTime: { type: String },
          numberOfGuests: { type: Number },
          status: { type: String },
        },
      ],
      default: [],
    },

    lastGiftPurchases: {
      type: [
        {
          purchaseId: { type: mongoose.Schema.Types.ObjectId }, // _id du subdoc embed
          created_at: { type: Date },
          amount: { type: Number },
          description: { type: String },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

customerSchema.pre("save", function (next) {
  this.emailNorm = normEmail(this.email);
  this.phoneNorm = normPhone(this.phone);
  next();
});

// ✅ Unique par restaurant (email OU phone) sans bloquer les docs vides
customerSchema.index(
  { restaurant_id: 1, emailNorm: 1 },
  { unique: true, partialFilterExpression: { emailNorm: { $type: "string" } } },
);

customerSchema.index(
  { restaurant_id: 1, phoneNorm: 1 },
  { partialFilterExpression: { phoneNorm: { $type: "string" } } },
);

module.exports = mongoose.model("Customer", customerSchema);
