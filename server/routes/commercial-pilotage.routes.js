const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { DateTime } = require("luxon");
const { randomUUID } = require("node:crypto");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { authenticateCommercial } = require("../middleware/authenticate-commercial");
const Acquisition = require("../models/commercial-acquisition.model");
const Account = require("../models/commercial-account.model");
const Document = require("../models/document.model");
const Establishment = require("../models/commercial-establishment.model");
const Restaurant = require("../models/restaurant.model");
const { CommercialProspect: Prospect, CommercialInteraction: Interaction, pipelineStage } = require("../models/commercial-prospect.model");
const { activePipeline, upcomingActions } = require("../services/commercial/calendar.service");
const {
  commercialDocumentStatusFilter, issuedSetupInvoice, paidSetupInvoice, paidInvoiceForAcquisition, invoiceMatchesContract, archiveCompletedProspect,
  countedQuotes, validAcquisitions,
} = require("../services/commercial/sales.service");
const { restaurantIdentityFields, matchesRestaurantIdentity, currentRegistryRestaurants } = require("../services/commercial/establishments.service");
const { pendingCommercialSignature } = require("../services/commercial/offers.service");
const { uploadPrivateFile, readPrivateFile, removePrivateFile } = require("../services/shared/private-files.service");
const {
  validateEmployeeDocumentFile, EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, getDocumentContentDisposition,
} = require("../services/employees/employee-documents.service");

const router = express.Router();
const admin = "/admin/commerciaux/pilotage";
const seller = "/commercial";
const zone = "Europe/Paris";
const statuses = ["WAITING_CUSTOMER_PAYMENT", "TO_PAY", "PAID", "CONTESTED", "CANCELLED"];
const unpaidInvoice = { ...issuedSetupInvoice, "setupInvoice.paidAt": null };
const invoiceSummaryFields = "docNumber salesOwnerId prospectId setupInvoice.paidAt";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, files: 1, fields: 0 } }).single("proof");

router.use(admin, authenticateAdmin);
router.use([`${seller}/dashboard`, `${seller}/commissions`], authenticateCommercial);

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function run(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: "Une acquisition existe déjà pour ce dossier, ce contrat ou cet établissement." });
      if (["ValidationError", "CastError", "EmployeeDocumentValidationError"].includes(error.name)) {
        return res.status(400).json({ message: "Informations ou fichier invalides." });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[commercial-pilotage]", error.code || error.name || "unavailable");
      return res.status(status).json({ message: status === 500 ? "Opération impossible." : error.message });
    }
  };
}

function validId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw problem(400, "Identifiant invalide.");
  return new mongoose.Types.ObjectId(value);
}

function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw problem(400, "Date invalide.");
  const parsed = DateTime.fromISO(value, { zone });
  if (!parsed.isValid || parsed.toISODate() !== value) throw problem(400, "Date invalide.");
  return parsed;
}

function destination(req) {
  if (req.commercialAccount) return req.commercialAccount._id;
  if (req.query.salesOwnerId) return validId(req.query.salesOwnerId);
  return null;
}

function commissionScope(req) {
  const beneficiaryId = destination(req);
  return { _id: validId(req.params.id), ...(beneficiaryId && { beneficiaryId }) };
}

function windowFor(req) {
  const now = DateTime.now().setZone(zone);
  const from = req.query.from ? date(req.query.from) : now.startOf("month");
  const to = req.query.to ? date(req.query.to).plus({ days: 1 }) : now.startOf("day").plus({ days: 1 });
  if (to <= from || to.diff(from, "days").days > 1098) throw problem(400, "Période invalide.");
  return { from: from.toISODate(), to: to.minus({ days: 1 }).toISODate(), range: { $gte: from.toJSDate(), $lt: to.toJSDate() } };
}

function audit(actor, action, note = "") {
  return { actor: String(actor), action, note, at: new Date() };
}

function serialize(item, isAdmin, invoice) {
  const { _id, restaurantName, contractNumber, signedAt, commission, prospectId } = item;
  const { amountCents, currency, status, paidAt } = commission;
  return {
    _id, restaurantName, contractNumber, signedAt,
    commission: isAdmin ? commission : { amountCents, currency, status, paidAt },
    ...(invoice && { invoice: { id: invoice._id, number: invoice.docNumber, paidAt: invoice.setupInvoice.paidAt,
      ...(isAdmin && { owner: invoice.salesOwnerId }) } }),
    ...(isAdmin && {
      prospectId, beneficiaryId: item.beneficiaryId, contractId: item.contractId,
      restaurantId: item.restaurantId, restaurantCreatedAt: item.restaurantCreatedAt,
      hasProof: Boolean(item.proof?.public_id), activity: item.activity,
    }),
  };
}

for (const path of [`${admin}/commissions`, `${seller}/commissions`]) {
  router.get(path, run(async (req, res) => {
    const actor = destination(req);
    const scope = actor ? { beneficiaryId: actor } : {};
    const range = req.query.from || req.query.to ? windowFor(req).range : null;
    if (range) scope.$or = [
      { "commission.paidAt": range },
      { "commission.paidAt": null, signedAt: range },
    ];
    const selected = req.query.status;
    const filter = { ...scope,
      ...(selected === "PAID" ? { "commission.paidAt": { $type: "date" } } :
        statuses.includes(selected) && { "commission.status": selected }),
    };
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 25;
    const [rows, total, summary] = await Promise.all([
      Acquisition.find(filter).select(req.commercialAccount ? "-activity" : "+proof")
        .sort({ signedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Acquisition.countDocuments(filter),
      req.query.summary === "true" ? Acquisition.aggregate([
        { $match: { ...(actor && { beneficiaryId: actor }), ...(range && { $or: [
          { "commission.paidAt": null },
          { "commission.paidAt": range },
        ] }) } },
        { $group: { _id: { $cond: [{ $eq: [{ $type: "$commission.paidAt" }, "date"] }, "PAID", "$commission.status"] },
          count: { $sum: 1 }, amountCents: { $sum: "$commission.amountCents" } } },
      ]) : null,
    ]);
    const invoices = rows.length ? await Document.find({
      ...(req.commercialAccount && { salesOwnerId: actor }),
      $or: [
        { "setupInvoice.establishmentId": { $in: rows.map(({ establishmentId }) => establishmentId) }, "setupInvoice.active": true },
        { _id: { $in: rows.map(({ commission }) => commission.paymentInvoiceId).filter(Boolean) } },
      ],
    }).select(invoiceSummaryFields + " setupInvoice.active").lean() : [];
    const relatedInvoice = (item) => invoices.find(({ _id }) => String(_id) === String(item.commission.paymentInvoiceId)) ||
      invoices.find(({ setupInvoice, prospectId }) => setupInvoice.active && String(prospectId) === String(item.prospectId));
    res.json({ commissions: rows.map((item) => serialize(item, !req.commercialAccount, relatedInvoice(item))), page, limit, total,
      ...(summary && { summary: Object.fromEntries(summary.map(({ _id, ...amount }) => [_id, amount])) }),
    });
  }));
}

router.post(`${admin}/commissions/:id/status`, run(async (req, res) => {
  const { action, note = "", paidOn, reference = "", beneficiaryId } = req.body || {};
  if (!["pay", "contest", "cancel", "restore", "reconcile"].includes(action) ||
      typeof note !== "string" || note.length > 500 || typeof reference !== "string" || reference.length > 180 ||
      (["contest", "cancel", "restore", "reconcile"].includes(action) && !note.trim()) ||
      (beneficiaryId != null && action !== "reconcile")) {
    throw problem(400, "Action ou motif invalide.");
  }
  const scope = commissionScope(req);
  const item = await Acquisition.findOne(scope).select("+proof").lean();
  if (!item) throw problem(404, "Commission introuvable.");
  const now = new Date();
  const { status, paidAt } = item.commission;
  const set = {};
  const event = audit(req.user.id, action.toUpperCase(), note.trim());
  if (action === "pay" && status === "TO_PAY" && !paidAt) {
    if (item.commission.reconciliationRequiredAt && !item.commission.reconciledAt) {
      throw problem(409, "Documentez l’arbitrage avant d’enregistrer le versement.");
    }
    const invoice = await paidInvoiceForAcquisition(item);
    if (!invoice) throw problem(409, "Les frais de mise en service doivent être intégralement réglés.");
    const paid = date(paidOn);
    if (paid.toJSDate() > now || paid.endOf("day").toMillis() < Math.max(+item.signedAt, +invoice.setupInvoice.paidAt)) {
      throw problem(400, "La date doit être compatible avec la signature et l’encaissement client.");
    }
    set["commission.status"] = "PAID";
    set["commission.paymentInvoiceId"] = invoice._id;
    set["commission.paidAt"] = paid.toJSDate();
    set["commission.paidBy"] = req.user.id;
    set["commission.paymentReference"] = reference.trim();
  } else if (action === "contest" && !["CONTESTED", "CANCELLED"].includes(status)) set["commission.status"] = "CONTESTED";
  else if (action === "cancel" && status !== "CANCELLED") set["commission.status"] = "CANCELLED";
  else if (action === "restore" && status === "CONTESTED") {
    set["commission.status"] = paidAt ? "PAID" : item.commission.paymentInvoiceId ? "TO_PAY" : "WAITING_CUSTOMER_PAYMENT";
  }
  else if (action === "reconcile" && item.commission.reconciliationRequiredAt && !item.commission.reconciledAt) {
    const allowed = !paidAt && item.commission.assignmentCandidates?.length ? item.commission.assignmentCandidates.map(String) : [];
    if (allowed.length) {
      if (typeof beneficiaryId !== "string" || !allowed.includes(beneficiaryId) || !await Account.exists({ _id: beneficiaryId })) {
        throw problem(400, "Sélectionnez le bénéficiaire parmi les commerciaux du dossier.");
      }
      set.beneficiaryId = beneficiaryId;
      event.previousBeneficiaryId = item.beneficiaryId;
      event.beneficiaryId = beneficiaryId;
    } else if (beneficiaryId != null) {
      throw problem(409, "Le bénéficiaire de ce versement doit être conservé.");
    }
    set["commission.reconciledAt"] = now;
  }
  else throw problem(409, "Transition indisponible.");
  const update = (session) => Acquisition.findOneAndUpdate({
    ...scope, revision: item.revision, "commission.status": status,
  }, { $set: set, $inc: { revision: 1 }, $push: { activity: event } }, { new: true, session }).select("+proof").lean();
  const changed = ["cancel", "pay", "restore"].includes(action)
    ? await mongoose.connection.transaction(async (session) => {
      const updated = await update(session);
      if (!updated) return null;
      if (action === "cancel") await Prospect.updateOne({ _id: item.prospectId }, {
        $set: { stage: "LOST" }, $unset: { "milestones.acquiredAt": 1 },
      }, { session });
      else await archiveCompletedProspect(updated, now, session);
      return updated;
    })
    : await update();
  if (!changed) throw problem(409, "La commission a changé. Actualisez la page.");
  res.json({ acquisition: serialize(changed, true) });
}));

router.post(`${admin}/commissions/:id/proof`, (req, res, next) => {
  upload(req, res, (error) => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Justificatif invalide ou trop volumineux." });
    next();
  });
}, run(async (req, res) => {
  const scope = commissionScope(req);
  const item = await Acquisition.findOne(scope).select("+proof").lean();
  if (!item) throw problem(404, "Commission introuvable.");
  if (!item.commission?.paidAt) throw problem(409, "Enregistrez d’abord le règlement.");
  const validated = validateEmployeeDocumentFile(req.file);
  const stored = await uploadPrivateFile(req.file.buffer, "Gusto_Workspace/commercial/proofs", randomUUID(), validated.format);
  try {
    const changed = await Acquisition.updateOne({ ...scope, revision: item.revision }, {
      $set: { proof: { ...stored, filename: validated.filename, mimeType: validated.mimeType } },
      $inc: { revision: 1 },
      $push: { activity: audit(req.user.id, "PROOF_UPLOADED") },
    });
    if (!changed.modifiedCount) throw problem(409, "La commission a changé. Actualisez la page.");
  } catch (error) {
    await removePrivateFile(stored);
    throw error;
  }
  if (item.proof) await removePrivateFile(item.proof);
  res.sendStatus(204);
}));

router.get(`${admin}/commissions/:id/proof`, run(async (req, res) => {
  const item = await Acquisition.findOne(commissionScope(req)).select("+proof").lean();
  if (!item?.proof?.public_id) throw problem(404, "Justificatif introuvable.");
  const data = await readPrivateFile(item.proof, "stream");
  res.set("Content-Type", item.proof.mimeType);
  res.set("Content-Disposition", getDocumentContentDisposition(item.proof.filename));
  res.set("X-Content-Type-Options", "nosniff");
  data.on("error", () => res.destroy());
  data.pipe(res);
}));

const queues = {
  restaurants: { restaurantCreatedAt: null, "commission.status": { $ne: "CANCELLED" } },
  payments: { "commission.status": "TO_PAY" },
};

router.get(`${admin}/actions/:queue`, run(async (req, res) => {
  const queue = req.params.queue;
  const owner = destination(req);
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 5;
  if (queue === "invoices") {
    const filter = { ...unpaidInvoice, ...(owner && { salesOwnerId: owner }) };
    const [invoices, total] = await Promise.all([
      Document.find(filter).select(invoiceSummaryFields + " party.restaurantName issueDate firstSentAt offerConditions.setupCents")
        .sort({ firstSentAt: 1, _id: 1 })
        .skip((page - 1) * limit).limit(limit).populate("salesOwnerId", "firstName lastName")
        .populate({ path: "prospectId", select: "city", transform: (prospect, id) => prospect || { _id: id } }).lean(),
      Document.countDocuments(filter),
    ]);
    return res.json({ page, limit, total, rows: invoices.map((invoice) => ({
      _id: invoice._id, prospectId: invoice.prospectId?._id, restaurantName: invoice.party.restaurantName, city: invoice.prospectId?.city,
      seller: invoice.salesOwnerId ? [invoice.salesOwnerId] : [],
      invoice: { id: invoice._id, number: invoice.docNumber, owner: invoice.salesOwnerId?._id,
        issuedAt: invoice.firstSentAt || invoice.issueDate,
        amountCents: invoice.offerConditions.setupCents },
    })) });
  }
  if (!Object.hasOwn(queues, queue)) throw problem(404, "Liste introuvable.");
  const [result] = await Acquisition.aggregate([
    { $match: { ...queues[queue], ...(owner && { beneficiaryId: owner }) } },
    { $lookup: { from: Prospect.collection.name, localField: "prospectId", foreignField: "_id",
      pipeline: [{ $project: { city: 1, archivedAt: 1, opposedAt: 1 } }], as: "prospect" } },
    { $unwind: "$prospect" },
    ...(queue === "payments" ? [] : [{ $match: { "prospect.archivedAt": null, "prospect.opposedAt": null } }]),
    { $sort: { signedAt: 1, _id: 1 } },
    { $facet: {
      count: [{ $count: "total" }],
      rows: [
        { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: { from: Account.collection.name, localField: "beneficiaryId", foreignField: "_id",
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }], as: "seller" } },
        { $lookup: { from: Document.collection.name, localField: "contractId", foreignField: "_id",
          pipeline: [{ $project: { salesOwnerId: 1, prospectId: 1, "offerConditions.setupCents": 1, "contractSnapshot.offerConditions.setupCents": 1 } }], as: "contract" } },
        ...(queue === "payments" ? [
          { $lookup: { from: Document.collection.name, localField: "commission.paymentInvoiceId", foreignField: "_id",
            pipeline: [{ $project: { id: "$_id", owner: "$salesOwnerId", number: "$docNumber", paidAt: "$setupInvoice.paidAt" } }],
            as: "paymentInvoice" } },
        ] : []),
        ...(queue === "restaurants" ? [
          { $lookup: { from: Prospect.collection.name, localField: "prospectId", foreignField: "_id",
            pipeline: [{ $project: { restaurantName: 1, address: 1, postalCode: 1, city: 1, siret: 1 } }], as: "identity" } },
          { $lookup: { from: Establishment.collection.name, localField: "establishmentId", foreignField: "_id",
            pipeline: [{ $project: { restaurants: 1 } }], as: "establishment" } },
          { $lookup: { from: Restaurant.collection.name, localField: "establishment.restaurants", foreignField: "_id",
            pipeline: [{ $project: Object.fromEntries(restaurantIdentityFields.split(" ").map((field) => [field, 1])) }], as: "restaurants" } },
          { $lookup: { from: Document.collection.name, localField: "establishmentId", foreignField: "setupInvoice.establishmentId",
            pipeline: [{ $match: paidSetupInvoice },
              { $project: { prospectId: 1, sourceContractId: 1, "offerConditions.setupCents": 1, "setupInvoice.paidAt": 1 } }], as: "receivedInvoices" } },
        ] : []),
        { $project: {
          contractId: 1, contractNumber: 1, prospectId: 1, restaurantName: 1, signedAt: 1, commission: 1, seller: 1,
          city: "$prospect.city",
          contractOwnerId: { $first: "$contract.salesOwnerId" },
          ...(queue === "payments" && { invoice: { $first: "$paymentInvoice" } }),
          ...(queue === "restaurants" && {
            reviewedAt: "$integrationReviewedAt",
            restaurants: 1, receivedInvoices: 1, identity: { $first: "$identity" }, contract: { $first: "$contract" },
          }),
        } },
      ],
    } },
  ]);
  const rows = queue === "restaurants" ? result.rows.map(({ restaurants, identity, receivedInvoices, contract, ...row }) => {
    const matches = identity ? restaurants.filter((restaurant) => matchesRestaurantIdentity(identity, restaurant)) : [];
    const invoice = receivedInvoices.find((item) => invoiceMatchesContract(item, contract));
    return { ...row, restaurantMatchCount: matches.length, restaurantId: matches.length === 1 ? matches[0]._id : null,
      paidAt: invoice?.setupInvoice.paidAt };
  }) : result.rows;
  res.json({ rows, total: result.count[0]?.total || 0, page, limit });
}));

router.post(`${admin}/restaurants/:id/complete`, run(async (req, res) => {
  await mongoose.connection.transaction(async (session) => {
    const sale = await Acquisition.findOne({
      ...commissionScope(req), restaurantCreatedAt: null, "commission.status": { $ne: "CANCELLED" },
      integrationFiles: { $not: { $elemMatch: { removalRequestedAt: { $type: "date" } } } },
    }).session(session);
    if (!sale) throw problem(409, "Ce dossier a déjà été traité ou annulé.");
    const at = new Date();
    const prospect = await Prospect.findOneAndUpdate({ _id: sale.prospectId, archivedAt: null, opposedAt: null },
      { $inc: { __v: 1 } }, { session, new: true });
    if (!prospect) throw problem(409, "Le dossier n’est plus disponible pour l’intégration.");
    const establishment = await Establishment.findOneAndUpdate({
      _id: sale.establishmentId, prospectId: sale.prospectId, kind: "ESTABLISHMENT",
    }, { $inc: { __v: 1 } }, { session });
    const restaurants = await currentRegistryRestaurants(establishment, prospect, session);
    if (restaurants.length !== 1) throw problem(409, "Associez un établissement existant et identifié de manière unique.");
    const invoice = await paidInvoiceForAcquisition(sale, session);
    if (!sale.integrationReviewedAt || !invoice) throw problem(409, "Confirmez le dossier d’intégration et l’encaissement de la mise en service.");
    sale.set({ restaurantCreatedAt: at, restaurantId: restaurants[0]._id });
    sale.activity.push(audit(req.user.id, "RESTAURANT_CREATED"));
    sale.revision += 1;
    await sale.save({ session });
    await archiveCompletedProspect(sale, at, session);
  });
  res.sendStatus(204);
}));

function sumAmount(match) {
  return Acquisition.aggregate([
    { $match: match },
    { $group: { _id: null, amountCents: { $sum: "$commission.amountCents" }, count: { $sum: 1 } } },
  ]).then(([row]) => ({ amountCents: row?.amountCents || 0, count: row?.count || 0 }));
}

async function salesActivity(documents, sales, range) {
  const first = DateTime.fromJSDate(range.$gte, { zone });
  const end = DateTime.fromJSDate(range.$lt, { zone });
  const unit = end.diff(first, "days").days > 42 ? "month" : "day";
  const format = unit === "month" ? "yyyy-MM" : "yyyy-MM-dd";
  const group = (Model, field, filter) => Model.aggregate([
    { $match: { ...filter, [field]: range } },
    { $group: { _id: { $dateToString: { date: `$${field}`, format: unit === "month" ? "%Y-%m" : "%Y-%m-%d", timezone: zone } }, count: { $sum: 1 } } },
  ]).then((rows) => new Map(rows.map(({ _id, count }) => [_id, count])));
  const [quotes, contracts, acquired] = await Promise.all([
    group(Document, "firstSentAt", { ...documents, ...countedQuotes }),
    group(Document, "signature.signedAt", { ...documents, type: "CONTRACT", status: "SIGNED" }),
    group(Acquisition, "signedAt", { ...sales, ...validAcquisitions }),
  ]);
  const activity = [];
  for (let cursor = first.startOf(unit); cursor < end; cursor = cursor.plus({ [unit]: 1 })) {
    const key = cursor.toFormat(format);
    activity.push({
      period: key, quotes: quotes.get(key) || 0, contracts: contracts.get(key) || 0, sales: acquired.get(key) || 0,
    });
  }
  return activity;
}

function deliveriesToReview(now) {
  return [
    { "commercialDelivery.state": "UNCERTAIN" },
    { "commercialDelivery.state": { $in: ["PREPARING", "HANDOFF"] }, "commercialDelivery.updatedAt": { $lte: new Date(now - 600000) } },
  ];
}

async function pipelineOverview(scope, documents, now, startOfToday, tomorrow) {
  const [groups, schedule, expiredContracts] = await Promise.all([
    Prospect.aggregate([
      { $match: { ...scope, archivedAt: null } },
      { $group: { _id: pipelineStage, count: { $sum: 1 } } },
    ]),
    upcomingActions(scope, now, startOfToday, tomorrow),
    Document.find({ ...documents, type: "CONTRACT", status: "SENT", "signatureRequest.status": { $in: ["PENDING", "EXPIRED"] },
      "signatureRequest.expiresAt": { $lte: now } }).select("party.restaurantName docNumber signatureRequest.expiresAt")
      .sort({ "signatureRequest.expiresAt": 1, _id: 1 }).limit(5).lean(),
  ]);
  return {
    prospectsByStage: Object.fromEntries(groups.map(({ _id, count }) => [_id, count])),
    totalProspects: groups.reduce((sum, { count }) => sum + count, 0),
    appointments: schedule.appointments,
    nextActions: { appointments: schedule.actions.appointments, followUps: schedule.actions.followUps,
      overdue: schedule.actions.overdue, dueToday: schedule.actions.dueToday, expiredContracts },
    upcomingDemos: schedule.actions.demos,
  };
}

async function metrics(req, res) {
  const owner = destination(req);
  const { from, to, range } = windowFor(req);
  const scope = owner ? { salesOwnerId: owner } : {};
  const sales = owner ? { beneficiaryId: owner } : {};
  const active = { ...scope, ...activePipeline };
  const documents = { ...(owner ? scope : { salesOwnerId: { $type: "objectId" } }), contractKind: { $ne: "AMENDMENT" } };
  const now = new Date();
  const currentDay = DateTime.fromJSDate(now, { zone }).startOf("day");
  const tomorrow = currentDay.plus({ days: 1 }).toJSDate();
  const [commercials, cohort, open, completedAppointments, demos, activity,
    converted, pending, toPay, paid, recentProspects, recentDocuments, recentEvents, pipeline, unresolvedConflicts, deliveryReviews, quoteDrafts, pendingContracts,
    invoicesSent, invoicesUnpaid] = await Promise.all([
    req.commercialAccount ? Promise.resolve(null) : Account.countDocuments({ status: "ACTIVE", ...(owner && { _id: owner }) }),
    Prospect.countDocuments({ ...scope, createdAt: range }),
    Prospect.countDocuments(active),
    Interaction.countDocuments({ ...scope, type: "APPOINTMENT", occurredAt: range }),
    Interaction.countDocuments({ ...scope, type: "DEMO", occurredAt: range }),
    salesActivity(documents, sales, range),
    Prospect.aggregate([
      { $match: { ...scope, createdAt: range } },
      { $lookup: { from: Acquisition.collection.name, localField: "_id", foreignField: "prospectId",
        pipeline: [{ $match: { signedAt: { $lt: range.$lt }, ...validAcquisitions } },
          { $project: { _id: 1 } }], as: "acquisition" } },
      { $match: { "acquisition.0": { $exists: true } } }, { $count: "count" },
    ]).then(([count]) => count?.count || 0),
    sumAmount({ ...sales, "commission.status": "WAITING_CUSTOMER_PAYMENT" }),
    sumAmount({ ...sales, "commission.status": "TO_PAY" }),
    sumAmount({ ...sales, "commission.paidAt": range }),
    Prospect.find({ ...scope, archivedAt: null }).select("restaurantName stage updatedAt").sort({ updatedAt: -1 }).limit(5).lean(),
    Document.find(documents).select("type docNumber status party.restaurantName updatedAt").sort({ updatedAt: -1 }).limit(5).lean(),
    Interaction.aggregate([
      { $match: { ...scope, state: { $in: ["COMPLETED", "CANCELLED"] } } },
      ...(req.commercialAccount ? [
        { $lookup: { from: Prospect.collection.name, localField: "prospectId", foreignField: "_id",
          pipeline: [{ $match: scope }, { $project: { _id: 1 } }], as: "prospect" } },
        { $match: { $or: [{ prospectId: null }, { "prospect.0": { $exists: true } }] } },
      ] : []),
      { $sort: { updatedAt: -1 } }, { $limit: 5 },
      { $project: { type: 1, state: 1, title: 1, startsAt: 1, updatedAt: 1 } },
    ]),
    pipelineOverview(scope, documents, now, currentDay.toJSDate(), tomorrow),
    !owner && !req.commercialAccount ? Establishment.countDocuments({ kind: "CONFLICT", decidedAt: null }) : null,
    req.commercialAccount ? null : Document.countDocuments({ ...documents, $or: deliveriesToReview(now) }),
    Document.countDocuments({ ...documents, type: "QUOTE", status: "DRAFT" }),
    Document.countDocuments({ ...documents, ...pendingCommercialSignature(now) }),
    Document.countDocuments({ ...documents, type: "INVOICE", firstSentAt: range }),
    Document.countDocuments({ ...documents, ...unpaidInvoice }),
  ]);
  res.json({
    from, to, open, completedAppointments, demos, activity,
    quotesSent: activity.reduce((count, row) => count + row.quotes, 0),
    acquired: activity.reduce((count, row) => count + row.sales, 0),
    conversion: { converted, cohort, rate: cohort ? converted / cohort : 0 },
    pending, toPay, paid, recentProspects, recentDocuments, recentEvents, quoteDrafts, pendingContracts, invoicesSent, invoicesUnpaid,
    ...(commercials !== null && { commercials, unresolvedConflicts, deliveryReviews }), ...pipeline,
  });
}

router.get(`${admin}/dashboard`, run(metrics));
router.get(`${seller}/dashboard`, run(metrics));

router.get(`${admin}/documents`, run(async (req, res) => {
  const sellerId = destination(req);
  const filter = { salesOwnerId: sellerId || { $type: "objectId" }, ...commercialDocumentStatusFilter(req.query.status) };
  if (req.query.prospectId) filter.prospectId = validId(req.query.prospectId);
  if (["QUOTE", "INVOICE", "CONTRACT"].includes(req.query.type)) filter.type = req.query.type;
  if (req.query.signature === "pending") filter.$and = [pendingCommercialSignature()];
  if (req.query.review === "delivery") filter.$or = deliveriesToReview(new Date());
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 25;
  const [documents, total] = await Promise.all([
    Document.find(filter).select("docNumber type status prospectId salesOwnerId party.restaurantName firstSentAt signature.signedAt signatureRequest.status signatureRequest.expiresAt commercialDelivery.state createdAt offerConditions.monthlyCents offerConditions.setupCents setupInvoice.paidAt setupInvoice.cancelledAt")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Document.countDocuments(filter),
  ]);
  res.json({ documents, total, limit, page });
}));

module.exports = router;
