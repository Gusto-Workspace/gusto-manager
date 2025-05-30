const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// MODELS
const AdminModel = require("../models/admin.model");
const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");

// JWT
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
router.post("/user/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email }).populate(
      "restaurants",
      "name _id"
    );
    if (owner) {
      const isMatch = await bcrypt.compare(password, owner.password);
      if (!isMatch) {
        return res.status(401).json({ message: "errors.incorrect" });
      }
      const token = jwt.sign(
        {
          id: owner._id,
          firstname: owner.firstname,
          role: "owner",
          stripeCustomerId: owner.stripeCustomerId,
        },
        JWT_SECRET
      );
      return res.json({ token, owner });
    }

    const employee = await EmployeeModel.findOne({ email }).populate(
      "restaurant",
      "name _id"
    );

    if (!employee) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({ message: "errors.incorrect" });
    }
    const token = jwt.sign(
      {
        id: employee._id,
        firstname: employee.firstname,
        role: "employee",
        options: employee.options,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );
    return res.json({ token, employee });
  } catch (err) {
    res.status(500).json({ message: "errors.server" });
  }
});

// OWNER RESTAURANT SELECTION
router.post("/user/select-restaurant", async (req, res) => {
  const { token, restaurantId } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const newPayload = { ...decoded, restaurantId };
    const newToken = jwt.sign(newPayload, JWT_SECRET);
    return res.json({ token: newToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
