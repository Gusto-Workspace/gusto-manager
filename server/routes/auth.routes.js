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

    const isMatch = await bcrypt.compare(password, admin.password);
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
    const owner = await OwnerModel.findOne({ email }).populate(
      "restaurants",
      "name _id"
    );
    if (!owner) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    const isMatch = await bcrypt.compare(password, owner.password);
    if (!isMatch) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    const token = jwt.sign(
      {
        id: owner._id,
        role: "owner",
        stripeCustomerId: owner.stripeCustomerId,
      },
      JWT_SECRET
    );

    res.json({ token, owner });
  } catch (err) {
    res.status(500).json({ message: "errors.server" });
  }
});

// Generate a new token after selecting a restaurant
router.post("/owner/select-restaurant", async (req, res) => {
  const { token, restaurantId } = req.body;

  try {
    // Decode the existing token to get owner info
    const decoded = jwt.verify(token, JWT_SECRET);

    // Create a new token with the restaurant ID included
    const newToken = jwt.sign(
      {
        id: decoded.id,
        role: "owner",
        stripeCustomerId: decoded.stripeCustomerId,
        restaurantId,
      },
      JWT_SECRET
    );

    res.json({ token: newToken });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
