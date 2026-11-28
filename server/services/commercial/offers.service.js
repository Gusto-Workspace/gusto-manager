const mongoose = require("mongoose");
const Offer = require("../../models/commercial-offer.model");
const { approvedCommercialTerms, approvedFetesTerms } = Offer;
const Establishment = require("../../models/commercial-establishment.model");
const Acquisition = require("../../models/commercial-acquisition.model");
const { CommercialProspect } = require("../../models/commercial-prospect.model");
const { currentRegistryRestaurants } = require("./establishments.service");

const moduleLabels = {
  reservations: "Réservations", gift_cards: "Cartes cadeaux", take_away: "Vente à emporter", employees: "Gestion du personnel",
};
const problem = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
const fetesDeadline = new Date("2027-01-01T00:00:00+01:00");
const commercialCopyVersion = 3;

function approvedOfferTerms(kind) {
  return kind === "FETES_2026"
    ? { ...approvedCommercialTerms, ...approvedFetesTerms, endsAt: fetesDeadline }
    : approvedCommercialTerms;
}

function isOfferAvailable(offer, now = new Date()) {
  return offer?.status === "PUBLISHED" && offer.reviewedAt &&
    (!offer.startsAt || offer.startsAt <= now) && (!offer.endsAt || offer.endsAt > now) &&
    (offer.kind !== "FETES_2026" || (offer.startsAt && offer.endsAt && offer.endsAt <= fetesDeadline &&
      offer.promoEligibility === "SIGNED_IN_WINDOW" && offer.monthlyCents === approvedCommercialTerms.monthlyCents &&
      offer.setupCents === approvedCommercialTerms.setupCents));
}

function publishingProblem(offer) {
  if (!Number.isSafeInteger(offer.signedCopyHours)) {
    return "Renseignez les conditions de consultation après signature.";
  }
  if (offer.kind === "FETES_2026" && (!offer.startsAt || +offer.endsAt !== +fetesDeadline)) {
    return "L’offre Fêtes demande un début de validité et se termine le 1er janvier 2027 à 00h00, heure de Paris, borne exclue.";
  }
  if (offer.startsAt && offer.endsAt && offer.endsAt <= offer.startsAt) return "La fenêtre de publication est invalide.";
  if (Object.entries(approvedOfferTerms(offer.kind)).some(([field, value]) =>
    field !== "endsAt" && offer[field] !== value)) return "Cette version doit reprendre les conditions commerciales approuvées.";
  return "";
}

async function assertPromotionEligibility(prospectId, session) {
  const prospect = await CommercialProspect.findById(prospectId).session(session).lean();
  const establishment = await Establishment.findOne({ kind: "ESTABLISHMENT", prospectId }).select("restaurants").session(session).lean();
  if (!prospect || !establishment || (await currentRegistryRestaurants(establishment, prospect, session)).length ||
      await Acquisition.exists({ establishmentId: establishment._id }).session(session)) {
    throw problem(409, "L’offre Fêtes est réservée aux nouveaux restaurants.");
  }
}

async function validatePromotionSignature(conditions, now, session) {
  if (conditions.kind !== "FETES_2026") return;
  const end = new Date(conditions.promoEndsAt);
  const offer = mongoose.isObjectIdOrHexString(conditions.offerId) && await Offer.findById(conditions.offerId).session(session).lean();
  if (!Number.isFinite(+end) || now >= end || now >= fetesDeadline || conditions.promoEligibility !== "SIGNED_IN_WINDOW" ||
      !isOfferAvailable(offer, now)) {
    throw Object.assign(problem(409, "La période de signature de l’offre Fêtes est terminée ou ses conditions ont changé. Demandez un nouveau contrat."), {
      code: "PROMOTION_UNAVAILABLE",
    });
  }
}

async function readAvailableOffer(id, now = new Date(), session = null, frozen = false) {
  if (!mongoose.isObjectIdOrHexString(id)) throw problem(400, "Offre invalide.");
  const offer = await Offer.findById(id).session(session).lean();
  if (!isOfferAvailable(offer, now) || (!frozen && publishingProblem(offer))) throw problem(409, "Cette offre est indisponible ou expirée.");
  return offer;
}

function rentalQuantity(value) {
  if (value == null) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > 10) throw problem(400, "Quantité de location invalide.");
  return value;
}

function makeOfferConditions(offer, choices = {}) {
  const { includedModule, extraModules = [], sms = false } = choices;
  if (!Object.hasOwn(moduleLabels, includedModule) || !Array.isArray(extraModules) ||
      extraModules.some((code) => !Object.hasOwn(moduleLabels, code)) ||
      new Set(extraModules).size !== extraModules.length || extraModules.includes(includedModule) ||
      typeof sms !== "boolean") throw problem(400, "Sélection des modules invalide.");
  const giftPromotion = offer.kind === "FETES_2026";
  if (giftPromotion && (includedModule === "gift_cards" || extraModules.includes("gift_cards"))) {
    throw problem(400, "Sélectionnez un autre module inclus. Cartes cadeaux est ajouté par l’offre.");
  }
  const tabletQuantity = rentalQuantity(choices.tabletQuantity);
  const terminalQuantity = rentalQuantity(choices.terminalQuantity);
  const monthlyCents = offer.monthlyCents + extraModules.length * offer.extraModuleCents +
    (sms ? offer.smsCents : 0) + tabletQuantity * offer.tabletCents + terminalQuantity * offer.terminalCents;
  return {
    offerId: String(offer._id), version: offer.version, kind: offer.kind, title: offer.title,
    currency: "EUR", baseCents: offer.monthlyCents, setupCents: offer.setupCents, monthlyCents, engagementMonths: 24,
    extraModuleCents: offer.extraModuleCents, smsCents: offer.smsCents, tabletCents: offer.tabletCents, terminalCents: offer.terminalCents,
    selections: { includedModule, extraModules, sms, tabletQuantity, terminalQuantity },
    taxLabel: offer.taxLabel, smsLabel: offer.smsLabel, bankFeeScope: offer.bankFeeScope, copyVersion: commercialCopyVersion,
    dayType: offer.dayType, signedCopyHours: offer.signedCopyHours,
    ...(giftPromotion && {
      giftMonths: 24, promoEligibility: offer.promoEligibility,
      promoEndsAt: new Date(offer.endsAt).toISOString(), postPromotionTerms: offer.postPromotionTerms,
    }),
  };
}

function asDocumentFields(conditions) {
  const { includedModule, extraModules, sms, tabletQuantity, terminalQuantity } = conditions.selections;
  const modules = [{ name: moduleLabels[includedModule], code: includedModule, priceMonthly: 0, offered: true }];
  for (const code of extraModules) modules.push({ name: moduleLabels[code], code, priceMonthly: conditions.extraModuleCents / 100 });
  if (conditions.giftMonths) modules.push({ name: "Cartes cadeaux (offert pendant 24 mois)", code: "gift_cards", priceMonthly: 0, offered: true });
  if (sms) modules.push({ name: "Rappels SMS", code: "sms_reminders", priceMonthly: conditions.smsCents / 100 });
  if (tabletQuantity) modules.push({ name: "Location de tablette", code: "commercial_tablet_rental", priceMonthly: conditions.tabletCents / 100, quantity: tabletQuantity });
  if (terminalQuantity) modules.push({ name: "Location de matériel de pointage", code: "commercial_terminal_rental", priceMonthly: conditions.terminalCents / 100, quantity: terminalQuantity });
  const website = { label: "Création et gestion du site internet", qty: 1, unitPrice: 0, offered: true, kind: "WEBSITE" };
  return {
    offerConditions: conditions,
    subscription: { name: conditions.title, priceMonthly: conditions.baseCents / 100, currency: "EUR" },
    engagementMonths: conditions.engagementMonths,
    website: { enabled: true, offered: true, line: website },
    lines: [website, { label: "Frais de mise en service", qty: 1, unitPrice: conditions.setupCents / 100, kind: "NORMAL" }],
    modules,
  };
}

async function markProspectMilestone(document, field, date) {
  if (!document.prospectId) return;
  try {
    await CommercialProspect.updateOne({ _id: document.prospectId }, { $min: { [`milestones.${field}`]: date } });
  } catch (error) {
    console.error("[commercial-milestones] update failed", { document: String(document._id), field, code: error.code });
  }
}

function pendingCommercialSignature(now = new Date()) {
  return { type: "CONTRACT", status: "SENT", "signatureRequest.status": { $in: ["PENDING", "SIGNING"] }, "signatureRequest.expiresAt": { $gt: now } };
}

module.exports = {
  moduleLabels, problem, isOfferAvailable, publishingProblem, readAvailableOffer,
  approvedOfferTerms, commercialCopyVersion,
  makeOfferConditions, asDocumentFields,
  assertPromotionEligibility, validatePromotionSignature, markProspectMilestone, pendingCommercialSignature,
};
