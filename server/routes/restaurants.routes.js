const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const OwnerModel = require("../models/owner.model");

// ADD RESTAURANT
router.post("/admin/add-restaurant", async (req, res) => {
  const { restaurantData, ownerData } = req.body;

  try {
    let owner;

    if (ownerData.existingOwnerId) {
      // 1. Récupérer le propriétaire existant
      owner = await OwnerModel.findById(ownerData.existingOwnerId);
      if (!owner) {
        return res.status(404).json({ message: "Propriétaire non trouvé" });
      }
    } else {
      // 2. Créer un nouveau propriétaire
      owner = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        username: ownerData.username,
        email: ownerData.email,
        password: ownerData.password,
      });

      await owner.save();

      // Créer le client Stripe pour le nouveau propriétaire
      const customer = await stripe.customers.create({
        email: owner.email,
        name: `${owner.firstname} ${owner.lastname}`,
        metadata: {
          owner_id: owner._id.toString(),
        },
      });

      owner.stripeCustomerId = customer.id;
      await owner.save();
    }

    // 3. Créer le restaurant et lier le propriétaire
    const newRestaurant = new RestaurantModel({
      name: restaurantData.name,
      address: restaurantData.address,
      phone: restaurantData.phone,
      website: restaurantData.website,
      owner_id: owner._id,
      opening_hours: restaurantData.opening_hours,
      menus: [],
      dishes: [],
      drinks: [],
      news: [],
    });

    await newRestaurant.save();

    // 4. Mettre à jour le propriétaire pour inclure le restaurant
    owner.restaurants.push(newRestaurant._id);

    // Enregistrer les modifications du propriétaire
    await owner.save();

    res.status(201).json({
      message: "Restaurant ajouté avec succès",
      restaurant: newRestaurant,
      owner: owner,
    });
  } catch (error) {
    console.error("Erreur lors de la création du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
