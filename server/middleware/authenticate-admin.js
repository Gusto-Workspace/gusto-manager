const authenticateToken = require("./authentificate-token");

function hasAdminBackofficeAccess(user) {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "seller";
}

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (!hasAdminBackofficeAccess(req.user)) {
      return res.status(403).json({ message: "Admin backoffice access required" });
    }

    next();
  });
}

function requireAdminRole(req, res, next) {
  if (String(req.user?.role || "").toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Admin role required" });
  }

  next();
}

module.exports = authenticateAdmin;
module.exports.requireAdminRole = requireAdminRole;
module.exports.hasAdminBackofficeAccess = hasAdminBackofficeAccess;
