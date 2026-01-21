const mongoose = require("mongoose");

const LineSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    offered: { type: Boolean, default: false },
  },
  { _id: false },
);

const TotalsSchema = new mongoose.Schema(
  {
    discountLabel: { type: String, default: "" },
    discountAmount: { type: Number, default: 0 },
  },
  { _id: false },
);

const PartySchema = new mongoose.Schema(
  {
    restaurantName: { type: String, required: true },
    address: { type: String, default: "" },
    ownerName: { type: String, default: "" },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
  },
  { _id: false },
);

const WebsiteSchema = new mongoose.Schema(
  {
    offered: { type: Boolean, default: false },
    priceLabel: { type: String, default: "" },
  },
  { _id: false },
);

// ✅ NEW subscription schema
const SubscriptionSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" }, // ex: "Essentiel"
    priceMonthly: { type: Number, default: 0 }, // ex: 95
  },
  { _id: false },
);

const ModuleSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    offered: { type: Boolean, default: false },
    priceMonthly: { type: Number, default: 0 }, // ex: 35
  },
  { _id: false },
);

const PdfSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    version: { type: Number, default: 0 },
    generatedAt: { type: Date },
  },
  { _id: false },
);

const SignatureSchema = new mongoose.Schema(
  {
    signedAt: { type: Date },
  },
  { _id: false },
);

const DocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["QUOTE", "INVOICE", "CONTRACT"],
      required: true,
    },

    docNumber: { type: String, required: true, unique: true },

    status: {
      type: String,
      enum: ["DRAFT", "SENT", "SIGNED"],
      default: "DRAFT",
    },

    party: { type: PartySchema, required: true },

    // Devis / Facture
    issueDate: { type: Date },
    dueDate: { type: Date },
    lines: { type: [LineSchema], default: [] },
    totals: { type: TotalsSchema, default: () => ({}) },

    // Contrat
    website: { type: WebsiteSchema, default: () => ({}) },
    placeOfSignature: { type: String, default: "" },
    subscription: { type: SubscriptionSchema, default: () => ({}) },
    engagementMonths: { type: Number, default: 12 },
    modules: { type: [ModuleSchema], default: [] },

    // PDF + signature
    pdf: { type: PdfSchema, default: () => ({}) },
    signature: { type: SignatureSchema, default: () => ({}) },

    sentAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Document", DocumentSchema);
