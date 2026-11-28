const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { hkdfSync } = require("node:crypto");
const { DateTime } = require("luxon");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { requireSuperAdmin } = authenticateAdmin;
const { authenticateCommercial } = require("../middleware/authenticate-commercial");
const { allowPasswordAttempt } = require("../middleware/limit-login");
const Account = require("../models/commercial-account.model");
const Restaurant = require("../models/restaurant.model");
const Establishment = require("../models/commercial-establishment.model");
const Document = require("../models/document.model");
const Acquisition = require("../models/commercial-acquisition.model");
const { CommercialProspect: Prospect, CommercialInteraction: Interaction, manualStages, closedStages, legacyStages, pipelineStages, pipelineStage, eventTypes, interactionTypes, computedStage } = require("../models/commercial-prospect.model");
const { uploadPrivateFile, readPrivateFile, removePrivateFile } = require("../services/shared/private-files.service");
const { seal, unseal } = require("../services/shared/authenticated-encryption.service");
const { validateEmployeeDocumentFile, EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, getDocumentContentDisposition } = require("../services/employees/employee-documents.service");
const {
  paris, legacyDates, activeAgenda, eventChange, legacyEvent, cancelProspectEvents,
  prospectSchedule, calendarStages, hydrateEvent, visibleCalendarActions,
} = require("../services/commercial/calendar.service");
const {
  registryControlId, registryReady, conflictMessage, keysForEstablishment,
  matchingEstablishments, recordConflict, syncRestaurantEstablishment,
} = require("../services/commercial/establishments.service");

const router = express.Router();
const commercial = "/commercial/prospects";
const admin = "/admin/commerciaux/crm";
const modules = ["reservations", "gift_cards", "take_away", "employees"];
const integrationCategories = ["SITE", "RIB", "DOMAIN", "ZENChef", "SKELLO"];
const migrationModules = { zenchef: "reservations", skello: "employees" };
const integrationUpload = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, files: 1, fields: 0 },
}).single("file");
const limits = {
  restaurantName: 160, address: 250, postalCode: 12, city: 120, siret: 24,
  phone: 40, email: 254, website: 500, contactName: 160, source: 160, needs: 4000, notes: 4000,
};

router.use(commercial, authenticateCommercial);
router.use(admin, authenticateAdmin);

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function handle(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (["ValidationError", "CastError", "EmployeeDocumentValidationError"].includes(error?.name)) {
        return res.status(400).json({ message: "Informations du dossier invalides." });
      }
      const status = Number(error.status) || 500;
      if (status >= 500) console.error("[commercial-prospects]", error?.code || error?.name || "unavailable");
      return res.status(status).json({ message: status === 500 ? "Impossible de traiter le dossier." : error.message });
    }
  };
}

function validId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw problem(404, "Dossier introuvable.");
  return value;
}

function dateValue(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw problem(400, "Date invalide.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !value.includes("T") && date.toISOString().slice(0, 10) !== value) {
    throw problem(400, "Date invalide.");
  }
  return date;
}

function pickFields(body = {}) {
  const patch = {};
  for (const [field, max] of Object.entries(limits)) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== "string" || body[field].length > max) throw problem(400, "Informations du dossier invalides.");
    patch[field] = body[field].trim();
  }
  if (Object.hasOwn(patch, "siret")) {
    patch.siret = patch.siret.replace(/\s+/g, "");
    if (patch.siret && !/^\d{14}$/.test(patch.siret)) throw problem(400, "Le SIRET doit comporter 14 chiffres.");
  }
  if (Object.hasOwn(patch, "email")) {
    patch.email = patch.email.toLowerCase();
    if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) throw problem(400, "Adresse email invalide.");
  }
  if (patch.website) {
    try {
      const url = new URL(patch.website.includes("://") ? patch.website : `https://${patch.website}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new Error();
      patch.website = url.href;
    } catch {
      throw problem(400, "Adresse du site internet invalide.");
    }
  }
  if (Object.hasOwn(body, "modules")) {
    if (!Array.isArray(body.modules) || body.modules.some((key) => !modules.includes(key))) throw problem(400, "Module invalide.");
    patch.modules = [...new Set(body.modules)];
  }
  if (Object.hasOwn(body, "stage")) {
    if (!manualStages.includes(body.stage)) throw problem(400, "Ce statut est déterminé par les événements du dossier.");
    patch.stage = body.stage;
  }
  for (const field of ["nextFollowUpAt", "nextAppointmentAt"]) {
    if (Object.hasOwn(body, field)) patch[field] = dateValue(body[field]);
  }
  return patch;
}

function identityKeys(profile) {
  if (!profile.restaurantName || !(profile.siret || profile.address && profile.postalCode && profile.city)) {
    throw problem(400, "Renseignez le nom et l’adresse complète, ou le nom et le SIRET.");
  }
  return keysForEstablishment(profile);
}

function paginate(req) {
  const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  return { page, limit: 25 };
}

function prospectDto(item, isAdmin) {
  const {
    _id, restaurantName, contactName, address, postalCode, city, phone, email, website,
    siret, source, needs, notes, modules, stage, archivedAt, opposedAt, lastContactAt,
    nextFollowUpAt, nextAppointmentAt, milestones, createdAt, updatedAt, salesOwnerId, createdBy, archivePurgeAt, operationsPurgedAt,
  } = item;
  const operationalNotesVisible = !archivePurgeAt || new Date(archivePurgeAt) > new Date();
  return {
    _id, restaurantName, contactName, address, postalCode, city, phone, email, website,
    siret, source, ...(operationalNotesVisible && { needs, notes }), modules, stage: legacyStages[stage] || stage,
    effectiveStage: computedStage(item), archivedAt, archivePurgeAt, operationsPurgedAt,
    opposedAt, lastContactAt, nextFollowUpAt, nextAppointmentAt, milestones, createdAt, updatedAt,
    ...(isAdmin && { salesOwnerId, createdBy }),
  };
}

async function prospectResults(items, isAdmin) {
  const owners = isAdmin ? await Account.find({ _id: { $in: items.map((item) => item.salesOwnerId) } })
    .select("firstName lastName").lean() : [];
  const names = new Map(owners.map((owner) => [String(owner._id), `${owner.firstName} ${owner.lastName}`]));
  return (await prospectSchedule(items)).map((item) => ({
    ...prospectDto(item, isAdmin), ...(isAdmin && { salesOwnerName: names.get(String(item.salesOwnerId)) }),
  }));
}

function scopedProspect(req) {
  const salesOwnerId = req.commercialAccount?._id || (req.query.salesOwnerId && validId(req.query.salesOwnerId));
  return { _id: validId(req.params.id), ...(salesOwnerId && { salesOwnerId }) };
}

function actor(req) {
  return String(req.commercialAccount?._id || req.user.id);
}

async function integrationScope(req, { cleanup = false } = {}) {
  const prospect = await Prospect.findOne(scopedProspect(req)).select("archivedAt archivePurgeAt opposedAt").lean();
  const expired = prospect?.archivePurgeAt && prospect.archivePurgeAt <= new Date();
  if (!prospect || (!cleanup && expired) ||
    (req.commercialAccount && (prospect.opposedAt || (prospect.archivedAt && !prospect.archivePurgeAt)))) {
    throw problem(404, "Dossier introuvable.");
  }
  return { prospectId: prospect._id, ...(req.commercialAccount && { "commission.status": { $ne: "CANCELLED" } }) };
}

async function revokePendingContracts(prospectId, req, at, session) {
  await Document.updateMany({
    prospectId, type: "CONTRACT", status: "SENT", offerConditions: { $exists: true },
    "signatureRequest.status": { $in: ["PENDING", "SIGNING"] },
  }, {
    $set: { "signatureRequest.status": "REVOKED", "signatureRequest.revokedAt": at, "signatureRequest.processingAt": null },
    $push: { signatureHistory: { event: "LINK_REVOKED",
      actor: req.commercialAccount ? "COMMERCIAL" : "ADMIN", actorId: actor(req), at } },
  }, { session });
}

function installIntegration(path, isAdmin) {
  const entry = `${path}/:id/integration`;
  router.get(entry, handle(async (req, res) => {
    const scope = await integrationScope(req);
    if (!(await Document.exists({ prospectId: scope.prospectId, type: "CONTRACT", status: "SIGNED",
      ...(req.commercialAccount && { salesOwnerId: req.commercialAccount._id }),
    }))) throw problem(404, "Dossier d’intégration introuvable.");
    const sale = await Acquisition.findOne(scope).select("+integrationFiles +migrationAccess").lean();
    const services = sale ? await allowedMigrations(sale.contractId) : [];
    res.json({
      available: Boolean(sale),
      reviewedAt: sale?.integrationReviewedAt, restaurantId: sale?.restaurantId,
      migration: services.map((provider) => ({ provider, stored: Boolean(sale.migrationAccess?.[provider]) })),
      files: (sale?.integrationFiles || []).filter((file) => isAdmin || !file.removalRequestedAt)
        .map(({ _id, category, filename, uploadedAt, removalRequestedAt }) => ({ _id, category, filename, uploadedAt, removalRequestedAt })),
    });
  }));
  router.post(`${entry}/access/:provider/:action`, handle(async (req, res) => {
    const { provider, action } = req.params;
    if (!Object.hasOwn(migrationModules, provider) || !["save", "reveal", "remove"].includes(action)) {
      throw problem(404, "Accès de migration introuvable.");
    }
    if (action === "remove" && !isAdmin) throw problem(403, "Droits administrateur requis.");
    const by = actor(req);
    if (!allowPasswordAttempt(req, res, by, "commercial-migration")) return;
    const at = new Date();
    const value = req.body?.access;
    if (action === "save" && (typeof value !== "string" || !value.trim() || value.length > 2048)) {
      throw problem(400, "Renseignez un accès de migration valide.");
    }
    const result = await mongoose.connection.transaction(async (session) => {
      const prospect = await Prospect.findOneAndUpdate({
        ...scopedProspect(req),
        ...(action !== "remove" && { opposedAt: null, $or: [{ archivedAt: null }, { archivePurgeAt: { $gt: at } }] }),
      }, { $inc: { __v: 1 } }, { new: true, session, projection: "_id" });
      if (!prospect) throw problem(404, "Dossier introuvable.");
      const sale = await Acquisition.findOne({ prospectId: prospect._id,
        ...(action !== "remove" && { "commission.status": { $ne: "CANCELLED" } }),
        ...(action === "save" && { restaurantCreatedAt: null }),
      }).select("+migrationAccess").session(session).lean();
      if (!sale || (action !== "remove" && !(await allowedMigrations(sale.contractId, session)).includes(provider))) {
        throw problem(404, "Accès de migration introuvable.");
      }
      const encrypted = sale.migrationAccess?.[provider];
      if (action === "reveal" && !encrypted) throw problem(404, "Accès de migration introuvable.");
      const field = `migrationAccess.${provider}`;
      const context = Buffer.from(`commercial-migration:v1:${prospect._id}:${provider}`);
      const revealed = action === "reveal" ? unseal(encrypted, migrationKey(), context) : null;
      await Acquisition.updateOne({ _id: sale._id }, {
        ...(action === "save" && { $set: { [field]: seal(value, migrationKey(), context) } }),
        ...(action === "remove" && { $unset: { [field]: 1 } }),
        $push: { activity: { actor: by, action: `MIGRATION_ACCESS_${action.toUpperCase()}`, at, note: provider } },
      }, { session });
      return revealed;
    });
    if (action === "reveal") return res.json({ access: result });
    res.sendStatus(204);
  }));
  router.post(`${entry}/files/:category`, (req, res, next) => integrationUpload(req, res, (error) => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Fichier invalide ou trop volumineux." });
    next();
  }), handle(async (req, res) => {
    const { category } = req.params;
    if (!integrationCategories.includes(category)) throw problem(400, "Catégorie de fichier inconnue.");
    const scope = await integrationScope(req);
    const sale = await Acquisition.findOne({ ...scope, restaurantCreatedAt: null, "commission.status": { $ne: "CANCELLED" } }).select("+integrationFiles").lean();
    if (!sale) throw problem(404, "Dossier d’intégration indisponible.");
    const provider = { ZENChef: "zenchef", SKELLO: "skello" }[category];
    if (provider && !(await allowedMigrations(sale.contractId)).includes(provider)) {
      throw problem(409, "Cette migration ne figure pas parmi les modules du contrat.");
    }
    if (sale.integrationFiles?.length >= 12) throw problem(409, "Le dossier contient déjà 12 pièces.");
    const file = validateEmployeeDocumentFile(req.file);
    if (category === "RIB" && file.format !== "pdf") throw problem(400, "Le RIB doit être un PDF.");
    const fileId = new mongoose.Types.ObjectId();
    const storage = await uploadPrivateFile(req.file.buffer, "Gusto_Workspace/commercial/integration", String(fileId), file.format);
    const uploadedAt = new Date();
    try {
      await mongoose.connection.transaction(async (session) => {
        const prospect = await Prospect.updateOne({ ...scopedProspect(req),
          ...(req.commercialAccount && { archivedAt: null, opposedAt: null }),
        }, { $set: { updatedAt: uploadedAt } }, { session });
        if (!prospect.matchedCount) throw problem(404, "Dossier introuvable.");
        const updated = await Acquisition.updateOne({ ...scope, _id: sale._id, revision: sale.revision,
          restaurantCreatedAt: null, "commission.status": { $ne: "CANCELLED" },
        }, {
          $push: {
            integrationFiles: { _id: fileId, category, filename: file.filename, mimeType: file.mimeType, storage, uploadedAt },
            activity: { actor: actor(req), action: "INTEGRATION_FILE_UPLOADED", at: uploadedAt, note: category },
          },
          $unset: { integrationReviewedAt: 1 }, $inc: { revision: 1 },
        }, { session });
        if (!updated.modifiedCount) throw problem(409, "Le dossier a changé. Actualisez la page.");
      });
    } catch (error) {
      await removePrivateFile(storage);
      throw error;
    }
    res.sendStatus(204);
  }));
  router.get(`${entry}/files/:fileId`, handle(async (req, res) => {
    const fileId = validId(req.params.fileId);
    const scope = await integrationScope(req);
    const sale = await Acquisition.findOne(scope).select("+integrationFiles").lean();
    const file = sale?.integrationFiles?.find((item) => String(item._id) === fileId);
    if (!file || file.removalRequestedAt) throw problem(404, "Pièce introuvable.");
    const stream = await readPrivateFile(file.storage, "stream");
    try {
      const currentScope = await integrationScope(req);
      if (!await Acquisition.exists({ ...currentScope, _id: sale._id,
        integrationFiles: { $elemMatch: { _id: fileId, removalRequestedAt: null } },
      })) throw problem(404, "Pièce introuvable.");
      if (isAdmin) await Acquisition.updateOne({ _id: sale._id }, {
        $push: { activity: { actor: actor(req), action: "INTEGRATION_FILE_READ", at: new Date(), note: file.category } },
      });
    } catch (error) {
      stream.destroy();
      throw error;
    }
    res.set("Content-Type", file.mimeType);
    res.set("Content-Disposition", getDocumentContentDisposition(file.filename));
    res.set("X-Content-Type-Options", "nosniff");
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }));
  if (!isAdmin) return;
  router.post(`${entry}/review`, handle(async (req, res) => {
    const scope = await integrationScope(req);
    const at = new Date();
    const sale = await Acquisition.findOneAndUpdate({
      ...scope, restaurantCreatedAt: null, "commission.status": { $ne: "CANCELLED" },
      "integrationFiles.category": { $all: ["SITE", "RIB"] },
      integrationFiles: { $not: { $elemMatch: { removalRequestedAt: { $type: "date" } } } },
    }, {
      $set: { integrationReviewedAt: at },
      $push: { activity: { actor: actor(req), action: "INTEGRATION_REVIEWED", at } },
      $inc: { revision: 1 },
    });
    if (!sale) throw problem(409, "Vérifiez les éléments du site et le RIB avant de confirmer la réception.");
    res.sendStatus(204);
  }));
  router.delete(`${entry}/files/:fileId`, handle(async (req, res) => {
    const fileId = validId(req.params.fileId);
    const scope = await integrationScope(req, { cleanup: true });
    const sale = await Acquisition.findOne(scope).select("+integrationFiles").lean();
    const file = sale?.integrationFiles?.find((item) => String(item._id) === fileId);
    if (!file) throw problem(404, "Pièce introuvable.");
    await removeIntegrationFile(sale, file, actor(req));
    res.sendStatus(204);
  }));
  router.route(`${entry}/purge`)
    .get(requireSuperAdmin, handle(async (req, res) => res.json(await purgeOperationalData(req))))
    .post(requireSuperAdmin, handle(async (req, res) => {
      if (process.env.COMMERCIAL_OPERATIONAL_PURGE_ENABLED !== "1") throw problem(409, "La purge opérationnelle est désactivée.");
      if (req.body?.confirmation !== "PURGER") throw problem(400, "Confirmation de purge requise.");
      await purgeOperationalData(req, true);
      res.sendStatus(204);
    }));
}

function migrationKey() {
  const raw = process.env.ENCRYPTION_SECRET;
  if (!raw || Buffer.byteLength(raw) < 32 || raw === process.env.COMMERCIAL_JWT_SECRET || raw === process.env.JWT_SECRET) {
    throw problem(503, "Le stockage des accès de migration est indisponible.");
  }
  return Buffer.from(hkdfSync("sha256", raw, "", "gusto-manager:commercial-migration:v1", 32));
}

async function allowedMigrations(contractId, session = null) {
  const contract = await Document.findOne({ _id: contractId, type: "CONTRACT", status: "SIGNED" })
    .select("contractSnapshot.offerConditions.selections offerConditions.selections").session(session).lean();
  const { includedModule, extraModules = [] } = contract?.contractSnapshot?.offerConditions?.selections ??
    contract?.offerConditions?.selections ?? {};
  return Object.keys(migrationModules).filter((provider) => [includedModule, ...extraModules].includes(migrationModules[provider]));
}

async function purgeOperationalData(req, execute = false) {
  const now = new Date();
  const scope = { ...scopedProspect(req), archivePurgeAt: { $lte: now } };
  const prospect = await Prospect.findOne(scope).select("operationsPurgedAt").lean();
  if (!prospect) throw problem(409, "La période de conservation opérationnelle est encore en cours.");
  const sale = await Acquisition.findOne({ prospectId: prospect._id }).select("+integrationFiles +migrationAccess").lean();
  if (!sale?.restaurantId || !sale.restaurantCreatedAt || !sale.commission?.paidAt) {
    throw problem(409, "Intégration et versement doivent être enregistrés.");
  }
  const notes = { prospectId: prospect._id, type: "NOTE", message: { $nin: ["", null] } };
  if (!execute) return {
    purgedAt: prospect.operationsPurgedAt,
    files: sale.integrationFiles?.length || 0,
    migrationAccess: Object.keys(sale.migrationAccess || {}).length,
    temporaryInteractions: await Interaction.countDocuments(notes),
  };
  if (prospect.operationsPurgedAt) return;
  for (const file of sale.integrationFiles || []) {
    const current = await Acquisition.findById(sale._id).select("+integrationFiles").lean();
    const pending = current.integrationFiles.find((entry) => entry._id.equals(file._id));
    if (pending) await removeIntegrationFile(current, pending, actor(req));
  }
  await mongoose.connection.transaction(async (session) => {
    const updated = await Prospect.updateOne({ ...scope, operationsPurgedAt: null },
      { $set: { operationsPurgedAt: now }, $unset: { needs: 1, notes: 1 } }, { session });
    if (!updated.modifiedCount) return;
    await Interaction.updateMany(notes, { $unset: { message: 1 } }, { session });
    await Acquisition.updateOne({ _id: sale._id }, { $unset: { migrationAccess: 1 },
      $push: { activity: { actor: actor(req), action: "OPERATIONAL_DATA_PURGED", at: now } } }, { session });
  });
}

async function removeIntegrationFile(sale, file, by) {
  if (!file.removalRequestedAt) {
    const marked = await Acquisition.updateOne({
      _id: sale._id, revision: sale.revision, "integrationFiles._id": file._id,
    }, {
      $set: { "integrationFiles.$.removalRequestedAt": new Date() },
      ...(!sale.restaurantCreatedAt && { $unset: { integrationReviewedAt: 1 } }),
      $inc: { revision: 1 },
    });
    if (!marked.modifiedCount) throw problem(409, "Le dossier a changé. Actualisez la page.");
  }
  if (!await removePrivateFile(file.storage)) throw problem(502, "La suppression du fichier n’a pas été confirmée. Réessayez.");
  await Acquisition.updateOne({ _id: sale._id, integrationFiles: { $elemMatch: { _id: file._id, removalRequestedAt: { $type: "date" } } } }, {
    $pull: { integrationFiles: { _id: file._id } },
    $inc: { revision: 1 },
    $push: { activity: { actor: by, action: "INTEGRATION_FILE_REMOVED", at: new Date(), note: file.category } },
  });
}
async function eligibleOwner(id, session = null) {
  const result = await Account.exists({
    _id: validId(id), status: { $in: ["ACTIVE", "INVITED"] },
  }).session(session);
  if (!result) throw problem(400, "Sélectionnez un commercial actif ou invité.");
  return result._id;
}

async function insertProspect(profile, salesOwnerId, actorId, session, allowAmbiguous = false) {
  const keys = identityKeys(profile);
  const matches = await matchingEstablishments(keys, session);
  const blocking = allowAmbiguous ? matches.filter(({ kind }) => kind !== "AMBIGUOUS") : matches;
  if (blocking.length) {
    await recordConflict(profile, blocking, actorId, session);
    return null;
  }
  const [prospect] = await Prospect.create([{ ...profile, salesOwnerId, createdBy: actorId }], { session });
  await Establishment.create([{ kind: "ESTABLISHMENT", prospectId: prospect._id, ...keys }], { session });
  return prospect;
}

function installRoutes(path) {
  router.get(path, handle(async (req, res) => {
    const isAdmin = !req.commercialAccount;
    const filter = isAdmin ? {} : { salesOwnerId: req.commercialAccount._id };
    if (isAdmin && req.query.salesOwnerId) filter.salesOwnerId = new mongoose.Types.ObjectId(validId(req.query.salesOwnerId));
    filter.archivedAt = req.query.archived === "true" ? { $type: "date" } : null;
    const query = typeof req.query.q === "string" && req.query.q.trim().slice(0, 100);
    if (query) {
      const expression = new RegExp(RegExp.escape(query), "i");
      filter.$or = ["restaurantName", "contactName", "city", "email"].map((field) => ({ [field]: expression }));
    }
    const stage = legacyStages[req.query.stage] || req.query.stage;
    if (stage && !pipelineStages.includes(stage)) throw problem(400, "Statut inconnu.");
    const { page, limit } = paginate(req);
    const sort = { updatedAt: -1, _id: -1 };
    const match = [{ $match: filter }, { $addFields: { pipelineStage } }, ...(stage ? [{ $match: { pipelineStage: stage } }] : [])];
    if (req.query.view === "pipeline") {
      const columnLimit = 10;
      const [facets] = await Prospect.aggregate([...match, { $sort: sort }, { $facet: {
        counts: [{ $group: { _id: "$pipelineStage", total: { $sum: 1 } } }],
        ...Object.fromEntries(pipelineStages.map((key) => [key, [{ $match: { pipelineStage: key } }, { $limit: columnLimit }]])),
      } }]);
      const counts = new Map(facets.counts.map(({ _id, total }) => [_id, total]));
      const cards = await prospectResults(pipelineStages.flatMap((key) => facets[key]), isAdmin);
      return res.json({ columns: pipelineStages.filter((key) => !stage || key === stage).map((key) => ({
        stage: key, total: counts.get(key) || 0, prospects: cards.filter((item) => item.effectiveStage === key),
      })), limit: columnLimit });
    }
    const pageLimit = req.query.column === "true" && stage ? 10 : limit;
    const [result] = await Prospect.aggregate([...match, { $facet: {
      items: [{ $sort: sort }, { $skip: (page - 1) * pageLimit }, { $limit: pageLimit }],
      total: [{ $count: "count" }],
    } }]);
    res.json({ prospects: await prospectResults(result.items, isAdmin), page, limit: pageLimit, total: result.total[0]?.count || 0 });
  }));

  router.post(path, handle(async (req, res) => {
    const isAdmin = !req.commercialAccount;
    if (!isAdmin && !allowPasswordAttempt(req, res, actor(req), "commercial-prospect-create")) return;
    if (!await registryReady()) return res.status(503).json({ message: "Le registre commercial est en cours de préparation." });
    const profile = pickFields(req.body);
    const salesOwnerId = isAdmin ? await eligibleOwner(req.body?.salesOwnerId) : req.commercialAccount._id;
    if (isAdmin && req.query.salesOwnerId && String(salesOwnerId) !== validId(req.query.salesOwnerId)) {
      throw problem(400, "L’attribution doit correspondre au commercial de la fiche.");
    }
    let created;
    try {
      created = await mongoose.connection.transaction((session) => insertProspect(profile, salesOwnerId, actor(req), session));
    } catch (error) {
      if (error.code !== 11000) throw error;
      const matches = await matchingEstablishments(identityKeys(profile), null);
      if (matches.length) await recordConflict(profile, matches, actor(req));
    }
    if (!created) return res.status(409).json({ message: conflictMessage });
    res.status(201).json({ prospect: (await prospectResults([created], isAdmin))[0] });
  }));

  router.get(`${path}/:id`, handle(async (req, res) => {
    const prospect = await Prospect.findOne(scopedProspect(req)).lean();
    if (!prospect) throw problem(404, "Dossier introuvable.");
    res.json({ prospect: (await prospectResults([prospect], !req.commercialAccount))[0] });
  }));

  router.patch(`${path}/:id`, handle(async (req, res) => {
    const scope = scopedProspect(req);
    const patch = pickFields(req.body);
    const identityFields = ["restaurantName", "address", "postalCode", "city", "siret", "phone", "email", "website"];
    const updatesIdentity = identityFields.some((key) => Object.hasOwn(patch, key));
    let updated;
    try {
      updated = await mongoose.connection.transaction(async (session) => {
        const current = await Prospect.findOne(scope).session(session).lean();
        if (!current) throw problem(404, "Dossier introuvable.");
        if (current.archivedAt || current.opposedAt) throw problem(409, "Ce dossier ne peut plus être modifié.");
        if (patch.stage && current.milestones?.acquiredAt && patch.stage !== (legacyStages[current.stage] || current.stage)) {
          throw problem(409, "Le statut d’un client acquis ne peut plus être modifié.");
        }
        if (patch.nextFollowUpAt && closedStages.includes(patch.stage || current.stage)) throw problem(409, "Ce dossier est clos.");
        if (patch.nextFollowUpAt && current.milestones?.acquiredAt) {
          throw problem(409, "Ce client est acquis. Le dossier n’a plus de relance de prospection à planifier.");
        }
        if (updatesIdentity) {
          const profile = { ...current, ...patch };
          const keys = identityKeys(profile);
          const identity = await Establishment.findOne({ prospectId: current._id }).session(session);
          if (!identity) throw problem(409, "L’identité du dossier est indisponible.");
          // Keep strong identifiers reserved once a contract is signed.
          if ((identity.restaurants.length && keys.certainKeys.some((key) => !identity.certainKeys?.includes(key))) ||
              (current.milestones?.contractSignedAt && identity.certainKeys?.some((key) => !keys.certainKeys.includes(key)))) {
            throw problem(409, "L’identité de cet établissement est déjà engagée par un contrat ou un restaurant.");
          }
          const matches = await matchingEstablishments(keys, session, identity._id);
          if (matches.length) {
            const proposed = Object.fromEntries(Object.keys(limits).map((key) => [key, profile[key]]));
            await recordConflict(proposed, matches, actor(req), session);
            return null;
          }
          identity.set(keys);
          await identity.save({ session });
        }
        const next = await Prospect.findOneAndUpdate(scope, { $set: patch }, { new: true, runValidators: true, session }).lean();
        if (updatesIdentity && Object.keys(patch).some((key) => identityFields.includes(key) && patch[key] !== current[key])) {
          await Interaction.create([{
            prospectId: current._id, salesOwnerId: current.salesOwnerId, actorId: actor(req), private: true,
            type: "PROFILE_UPDATED", occurredAt: new Date(),
          }], { session });
        }
        if (patch.stage && patch.stage !== (legacyStages[current.stage] || current.stage)) {
          if (closedStages.includes(patch.stage)) {
            const closing = await Prospect.findById(current._id).session(session);
            await cancelProspectEvents(closing, actor(req), session, new Date());
            await closing.save({ session });
            await revokePendingContracts(current._id, req, new Date(), session);
            next.nextFollowUpAt = closing.nextFollowUpAt;
            next.nextAppointmentAt = closing.nextAppointmentAt;
          }
          await Interaction.create([{
            prospectId: current._id, salesOwnerId: current.salesOwnerId, actorId: actor(req),
            type: "STAGE_CHANGED", previousStage: legacyStages[current.stage] || current.stage, nextStage: patch.stage,
            occurredAt: new Date(),
          }], { session });
        }
        return next;
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    if (!updated) return res.status(409).json({ message: conflictMessage });
    res.json({ prospect: (await prospectResults([updated], !req.commercialAccount))[0] });
  }));

  router.get(`${path}/:id/interactions`, handle(async (req, res) => {
    const { page, limit } = paginate(req);
    const scope = scopedProspect(req);
    const prospect = await Prospect.findOne(scope).select("archivePurgeAt").lean();
    if (!prospect) throw problem(404, "Dossier introuvable.");
    const operationalPeriodEnded = prospect.archivePurgeAt && prospect.archivePurgeAt <= new Date();
    const filter = { prospectId: prospect._id, ...(req.commercialAccount && { private: false }) };
    if (req.query.timeline !== "true") {
      const historical = { ...filter, type: { $nin: ["STAGE_CHANGED", "PROFILE_UPDATED"] }, state: { $ne: "CANCELLED" }, occurredAt: { $type: "date" } };
      const [interactions, total] = await Promise.all([
        Interaction.find(historical).select(req.commercialAccount ? "type message occurredAt" : "type message occurredAt actorId previousOwnerId salesOwnerId")
          .sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Interaction.countDocuments(historical),
      ]);
      if (!(await Prospect.exists(scope))) throw problem(404, "Dossier introuvable.");
      return res.json({
        interactions: operationalPeriodEnded
          ? interactions.map((item) => item.type === "NOTE" ? { ...item, message: "" } : item) : interactions,
        page, limit, total,
      });
    }
    const [result] = await Interaction.aggregate([
      { $match: { prospectId: prospect._id, state: { $ne: "SCHEDULED" },
        ...(req.commercialAccount && { $or: [
          { private: false }, { type: { $in: ["OPPOSITION", "ARCHIVED", "RESTORED"] } },
        ] }),
      } },
      { $project: { type: 1, title: 1, state: 1, previousStage: 1, nextStage: 1,
        occurredAt: { $ifNull: ["$occurredAt", "$cancelledAt"] },
        message: { $cond: [{ $or: [
          { $and: [Boolean(req.commercialAccount), "$private"] },
          { $and: [Boolean(operationalPeriodEnded), { $eq: ["$type", "NOTE"] }] },
        ] }, "", "$message"] },
        ...(!req.commercialAccount && { actorId: 1, previousOwnerId: 1, salesOwnerId: 1 }),
      } },
      { $unionWith: { coll: Document.collection.name, pipeline: [
        { $match: { prospectId: prospect._id, type: { $in: ["QUOTE", "INVOICE", "CONTRACT"] }, contractKind: { $ne: "AMENDMENT" },
          ...(req.commercialAccount && { salesOwnerId: req.commercialAccount._id }),
        } },
        { $project: { docNumber: 1, events: { $concatArrays: [
          [{ at: "$firstSentAt", event: { $concat: ["$type", "_SENT"] } }, { at: "$signature.signedAt", event: "CONTRACT_SIGNED" }],
          [{ at: { $cond: [{ $eq: ["$type", "INVOICE"] }, "$createdAt", null] }, event: "INVOICE_CREATED" },
            { at: "$setupInvoice.paidAt", event: "INVOICE_PAID" }, { at: "$setupInvoice.cancelledAt", event: "INVOICE_CANCELLED" }],
          { $filter: { input: { $ifNull: ["$signatureHistory", []] }, as: "entry", cond: { $in: ["$$entry.event", ["LINK_REPLACED", "LINK_REVOKED", "LINK_EXPIRED"]] } } },
          [{ at: { $cond: [{ $and: [
            { $in: ["$signatureRequest.status", ["PENDING", "EXPIRED"]] }, { $lte: ["$signatureRequest.expiresAt", new Date()] },
            { $not: [{ $in: ["LINK_EXPIRED", { $ifNull: ["$signatureHistory.event", []] }] }] },
          ] }, "$signatureRequest.expiresAt", null] }, event: "LINK_EXPIRED" }],
        ] } } },
        { $unwind: { path: "$events", includeArrayIndex: "eventIndex" } },
        { $match: { "events.at": { $type: "date" } } },
        { $project: { _id: { $concat: [{ $toString: "$_id" }, ":", { $toString: "$eventIndex" }] },
          occurredAt: "$events.at", type: "$events.event", message: "$docNumber" } },
      ] } },
      { $unionWith: { coll: Prospect.collection.name, pipeline: [
        { $match: { _id: prospect._id, "milestones.acquiredAt": { $type: "date" } } },
        { $project: { _id: { $concat: [{ $toString: "$_id" }, ":acquisition"] },
          occurredAt: "$milestones.acquiredAt", type: { $literal: "ACQUIRED" } } },
      ] } },
      { $facet: {
        items: [{ $sort: { occurredAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
      } },
    ]);
    if (!(await Prospect.exists(scope))) throw problem(404, "Dossier introuvable.");
    res.json({ interactions: result.items, page, limit, total: result.total[0]?.count || 0 });
  }));

  router.post(`${path}/:id/interactions`, handle(async (req, res) => {
    const scope = scopedProspect(req);
    const { type, message = "", occurredAt } = req.body || {};
    if (!interactionTypes.includes(type) || typeof message !== "string" || message.length > 4000) {
      throw problem(400, "Interaction invalide.");
    }
    const timestamp = dateValue(occurredAt) || new Date();
    if (timestamp.getTime() > Date.now() + 60000) throw problem(400, "Une interaction terminée ne peut pas être dans le futur.");
    await mongoose.connection.transaction(async (session) => {
      const prospect = await Prospect.findOne(scope).session(session);
      if (!prospect) throw problem(404, "Dossier introuvable.");
      if (prospect.archivedAt || prospect.opposedAt) throw problem(409, "L’interaction n’est plus autorisée.");
      await Interaction.create([{
        prospectId: prospect._id, salesOwnerId: prospect.salesOwnerId, actorId: actor(req),
        type, message: message.trim(), occurredAt: timestamp,
      }], { session });
      if (type !== "NOTE") {
        if (!prospect.firstContactAt || timestamp < prospect.firstContactAt) prospect.firstContactAt = timestamp;
        if (!prospect.lastContactAt || timestamp > prospect.lastContactAt) prospect.lastContactAt = timestamp;
      }
      prospect.updatedAt = new Date();
      await prospect.save({ session });
    });
    res.sendStatus(201);
  }));

  router.post(`${path}/:id/status`, handle(async (req, res) => {
    const scope = scopedProspect(req);
    const { action, reason = "" } = req.body || {};
    if (!["archive", "restore", "oppose"].includes(action) || typeof reason !== "string" || reason.length > 500) {
      throw problem(400, "Action invalide.");
    }
    await mongoose.connection.transaction(async (session) => {
      const prospect = await Prospect.findOne(scope).session(session);
      if (!prospect) throw problem(404, "Dossier introuvable.");
      const now = new Date();
      if (action === "oppose") {
        if (prospect.opposedAt) return;
        prospect.opposedAt = now;
        const changed = await Establishment.updateOne({ prospectId: prospect._id }, { $set: { opposedAt: now } }, { session });
        if (!changed.matchedCount) throw problem(409, "L’identité du dossier est indisponible.");
      } else {
        const archive = action === "archive";
        if (!archive && prospect.archivePurgeAt) throw problem(409, "L’archive d’une intégration terminée ne peut pas être restaurée.");
        if (Boolean(prospect.archivedAt) === archive) return;
        prospect.archivedAt = archive ? now : null;
      }
      if (action !== "restore") {
        await cancelProspectEvents(prospect, actor(req), session, now);
        await revokePendingContracts(prospect._id, req, now, session);
      }
      await prospect.save({ session });
      await Interaction.create([{
        prospectId: prospect._id, salesOwnerId: prospect.salesOwnerId, actorId: actor(req),
        type: { oppose: "OPPOSITION", archive: "ARCHIVED", restore: "RESTORED" }[action],
        message: reason.trim(), occurredAt: now, private: true,
      }], { session });
    });
    res.sendStatus(204);
  }));
}

installRoutes(commercial);
installRoutes(`${admin}/prospects`);
installIntegration(commercial, false);
installIntegration(`${admin}/prospects`, true);

function calendarOwner(req) {
  return req.commercialAccount?._id || (req.query.salesOwnerId && new mongoose.Types.ObjectId(validId(req.query.salesOwnerId)));
}

function calendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw problem(400, "Date invalide.");
  const day = DateTime.fromISO(value, { zone: paris });
  if (!day.isValid) throw problem(400, "Date invalide.");
  return day;
}

function eventProfile(body, current = {}) {
  const changes = {};
  for (const [field, limit] of Object.entries({ title: 160, location: 250, message: 4000 })) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== "string" || body[field].length > limit) throw problem(400, "Informations de l’événement invalides.");
    changes[field] = body[field].trim();
  }
  if (Object.hasOwn(body, "type")) changes.type = body.type;
  if (Object.hasOwn(body, "allDay")) changes.allDay = body.allDay;
  if (Object.hasOwn(body, "prospectId")) changes.prospectId = body.prospectId ? validId(body.prospectId) : null;
  const allDay = changes.allDay ?? current.allDay ?? false;
  if (typeof allDay !== "boolean" || !eventTypes.includes(changes.type ?? current.type)) throw problem(400, "Type ou horaire invalide.");
  if (Object.hasOwn(body, "startsAt")) {
    changes.startsAt = allDay ? calendarDay(body.startsAt).toJSDate() : dateValue(body.startsAt);
    if (!changes.startsAt) throw problem(400, "Renseignez le début de l’événement.");
  }
  if (Object.hasOwn(body, "endsAt")) {
    changes.endsAt = dateValue(body.endsAt);
    if (changes.endsAt && !allDay && !body.endsAt.includes("T")) throw problem(400, "Renseignez l’heure de fin.");
  }
  if (changes.allDay !== undefined && changes.allDay !== current.allDay && !changes.startsAt) throw problem(400, "Renseignez la date de l’événement.");
  const start = changes.startsAt ?? current.startsAt;
  const end = Object.hasOwn(changes, "endsAt") ? changes.endsAt : current.endsAt;
  if (!start || (!allDay && typeof body.startsAt === "string" && !body.startsAt.includes("T")) || (!allDay && end && end <= start)) {
    throw problem(400, "Renseignez un début et une fin postérieure au début.");
  }
  if (allDay) changes.endsAt = null;
  return changes;
}

async function updateEventProspect(id, owner, session, { completedAt, requiresProspecting } = {}) {
  if (!id) return;
  const prospect = await Prospect.findOne({ _id: id, salesOwnerId: owner }).session(session);
  if (!prospect) throw problem(404, "Prospect introuvable pour ce commercial.");
  if (prospect.archivedAt || prospect.opposedAt) throw problem(409, "Ce dossier ne peut plus être prospecté.");
  if (requiresProspecting && closedStages.includes(prospect.stage)) throw problem(409, "Ce dossier est clos.");
  if (requiresProspecting && prospect.milestones?.acquiredAt) {
    throw problem(409, "Ce client est acquis. Le dossier n’a plus de relance de prospection à planifier.");
  }
  if (completedAt) {
    if (!prospect.firstContactAt || completedAt < prospect.firstContactAt) prospect.firstContactAt = completedAt;
    if (!prospect.lastContactAt || completedAt > prospect.lastContactAt) prospect.lastContactAt = completedAt;
  }
  prospect.updatedAt = new Date();
  await prospect.save({ session });
  return prospect;
}

function calendarDto(event, isAdmin, name, prospect) {
  const { _id, type, title, startsAt, endsAt, allDay, state, message, location, occurredAt, cancelledAt, salesOwnerId, prospectId } = event;
  return { _id, type, title, startsAt, endsAt, allDay, state, message, location, occurredAt, cancelledAt, prospectId,
    prospectName: prospect?.restaurantName, ...(isAdmin && { salesOwnerId, salesOwnerName: name }) };
}

function installCalendar(path) {
  router.get(path, handle(async (req, res) => {
    const owner = calendarOwner(req);
    const isAdmin = !req.commercialAccount;
    const scope = owner ? { salesOwnerId: owner } : {};
    const prospectId = req.query.prospectId && new mongoose.Types.ObjectId(validId(req.query.prospectId));
    if (prospectId && !(await Prospect.exists({ ...scope, _id: prospectId }))) throw problem(404, "Dossier introuvable.");
    const openOnly = Boolean(prospectId && req.query.upcoming === "true");
    let range = {};
    if (!openOnly) {
      const from = calendarDay(req.query.from);
      const to = calendarDay(req.query.to);
      const days = to.diff(from, "days").days;
      if (days <= 0 || days > 62) throw problem(400, "La période du calendrier est invalide.");
      range = { $gte: from.toJSDate(), $lt: to.toJSDate() };
    }
    const { type } = req.query;
    if (type && !eventTypes.includes(type)) throw problem(400, "Type d’événement inconnu.");
    const max = openOnly ? 50 : 1000;
    const rows = await Interaction.aggregate([
      ...calendarStages(scope, type ? [type] : eventTypes, range, openOnly, prospectId),
      { $lookup: { from: Prospect.collection.name, localField: "prospectId", foreignField: "_id",
        pipeline: [
          ...(!isAdmin ? [{ $match: { salesOwnerId: owner } }] : []),
          { $project: { restaurantName: 1, salesOwnerId: 1, "milestones.acquiredAt": 1 } },
        ], as: "prospect" } },
      ...(!isAdmin ? [{ $match: { $or: [{ prospectId: null }, { "prospect.0": { $exists: true } }] } }] : []),
      { $match: visibleCalendarActions },
      { $sort: { startsAt: 1, _id: 1 } }, { $limit: max + 1 },
      { $project: { eventChanges: 0, actorId: 0 } },
    ]);
    const names = isAdmin ? new Map((await Account.find({ _id: { $in: rows.map((row) => row.salesOwnerId) } })
      .select("firstName lastName").lean()).map((account) => [String(account._id), `${account.firstName} ${account.lastName}`])) : new Map();
    res.json({ events: rows.slice(0, max).map((row) => calendarDto(hydrateEvent(row), isAdmin, names.get(String(row.salesOwnerId)), row.prospect[0])),
      truncated: rows.length > max });
  }));

  router.post(path, handle(async (req, res) => {
    const body = req.body || {};
    const scope = calendarOwner(req);
    if (Object.hasOwn(body, "state") || Object.hasOwn(body, "occurredAt") || Object.hasOwn(body, "action")) {
      throw problem(400, "Un nouvel événement est d’abord planifié.");
    }
    if (Object.hasOwn(body, "salesOwnerId") && (req.commercialAccount || scope && String(scope) !== body.salesOwnerId)) {
      throw problem(400, "Le commercial doit correspondre au calendrier.");
    }
    const profile = eventProfile(body);
    if (!profile.title) throw problem(400, "Renseignez l’intitulé de l’événement.");
    const event = await mongoose.connection.transaction(async (session) => {
      const salesOwnerId = req.commercialAccount ? scope : await eligibleOwner(scope || body.salesOwnerId, session);
      await updateEventProspect(profile.prospectId, salesOwnerId, session, { requiresProspecting: profile.type === "FOLLOW_UP" });
      const actorId = actor(req);
      const [created] = await Interaction.create([{ ...profile, salesOwnerId, actorId, state: "SCHEDULED",
        eventChanges: [eventChange(actorId, "CREATED")],
      }], { session });
      return created;
    });
    res.status(201).json({ event: calendarDto(event, !req.commercialAccount) });
  }));

  router.patch(`${path}/:id`, handle(async (req, res) => {
    const body = req.body || {};
    if (Object.hasOwn(body, "salesOwnerId") || Object.hasOwn(body, "state") || Object.hasOwn(body, "occurredAt")) {
      throw problem(400, "Le propriétaire et la réalisation sont déterminés par le dossier.");
    }
    const { action = "edit" } = body;
    if (!["edit", "complete", "cancel"].includes(action)) throw problem(400, "Action invalide.");
    const owner = calendarOwner(req);
    const scope = owner ? { salesOwnerId: owner } : {};
    const legacy = /^legacy:([0-9a-f]{24}):(APPOINTMENT|FOLLOW_UP)$/.exec(req.params.id);
    const event = await mongoose.connection.transaction(async (session) => {
      const now = new Date();
      const actorId = actor(req);
      let current;
      if (legacy) {
        const [, id, type] = legacy;
        const field = legacyDates[type];
        const prospect = await Prospect.findOne({ _id: id, ...scope, ...activeAgenda, [field]: { $type: "date" } }).session(session);
        if (!prospect) throw problem(404, "Événement introuvable.");
        const { _id, ...profile } = legacyEvent(prospect, type);
        current = new Interaction({ ...profile, actorId, eventChanges: [eventChange(actorId, "RETAINED", now)] });
        prospect.set(field, null);
        await prospect.save({ session });
      } else {
        current = await Interaction.findOne({ _id: validId(req.params.id), ...scope, startsAt: { $type: "date" } }).session(session);
        if (!current) throw problem(404, "Événement introuvable.");
      }
      if (current.state !== "SCHEDULED") throw problem(409, "Cet événement est déjà terminé ou annulé.");
      const completedAt = action === "complete" ? now : undefined;
      if (completedAt && current.startsAt > completedAt) throw problem(400, "Cet événement n’a pas encore commencé.");
      const patch = action === "edit" ? eventProfile(body, current) : {};
      const moved = Object.hasOwn(patch, "prospectId") && String(patch.prospectId) !== String(current.prospectId);
      const followUp = (patch.type || current.type) === "FOLLOW_UP";
      await updateEventProspect(current.prospectId, current.salesOwnerId, session, {
        completedAt, requiresProspecting: action !== "cancel" && !moved && followUp,
      });
      if (action === "edit") {
        if (patch.title === "") throw problem(400, "Renseignez l’intitulé de l’événement.");
        if (moved) {
          await updateEventProspect(patch.prospectId, current.salesOwnerId, session, { requiresProspecting: followUp });
        }
        current.set(patch);
      }
      if (completedAt) current.set({ state: "COMPLETED", occurredAt: completedAt });
      if (action === "cancel") current.set({ state: "CANCELLED", cancelledAt: now });
      current.eventChanges.push(eventChange(actorId, { edit: "EDITED", complete: "COMPLETED", cancel: "CANCELLED" }[action], now));
      await current.save({ session });
      return current;
    });
    res.json({ event: calendarDto(event, !req.commercialAccount) });
  }));
}

router.use("/commercial/calendar", authenticateCommercial);
installCalendar("/commercial/calendar");
installCalendar(`${admin}/calendar`);

router.post(`${admin}/prospects/:id/reassign`, handle(async (req, res) => {
  const scope = scopedProspect(req);
  const { salesOwnerId, reason } = req.body || {};
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) throw problem(400, "Motif de réattribution requis.");
  await mongoose.connection.transaction(async (session) => {
    const current = await Prospect.findOne(scope).session(session);
    if (!current) throw problem(404, "Dossier introuvable.");
    const nextOwner = await eligibleOwner(salesOwnerId, session);
    const previousOwnerId = current.salesOwnerId;
    if (String(previousOwnerId) === String(nextOwner)) return;
    current.salesOwnerId = nextOwner;
    await current.save({ session });
    await Document.updateMany({ prospectId: current._id, salesOwnerId: previousOwnerId }, {
      $set: { salesOwnerId: nextOwner },
    }, { session });
    await Interaction.updateMany({ prospectId: current._id, salesOwnerId: previousOwnerId, state: "SCHEDULED" }, {
      $set: { salesOwnerId: nextOwner },
      $push: { eventChanges: eventChange(actor(req), "REASSIGNED") },
    }, { session });
    await Interaction.create([{
      prospectId: current._id, salesOwnerId: nextOwner, actorId: actor(req), type: "ASSIGNMENT",
      message: reason.trim(), occurredAt: new Date(), private: true, previousOwnerId,
    }], { session });
  });
  res.sendStatus(204);
}));

router.get(`${admin}/conflicts`, handle(async (req, res) => {
  const { page, limit } = paginate(req);
  const filter = { kind: "CONFLICT", decidedAt: null };
  const [conflicts, total] = await Promise.all([
    Establishment.find(filter).select("proposed conflictKind createdAt").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Establishment.countDocuments(filter),
  ]);
  res.json({ conflicts, page, limit, total });
}));

router.post(`${admin}/conflicts/:id/resolve`, handle(async (req, res) => {
  const { decision, reason, salesOwnerId } = req.body || {};
  if (!["DISTINCT", "REJECTED"].includes(decision) || typeof reason !== "string" || !reason.trim() || reason.length > 500) {
    throw problem(400, "Décision et motif requis.");
  }
  await mongoose.connection.transaction(async (session) => {
    const conflict = await Establishment.findOne({ _id: validId(req.params.id), kind: "CONFLICT", decidedAt: null }).session(session);
    if (!conflict) throw problem(404, "Conflit introuvable ou déjà traité.");
    if (decision === "DISTINCT") {
      const selectedOwner = await eligibleOwner(salesOwnerId, session);
      // Conflict data was validated on entry, including future scheduling dates.
      const { requestedBy, ...profile } = conflict.proposed;
      const inserted = await insertProspect(profile, selectedOwner, actor(req), session, true);
      if (!inserted) throw problem(409, "Une identité certaine ou une opposition empêche cette création.");
    }
    conflict.set({ decision, decisionReason: reason.trim(), decidedAt: new Date(), decidedBy: actor(req) });
    await conflict.save({ session });
  });
  res.sendStatus(204);
}));

router.get(`${admin}/registry`, handle(async (_req, res) => res.json({ ready: await registryReady() })));

router.post(`${admin}/registry/initialize`, requireSuperAdmin, handle(async (_req, res) => {
  if (await registryReady()) return res.json({ ready: true });
  const fields = "name address phone email website";
  for await (const restaurant of Restaurant.find().select(fields).lean().cursor()) {
    await mongoose.connection.transaction((session) => syncRestaurantEstablishment(restaurant, session));
  }
  await Establishment.updateOne({ _id: registryControlId }, {
    $setOnInsert: { kind: "CONTROL", readyAt: new Date() },
  }, { upsert: true });
  return res.json({ ready: true });
}));

module.exports = router;
