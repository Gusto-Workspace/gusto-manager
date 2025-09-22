const mongoose = require("mongoose");
const { Schema } = mongoose;

const receptionLineSchema = new Schema(
  {
    productName: String,
    supplierProductId: String,
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
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

const receptionSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    supplier: String,
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    receivedAt: { type: Date, default: Date.now, index: true },
    lines: { type: [receptionLineSchema], default: [] },
    receivedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: String,
    billUrl: String,
  },
  { versionKey: false }
);

receptionSchema.index({ restaurantId: 1, receivedAt: -1 });

module.exports =
  mongoose.models.Reception || mongoose.model("Reception", receptionSchema);
