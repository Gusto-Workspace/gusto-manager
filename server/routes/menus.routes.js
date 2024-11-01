const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const MenuModel = require("../models/menu.model");

// ADD MENU
router.post("/restaurants/:restaurantId/add-menus", async (req, res) => {
  const { restaurantId } = req.params;
  const { combinations, description, name, type, dishes } = req.body;

  try {
    // Vérifiez si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Créez et sauvegardez le nouveau menu
    const newMenu = new MenuModel({
      restaurant_id: restaurantId,
      combinations,
      description,
      name,
      type,
      dishes,
    });
    await newMenu.save();

    // Ajoutez l'ID du menu au restaurant et sauvegardez
    restaurant.menus.push(newMenu._id);
    await restaurant.save();

    // Récupérez le restaurant peuplé avec les menus après la mise à jour
    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus"); // Ceci recharge les menus complets

    res.status(201).json({
      message: "Menu added successfully",
      restaurant: updatedRestaurant, // Utilise le restaurant rechargé et peuplé
    });
  } catch (error) {
    console.error("Error adding menu:", error);
    res
      .status(500)
      .json({ message: "An error occurred while saving the menu" });
  }
});

module.exports = router;
