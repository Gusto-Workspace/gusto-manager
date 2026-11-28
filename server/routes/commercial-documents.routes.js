const express = require("express");
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { authenticateCommercial } = require("../middleware/authenticate-commercial");
const { CommercialProspect: Prospect } = require("../models/commercial-prospect.model");
const Offer = require("../models/commercial-offer.model");
const Document = require("../models/document.model");
const Establishment = require("../models/commercial-establishment.model");
const {
  problem, isOfferAvailable, publishingProblem, readAvailableOffer, makeOfferConditions, asDocumentFields,
  pendingCommercialSignature, assertPromotionEligibility, approvedOfferTerms,
} = require("../services/commercial/offers.service");
const { getDocNumber } = require("../services/contracts/document-number.service");
const {
  activeSetupInvoice, commercialDocumentStatusFilter, settleSetupInvoice, signedSetupContract, assertSetupInvoiceDeal, invoiceMatchesContract,
} = require("../services/commercial/sales.service");

const router = express.Router();
const offersPath = "/admin/commerciaux/catalogue/offers";
const docsPath = "/commercial/documents";
const adminDraftPath = "/admin/commerciaux/documents";
const offerKinds = ["STANDARD", "FETES_2026"];
const types = ["QUOTE", "INVOICE", "CONTRACT"];
const pendingDelivery = ["PREPARING", "HANDOFF", "UNCERTAIN"];

router.use(offersPath, authenticateAdmin);
router.use([docsPath, "/commercial/offers"], authenticateCommercial);

function handle(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: "Un document ou une version équivalente existe déjà." });
      if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: "Informations invalides." });
      const status = Number(error.status || error.statusCode) || 500;
      if (status >= 500) console.error("[commercial-documents]", error.code || error.name || "unavailable");
      return res.status(status).json({ message: status === 500 ? "Opération impossible." : error.message });
    }
  };
}

function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw problem(404, "Document ou dossier introuvable.");
  return value;
}

function commercialDocumentScope(req) {
  return { _id: id(req.params.id), salesOwnerId: req.commercialAccount._id, type: { $in: types }, contractKind: { $ne: "AMENDMENT" } };
}

function documentDto(doc) {
  const { _id, type, docNumber, status, party, prospectId, sourceQuoteId, sourceContractId, offerConditions, createdAt, updatedAt, sentAt, firstSentAt, setupInvoice } = doc;
  return { _id, type, docNumber, status, party, prospectId, sourceQuoteId, sourceContractId, offerConditions, createdAt, updatedAt, sentAt, firstSentAt,
    ...(setupInvoice && { setupInvoice: {
      paidAt: setupInvoice.paidAt, cancelledAt: setupInvoice.cancelledAt,
    } }),
    signedAt: doc.signature?.signedAt, deliveryState: doc.commercialDelivery?.state,
    signatureStatus: doc.signatureRequest?.status === "PENDING" && doc.signatureRequest.expiresAt <= new Date()
      ? "EXPIRED" : doc.signatureRequest?.status,
  };
}

function offerSummary(offer) {
  const { _id, kind, version, title, monthlyCents, setupCents, extraModuleCents, smsCents, tabletCents, terminalCents, startsAt, endsAt, smsLabel, bankFeeScope, postPromotionTerms } = offer;
  return { _id, kind, version, title, monthlyCents, setupCents, extraModuleCents, smsCents, tabletCents, terminalCents, startsAt, endsAt, smsLabel, bankFeeScope, postPromotionTerms };
}

function offerFields(body = {}) {
  const fields = {};
  for (const key of ["title", "dayType", "taxLabel", "smsLabel", "bankFeeScope", "promoEligibility", "giftSelectedFirst", "postPromotionTerms"]) {
    if (Object.hasOwn(body, key)) {
      if (typeof body[key] !== "string") throw problem(400, "Conditions invalides.");
      fields[key] = body[key].trim() || undefined;
    }
  }
  for (const key of ["monthlyCents", "setupCents", "extraModuleCents", "smsCents", "tabletCents", "terminalCents", "signedCopyHours"]) {
    if (Object.hasOwn(body, key)) {
      if (!Number.isSafeInteger(body[key])) throw problem(400, "Saisissez un montant ou une durée valide.");
      fields[key] = body[key];
    }
  }
  for (const key of ["startsAt", "endsAt"]) {
    if (Object.hasOwn(body, key)) {
      if (!body[key]) fields[key] = null;
      else if (typeof body[key] === "string" && /T.+(?:Z|[+-]\d\d:\d\d)$/.test(body[key]) &&
          Number.isFinite(new Date(body[key]).getTime())) fields[key] = new Date(body[key]);
      else throw problem(400, "Date de publication invalide.");
    }
  }
  return fields;
}

router.get(offersPath, handle(async (_req, res) => {
  res.json({ offers: await Offer.find().sort({ createdAt: -1, _id: -1 }).limit(200).lean() });
}));

router.post(offersPath, handle(async (req, res) => {
  const { kind } = req.body || {};
  if (!offerKinds.includes(kind)) throw problem(400, "Type d’offre invalide.");
  const previous = await Offer.findOne({ kind }).sort({ version: -1 }).lean();
  const title = kind === "STANDARD" ? "Gusto Manager" : "Offre fêtes 2026";
  const offer = await Offer.create({ kind, version: (previous?.version || 0) + 1, title,
    ...approvedOfferTerms(kind), ...offerFields(req.body), updatedBy: req.user.id });
  res.status(201).json({ offer });
}));

router.patch(`${offersPath}/:id`, handle(async (req, res) => {
  const filter = { _id: id(req.params.id), status: "DRAFT" };
  const fields = offerFields(req.body);
  const blank = Object.fromEntries(Object.keys(fields).filter((key) => fields[key] === undefined).map((key) => [key, 1]));
  const draft = await Offer.findOne(filter).select("kind updatedAt").lean();
  if (!draft) throw problem(409, "Seul un brouillon peut être modifié.");
  const offer = await Offer.findOneAndUpdate({ ...filter, updatedAt: draft.updatedAt }, {
    $set: { ...approvedOfferTerms(draft.kind), ...fields, updatedBy: req.user.id }, $unset: blank,
  }, { new: true, runValidators: true }).lean();
  if (!offer) throw problem(409, "Seul un brouillon peut être modifié.");
  res.json({ offer });
}));

router.post(`${offersPath}/:id/status`, handle(async (req, res) => {
  const { action, approved } = req.body || {};
  const current = await Offer.findById(id(req.params.id)).lean();
  if (!current) throw problem(404, "Offre introuvable.");
  const now = new Date();
  let update;
  if (action === "publish" && current.status === "DRAFT" && approved === true) {
    const validation = publishingProblem(current);
    if (validation) throw problem(400, validation);
    if (current.endsAt && current.endsAt <= now) throw problem(409, "La période de publication est terminée.");
    update = { status: "PUBLISHED", reviewedAt: now, reviewedBy: req.user.id };
  } else if (action === "withdraw" && current.status === "PUBLISHED") {
    update = { status: "WITHDRAWN", withdrawnAt: now, withdrawnBy: req.user.id };
  } else {
    throw problem(409, "Transition indisponible ou conditions non approuvées.");
  }
  const offer = await Offer.findOneAndUpdate({ _id: current._id, status: current.status, updatedAt: current.updatedAt }, { $set: update }, { new: true }).lean();
  if (!offer) throw problem(409, "L’offre a changé. Actualisez la page.");
  res.json({ offer });
}));

const availableOffers = handle(async (_req, res) => {
  const now = new Date();
  const offers = await Offer.find({ status: "PUBLISHED", $and: [
    { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
  ] }).sort({ kind: 1, version: -1 }).lean();
  res.json({ offers: offers.filter((offer) => isOfferAvailable(offer, now) && !publishingProblem(offer)).map(offerSummary) });
});
router.get("/commercial/offers", availableOffers);
router.get(`${adminDraftPath}/offers`, authenticateAdmin, availableOffers);

router.get(docsPath, handle(async (req, res) => {
  const type = types.includes(req.query.type) ? req.query.type : { $in: types };
  const filter = { salesOwnerId: req.commercialAccount._id, type, contractKind: { $ne: "AMENDMENT" },
    ...commercialDocumentStatusFilter(req.query.status) };
  if (req.query.prospectId) filter.prospectId = id(req.query.prospectId);
  if (req.query.signature === "pending") filter.$and = [pendingCommercialSignature()];
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  if (q) {
    const pattern = new RegExp(RegExp.escape(q), "i");
    filter.$or = [{ docNumber: pattern }, { "party.restaurantName": pattern }];
  }
  const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const limit = 25;
  const [docs, total] = await Promise.all([
    Document.find(filter).select("type docNumber status party prospectId sourceQuoteId sourceContractId offerConditions createdAt updatedAt sentAt firstSentAt signature.signedAt signatureRequest.status signatureRequest.expiresAt commercialDelivery.state setupInvoice.paidAt setupInvoice.cancelledAt")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Document.countDocuments(filter),
  ]);
  res.json({ documents: docs.map(documentDto), page, limit, total });
}));

function assertSalesRequest(body, fields) {
  if (Object.keys(body).some((key) => !fields.includes(key))) throw problem(400, "La requête contient des champs non autorisés.");
  if (Object.hasOwn(body, "choices") && (body.choices === null || typeof body.choices !== "object" || Array.isArray(body.choices) ||
      Object.keys(body.choices).some((key) => !["includedModule", "extraModules", "sms", "tabletQuantity", "terminalQuantity"].includes(key)))) {
    throw problem(400, "Sélection d’options invalide.");
  }
}

function partyFromProspect(prospect) {
  if (!prospect.email) throw problem(400, "Renseignez l’email du prospect avant de créer le document.");
  return {
    restaurantName: prospect.restaurantName, ownerName: prospect.contactName,
    address: [prospect.address, [prospect.postalCode, prospect.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    email: prospect.email, phone: prospect.phone,
  };
}

function setupInvoiceFields(snapshot) {
  const { setupCents, title, version, offerId } = snapshot || {};
  if (!Number.isSafeInteger(setupCents) || setupCents <= 0 || !snapshot.taxLabel?.trim()) {
    throw problem(409, "Le contrat signé doit prévoir des frais et une mention fiscale approuvée.");
  }
  const amount = setupCents / 100;
  return {
    offerConditions: { offerId, title, version, setupCents, taxLabel: Offer.approvedCommercialTerms.taxLabel },
    lines: [{ label: "Frais de mise en service", qty: 1, unitPrice: amount, total: amount, kind: "NORMAL" }],
    totals: { subtotal: amount, total: amount },
  };
}

async function lockProspect(prospectId, owner, session) {
  const current = await Prospect.findOneAndUpdate({
    _id: prospectId, salesOwnerId: owner, archivedAt: null, opposedAt: null,
  }, { $set: { updatedAt: new Date() } }, { new: true, session });
  if (!current) throw problem(404, "Dossier introuvable.");
  return current;
}

const createDraft = handle(async (req, res) => {
  const body = req.body || {};
  assertSalesRequest(body, ["type", "prospectId", "sourceQuoteId", "sourceContractId", "offerId", "choices"]);
  if (!types.includes(body.type)) throw problem(400, "Type de document invalide.");
  const owner = req.commercialAccount?._id || id(req.query.salesOwnerId);
  const invoice = body.type === "INVOICE";
  const sourceId = body.sourceQuoteId || body.sourceContractId;
  if ((body.sourceContractId && (!invoice || body.sourceQuoteId)) ||
      (sourceId && (body.type === "QUOTE" || body.prospectId || body.offerId || body.choices)) ||
      (invoice && Object.hasOwn(body, "choices"))) {
    throw problem(400, "Un document issu d’un devis ou d’un contrat conserve son offre et son dossier.");
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await mongoose.connection.transaction(async (session) => {
        let source;
        if (sourceId) {
          source = await Document.findOneAndUpdate({
            _id: id(sourceId), type: body.sourceContractId ? "CONTRACT" : "QUOTE",
            contractKind: { $ne: "AMENDMENT" }, salesOwnerId: owner,
          }, { $set: { updatedAt: new Date() } }, { session, new: true }).lean();
          if (!source?.offerConditions) throw problem(404, "Document ou dossier introuvable.");
          if (!invoice) {
            const existing = await Document.findOne({ sourceQuoteId: source._id, type: "CONTRACT", salesOwnerId: owner }).session(session).lean();
            if (existing) return { document: existing, created: false };
          }
        }
        const prospect = await lockProspect(source?.prospectId || id(body.prospectId), owner, session);
        let establishment;
        let signed;
        if (invoice) {
          signed = await signedSetupContract(prospect._id, owner, session);
          if ((body.sourceContractId && String(signed._id) !== body.sourceContractId) ||
              (body.sourceQuoteId && String(signed.sourceQuoteId) !== body.sourceQuoteId) ||
              (body.offerId && signed.offerConditions?.offerId !== body.offerId)) {
            throw problem(409, "La facture doit reprendre les conditions du contrat initial signé.");
          }
          establishment = await Establishment.findOne({ prospectId: prospect._id }).select("_id").session(session);
          if (!establishment) throw problem(409, "L’identité de l’établissement est indisponible.");
          const existing = await Document.findOne(activeSetupInvoice(establishment._id)).session(session).lean();
          if (existing) {
            if (String(existing.salesOwnerId) !== String(owner) || String(existing.prospectId) !== String(prospect._id)) {
              throw problem(409, "Une facture existe déjà pour cet établissement.");
            }
            if (!invoiceMatchesContract(existing, signed)) throw problem(409, "La facture active doit être régularisée par l’administration.");
            return { document: existing, created: false };
          }
        }
        const offer = invoice ? null : await readAvailableOffer(source?.offerConditions?.offerId || body.offerId, new Date(), session);
        if (offer?.kind === "FETES_2026") await assertPromotionEligibility(prospect._id, session);
        const fields = invoice ? setupInvoiceFields(signed.offerConditions)
          : asDocumentFields(makeOfferConditions(offer, source?.offerConditions?.selections || body.choices));
        const [document] = await Document.create([{
          ...fields, type: body.type, docNumber: getDocNumber(body.type, attempt),
          party: signed?.party || source?.party || partyFromProspect(prospect), issueDate: new Date(),
          salesOwnerId: owner, prospectId: prospect._id, createdBy: String(req.commercialAccount?._id || req.user.id),
          ...((signed?.sourceQuoteId || body.sourceQuoteId) && { sourceQuoteId: signed?.sourceQuoteId || source._id }),
          ...(invoice && { sourceContractId: signed._id, setupInvoice: { establishmentId: establishment._id } }),
        }], { session });
        return { document, created: true };
      });
      return res.status(result.created ? 201 : 200).json({ document: documentDto(result.document) });
    } catch (error) {
      if (error.code !== 11000 || attempt === 3) throw error;
    }
  }
});
router.post(docsPath, createDraft);
router.post(adminDraftPath, authenticateAdmin, createDraft);

router.get(`${docsPath}/:id`, handle(async (req, res) => {
  const document = await Document.findOne(commercialDocumentScope(req)).lean();
  if (!document) throw problem(404, "Document ou dossier introuvable.");
  let canInvoice = false;
  if (document.type === "CONTRACT" && document.status === "SIGNED" && document.offerConditions &&
      await Prospect.exists({ _id: document.prospectId, salesOwnerId: req.commercialAccount._id, opposedAt: null, archivedAt: null })) {
    try {
      const reference = await signedSetupContract(document.prospectId, req.commercialAccount._id);
      canInvoice = String(reference._id) === String(document._id);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
  }
  res.json({ document: { ...documentDto(document), canInvoice } });
}));

router.patch(`${docsPath}/:id`, handle(async (req, res) => {
  const body = req.body || {};
  assertSalesRequest(body, ["offerId", "choices"]);
  const filter = commercialDocumentScope(req);
  const document = await mongoose.connection.transaction(async (session) => {
    const current = await Document.findOne(filter).session(session).lean();
    if (!current) throw problem(404, "Document ou dossier introuvable.");
    const invoice = current.type === "INVOICE";
    const converted = Boolean(current.sourceQuoteId || current.sourceContractId);
    if (current.status !== "DRAFT" || (!invoice && converted) || pendingDelivery.includes(current.commercialDelivery?.state)) {
      throw problem(409, "Ce document ne peut plus être modifié.");
    }
    const prospect = await lockProspect(current.prospectId, req.commercialAccount._id, session);
    if (invoice && (Object.hasOwn(body, "choices") ||
        (body.offerId && body.offerId !== current.offerConditions.offerId))) {
      throw problem(400, "La facture conserve les frais de mise en service applicables.");
    }
    let fields = {};
    if (!invoice) {
      const offer = await readAvailableOffer(body.offerId || current.offerConditions.offerId, new Date(), session);
      if (offer.kind === "FETES_2026") await assertPromotionEligibility(prospect._id, session);
      fields = asDocumentFields(makeOfferConditions(offer, body.choices || current.offerConditions.selections));
    }
    if (invoice) {
      await assertSetupInvoiceDeal(current, session);
      fields["offerConditions.taxLabel"] = Offer.approvedCommercialTerms.taxLabel;
    }
    const party = partyFromProspect(prospect);
    if (invoice) Object.assign(party, { restaurantName: current.party.restaurantName, ownerName: current.party.ownerName });
    return Document.findOneAndUpdate(filter, { $set: { ...fields, party } },
      { new: true, runValidators: true, session }).lean();
  });
  res.json({ document: documentDto(document) });
}));

const settlementFields = {
  record: ["paidOn", "reference", "requestId"],
  "record-advance": ["paidOn", "reference", "requestId", "reason"],
  reverse: ["requestId", "reason"],
  cancel: ["reason"],
};

router.post(`${adminDraftPath}/:id/settlement`, authenticateAdmin, handle(async (req, res) => {
  const body = req.body || {};
  const { action, paidOn, reference = "", requestId, reason } = body;
  if (typeof action !== "string" || !Object.hasOwn(settlementFields, action) ||
      Object.keys(body).some((key) => key !== "action" && !settlementFields[action].includes(key))) {
    throw problem(400, "Champs de règlement invalides.");
  }
  if (action !== "cancel" && (typeof requestId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId))) {
    throw problem(400, "Identifiant de règlement invalide.");
  }
  const decision = { action, requestId: requestId?.toLowerCase() };
  if (action === "record" || action === "record-advance") {
    const paid = typeof paidOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidOn)
      ? DateTime.fromISO(paidOn, { zone: "Europe/Paris" }) : null;
    if (!paid?.isValid || paid.toMillis() > Date.now() || typeof reference !== "string" || reference.length > 180) {
      throw problem(400, "Date ou référence de règlement invalide.");
    }
    Object.assign(decision, { paidAt: paid.toJSDate(), paidBefore: paid.endOf("day").toJSDate(), reference: reference.trim() });
  }
  if (action !== "record") {
    if (typeof reason !== "string" || reason.length > 500 || !reason.trim()) throw problem(400, "Motif invalide.");
    decision.reason = reason.trim();
  }
  const invoice = await settleSetupInvoice({
    _id: id(req.params.id), ...(req.query.salesOwnerId && { salesOwnerId: id(req.query.salesOwnerId) }),
  }, decision, req.user.id);
  res.json({ document: invoice });
}));

module.exports = router;
