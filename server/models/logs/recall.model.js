// server/models/logs/recall.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const itemSchema = new Schema(
  {
    // Lien optionnel vers un lot d’inventaire existant
    inventoryLotId: { type: Schema.Types.ObjectId, ref: "InventoryLot" },

    // Données “snapshot” (garde une trace même si le lot disparaît / change)
    productName: { type: String, required: true },
    lotNumber: String,

    // Détails retour
    quantity: Number,
    unit: String,
    bestBefore: Date, // DLC/DDM si connu
    note: String,
  },
  { _id: true }
);

const recallSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Origine
    source: {
      type: String,
      enum: ["supplier", "authority", "internal"],
      default: "supplier",
      index: true,
    },

    // Fournisseur (facultatif, utile si pas de lot lié)
    supplierName: { type: String, index: true },

    initiatedAt: { type: Date, default: Date.now, index: true },

    items: { type: [itemSchema], default: [] },

    actionsTaken: String,
    attachments: { type: [String], default: [] },

    // Clôture
    closedAt: { type: Date, index: true },

    // Traçabilité opérateur
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "recall" }
);

recallSchema.index({ restaurantId: 1, initiatedAt: -1 });
recallSchema.index({ restaurantId: 1, source: 1, initiatedAt: -1 });

recallSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Recall || mongoose.model("Recall", recallSchema);
