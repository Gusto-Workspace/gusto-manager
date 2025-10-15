// server/models/logs/supplier-certificate.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const supplierCertificateSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    supplierName: { type: String, index: true },

    // Détail certificat
    type: { type: String, index: true }, // ex: "IFS/BRC", "Allergènes", "HACCP"
    certificateNumber: String, // optionnel
    fileUrl: String, // URL principal du certificat
    validFrom: Date,
    validUntil: { type: Date, index: true },

    notes: String,

    // Traçabilité
    uploadedAt: { type: Date, default: Date.now, index: true },
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    // Métadonnées
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "suppliers_certificates" }
);

// Index composés utiles
supplierCertificateSchema.index({ restaurantId: 1, validUntil: 1 });
supplierCertificateSchema.index({ restaurantId: 1, type: 1, validUntil: 1 });

supplierCertificateSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.SupplierCertificate ||
  mongoose.model("SupplierCertificate", supplierCertificateSchema);
