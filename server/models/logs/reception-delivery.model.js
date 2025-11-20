const mongoose = require("mongoose");
const { Schema } = mongoose;

const receptionDeliveryLineAttachmentSchema = new Schema(
  {
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    filename: { type: String },
    mimetype: { type: String },
    bytes: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const receptionDeliveryLineSchema = new Schema(
  {
    productName: String,
    supplierProductId: String,
    lotNumber: String,
    dlc: Date,
    ddm: Date,
    qty: Number,
    unit: String,
    tempOnArrival: Number,
    allergens: { type: [String], default: [] },
    packagingCondition: {
      type: String,
      enum: ["compliant", "non-compliant"],
      default: "compliant",
    },
    qtyRemaining: Number,

    // 🔽 NOUVEAU : pièces jointes par ligne produit
    attachments: {
      type: [receptionDeliveryLineAttachmentSchema],
      default: [],
    },
  },
  { _id: true }
);

const receptionDeliverySchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    supplier: String,
    receivedAt: { type: Date, default: Date.now, index: true },
    lines: { type: [receptionDeliveryLineSchema], default: [] },
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    note: String,
    billUrl: String,
  },
  { versionKey: false, collection: "reception_delivery" }
);

receptionDeliverySchema.index({ restaurantId: 1, receivedAt: -1 });
receptionDeliverySchema.index({ restaurantId: 1, "lines.lotNumber": 1 });

module.exports =
  mongoose.models.ReceptionDelivery ||
  mongoose.model("ReceptionDelivery", receptionDeliverySchema);
