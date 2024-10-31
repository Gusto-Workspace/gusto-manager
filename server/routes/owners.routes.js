const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MODELS
const OwnerModel = require("../models/owner.model");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");
const RestaurantModel = require("../models/restaurant.model");

// GET OWNER DATA
router.get("/owner/get-data", authenticateToken, async (req, res) => {
  try {
    const owner = await OwnerModel.findById(req.user.id).select("-password");
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const restaurant = await RestaurantModel.findById(
      req.user.restaurantId
    ).populate("owner_id", "firstname");

    res.status(200).json({ owner, restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// UPDATE OWNER DATA
router.put("/owner/update-data", authenticateToken, async (req, res) => {
  const { firstname, lastname, email, phoneNumber } = req.body;

  try {
    const owner = await OwnerModel.findById(req.user.id);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    // Mise à jour des informations
    owner.firstname = firstname;
    owner.lastname = lastname;
    owner.email = email;
    owner.phoneNumber = phoneNumber;

    await owner.save();

    if (owner.stripeCustomerId) {
      // Mettre à jour le client Stripe avec les nouvelles informations du propriétaire
      try {
        await stripe.customers.update(owner.stripeCustomerId, {
          email: owner.email,
          name: `${owner.firstname} ${owner.lastname}`,
        });
      } catch (stripeError) {
        console.error(
          "Erreur lors de la mise à jour du client Stripe :",
          stripeError
        );
        return res
          .status(500)
          .json({ message: "Erreur lors de la mise à jour du client Stripe" });
      }
    }

    res.status(200).json({ message: "Owner information updated successfully" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du propriétaire :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// UPDATE OWNER PASSWORD
router.put("/owner/update-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const owner = await OwnerModel.findById(req.user.id);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    // Vérification du mot de passe actuel
    const isMatch = await owner.comparePassword(
      currentPassword,
      owner.password
    );
    if (!isMatch)
      return res.status(401).json({ message: "Incorrect current password" });

    // Mise à jour du mot de passe
    owner.password = newPassword; // Le hashing est géré dans le hook "pre('save')"
    await owner.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du mot de passe :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
