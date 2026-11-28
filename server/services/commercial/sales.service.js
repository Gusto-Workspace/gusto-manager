const Acquisition = require("../../models/commercial-acquisition.model");
const Account = require("../../models/commercial-account.model");
const { DateTime } = require("luxon");
const Offer = require("../../models/commercial-offer.model");
const Document = require("../../models/document.model");
const Establishment = require("../../models/commercial-establishment.model");
const { CommercialProspect: Prospect, CommercialInteraction: Interaction, closedStages } = require("../../models/commercial-prospect.model");
const { cancelProspectEvents } = require("./calendar.service");
const { problem, assertPromotionEligibility, readAvailableOffer, commercialCopyVersion } = require("./offers.service");
const { currentRegistryRestaurants } = require("./establishments.service");

const signedContract = { type: "CONTRACT", contractKind: "INITIAL", status: "SIGNED", "signature.signedAt": { $type: "date" } };
const contractFields = "prospectId party sourceQuoteId offerConditions contractSnapshot.offerConditions";
const issuedSetupInvoice = { type: "INVOICE", status: "SENT", "setupInvoice.active": true };
const paidSetupInvoice = { ...issuedSetupInvoice, "setupInvoice.paidAt": { $type: "date" } };
const countedQuotes = { type: "QUOTE", status: "SENT", contractKind: { $ne: "AMENDMENT" } };
const validAcquisitions = { "commission.status": { $ne: "CANCELLED" } };

function activeSetupInvoice(establishmentId) {
  return { "setupInvoice.establishmentId": establishmentId, "setupInvoice.active": true };
}

function signedConditions(contract) {
  return contract?.contractSnapshot?.offerConditions ?? contract?.offerConditions;
}

function invoiceMatchesContract(invoice, contract) {
  return Boolean(invoice && contract &&
    String(invoice.prospectId) === String(contract.prospectId) &&
    (!invoice.sourceContractId || String(invoice.sourceContractId) === String(contract._id)) &&
    Number.isSafeInteger(signedConditions(contract)?.setupCents) &&
    invoice.offerConditions?.setupCents === signedConditions(contract).setupCents);
}

async function signedSetupContract(prospectId, salesOwnerId, session) {
  const sale = await Acquisition.findOne({ prospectId }).select("contractId").session(session).lean();
  const signed = await Document.findOne({
    ...signedContract, prospectId, salesOwnerId, ...(sale && { _id: sale.contractId }),
  }).sort({ "signature.signedAt": 1, _id: 1 }).select(contractFields).session(session).lean();
  if (!signed) throw problem(409, "Un contrat initial de référence signé est requis pour facturer la mise en service.");
  return { ...signed, offerConditions: signedConditions(signed) };
}

async function assertSetupInvoiceDeal(invoice, session = null) {
  const signed = await signedSetupContract(invoice.prospectId, invoice.salesOwnerId, session);
  if (!invoiceMatchesContract(invoice, signed)) {
    throw problem(409, "La facture doit reprendre les conditions du contrat initial signé.");
  }
}

async function validateCommercialDocumentSend(document, { copy = false, frozen = false } = {}) {
  const conditions = document.offerConditions;
  if (!conditions || !document.prospectId) return;
  if (!copy && document.setupInvoice) {
    await assertSetupInvoiceDeal(document);
    if (conditions.taxLabel !== Offer.approvedCommercialTerms.taxLabel) {
      throw problem(409, "Actualisez le brouillon pour appliquer la mention fiscale approuvée.");
    }
  }
  else if (!copy) {
    if (!frozen && conditions.copyVersion !== commercialCopyVersion) {
      throw problem(409, "Actualisez le brouillon avec une version approuvée de l’offre.");
    }
    const offer = await readAvailableOffer(conditions.offerId, new Date(), null, frozen);
    if (offer.kind === "FETES_2026") await assertPromotionEligibility(document.prospectId);
  }
  const prospect = await Prospect.findOne({ _id: document.prospectId, salesOwnerId: document.salesOwnerId }).select("opposedAt archivedAt archivePurgeAt stage").lean();
  if (!prospect || prospect.opposedAt || (prospect.archivedAt && !(copy && prospect.archivePurgeAt)) || closedStages.includes(prospect.stage)) {
    throw problem(409, "Le dossier ne permet plus l’envoi du document.");
  }
}

async function paidInvoiceForAcquisition(sale, session = null) {
  const contract = await Document.findOne({ ...signedContract, _id: sale.contractId }).select(contractFields).session(session).lean();
  const invoice = await Document.findOne({ ...paidSetupInvoice, ...activeSetupInvoice(sale.establishmentId), prospectId: sale.prospectId }).session(session).lean();
  return invoiceMatchesContract(invoice, contract) ? invoice : null;
}

async function recordCommercialSignature(contract, session) {
  const signedAt = contract.signature.signedAt;
  const prospect = await Prospect.findOneAndUpdate({
    _id: contract.prospectId, opposedAt: null, archivedAt: null, stage: { $nin: closedStages },
  }, {
    $min: {
      "milestones.contractSentAt": contract.firstSentAt || signedAt,
      "milestones.contractSignedAt": signedAt,
    },
  }, { new: true, session });
  if (!prospect) {
    throw Object.assign(new Error("Ce dossier ne permet plus de signer le contrat."), { statusCode: 409 });
  }

  // Coordinate with the registry write performed by the historical restaurant creation.
  const establishment = await Establishment.findOneAndUpdate({ prospectId: prospect._id },
    { $inc: { __v: 1 } }, { session, new: true });
  if (!establishment) throw new Error("L’identité commerciale du dossier est indisponible.");
  if (contract.offerConditions?.kind === "FETES_2026") await assertPromotionEligibility(prospect._id, session);
  const previous = await Acquisition.findOne({ $or: [{ prospectId: prospect._id }, { establishmentId: establishment._id }] })
    .select("commission.status").session(session);
  if (previous?.commission.status === "CANCELLED") return;
  if (!prospect.milestones.acquiredAt) {
    prospect.set("milestones.acquiredAt", signedAt);
    await cancelProspectEvents(prospect, "SYSTEM", session, signedAt, ["FOLLOW_UP"]);
    await prospect.save({ session });
  }
  if (previous || (await currentRegistryRestaurants(establishment, prospect, session)).length) return;

  const beneficiary = await Account.exists({ _id: prospect.salesOwnerId }).session(session);
  if (!beneficiary) throw new Error("Le bénéficiaire de la commission est indisponible.");
  const invoice = await Document.findOne({ ...paidSetupInvoice, ...activeSetupInvoice(establishment._id) }).session(session);
  const payable = invoiceMatchesContract(invoice, contract);
  const assignments = await Interaction.find({ prospectId: prospect._id, type: "ASSIGNMENT", occurredAt: { $lte: signedAt } })
    .select("previousOwnerId salesOwnerId").session(session).lean();
  const assignmentCandidates = [...new Set(assignments.flatMap(({ previousOwnerId, salesOwnerId }) =>
    [previousOwnerId, salesOwnerId].filter(Boolean).map(String)).concat(String(beneficiary._id)))];
  const reassigned = assignments.length > 0;
  await Acquisition.create([{
    prospectId: prospect._id,
    contractId: contract._id,
    establishmentId: establishment._id,
    beneficiaryId: beneficiary._id,
    contractCreatedBy: contract.createdBy,
    restaurantName: contract.party.restaurantName,
    contractNumber: contract.docNumber,
    signedAt,
    commission: { amountCents: Account.commissionAmountCents, ...(payable && { status: "TO_PAY", paymentInvoiceId: invoice._id }),
      ...(reassigned && { reconciliationRequiredAt: signedAt, assignmentCandidates }) },
    activity: [{ actor: "SYSTEM", action: "SIGNED", at: signedAt },
      ...(reassigned ? [{ actor: "SYSTEM", action: "ASSIGNMENT_REVIEW", at: signedAt }] : [])],
  }], { session });
}

async function archiveCompletedProspect(sale, at, session) {
  if (!sale.restaurantId || !sale.restaurantCreatedAt || sale.commission.status !== "PAID" || !sale.commission.paidAt) return;
  const archivePurgeAt = DateTime.fromJSDate(at, { zone: "Europe/Paris" }).plus({ days: 30 }).toJSDate();
  const archived = await Prospect.updateOne({ _id: sale.prospectId, archivePurgeAt: null, "milestones.acquiredAt": { $type: "date" } },
    { $set: { archivedAt: at, archivePurgeAt } }, { session });
  if (archived.modifiedCount) {
    await Acquisition.updateOne({ _id: sale._id }, {
      $push: { activity: { actor: "SYSTEM", action: "INTEGRATION_ARCHIVED", at } },
    }, { session });
  }
}

async function updateCommissionFromInvoice(invoice, actor, at, session) {
  const sale = await Acquisition.findOne({ establishmentId: invoice.setupInvoice.establishmentId, prospectId: invoice.prospectId }).session(session);
  if (!sale || (sale.commission.status === "CANCELLED" && !sale.commission.paidAt)) return;
  const contract = await Document.findOne({ ...signedContract, _id: sale.contractId }).select(contractFields).session(session);
  const payable = Boolean(invoice.setupInvoice.paidAt && invoiceMatchesContract(invoice, contract));
  const paidWithInvoice = String(sale.commission.paymentInvoiceId) === String(invoice._id);
  if (payable === paidWithInvoice) return;
  if (!sale.commission.paidAt) {
    sale.commission.paymentInvoiceId = payable ? invoice._id : undefined;
    if (sale.commission.status !== "CONTESTED") sale.commission.status = payable ? "TO_PAY" : "WAITING_CUSTOMER_PAYMENT";
  } else if (!paidWithInvoice) {
    return;
  } else if (!payable) {
    sale.set("commission.reconciliationRequiredAt", at);
    sale.set("commission.reconciledAt", undefined);
  }
  sale.activity.push({ actor, at, action: payable ? "CUSTOMER_PAID" : "CUSTOMER_PAYMENT_REVERSED" });
  sale.revision += 1;
  await sale.save({ session });
}

async function settleSetupInvoice(filter, decision, actor) {
  return Document.db.transaction(async (session) => {
    const invoice = await Document.findOne({ ...filter, ...issuedSetupInvoice }).session(session);
    if (!invoice) throw problem(404, "Facture émise introuvable.");
    const setup = invoice.setupInvoice;
    const advance = decision.action === "record-advance";
    const recording = decision.action === "record" || advance;
    if (recording) {
      const beforeIssue = decision.paidBefore < (invoice.firstSentAt || invoice.sentAt || invoice.issueDate);
      if (beforeIssue && !advance) {
        throw problem(409, "La date d’encaissement précède l’émission. Vérifiez le virement avant de rapprocher la facture.");
      }
      if (advance && !beforeIssue) throw problem(409, "Utilisez le règlement standard à partir du jour de l’émission.");
      if (setup.paidAt) {
        if (setup.paymentRequestId === decision.requestId && +setup.paidAt === +decision.paidAt &&
            (setup.paymentReference || "") === decision.reference && setup.advanceReason === decision.reason) return invoice;
        throw problem(409, "Un règlement est déjà enregistré pour cette facture.");
      }
      if (setup.paymentCorrections?.some(({ requestId }) => requestId === decision.requestId)) {
        throw problem(409, "Ce règlement a déjà été corrigé.");
      }
      await assertSetupInvoiceDeal(invoice, session);
    }
    const now = new Date();
    const establishment = await Establishment.updateOne(
      { _id: setup.establishmentId, prospectId: invoice.prospectId }, { $inc: { __v: 1 } }, { session },
    );
    if (!establishment.matchedCount) throw problem(409, "L’identité de l’établissement est indisponible.");

    if (recording) {
      setup.set({
        paidAt: decision.paidAt, paidBy: actor, paymentReference: decision.reference || undefined,
        paymentRequestId: decision.requestId, advanceReason: decision.reason,
      });
    } else if (decision.action === "reverse") {
      if (!setup.paidAt || setup.paymentRequestId !== decision.requestId) {
        throw problem(409, "Le règlement a changé. Actualisez la facture.");
      }
      if (!setup.paymentCorrections) setup.paymentCorrections = [];
      setup.paymentCorrections.push({
        requestId: setup.paymentRequestId, paidAt: setup.paidAt, paidBy: setup.paidBy,
        reference: setup.paymentReference, advanceReason: setup.advanceReason, correctedAt: now, correctedBy: actor, reason: decision.reason,
      });
      setup.set({ paidAt: undefined, paidBy: undefined, paymentReference: undefined, paymentRequestId: undefined, advanceReason: undefined });
    } else {
      if (setup.paidAt) throw problem(409, "Corrigez le règlement avant d’annuler la facture.");
      setup.set({ active: false, cancelledAt: now, cancelledBy: actor, cancellationReason: decision.reason });
    }
    await invoice.save({ session });
    if (decision.action !== "cancel") await updateCommissionFromInvoice(invoice, actor, now, session);
    return invoice;
  });
}

function commercialDocumentStatusFilter(status) {
  if (status === "PAID") return { "setupInvoice.active": true, "setupInvoice.paidAt": { $type: "date" } };
  if (status === "CANCELLED") return { "setupInvoice.active": false };
  if (status === "SENT") return { status, "setupInvoice.cancelledAt": null, "setupInvoice.paidAt": null };
  return ["DRAFT", "SIGNED"].includes(status) ? { status } : {};
}

module.exports = {
  recordCommercialSignature, activeSetupInvoice, settleSetupInvoice, commercialDocumentStatusFilter,
  issuedSetupInvoice, paidSetupInvoice, paidInvoiceForAcquisition, invoiceMatchesContract,
  signedSetupContract, assertSetupInvoiceDeal, validateCommercialDocumentSend,
  archiveCompletedProspect, countedQuotes, validAcquisitions,
};
