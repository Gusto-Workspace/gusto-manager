const express = require("express");
const multer = require("multer");
const { randomUUID } = require("node:crypto");
const { isIP } = require("node:net");
const { isObjectIdOrHexString } = require("mongoose");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { authenticateCommercial } = require("../middleware/authenticate-commercial");
const Resource = require("../models/commercial-resource.model");
const { uploadPrivateFile, readPrivateFile, removePrivateFile } = require("../services/shared/private-files.service");
const {
  EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, validateEmployeeDocumentFile, getDocumentContentDisposition,
} = require("../services/employees/employee-documents.service");

const router = express.Router();
const admin = "/admin/commerciaux/library/resources";
const seller = "/commercial/resources";
const parseFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, files: 1, fields: 0 } }).single("file");

router.use(admin, authenticateAdmin);
router.use(seller, authenticateCommercial);

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function run(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (["ValidationError", "CastError", "EmployeeDocumentValidationError"].includes(error.name)) {
        return res.status(400).json({ message: "Ressource ou fichier invalide." });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[commercial-resources]", error.code || error.name || "unavailable");
      return res.status(status).json({ message: status === 500 ? "Impossible de traiter la ressource." : error.message });
    }
  };
}

function filterById(value) {
  if (!isObjectIdOrHexString(value)) throw problem(404, "Ressource introuvable.");
  return { _id: value };
}

function publishedFilter(now = new Date()) {
  return { status: "PUBLISHED", $or: [{ endsAt: null }, { endsAt: { $gt: now } }] };
}

function fieldsFrom(body = {}, kind) {
  const fields = {};
  for (const [key, limit] of Object.entries({ title: 150, category: 60, description: 700 })) {
    if (!Object.hasOwn(body, key)) continue;
    if (typeof body[key] !== "string" || body[key].length > limit) throw problem(400, "Informations de la ressource invalides.");
    fields[key] = body[key].trim();
  }
  if (Object.hasOwn(body, "order")) {
    if (!Number.isSafeInteger(body.order) || body.order < 0 || body.order > 10000) throw problem(400, "Ordre invalide.");
    fields.order = body.order;
  }
  if (Object.hasOwn(body, "endsAt")) {
    const value = body.endsAt;
    if (value != null && (typeof value !== "string" || !/T.+(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(new Date(value).getTime()))) throw problem(400, "Date de retrait invalide.");
    fields.endsAt = value ? new Date(value) : null;
  }
  if (kind === "LINK" && Object.hasOwn(body, "link")) {
    try {
      if (typeof body.link !== "string" || body.link.length > 1000) throw new Error();
      const url = new URL(body.link);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
          isIP(url.hostname) || /\.(?:local|localhost|internal)$/.test(url.hostname)) throw new Error();
      fields.link = url.href;
    } catch {
      throw problem(400, "Utilisez une adresse HTTPS externe.");
    }
  }
  return fields;
}

function dto(item, isAdmin) {
  const { _id, title, category, description, kind, link, order, fileVersion, endsAt, status } = item;
  return {
    _id, title, category, description, kind, order, fileVersion, endsAt,
    ...(kind === "LINK" && { link }),
    ...(kind === "FILE" && item.file && { filename: item.file.filename, size: item.file.size }),
    ...(isAdmin && { status, updatedAt: item.updatedAt }),
  };
}

for (const path of [admin, seller]) {
  router.get(path, run(async (req, res) => {
    const isAdmin = !req.commercialAccount;
    const filter = isAdmin ? {} : publishedFilter();
    if (isAdmin && ["DRAFT", "PUBLISHED", "WITHDRAWN", "ARCHIVED"].includes(req.query.status)) filter.status = req.query.status;
    if (typeof req.query.category === "string" && req.query.category.length <= 60) filter.category = req.query.category;
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 30;
    const [items, total] = await Promise.all([
      Resource.find(filter).select("+file").sort({ category: 1, order: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Resource.countDocuments(filter),
    ]);
    res.json({ resources: items.map((item) => dto(item, isAdmin)), page, limit, total });
  }));

  router.get(`${path}/:id/download`, run(async (req, res) => {
    const filter = { ...filterById(req.params.id), kind: "FILE", ...(req.commercialAccount && publishedFilter()) };
    const item = await Resource.findOne(filter).select("+file").lean();
    if (!item?.file?.public_id) throw problem(404, "Ressource introuvable.");
    const stream = await readPrivateFile(item.file, "stream");
    if (req.commercialAccount && !await Resource.exists({ ...filter, ...publishedFilter(), revision: item.revision })) {
      stream.destroy();
      throw problem(404, "Ressource introuvable.");
    }
    res.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": item.file.mimeType,
      "Content-Disposition": getDocumentContentDisposition(item.file.filename),
    });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }));
}

router.post(admin, run(async (req, res) => {
  const { kind } = req.body || {};
  if (!["FILE", "LINK"].includes(kind)) throw problem(400, "Type de ressource invalide.");
  const fields = fieldsFrom(req.body, kind);
  if (kind === "LINK" && !fields.link) throw problem(400, "Adresse du lien requise.");
  const item = await Resource.create({ ...fields, kind, updatedBy: req.user.id });
  res.status(201).json({ resource: dto(item, true) });
}));

router.patch(`${admin}/:id`, run(async (req, res) => {
  const filter = filterById(req.params.id);
  const current = await Resource.findOne(filter).lean();
  if (!current) throw problem(404, "Ressource introuvable.");
  const fields = fieldsFrom(req.body, current.kind);
  const item = await Resource.findOneAndUpdate({ ...filter, revision: current.revision, status: { $ne: "ARCHIVED" } }, {
    $set: { ...fields, updatedBy: req.user.id }, $inc: { revision: 1 },
  }, { new: true, runValidators: true }).select("+file").lean();
  if (!item) throw problem(409, "La ressource est archivée ou a changé.");
  res.json({ resource: dto(item, true) });
}));

router.post(`${admin}/:id/file`, (req, res, next) => {
  parseFile(req, res, (error) => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Fichier invalide ou trop volumineux." });
    next();
  });
}, run(async (req, res) => {
  const filter = { ...filterById(req.params.id), kind: "FILE", status: { $ne: "ARCHIVED" } };
  const item = await Resource.findOne(filter).select("+file").lean();
  if (!item) throw problem(404, "Ressource introuvable.");
  const validated = validateEmployeeDocumentFile(req.file);
  const storage = await uploadPrivateFile(req.file.buffer, "Gusto_Workspace/commercial/resources", randomUUID(), validated.format);
  let changed;
  try {
    changed = await Resource.findOneAndUpdate({ ...filter, revision: item.revision }, {
      $set: { file: { ...storage, filename: validated.filename, mimeType: validated.mimeType, size: validated.size }, updatedBy: req.user.id },
      $inc: { revision: 1, fileVersion: 1 },
    }, { new: true }).select("+file").lean();
    if (!changed) throw problem(409, "La ressource a changé. Actualisez la page.");
  } catch (error) {
    await removePrivateFile(storage);
    throw error;
  }
  if (item.file) await removePrivateFile(item.file);
  res.json({ resource: dto(changed, true) });
}));

router.post(`${admin}/:id/status`, run(async (req, res) => {
  const filter = filterById(req.params.id);
  const current = await Resource.findOne(filter).select("+file").lean();
  if (!current) throw problem(404, "Ressource introuvable.");
  const { action } = req.body || {};
  const now = new Date();
  const transitions = { publish: "PUBLISHED", withdraw: "WITHDRAWN", archive: "ARCHIVED" };
  if (!Object.hasOwn(transitions, action) || current.status === "ARCHIVED" ||
      (action === "withdraw" && current.status !== "PUBLISHED") ||
      (action === "publish" && (current.status === "PUBLISHED" || current.endsAt && current.endsAt <= now ||
        (current.kind === "FILE" ? !current.file?.public_id : !current.link)))) {
    throw problem(409, "La ressource n’est pas publiable ou le changement est indisponible.");
  }
  const item = await Resource.findOneAndUpdate({ ...filter, revision: current.revision }, {
    $set: { status: transitions[action], updatedBy: req.user.id, ...(action === "publish" && { publishedAt: now }) },
    $inc: { revision: 1 },
  }, { new: true }).select("+file").lean();
  if (!item) throw problem(409, "La ressource a changé. Actualisez la page.");
  res.json({ resource: dto(item, true) });
}));

module.exports = router;
