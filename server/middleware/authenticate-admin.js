const jwt = require("jsonwebtoken");
const { isObjectIdOrHexString } = require("mongoose");
const Admin = require("../models/admin.model");
const { getSessionVersion } = require("../services/shared/account-session.service");

const ADMIN_AUDIENCE = "gusto-manager:admin";
const ADMIN_ISSUER = "gusto-manager";

function hasAdminBackofficeAccess(user) {
  return user?.role === "admin" || user?.role === "super-admin";
}

function isActiveAdmin(account) {
  return hasAdminBackofficeAccess(account) &&
    (account.status === "ACTIVE" || account.status === undefined);
}

function signAdminToken(account) {
  return jwt.sign(
    { id: String(account._id), role: account.role, sessionVersion: getSessionVersion(account) },
    process.env.JWT_SECRET,
    { algorithm: "HS256", audience: ADMIN_AUDIENCE, issuer: ADMIN_ISSUER },
  );
}

const authorizedRequest = Symbol("adminSessionAuthorized");

async function authenticateAdmin(req, res, next) {
  if (req[authorizedRequest]) return next();
  res.set?.("Cache-Control", "private, no-store");
  const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || "")?.[1];
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"], audience: ADMIN_AUDIENCE, issuer: ADMIN_ISSUER,
    });
  } catch {
    return res.status(403).json({ message: "Invalid or expired admin session" });
  }
  if (!isObjectIdOrHexString(claims?.id) || !hasAdminBackofficeAccess(claims) ||
      !Number.isSafeInteger(claims.sessionVersion) || claims.sessionVersion < 0) {
    return res.status(403).json({ message: "Invalid or expired admin session" });
  }

  let account;
  try {
    account = await Admin.findById(claims.id).select("role status sessionVersion").lean();
  } catch {
    return res.status(503).json({ message: "Admin session verification unavailable" });
  }
  if (!isActiveAdmin(account) || account.role !== claims.role ||
      getSessionVersion(account) !== claims.sessionVersion) {
    return res.status(403).json({ message: "Admin session revoked" });
  }
  req.user = claims;
  req[authorizedRequest] = true;
  return next();
}

function requireAdminRole(req, res, next) {
  if (!hasAdminBackofficeAccess(req.user)) {
    return res.status(403).json({ message: "Admin backoffice access required" });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "super-admin") {
    return res.status(403).json({ message: "Super-admin role required" });
  }
  next();
}

module.exports = authenticateAdmin;
module.exports.requireAdminRole = requireAdminRole;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.hasAdminBackofficeAccess = hasAdminBackofficeAccess;
module.exports.isActiveAdmin = isActiveAdmin;
module.exports.signAdminToken = signAdminToken;
