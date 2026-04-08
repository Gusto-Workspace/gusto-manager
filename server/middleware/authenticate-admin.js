const authenticateToken = require("./authentificate-token");

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  });
}

module.exports = authenticateAdmin;
