const { Schema, model } = require("mongoose");
const id = Schema.Types.ObjectId;
const schema = new Schema({
  prospectId: { type: id, ref: "CommercialProspect", required: true, unique: true },
  contractId: { type: id, ref: "Document", required: true, unique: true },
  establishmentId: { type: id, ref: "CommercialEstablishment", required: true, unique: true },
  beneficiaryId: { type: id, ref: "CommercialAccount", required: true },
  contractCreatedBy: String,
  restaurantName: { type: String, required: true },
  contractNumber: { type: String, required: true },
  signedAt: { type: Date, required: true },
  restaurantCreatedAt: Date,
  restaurantId: { type: id, ref: "Restaurant" },
  integrationReviewedAt: Date,
  integrationFiles: { type: [{
    _id: id, category: String, filename: String, mimeType: String,
    storage: Schema.Types.Mixed, uploadedAt: Date, removalRequestedAt: Date,
  }], select: false, default: [] },
  migrationAccess: { type: Map, of: String, select: false },
  revision: { type: Number, default: 0 },
  commission: {
    amountCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, enum: ["EUR"], default: "EUR" },
    status: { type: String, enum: ["WAITING_CUSTOMER_PAYMENT", "TO_PAY", "PAID", "CONTESTED", "CANCELLED"], default: "WAITING_CUSTOMER_PAYMENT" },
    paymentInvoiceId: { type: id, ref: "Document" },
    paidAt: Date,
    paidBy: String,
    paymentReference: { type: String, maxlength: 180 },
    reconciliationRequiredAt: Date,
    reconciledAt: Date,
    assignmentCandidates: { type: [id], default: undefined },
  },
  proof: { type: Schema.Types.Mixed, select: false },
  activity: [{
    _id: false, actor: String, action: String, at: Date, note: String, previousBeneficiaryId: id, beneficiaryId: id,
  }],
}, { timestamps: true });
schema.index({ beneficiaryId: 1, signedAt: -1 });
schema.index({ beneficiaryId: 1, "commission.status": 1, "commission.paidAt": 1 });
schema.index({ restaurantId: 1 }, { unique: true, partialFilterExpression: { restaurantId: { $type: "objectId" } } });

module.exports = model("CommercialAcquisition", schema);
