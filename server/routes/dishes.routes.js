const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// ADD A DISH
router.post("/restaurants/:restaurantId/dishes", async (req, res) => {
  const { restaurantId } = req.params;
  const { name, description, price, category, showOnWebsite } = req.body;

  // Validation des données
  if (!name || !price || !category) {
    return res
      .status(400)
      .json({ message: "Name, price, and category are required." });
  }

  try {
    // Vérifier si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Ajouter le nouveau plat
    const newDish = {
      name,
      description,
      price,
      category,
      showOnWebsite,
    };

    // Ajouter le plat à la liste des plats du restaurant
    restaurant.dishes.push(newDish);

    // Sauvegarder les modifications
    await restaurant.save();

    res.status(201).json({ message: "Dish added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding dish:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});


// ADD A CATEGORY
router.post("/restaurants/:restaurantId/categories", async (req, res) => {
  const { restaurantId } = req.params;
  const { name } = req.body;

  // Validation des données
  if (!name) {
    return res.status(400).json({ message: "Category name is required." });
  }

  try {
    // Vérifier si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Vérifier si la catégorie existe déjà
    const existingCategory = restaurant.dish_categories.find(
      (category) => category.name.toLowerCase() === name.toLowerCase()
    );

    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists." });
    }

    // Ajouter la nouvelle catégorie
    const newCategory = {
      name,
      dishes: [],
    };

    restaurant.dish_categories.push(newCategory);

    // Sauvegarder les modifications
    await restaurant.save();

    res.status(201).json({ message: "Category added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});



module.exports = router;
