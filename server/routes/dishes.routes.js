const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// ADD A DISH TO A CATEGORY
router.post("/restaurants/:restaurantId/dishes", async (req, res) => {
  const { restaurantId } = req.params;
  const { categoryId } = req.body;

  // Validation des données
  if (!req.body.name || !req.body.price || !categoryId) {
    return res
      .status(400)
      .json({ message: "Name, price, and category ID are required." });
  }

  try {
    // Vérifier si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver la catégorie à laquelle ajouter le plat
    const category = restaurant.dish_categories.id(categoryId);

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Ajouter le nouveau plat à la catégorie
    category.dishes.push(req.body);

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

    res
      .status(201)
      .json({ message: "Category added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// GET DISHES BY CATEGORY
router.get("/categories/:categoryId/dishes", async (req, res) => {
  const { categoryId } = req.params;

  try {
    // Rechercher la catégorie avec l'ID donné
    const restaurant = await RestaurantModel.findOne({
      "dish_categories._id": categoryId,
    });

    if (!restaurant) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Trouver la catégorie spécifique
    const category = restaurant.dish_categories.find(
      (cat) => cat._id.toString() === categoryId
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Retourner directement la catégorie trouvée
    res.status(200).json({ category });
  } catch (error) {
    console.error("Error fetching dishes by category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

module.exports = router;
