const jwt = require("jsonwebtoken");

const ACCOUNTANT_ALLOWED_ROUTES = [
  { method: "GET", pattern: /^\/accountants\/me\/?$/ },
  {
    method: "GET",
    pattern:
      /^\/restaurants\/[^/]+\/employees\/[^/]+\/documents(?:\/.+\/download)?\/?$/,
  },
  {
    method: "POST",
    pattern: /^\/restaurants\/[^/]+\/employees\/[^/]+\/documents\/?$/,
  },
  {
    method: "POST",
    pattern: /^\/restaurants\/[^/]+\/time-clock\/export\/(?:pdf|excel)\/?$/,
  },
];

function isAccountantRouteAllowed(method, path) {
  return ACCOUNTANT_ALLOWED_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path),
  );
}

function restrictAccountantAccess(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();

  const decoded = jwt.decode(token);
  if (decoded?.role !== "accountant") return next();

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }

  if (!isAccountantRouteAllowed(req.method, req.path)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
}

module.exports = {
  isAccountantRouteAllowed,
  restrictAccountantAccess,
};
