const { Schema, model } = require("mongoose");

const approvedCommercialTerms = Object.freeze({
  monthlyCents: 9500, setupCents: 25000, extraModuleCents: 4500,
  smsCents: 990, tabletCents: 1200, terminalCents: 1200,
  dayType: "CALENDAR",
  taxLabel: "TVA non applicable, art. 293 B du CGI.",
  smsLabel: "SMS : 9,90 €/mois pour 100 unités communes aux réservations et à la vente à emporter, puis 0,10 € par unité supplémentaire. Unités selon les segments et la destination.",
  bankFeeScope: "Achats de cartes cadeaux, paiements des commandes à emporter et encaissements d’empreintes bancaires effectués via le site.",
});
const approvedFetesTerms = Object.freeze({
  promoEligibility: "SIGNED_IN_WINDOW",
  giftSelectedFirst: "SELECT_ANOTHER_INCLUDED_MODULE",
  postPromotionTerms: "Après les 24 mois, le module peut être conservé en supplément pour 45 €/mois sur choix du client. Aucun renouvellement automatique de l’avantage.",
});

function cents(defaultValue) {
  return { type: Number, default: defaultValue, min: 1, max: 10000000, validate: Number.isSafeInteger };
}

const offerSchema = new Schema({
  kind: { type: String, enum: ["STANDARD", "FETES_2026"], required: true },
  version: { type: Number, min: 1, required: true },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "WITHDRAWN"], default: "DRAFT" },
  title: { type: String, maxlength: 100, required: true },
  monthlyCents: cents(approvedCommercialTerms.monthlyCents),
  setupCents: cents(approvedCommercialTerms.setupCents),
  extraModuleCents: cents(approvedCommercialTerms.extraModuleCents),
  smsCents: cents(approvedCommercialTerms.smsCents),
  tabletCents: cents(approvedCommercialTerms.tabletCents),
  terminalCents: cents(approvedCommercialTerms.terminalCents),
  dayType: { type: String, enum: ["CALENDAR", "WORKING"] },
  taxLabel: { type: String, maxlength: 180 },
  smsLabel: { type: String, maxlength: 180 },
  bankFeeScope: { type: String, maxlength: 180 },
  signedCopyHours: { type: Number, min: 0, max: 720, validate: Number.isSafeInteger },
  startsAt: Date,
  endsAt: Date,
  promoEligibility: { type: String, enum: ["SENT_IN_WINDOW", "SIGNED_IN_WINDOW"] },
  giftSelectedFirst: { type: String, enum: ["SELECT_ANOTHER_INCLUDED_MODULE"] },
  postPromotionTerms: { type: String, maxlength: 400 },
  reviewedAt: Date,
  reviewedBy: String,
  withdrawnAt: Date,
  withdrawnBy: String,
  updatedBy: String,
}, { timestamps: true });

offerSchema.index({ kind: 1, version: 1 }, { unique: true });
offerSchema.index({ status: 1, startsAt: 1, endsAt: 1 });

module.exports = model("CommercialOffer", offerSchema);
module.exports.approvedCommercialTerms = approvedCommercialTerms;
module.exports.approvedFetesTerms = approvedFetesTerms;
