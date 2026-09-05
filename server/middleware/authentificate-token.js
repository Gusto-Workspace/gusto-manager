const jwt = require("jsonwebtoken");
const {
  isAccountSessionValid,
} = require("../services/account-session.service");
const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Token not provided" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
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
