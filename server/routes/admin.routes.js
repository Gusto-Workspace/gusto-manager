const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// DASHBOARD
router.get("/admin/dashboard", authenticateToken, (req, res) => {
  res.json({ message: `Welcome to the admin dashboard, ${req.user.role}` });
});

module.exports = router;
