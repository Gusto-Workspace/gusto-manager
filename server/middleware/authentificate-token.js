const jwt = require("jsonwebtoken");
const {
  accountAuditContext, isAccountSessionValid, isSuperAdminSession,
} = require("../services/shared/account-session.service");
const JWT_SECRET = process.env.JWT_SECRET;
const supportAuditAttached = Symbol("supportAuditAttached");
const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const sensitiveRead = /\/(?:reveal|export|download|backup)(?:\/|$)/;

function auditSupportRequest(req, res, user) {
  if (!isSuperAdminSession(user) || typeof res.once !== "function" || res[supportAuditAttached]) return;
  res[supportAuditAttached] = true;
  res.once("finish", () => {
    const route = req.route?.path;
    if (res.statusCode < 400 && (typeof route !== "string" || readMethods.has(req.method) && !sensitiveRead.test(route))) return;
    console.info("[support-audit]", {
      ...accountAuditContext(user),
      actor: user.id,
      method: req.method,
      route: typeof route === "string" ? route : null,
      status: res.statusCode,
    });
  });
}

async function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Token not provided" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    auditSupportRequest(req, res, user);
    const sessionIsValid = await isAccountSessionValid(user);

    if (!sessionIsValid) {
      return res.status(403).json({ message: "Session revoked" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
