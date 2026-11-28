const jwt = require("jsonwebtoken");
const { isObjectIdOrHexString } = require("mongoose");
const CommercialAccount = require("../models/commercial-account.model");
const { getSessionVersion } = require("../services/shared/account-session.service");

const issuer = "gusto-manager";
const audience = "gusto-manager:commercial";
const sessionDurationSeconds = 72 * 60 * 60;

function commercialKey() {
  const key = process.env.COMMERCIAL_JWT_SECRET;
  return key && Buffer.byteLength(key) >= 32 && key !== process.env.JWT_SECRET ? key : null;
}

function signCommercialToken(account) {
  const key = commercialKey();
  if (!key) throw new Error("Commercial authentication is unavailable");
  return jwt.sign({ role: "seller", sessionVersion: getSessionVersion(account) }, key, {
    algorithm: "HS256", issuer, audience, subject: String(account._id), expiresIn: sessionDurationSeconds,
  });
}

async function authenticateCommercial(req, res, next) {
  res.set("Cache-Control", "private, no-store");
  try {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || "")?.[1];
    const claims = jwt.verify(token, commercialKey(), { issuer, audience, algorithms: ["HS256"], maxAge: sessionDurationSeconds });
    if (claims.role !== "seller" || !isObjectIdOrHexString(claims.sub) || !Number.isSafeInteger(claims.exp) ||
        !Number.isSafeInteger(claims.sessionVersion) || claims.sessionVersion < 0) {
      return res.status(401).json({ message: "Session commerciale invalide." });
    }
    const account = await CommercialAccount.findOne({
      _id: claims.sub, status: "ACTIVE", sessionVersion: claims.sessionVersion,
    }).select("+sessionVersion").lean();
    if (!account) return res.status(401).json({ message: "Session commerciale révoquée." });
    req.commercialAccount = account;
    return next();
  } catch {
    return res.status(401).json({ message: "Session commerciale invalide." });
  }
}

module.exports = { authenticateCommercial, signCommercialToken, commercialKey };
