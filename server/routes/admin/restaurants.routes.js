const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../../models/restaurant.model");
const OwnerModel = require("../../models/owner.model");

// CRYPTO
const {
  encryptApiKey,
  decryptApiKey,
} = require("../../services/encryption.service");

// GET STRIPE KEY FOR A SPECIFIC RESTAURANT
router.get("/admin/restaurants/:id/stripe-key", async (req, res) => {
  const restaurantId = req.params.id;

  try {
    // Rechercher le restaurant par ID
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant introuvable" });
    }

    // Vérifier si la clé existe
    if (!restaurant.stripeSecretKey) {
      return res.status(200).json({ stripeKey: null });
    }

    // Déchiffrer la clé Stripe
    const decryptedKey = decryptApiKey(restaurant.stripeSecretKey);

    // Retourner la clé déchiffrée
    res.status(200).json({ stripeKey: decryptedKey });
  } catch (error) {
    console.error("Erreur lors de la récupération de la clé Stripe :", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET ALL RESTAURANTS
router.get("/admin/restaurants", authenticateToken, async (req, res) => {
  try {
    const restaurants = await RestaurantModel.find().populate(
      "owner_id",
      "firstname lastname phoneNumber email"
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// ADD RESTAURANT
router.post("/admin/add-restaurant", async (req, res) => {
  const { restaurantData, ownerData, existingOwnerId, stripeSecretKey } =
    req.body;

  try {
    let owner;

    if (existingOwnerId) {
      owner = await OwnerModel.findById(existingOwnerId);
      if (!owner) {
        return res.status(404).json({ message: "Propriétaire non trouvé" });
      }
    } else {
      owner = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        email: ownerData.email,
        password: ownerData.password,
        phoneNumber: ownerData.phoneNumber,
      });

      await owner.save();

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

    let encryptedKey = null;

    // Si une clé Stripe est fournie, validez et chiffrez-la
    if (stripeSecretKey) {
      try {
        const stripeInstance = require("stripe")(stripeSecretKey);
        await stripeInstance.balance.retrieve(); // Valide la clé Stripe
        encryptedKey = encryptApiKey(stripeSecretKey); // Chiffrez la clé Stripe
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Clé Stripe invalide. Veuillez vérifier." });
      }
    }
    // Créer le restaurant avec l'adresse sous forme d'objet
    const newRestaurant = new RestaurantModel({
      name: restaurantData.name,
      address: {
        line1: restaurantData.address.line1,
        zipCode: restaurantData.address.zipCode,
        city: restaurantData.address.city,
        country: restaurantData.address.country || "France",
      },
      phone: restaurantData.phone,
      email: restaurantData.email,
      website: restaurantData.website,
      stripeSecretKey: encryptedKey,
      owner_id: owner._id,
      opening_hours: restaurantData.opening_hours,
      options: {
        gift_card: restaurantData.options?.gift_card || false,
        reservations: restaurantData.options?.reservations || false,
        take_away: restaurantData.options?.take_away || false,
      },
      menus: [],
      dishes: [],
      drinks: [],
      news: [],
    });

    await newRestaurant.save();

    owner.restaurants.push(newRestaurant._id);
    await owner.save();

    const populatedRestaurant = await RestaurantModel.findById(
      newRestaurant._id
    ).populate("owner_id", "firstname lastname email");

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
  const { restaurantData, ownerData, existingOwnerId, stripeSecretKey } =
    req.body;

  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant non trouvé" });
    }

    let previousOwner = null;
    let newOwner = null;

    if (
      existingOwnerId &&
      existingOwnerId !== restaurant.owner_id?.toString()
    ) {
      newOwner = await OwnerModel.findById(existingOwnerId);
      if (!newOwner) {
        return res
          .status(404)
          .json({ message: "Nouveau propriétaire non trouvé" });
      }

      if (restaurant.owner_id) {
        previousOwner = await OwnerModel.findById(restaurant.owner_id);
        if (previousOwner) {
          previousOwner.restaurants = previousOwner.restaurants.filter(
            (restaurantId) =>
              restaurantId.toString() !== restaurant._id.toString()
          );
          await previousOwner.save();
        }
      }
      newOwner.restaurants.push(restaurant._id);
      await newOwner.save();

      restaurant.owner_id = newOwner._id;
    } else if (!existingOwnerId && ownerData && ownerData.firstname) {
      if (restaurant.owner_id) {
        previousOwner = await OwnerModel.findById(restaurant.owner_id);
      }

      const newOwnerData = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        email: ownerData.email,
        password: ownerData.password,
        phoneNumber: ownerData.phoneNumber,
      });

      await newOwnerData.save();

      const customer = await stripe.customers.create({
        email: newOwnerData.email,
        name: `${newOwnerData.firstname} ${newOwnerData.lastname}`,
        metadata: {
          owner_id: newOwnerData._id.toString(),
        },
      });

      newOwnerData.stripeCustomerId = customer.id;
      await newOwnerData.save();

      if (previousOwner) {
        previousOwner.restaurants = previousOwner.restaurants.filter(
          (restaurantId) =>
            restaurantId.toString() !== restaurant._id.toString()
        );
        await previousOwner.save();
      }

      restaurant.owner_id = newOwnerData._id;
      newOwnerData.restaurants.push(restaurant._id);
      await newOwnerData.save();
    }

    // Mise à jour des informations du restaurant
    restaurant.name = restaurantData.name;
    restaurant.address = {
      line1: restaurantData.address.line1,
      zipCode: restaurantData.address.zipCode,
      city: restaurantData.address.city,
      country: restaurantData.address.country || "France",
    };
    restaurant.phone = restaurantData.phone;
    restaurant.email = restaurantData.email;
    restaurant.website = restaurantData.website;
    restaurant.options = {
      gift_card: restaurantData.options?.gift_card || false,
      reservations: restaurantData.options?.reservations || false,
      take_away: restaurantData.options?.take_away || false,
    };

    // Gestion de la clé Stripe
    if (stripeSecretKey === null || stripeSecretKey === "") {
      // Supprime la clé Stripe si elle est vide ou null
      restaurant.stripeSecretKey = null;
    } else if (stripeSecretKey) {
      try {
        const stripeInstance = require("stripe")(stripeSecretKey);
        await stripeInstance.balance.retrieve(); // Valide la clé Stripe

        const encryptedKey = encryptApiKey(stripeSecretKey);
        restaurant.stripeSecretKey = encryptedKey;
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Clé Stripe invalide. Veuillez vérifier." });
      }
    }

    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(
      restaurant._id
    ).populate("owner_id", "firstname lastname email");

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
    await RestaurantModel.deleteOne({ _id: restaurant._id });

    res.status(200).json({ message: "Restaurant supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
