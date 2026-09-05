const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");

const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");

function normalizeSessionVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

function getSessionVersion(account) {
  return normalizeSessionVersion(account?.sessionVersion);
}

function incrementSessionVersion(account) {
  account.sessionVersion = getSessionVersion(account) + 1;
  return account.sessionVersion;
}

function buildSessionVersionFilter(accountId, sessionVersion) {
  const normalizedVersion = normalizeSessionVersion(sessionVersion);
  const filter = { _id: accountId };

  if (normalizedVersion === 0) {
    filter.$or = [
      { sessionVersion: 0 },
      { sessionVersion: { $exists: false } },
    ];
  } else {
    filter.sessionVersion = normalizedVersion;
  }

  return filter;
}

function createSuperAdminSessionClaims() {
  return {
    superAdmin: true,
    authMethod: "super_admin",
    superAdminSessionId: randomUUID(),
  };
}

function isSuperAdminSession(user) {
  return user?.superAdmin === true;
}

function hasValidSuperAdminMetadata(user) {
  if (!isSuperAdminSession(user)) return true;

  return (
    user.authMethod === "super_admin" &&
    typeof user.superAdminSessionId === "string" &&
    user.superAdminSessionId.length > 0
  );
}

function canUpdateOwnerEmail(user, currentEmail, requestedEmail) {
  return !(
    isSuperAdminSession(user) &&
    requestedEmail &&
    requestedEmail !== currentEmail
  );
}

function hasMatchingSessionVersion(user, account) {
  return (
    normalizeSessionVersion(user?.sessionVersion) === getSessionVersion(account)
  );
}

function stripJwtMetadata(payload = {}) {
  const claims = { ...payload };
  delete claims.exp;
  delete claims.iat;
  delete claims.nbf;
  delete claims.jti;
  return claims;
}

function signAccountToken(payload, options = {}) {
  const claims = stripJwtMetadata(payload);
  return jwt.sign(claims, process.env.JWT_SECRET, options);
}

async function rotatePasswordSession({
  AccountModel,
  accountId,
  currentPasswordHash,
  expectedSessionVersion,
  newPassword,
}) {
  const passwordHash = await bcrypt.hash(newPassword, 13);
  const filter = {
    ...buildSessionVersionFilter(accountId, expectedSessionVersion),
    password: currentPasswordHash,
  };

  return AccountModel.findOneAndUpdate(
    filter,
    {
      $set: { password: passwordHash },
      $inc: { sessionVersion: 1 },
    },
    { new: true, runValidators: true },
  ).select("+sessionVersion");
}

async function revokeAllAccountSessions(AccountModel, accountId) {
  return AccountModel.findByIdAndUpdate(
    accountId,
    { $inc: { sessionVersion: 1 } },
    { new: true },
  ).select("+sessionVersion");
}

function validatePasswordChangeInput(currentPassword, newPassword) {
  if (
    typeof currentPassword !== "string" ||
    currentPassword.trim().length === 0
  ) {
    return {
      field: "currentPassword",
      message: "Current password is required",
    };
  }

  if (typeof newPassword !== "string" || newPassword.trim().length < 6) {
    return {
      field: "newPassword",
      message: "New password must contain at least 6 characters",
    };
  }

  return null;
}

async function isAccountSessionValid(user) {
  if (!hasValidSuperAdminMetadata(user)) return false;

  const role = String(user?.role || "").toLowerCase();
  let account = null;
  const sessionProjection = { _id: 1, sessionVersion: 1 };

  if (role === "owner") {
    account = await OwnerModel.findById(user.id)
      .select(sessionProjection)
      .lean();
  } else if (role === "employee") {
    account = await EmployeeModel.findById(user.id)
      .select(sessionProjection)
      .lean();
  } else {
    return true;
  }

  if (!account) return false;

  return hasMatchingSessionVersion(user, account);
}

async function matchesSuperAdminPassword(password) {
  const passwordHash = String(
    process.env.SUPER_ADMIN_PASSWORD_HASH || "",
  ).trim();

  if (!password || !passwordHash) return false;

  try {
    return await bcrypt.compare(String(password), passwordHash);
  } catch {
    return false;
  }
}

module.exports = {
  buildSessionVersionFilter,
  canUpdateOwnerEmail,
  createSuperAdminSessionClaims,
  getSessionVersion,
  hasMatchingSessionVersion,
  hasValidSuperAdminMetadata,
  incrementSessionVersion,
  isSuperAdminSession,
  isAccountSessionValid,
  matchesSuperAdminPassword,
  normalizeSessionVersion,
  revokeAllAccountSessions,
  rotatePasswordSession,
  signAccountToken,
  stripJwtMetadata,
  validatePasswordChangeInput,
};
