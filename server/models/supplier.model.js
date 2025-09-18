// models/supplier.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    contactName: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      zipCode: String,
      city: String,
      country: { type: String, default: "France" },
    },
    notes: String,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

supplierSchema.index({ name: 1 });

module.exports =
  mongoose.models.Supplier || mongoose.model("Supplier", supplierSchema);
