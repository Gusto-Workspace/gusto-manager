const express = require("express");
const router = express.Router();

// MODELS
const OwnerModel = require("../models/owner.model");

// OWNERS LIST
router.get("/admin/owners", async (req, res) => {
  try {
    const owners = await OwnerModel.find({}, "firstname lastname email _id");

    res.status(200).json({ owners });
  } catch (error) {
    console.error("Erreur lors de la récupération des propriétaires:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
