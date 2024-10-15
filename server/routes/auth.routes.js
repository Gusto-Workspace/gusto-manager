const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// MODELS
const AdminModel = require("../models/admin.model");
const OwnerModel = require("../models/owner.model");

const JWT_SECRET = process.env.JWT_SECRET;

// CONNEXION ADMIN
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await AdminModel.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET);

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// CONNEXION USER
router.post("/owner/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const isMatch = bcrypt.compare(password, owner.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: owner._id, role: "owner" }, JWT_SECRET);

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
