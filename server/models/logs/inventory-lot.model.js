const mongoose = require("mongoose");
const { Schema } = mongoose;

function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0; // unités comptées
  return 3; // kg, g, L, mL
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

const inventoryLotSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    receptionId: { type: Schema.Types.ObjectId, ref: "ReceptionDelivery" },

    productName: { type: String, required: true },
    supplier: String,

    lotNumber: { type: String, required: true, index: true },
    dlc: Date,
    ddm: Date,
    allergens: { type: [String], default: [] },

    qtyReceived: { type: Number, required: true },
    qtyRemaining: { type: Number, required: true },
    unit: { type: String, required: true },

    tempOnArrival: Number,
    packagingCondition: {
      type: String,
      enum: ["ok", "damaged", "wet", "unknown"],
      default: "unknown",
    },

    storageArea: { type: String },
    openedAt: Date,
    internalUseBy: Date,

    status: {
      type: String,
      enum: [
        "in_stock",
        "used",
        "expired",
        "discarded",
        "returned",
        "recalled",
      ],
      default: "in_stock",
      index: true,
    },
    disposalReason: String,

    labelCode: String,
    notes: String,
    createdBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
  },
  { versionKey: false, collection: "inventory_lot", timestamps: true }
);

// --- Arrondi systématique ---
inventoryLotSchema.path("qtyReceived").set(function (v) {
  const unit = this.unit || this.get("unit");
  return roundByUnit(v, unit);
});
inventoryLotSchema.path("qtyRemaining").set(function (v) {
  const unit = this.unit || this.get("unit");
  return roundByUnit(v, unit);
});

// Ceinture/bretelles : si l’unité change, re-arrondir les quantités
inventoryLotSchema.pre("save", function (next) {
  if (this.isModified("unit")) {
    this.qtyReceived = roundByUnit(this.qtyReceived, this.unit);
    this.qtyRemaining = roundByUnit(this.qtyRemaining, this.unit);
  }
  next();
});

// Index
inventoryLotSchema.index({ restaurantId: 1, lotNumber: 1 });
inventoryLotSchema.index({ restaurantId: 1, status: 1 });
inventoryLotSchema.index({ restaurantId: 1, dlc: 1 });
inventoryLotSchema.index({ restaurantId: 1, ddm: 1 });
inventoryLotSchema.index({ restaurantId: 1, internalUseBy: 1 });
inventoryLotSchema.index({ receptionId: 1 });

module.exports =
  mongoose.models.InventoryLot ||
  mongoose.model("InventoryLot", inventoryLotSchema);
