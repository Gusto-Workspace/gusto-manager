const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// Fonction pour mettre à jour le statut des cartes cadeaux expirées
async function updateExpiredStatus(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId);
  const now = new Date();

  restaurant.gifts.forEach((gift) => {
    gift.purchases.forEach((purchase) => {
      if (purchase.status === "Valid" && purchase.validUntil < now) {
        purchase.status = "Expired";
      }
    });
  });

  await restaurant.save();
}

// GET ALL OWNER RESTAURANTS
router.get("/owner/restaurants", async (req, res) => {
  const ownerId = req.query.ownerId;

  try {
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "name _id"
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// CHANGE RESTAURANT SELECTED
router.post("/owner/change-restaurant", authenticateToken, (req, res) => {
  const { restaurantId } = req.body;

  const decodedToken = req.user;

  const updatedToken = jwt.sign({ ...decodedToken, restaurantId }, JWT_SECRET);

  res.status(200).json({ token: updatedToken });
});

// GET RESTAURANT DETAILS
router.get("/owner/restaurants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Met à jour les statuts des cartes expirées avant de récupérer les données

    await updateExpiredStatus(id);

    const restaurant = await RestaurantModel.findById(id).populate(
      "owner_id",
      "firstname"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
