const mongoose = require("mongoose");
const { Schema } = mongoose;

const inventoryLotSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Lien vers la réception d’origine (preuve & doc)
    receptionId: { type: Schema.Types.ObjectId, ref: "Reception" },

    // Info produit / fournisseur
    productName: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },

    // Traçabilité étiquette
    lotNumber: { type: String, required: true, index: true },
    dlc: Date, // Date Limite de Consommation (produits frais)
    ddm: Date, // Date de Durabilité Minimale (DLUO)
    allergens: { type: [String], default: [] },

    // Quantités & unité
    qtyReceived: { type: Number, required: true },
    qtyRemaining: { type: Number, required: true }, // init = qtyReceived
    unit: { type: String, required: true },

    // Suivi hygiène / conditions
    tempOnArrival: Number,
    packagingCondition: {
      type: String,
      enum: ["ok", "damaged", "wet", "unknown"],
      default: "unknown",
    },

    // Stockage & vie du lot
    storageArea: { type: String }, // ex: "fridge-1", "freezer-2", "dry"
    openedAt: Date, // date d’ouverture du lot
    internalUseBy: Date, // DLU après ouverture (si applicable)

    // Statut du lot
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
    disposalReason: String, // motif si discarded/returned

    // Opérationnel
    labelCode: String, // code/QR à imprimer sur l’étiquette
    notes: String,
    createdBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
  },
  { versionKey: false, timestamps: true }
);

// Index utiles
inventoryLotSchema.index({ restaurantId: 1, lotNumber: 1 });
inventoryLotSchema.index({ restaurantId: 1, status: 1 });
inventoryLotSchema.index({ restaurantId: 1, dlc: 1 });
inventoryLotSchema.index({ restaurantId: 1, ddm: 1 });
inventoryLotSchema.index({ restaurantId: 1, internalUseBy: 1 });
inventoryLotSchema.index({ receptionId: 1 });

module.exports =
  mongoose.models.InventoryLot ||
  mongoose.model("InventoryLot", inventoryLotSchema);
