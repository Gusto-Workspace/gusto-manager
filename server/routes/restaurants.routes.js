const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const OwnerModel = require("../models/owner.model");

// GET ALL RESTAURANTS
router.get("/admin/restaurants", authenticateToken, async (req, res) => {
  try {
    const restaurants = await RestaurantModel.find().populate(
      "owner_id",
      "username firstname lastname phoneNumber email"
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// ADD RESTAURANT
router.post("/admin/add-restaurant", async (req, res) => {
  const { restaurantData, ownerData, existingOwnerId } = req.body;

  try {
    let owner;

    if (existingOwnerId) {
      // 1. Récupérer le propriétaire existant
      owner = await OwnerModel.findById(existingOwnerId);
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
        phoneNumber: ownerData.phoneNumber,
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
    await owner.save();

    // 5. Populer les informations du propriétaire avant de renvoyer la réponse
    const populatedRestaurant = await RestaurantModel.findById(
      newRestaurant._id
    ).populate("owner_id", "firstname lastname email username");

    res.status(201).json({
      message: "Restaurant ajouté avec succès",
      restaurant: populatedRestaurant,
    });
  } catch (error) {
    console.error("Erreur lors de la création du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// UPDATE RESTAURANT
router.put("/admin/restaurants/:id", async (req, res) => {
  const { restaurantData, ownerData, existingOwnerId } = req.body;

  try {
    // Trouver le restaurant existant
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant non trouvé" });
    }

    let previousOwner = null;
    let newOwner = null;

    // Si un propriétaire existant est sélectionné et qu'il est différent de l'actuel
    if (existingOwnerId && existingOwnerId !== restaurant.owner_id.toString()) {
      newOwner = await OwnerModel.findById(existingOwnerId);
      if (!newOwner) {
        return res
          .status(404)
          .json({ message: "Nouveau propriétaire non trouvé" });
      }

      // Trouver l'ancien propriétaire
      previousOwner = await OwnerModel.findById(restaurant.owner_id);

      // Retirer le restaurant de la liste des restaurants de l'ancien propriétaire
      if (previousOwner) {
        previousOwner.restaurants = previousOwner.restaurants.filter(
          (restaurantId) =>
            restaurantId.toString() !== restaurant._id.toString()
        );
        await previousOwner.save();
      }

      // Ajouter le restaurant dans la liste du nouveau propriétaire
      newOwner.restaurants.push(restaurant._id);
      await newOwner.save();

      // Mettre à jour le propriétaire dans le restaurant
      restaurant.owner_id = newOwner._id;
    } else if (!existingOwnerId && ownerData && ownerData.firstname) {
      // Si on crée un nouveau propriétaire

      previousOwner = await OwnerModel.findById(restaurant.owner_id);

      const newOwnerData = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        username: ownerData.username,
        email: ownerData.email,
        password: ownerData.password,
        phoneNumber: ownerData.phoneNumber,
      });

      await newOwnerData.save();

      // Créer un client Stripe pour le nouveau propriétaire
      const customer = await stripe.customers.create({
        email: newOwnerData.email,
        name: `${newOwnerData.firstname} ${newOwnerData.lastname}`,
        metadata: {
          owner_id: newOwnerData._id.toString(),
        },
      });

      newOwnerData.stripeCustomerId = customer.id;
      await newOwnerData.save();

      // Supprimer le restaurant de l'ancien propriétaire
      if (previousOwner) {
        previousOwner.restaurants = previousOwner.restaurants.filter(
          (restaurantId) =>
            restaurantId.toString() !== restaurant._id.toString()
        );
        await previousOwner.save();
      }

      // Mettre à jour le restaurant pour qu'il appartienne au nouveau propriétaire
      restaurant.owner_id = newOwnerData._id;
      newOwnerData.restaurants.push(restaurant._id);
      await newOwnerData.save();
    }

    // Mettre à jour les informations du restaurant (si modifiées)
    restaurant.name = restaurantData.name;
    restaurant.address = restaurantData.address;
    restaurant.phone = restaurantData.phone;
    restaurant.website = restaurantData.website;

    // Sauvegarder les modifications du restaurant
    await restaurant.save();

    // Populer les informations du propriétaire avant de renvoyer la réponse
    const updatedRestaurant = await RestaurantModel.findById(
      restaurant._id
    ).populate("owner_id", "firstname lastname email username");

    res.status(200).json({
      message: "Restaurant mis à jour avec succès",
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// DELETE RESTAURANT
router.delete("/admin/restaurants/:id", async (req, res) => {
  try {
    // Trouver le restaurant à supprimer
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant non trouvé" });
    }

    // Trouver le propriétaire du restaurant
    const owner = await OwnerModel.findById(restaurant.owner_id);
    if (owner) {
      // Retirer le restaurant de la liste des restaurants du propriétaire
      owner.restaurants = owner.restaurants.filter(
        (restaurantId) => restaurantId.toString() !== restaurant._id.toString()
      );
      await owner.save();
    }

    // Supprimer le restaurant
    await RestaurantModel.deleteOne({ _id: restaurant._id }); // Utilisation de deleteOne() à la place de remove()

    res.status(200).json({ message: "Restaurant supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
