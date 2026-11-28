const mongoose = require("mongoose");
const commissionAmountCents = 40000;

const commercialAccountSchema = new mongoose.Schema({
  firstName: { type: String, trim: true, maxlength: 100, required: true },
  lastName: { type: String, trim: true, maxlength: 100, required: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, required: true, unique: true },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  companyName: { type: String, trim: true, maxlength: 160, default: "" },
  siret: { type: String, match: /^(?:\d{14})?$/, default: "" },
  businessAddress: { type: String, trim: true, maxlength: 400, default: "" },
  startedAt: Date,
  status: { type: String, enum: ["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"], default: "INVITED" },
  commissionCents: { type: Number, default: commissionAmountCents, min: 0, max: 10000000, validate: Number.isSafeInteger },
  internalNotes: { type: String, maxlength: 4000, default: "", select: false },
  password: { type: String, select: false },
  sessionVersion: { type: Number, default: 0, select: false },
  accessChallenge: {
    type: new mongoose.Schema({
      hash: { type: String, required: true },
      purpose: { type: String, enum: ["INVITATION", "RESET"], required: true },
      expiresAt: { type: Date, required: true },
    }, { _id: false }),
    select: false,
  },
  activity: {
    type: [new mongoose.Schema({
      action: String,
      actor: String,
      at: Date,
    }, { _id: false })],
    select: false,
  },
}, { timestamps: true });

commercialAccountSchema.index({ "accessChallenge.hash": 1 }, { unique: true, sparse: true });
commercialAccountSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CommercialAccount", commercialAccountSchema);
module.exports.commissionAmountCents = commissionAmountCents;
