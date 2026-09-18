const mongoose = require("mongoose");
const {
  DEFAULT_EARLY_TERMINATION,
  MAX_CONTRACT_TERM_MONTHS,
} = require("../services/contract-terms.service");

const LineSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    offered: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    kind: {
      type: String,
      enum: ["NORMAL", "WEBSITE"],
      default: "NORMAL",
    },
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
    enabled: { type: Boolean, default: false },
    offered: { type: Boolean, default: false },
    priceLabel: { type: String, default: "" },
    paymentSplit: { type: Number, enum: [1, 2, 3], default: 1 },

    line: { type: LineSchema, default: null },
  },
  { _id: false },
);

const TimeClockTerminalRentalSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    priceMonthly: { type: Number, default: 12 },
    quantity: { type: Number, min: 1, default: 1 },
    code: { type: String, default: "" },
    priceId: { type: String, default: "" },
    productId: { type: String, default: "" },
    currency: { type: String, default: "EUR" },
    interval: { type: String, default: "month" },
    intervalCount: { type: Number, min: 1, default: 1 },
  },
  { _id: false },
);

// ✅ NEW subscription schema
const SubscriptionSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" }, // ex: "Essentiel"
    priceMonthly: { type: Number, default: 0 }, // ex: 95
    quantity: { type: Number, min: 1, default: 1 },
    code: { type: String, default: "" },
    priceId: { type: String, default: "" },
    productId: { type: String, default: "" },
    currency: { type: String, default: "EUR" },
    interval: { type: String, default: "month" },
    intervalCount: { type: Number, min: 1, default: 1 },
  },
  { _id: false },
);

const EarlyTerminationSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: DEFAULT_EARLY_TERMINATION.enabled,
    },
    minimumCommitmentMonths: {
      type: Number,
      min: 1,
      max: MAX_CONTRACT_TERM_MONTHS,
      validate: Number.isInteger,
      default: DEFAULT_EARLY_TERMINATION.minimumCommitmentMonths,
    },
    noticeMonths: {
      type: Number,
      min: 1,
      max: MAX_CONTRACT_TERM_MONTHS,
      validate: Number.isInteger,
      default: DEFAULT_EARLY_TERMINATION.noticeMonths,
    },
  },
  { _id: false },
);

const ModuleSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    offered: { type: Boolean, default: false },
    priceMonthly: { type: Number, default: 0 }, // ex: 35
    quantity: { type: Number, min: 1, default: 1 },
    code: { type: String, default: "" },
    priceId: { type: String, default: "" },
    productId: { type: String, default: "" },
    currency: { type: String, default: "EUR" },
    interval: { type: String, default: "month" },
    intervalCount: { type: Number, min: 1, default: 1 },
    sourceKind: {
      type: String,
      enum: ["ADDON", "OTHER"],
      default: "ADDON",
    },
    requiresReview: { type: Boolean, default: false },
  },
  { _id: false },
);

const CommercialItemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["PLAN", "ADDON", "OTHER"],
      default: "OTHER",
    },
    code: { type: String, default: "" },
    priceId: { type: String, default: "" },
    productId: { type: String, default: "" },
    label: { type: String, default: "" },
    quantity: { type: Number, min: 1, default: 1 },
    unitAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    interval: { type: String, default: "month" },
    intervalCount: { type: Number, min: 1, default: 1 },
    requiresReview: { type: Boolean, default: false },
    reviewReason: { type: String, default: "" },
  },
  { _id: false },
);

const CommercialSnapshotSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["STRIPE_SUBSCRIPTION", "MANUAL"],
      default: "MANUAL",
    },
    subscriptionId: { type: String, default: "" },
    capturedAt: { type: Date },
    currency: { type: String, default: "EUR" },
    items: { type: [CommercialItemSchema], default: [] },
    fingerprint: { type: String, default: "" },
    reviewRequired: { type: Boolean, default: false },
    reviewWarnings: { type: [String], default: [] },
  },
  { _id: false },
);

const CommercialChangeSchema = new mongoose.Schema(
  {
    changeType: {
      type: String,
      enum: ["ADDED", "UPDATED", "REMOVED"],
      required: true,
    },
    before: { type: CommercialItemSchema, default: null },
    after: { type: CommercialItemSchema, default: null },
  },
  { _id: false },
);

const AmendmentSchema = new mongoose.Schema(
  {
    baseContractNumber: { type: String, default: "" },
    baseContractSignedAt: { type: Date },
    changes: { type: [CommercialChangeSchema], default: [] },
  },
  { _id: false },
);

const PdfSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    version: { type: Number, default: 0 },
    generatedAt: { type: Date },
    sha256: { type: String, default: "" },
    byteLength: { type: Number, default: 0 },
  },
  { _id: false },
);

const SignatureSchema = new mongoose.Schema(
  {
    signedAt: { type: Date },
    acceptedAt: { type: Date },
    signerName: { type: String, default: "" },
    signerEmail: { type: String, default: "" },
    signerIp: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    method: {
      type: String,
      enum: ["IN_PERSON", "REMOTE", "LEGACY"],
      default: "LEGACY",
    },
    contentHash: { type: String, default: "" },
    presentedPdfHash: { type: String, default: "" },
    signedPdfHash: { type: String, default: "" },
    proofHash: { type: String, default: "" },
    signatureImageHash: { type: String, default: "" },
    processingAt: { type: Date, default: null },
    emailStatus: {
      type: String,
      enum: ["NOT_SENT", "SENT", "FAILED"],
      default: "NOT_SENT",
    },
    emailSentAt: { type: Date },
    emailError: { type: String, default: "" },
  },
  { _id: false },
);

const SelfServiceAcceptanceSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["SELF_SERVICE"], default: "SELF_SERVICE" },
    actionType: {
      type: String,
      enum: ["SMS_DEACTIVATION_SCHEDULED", "SMS_DEACTIVATION_CANCELLED", "SMS_REACTIVATED"],
      required: true,
    },
    acceptedAt: { type: Date, required: true },
    effectiveAt: { type: Date, required: true },
    acceptedByUserId: { type: String, required: true },
    acceptedByName: { type: String, default: "" },
    acceptedByEmail: { type: String, default: "" },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    idempotencyKey: { type: String, required: true },
    previousCommercialSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    newCommercialSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    acceptedTerms: { type: mongoose.Schema.Types.Mixed, default: null },
    emailStatus: { type: String, enum: ["NOT_SENT", "SENT", "FAILED"], default: "NOT_SENT" },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: "" },
  },
  { _id: false },
);

const SignatureRequestSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, default: "", select: false },
    status: {
      type: String,
      enum: ["PENDING", "SIGNING", "SIGNED", "EXPIRED", "REVOKED"],
      default: "PENDING",
    },
    issuedAt: { type: Date },
    expiresAt: { type: Date },
    lastSentAt: { type: Date },
    processingAt: { type: Date, default: null },
    revokedAt: { type: Date },
    usedAt: { type: Date },
    previewPdf: { type: PdfSchema, default: () => ({}) },
  },
  { _id: false },
);

const SignatureHistorySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: [
        "SENT_FOR_SIGNATURE",
        "LINK_REPLACED",
        "LINK_REVOKED",
        "LINK_EXPIRED",
        "SIGNED",
      ],
      required: true,
    },
    at: { type: Date, default: Date.now },
    actor: {
      type: String,
      enum: ["ADMIN", "SIGNER", "SYSTEM"],
      required: true,
    },
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "" },
    method: {
      type: String,
      enum: ["IN_PERSON", "REMOTE", "SYSTEM"],
      default: "SYSTEM",
    },
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
      enum: ["DRAFT", "SENT", "SIGNED", "ACCEPTED"],
      default: "DRAFT",
    },

    party: { type: PartySchema, required: true },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
      index: true,
    },

    contractKind: {
      type: String,
      enum: ["INITIAL", "AMENDMENT"],
      default: "INITIAL",
    },
    rootContractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },
    parentDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    versionNumber: { type: Number, min: 1, default: 1 },

    // Devis / Facture
    issueDate: { type: Date },
    dueDate: { type: Date },
    lines: { type: [LineSchema], default: [] },
    totals: { type: TotalsSchema, default: () => ({}) },
    comments: { type: String, default: "" },

    // Contrat
    website: { type: WebsiteSchema, default: () => ({}) },
    timeClockTerminalRental: {
      type: TimeClockTerminalRentalSchema,
      default: () => ({}),
    },
    placeOfSignature: { type: String, default: "" },
    subscription: { type: SubscriptionSchema, default: () => ({}) },
    engagementMonths: { type: Number, default: 12 },
    earlyTermination: {
      type: EarlyTerminationSchema,
      default: () => ({ ...DEFAULT_EARLY_TERMINATION }),
    },
    modules: { type: [ModuleSchema], default: [] },
    commercialSnapshot: {
      type: CommercialSnapshotSchema,
      default: null,
    },
    commercialReviewConfirmedAt: { type: Date, default: null },
    amendment: { type: AmendmentSchema, default: null },

    // Copie exacte des données remises au signataire. Une fois le document
    // envoyé ou signé, le PDF est toujours rendu depuis ce snapshot.
    contractSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    contentHash: { type: String, default: "" },
    signatureSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    acceptanceMode: {
      type: String,
      enum: ["SIGNATURE", "SELF_SERVICE"],
      default: "SIGNATURE",
    },
    selfServiceAcceptance: { type: SelfServiceAcceptanceSchema, default: null },

    // PDF + signature
    presentedPdf: { type: PdfSchema, default: null },
    pdf: { type: PdfSchema, default: () => ({}) },
    signature: { type: SignatureSchema, default: () => ({}) },
    signatureRequest: { type: SignatureRequestSchema, default: null },
    signatureHistory: { type: [SignatureHistorySchema], default: [] },

    sentAt: { type: Date },
  },
  { timestamps: true },
);

DocumentSchema.index({ rootContractId: 1, versionNumber: 1 });
DocumentSchema.index({ "signatureRequest.tokenHash": 1 }, { sparse: true });
DocumentSchema.index(
  { "selfServiceAcceptance.idempotencyKey": 1 },
  { unique: true, sparse: true },
);

DocumentSchema.pre("validate", function validateEarlyTerminationWindow() {
  if (this.type !== "CONTRACT" || this.earlyTermination?.enabled !== true) {
    return;
  }

  const engagementMonths = Number(this.engagementMonths);
  const minimumCommitmentMonths = Number(
    this.earlyTermination.minimumCommitmentMonths,
  );
  const noticeMonths = Number(this.earlyTermination.noticeMonths);

  if (minimumCommitmentMonths >= engagementMonths) {
    this.invalidate(
      "earlyTermination.minimumCommitmentMonths",
      "La période minimale doit être inférieure à la durée totale d'engagement.",
    );
  }
  if (minimumCommitmentMonths + noticeMonths >= engagementMonths) {
    this.invalidate(
      "earlyTermination.noticeMonths",
      "La période minimale additionnée au préavis doit permettre une fin avant le terme de l'engagement.",
    );
  }
});

module.exports = mongoose.model("Document", DocumentSchema);
