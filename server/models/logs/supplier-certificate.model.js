const mongoose = require("mongoose");
const { Schema } = mongoose;

const supplierCertificateSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    type: String,
    fileUrl: String,
    validFrom: Date,
    validUntil: Date,
    notes: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.SupplierCertificate ||
  mongoose.model("SupplierCertificate", supplierCertificateSchema);
