const express = require("express");
const bcrypt = require("bcryptjs");
const { createHash, randomBytes } = require("node:crypto");
const { isObjectIdOrHexString } = require("mongoose");
const { DateTime } = require("luxon");
const Admin = require("../models/admin.model");
const CommercialAccount = require("../models/commercial-account.model");
const { CommercialProspect } = require("../models/commercial-prospect.model");
const Document = require("../models/document.model");
const Acquisition = require("../models/commercial-acquisition.model");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { authenticateCommercial, signCommercialToken, commercialKey } = require("../middleware/authenticate-commercial");
const limitLogin = require("../middleware/limit-login");
const { sendAccountEmail, isValidNewPassword } = require("../services/shared/account-email.service");
const { rotatePasswordSession, getSessionVersion } = require("../services/shared/account-session.service");
const { countedQuotes, validAcquisitions } = require("../services/commercial/sales.service");

const router = express.Router();
const adminPath = "/admin/commerciaux";
const credentialsError = "Identifiants non reconnus.";
const challengeError = "Lien invalide ou expiré.";
const textFields = {
  firstName: 100, lastName: 100, email: 254, phone: 40, companyName: 160,
  siret: 30, businessAddress: 400, internalNotes: 4000,
};

router.use(adminPath, authenticateAdmin);
router.use("/commercial", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

function reject(status, message) {
  return Object.assign(new Error(message), { status });
}

function handle(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ message: "Cet email commercial est déjà utilisé." });
      if (error?.name === "ValidationError") return res.status(400).json({ message: "Informations du compte invalides." });
      const status = (error.status >= 400 && error.status < 500) || error.status === 503 ? error.status : 500;
      if (status === 500) console.error("[commercial-accounts]", error?.code || error?.name || "unavailable");
      return res.status(status).json({ message: status === 500 ? "Opération impossible." : error.message });
    }
  };
}

function publicAccount(account) {
  const { _id, firstName, lastName, email, phone, companyName, siret, businessAddress, startedAt } = account;
  return { _id, firstName, lastName, email, phone, companyName, siret, businessAddress, startedAt };
}

function adminAccount(account) {
  return {
    ...publicAccount(account), status: account.status, commissionCents: account.commissionCents,
    internalNotes: account.internalNotes, activity: account.activity, createdAt: account.createdAt,
  };
}

async function monthPerformance(accounts) {
  const ids = accounts.map(({ _id }) => _id);
  if (!ids.length) return new Map();
  const now = DateTime.now().setZone("Europe/Paris");
  const period = { $gte: now.startOf("month").toJSDate(), $lt: now.startOf("day").plus({ days: 1 }).toJSDate() };
  const totals = await Promise.all([
    [CommercialProspect, "salesOwnerId", { createdAt: period }],
    [Document, "salesOwnerId", { ...countedQuotes, firstSentAt: period }],
    [Acquisition, "beneficiaryId", { ...validAcquisitions, signedAt: period }],
  ].map(([Model, owner, condition]) => Model.aggregate([
    { $match: { [owner]: { $in: ids }, ...condition } },
    { $group: { _id: `$${owner}`, count: { $sum: 1 } } },
  ]).then((rows) => new Map(rows.map((row) => [String(row._id), row.count])))));
  return new Map(ids.map((id) => {
    const key = String(id);
    return [key, { prospects: totals[0].get(key) || 0, quotesSent: totals[1].get(key) || 0, acquired: totals[2].get(key) || 0 }];
  }));
}

function readProfile(body = {}, keys = Object.keys(textFields)) {
  const profile = {};
  for (const field of keys) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== "string" || body[field].length > textFields[field]) {
      throw reject(400, "Informations du compte invalides.");
    }
    profile[field] = body[field].trim();
  }
  if ("email" in profile) {
    profile.email = profile.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw reject(400, "Adresse email invalide.");
  }
  if ("siret" in profile) profile.siret = profile.siret.replace(/\s+/g, "");
  for (const field of ["firstName", "lastName"]) {
    if (Object.hasOwn(profile, field) && !profile[field]) throw reject(400, "Nom et prénom obligatoires.");
  }
  return profile;
}

function readAdminProfile(body = {}) {
  const profile = readProfile(body);
  if (Object.hasOwn(body, "commissionCents") && body.commissionCents !== CommercialAccount.commissionAmountCents) {
    throw reject(400, "La commission des nouvelles acquisitions est fixée à 400 €.");
  }
  if (Object.hasOwn(body, "startedAt")) {
    const value = body.startedAt;
    const date = value ? new Date(value) : null;
    if (value && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date?.getTime()) || date.toISOString().slice(0, 10) !== value)) {
      throw reject(400, "Date de début invalide.");
    }
    profile.startedAt = date;
  }
  return profile;
}

function audit(action, actor) {
  return { action, actor: String(actor), at: new Date() };
}

function record(action, actor) {
  return { activity: { $each: [audit(action, actor)], $slice: -100 } };
}

function accountFilter(id) {
  if (!isObjectIdOrHexString(id)) throw reject(404, "Commercial introuvable.");
  return { _id: id };
}

async function rolloutReady() {
  if (!commercialKey()) return false;
  const [superAdmin, legacySeller] = await Promise.all([
    Admin.exists({ role: "super-admin", status: { $ne: "DISABLED" } }),
    Admin.exists({ role: "seller" }),
  ]);
  return Boolean(superAdmin && !legacySeller);
}

function accessHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function issueAccess(account, purpose, actor, revoke = false) {
  const token = randomBytes(32).toString("hex");
  const app = URL.parse(process.env.APP_URL || "");
  if (!app || !["http:", "https:"].includes(app.protocol) || app.username || app.password) {
    throw reject(503, "Configurez APP_URL pour générer le lien d’accès commercial.");
  }
  const link = new URL("/dashboard/seller/login/activation", app);
  link.hash = token;
  const result = await CommercialAccount.updateOne({
    _id: account._id, status: account.status, email: account.email, updatedAt: account.updatedAt,
  }, {
    $set: { accessChallenge: {
      hash: accessHash(token), purpose,
      expiresAt: new Date(Date.now() + (purpose === "INVITATION" ? 24 : 1) * 3600000),
    } },
    ...(revoke && { $inc: { sessionVersion: 1 } }),
    $push: record(purpose === "INVITATION" ? "INVITATION_ISSUED" : "RESET_ISSUED", actor),
  });
  if (!result.modifiedCount) throw reject(409, "Le compte a changé. Actualisez la page.");
  await sendAccountEmail({
    email: account.email,
    subject: purpose === "INVITATION" ? "Votre invitation Gusto Manager" : "Récupération de votre accès Gusto Manager",
    htmlContent: `<p><a href="${link.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Choisir mon mot de passe Gusto Manager</a></p>`,
  });
}

router.get(adminPath, handle(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const re = search && new RegExp(RegExp.escape(search), "i");
  const filter = re ? { $or: ["firstName", "lastName", "email", "companyName"].map((field) => ({ [field]: re })) } : {};
  const limit = 25;
  const selection = req.query.view === "selection";
  const rows = CommercialAccount.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
  if (selection) rows.select("firstName lastName status");
  const [items, total] = await Promise.all([
    rows.lean(),
    CommercialAccount.countDocuments(filter),
  ]);
  if (selection) {
    const performance = page === 1 && req.query.performance === "overview" ? await monthPerformance(items.slice(0, 6)) : null;
    return res.json({ accounts: items.map(({ _id, firstName, lastName, status }) => ({
      _id, firstName, lastName, status, ...(performance?.has(String(_id)) && { performance: performance.get(String(_id)) }),
    })), page, limit, total });
  }
  const performance = req.query.performance === "month" ? await monthPerformance(items) : null;
  res.json({ accounts: items.map((item) => ({ ...adminAccount(item), ...(performance && { performance: performance.get(String(item._id)) }) })), page, limit, total, invitationReady: await rolloutReady() });
}));

router.get(`${adminPath}/session`, (_req, res) => res.sendStatus(204));

router.post(adminPath, handle(async (req, res) => {
  const profile = readAdminProfile(req.body);
  const account = await CommercialAccount.create({ ...profile, activity: [audit("CREATED", req.user.id)] });
  res.status(201).json({ account: adminAccount(account) });
}));

router.get(`${adminPath}/:id`, handle(async (req, res) => {
  const account = await CommercialAccount.findOne(accountFilter(req.params.id)).select("+internalNotes +activity").lean();
  if (!account) throw reject(404, "Commercial introuvable.");
  res.json({ account: adminAccount(account), invitationReady: await rolloutReady() });
}));

router.patch(`${adminPath}/:id`, handle(async (req, res) => {
  const filter = accountFilter(req.params.id);
  const current = await CommercialAccount.findOne(filter).lean();
  if (!current) throw reject(404, "Commercial introuvable.");
  const profile = readAdminProfile(req.body);
  const emailChanged = profile.email && profile.email !== current.email;
  if (current.status === "ARCHIVED") throw reject(409, "Ce compte est archivé.");
  const account = await CommercialAccount.findOneAndUpdate({ ...filter, updatedAt: current.updatedAt }, {
    $set: { ...profile, ...(emailChanged && { status: current.status === "DISABLED" ? "DISABLED" : "INVITED" }) },
    ...(emailChanged && { $unset: { password: 1, accessChallenge: 1 }, $inc: { sessionVersion: 1 } }),
    $push: record(emailChanged ? "EMAIL_CHANGED" : "PROFILE_UPDATED", req.user.id),
  }, { new: true, runValidators: true }).select("+internalNotes +activity").lean();
  if (!account) throw reject(409, "Le compte a changé. Actualisez la page.");
  res.json({ account: adminAccount(account) });
}));

router.post(`${adminPath}/:id/status`, handle(async (req, res) => {
  const filter = accountFilter(req.params.id);
  const current = await CommercialAccount.findOne(filter).select("+password").lean();
  if (!current) throw reject(404, "Commercial introuvable.");
  const action = req.body?.action;
  const transitions = { disable: "DISABLED", archive: "ARCHIVED", activate: current.password ? "ACTIVE" : "INVITED" };
  if (current.status === "ARCHIVED" || !Object.hasOwn(transitions, action) ||
      (action === "activate" && current.status !== "DISABLED")) {
    throw reject(409, "Transition de compte indisponible.");
  }
  if (action === "activate" && !(await rolloutReady())) throw reject(409, "L’accès commercial est fermé.");
  const status = transitions[action];
  const account = await CommercialAccount.findOneAndUpdate({ ...filter, status: current.status, updatedAt: current.updatedAt }, {
    $set: { status },
    $unset: { accessChallenge: 1 },
    $inc: { sessionVersion: 1 },
    $push: record(status, req.user.id),
  }, { new: true }).select("+internalNotes +activity").lean();
  if (!account) throw reject(409, "Le compte a changé. Actualisez la page.");
  res.json({ account: adminAccount(account) });
}));

for (const [action, status, purpose] of [["invite", "INVITED", "INVITATION"], ["reset-access", "ACTIVE", "RESET"]]) {
  router.post(`${adminPath}/:id/${action}`, limitLogin, handle(async (req, res) => {
    if (!(await rolloutReady())) throw reject(409, "L’accès commercial est fermé.");
    const account = await CommercialAccount.findOne({ ...accountFilter(req.params.id), status }).lean();
    if (!account) throw reject(409, "Le compte ne permet pas cet envoi.");
    await issueAccess(account, purpose, req.user.id, purpose === "RESET");
    res.sendStatus(204);
  }));
}

router.post("/commercial/auth/login", limitLogin, handle(async (req, res) => {
  if (!(await rolloutReady())) throw reject(401, credentialsError);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const account = await CommercialAccount.findOne({ email, status: "ACTIVE" }).select("+password +sessionVersion").lean();
  if (!account?.password || typeof password !== "string" || Buffer.byteLength(password) > 72 ||
      !(await bcrypt.compare(password, account.password))) throw reject(401, credentialsError);
  res.json({ token: signCommercialToken(account), account: publicAccount(account) });
}));

router.post("/commercial/auth/recover", limitLogin, handle(async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email && await rolloutReady()) {
    const account = await CommercialAccount.findOne({ email, status: "ACTIVE" }).lean();
    if (account) {
      try {
        await issueAccess(account, "RESET", account._id);
      } catch (error) {
        console.error("[commercial-access] recovery delivery failed", error?.code || error?.name);
      }
    }
  }
  res.json({ message: "Si le compte est éligible, un lien sera envoyé." });
}));

router.post("/commercial/auth/activate", limitLogin, handle(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || !(await rolloutReady())) {
    throw reject(400, challengeError);
  }
  if (!isValidNewPassword(password)) throw reject(400, "Le mot de passe doit comporter au moins 12 caractères.");
  const filter = {
    "accessChallenge.hash": accessHash(token),
    $or: [{ status: "INVITED", "accessChallenge.purpose": "INVITATION" }, { status: "ACTIVE", "accessChallenge.purpose": "RESET" }],
  };
  const current = await CommercialAccount.findOne({ ...filter, "accessChallenge.expiresAt": { $gt: new Date() } }).select("+accessChallenge").lean();
  if (!current) throw reject(400, challengeError);
  const hashedPassword = await bcrypt.hash(password, 13);
  const result = await CommercialAccount.updateOne({
    ...filter, _id: current._id, "accessChallenge.expiresAt": { $gt: new Date() },
  }, {
    $set: { password: hashedPassword, status: "ACTIVE" },
    $unset: { accessChallenge: 1 },
    $inc: { sessionVersion: 1 },
    $push: record(current.status === "INVITED" ? "ACTIVATED" : "PASSWORD_RESET", current._id),
  });
  if (!result.modifiedCount) throw reject(400, challengeError);
  res.sendStatus(204);
}));

router.get("/commercial/me", authenticateCommercial, (req, res) => res.json({ account: publicAccount(req.commercialAccount) }));
router.post("/commercial/auth/logout", authenticateCommercial, handle(async (req, res) => {
  const account = req.commercialAccount;
  await CommercialAccount.updateOne({ _id: account._id, sessionVersion: getSessionVersion(account) },
    { $inc: { sessionVersion: 1 } });
  res.sendStatus(204);
}));
router.patch("/commercial/me", authenticateCommercial, handle(async (req, res) => {
  const profile = readProfile(req.body, ["phone", "businessAddress"]);
  const account = await CommercialAccount.findOneAndUpdate({
    _id: req.commercialAccount._id, status: "ACTIVE", sessionVersion: getSessionVersion(req.commercialAccount),
  }, { $set: profile }, { new: true, runValidators: true }).lean();
  if (!account) throw reject(401, "Session commerciale révoquée.");
  res.json({ account: publicAccount(account) });
}));

router.put("/commercial/me/password", authenticateCommercial, limitLogin, handle(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const sessionVersion = getSessionVersion(req.commercialAccount);
  const account = await CommercialAccount.findOne({
    _id: req.commercialAccount._id, status: "ACTIVE", sessionVersion,
  }).select("+password").lean();
  if (!isValidNewPassword(newPassword)) throw reject(400, "Le nouveau mot de passe doit comporter au moins 12 caractères.");
  if (typeof currentPassword !== "string" || Buffer.byteLength(currentPassword) > 72 ||
      !account?.password || !(await bcrypt.compare(currentPassword, account.password))) {
    throw reject(400, "Mot de passe actuel incorrect.");
  }
  const changed = await rotatePasswordSession({
    AccountModel: CommercialAccount, accountId: account._id, currentPasswordHash: account.password,
    expectedSessionVersion: sessionVersion, newPassword,
  });
  if (!changed) throw reject(401, "Session commerciale révoquée.");
  res.sendStatus(204);
}));

module.exports = router;
