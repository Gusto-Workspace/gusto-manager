const mongoose = require("mongoose");
const { Schema } = mongoose;

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
      enum: ["ok", "damaged", "wet", "unknown"],
      default: "unknown",
    },
  },
  { _id: false }
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
