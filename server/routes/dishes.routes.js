const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// ADD A CATEGORY
router.post(
  "/restaurants/:restaurantId/dishes/categories",
  async (req, res) => {
    const { restaurantId } = req.params;
    const { name, description } = req.body;

    // Validation des données
    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }

    try {
      // Vérifier si le restaurant existe
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

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
        description,
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
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE A CATEGORY
router.put(
  "/restaurants/:restaurantId/dishes/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { name, description, visible } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.dish_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Mettre à jour le nom et la visibilité si fournis
      if (name !== undefined) category.name = name;
      if (description !== undefined) category.description = description;
      if (visible !== undefined) category.visible = visible;

      await restaurant.save();

      res
        .status(200)
        .json({ message: "Category updated successfully.", restaurant });
    } catch (error) {
      console.error("Error updating category:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// DELETE A CATEGORY
router.delete(
  "/restaurants/:restaurantId/dishes/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;

    try {
      const restaurant = await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        {
          $pull: { dish_categories: { _id: categoryId } },
        },
        { new: true }
      )
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      res
        .status(200)
        .json({ message: "Category deleted successfully.", restaurant });
    } catch (error) {
      console.error("Error deleting category:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

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
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

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

// UPDATE A DISH
router.put("/restaurants/:restaurantId/dishes/:dishId", async (req, res) => {
  const { restaurantId, dishId } = req.params;
  const {
    name,
    description,
    price,
    showOnWebsite,
    vegan,
    vegetarian,
    bio,
    glutenFree,
  } = req.body;

  // Validation des données
  if (!name || !price) {
    return res.status(400).json({ message: "Name and price are required." });
  }

  try {
    // Vérifier si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver le plat à mettre à jour dans toutes les catégories
    let dishFound = false;

    for (const category of restaurant.dish_categories) {
      const dish = category.dishes.id(dishId);
      if (dish) {
        // Mettre à jour les informations du plat
        dish.name = name;
        dish.description = description;
        dish.price = price;
        dish.showOnWebsite = showOnWebsite;
        dish.vegan = vegan;
        dish.vegetarian = vegetarian;
        dish.bio = bio;
        dish.glutenFree = glutenFree;

        dishFound = true;
        break; // Sortir de la boucle une fois le plat trouvé et mis à jour
      }
    }

    if (!dishFound) {
      return res.status(404).json({ message: "Dish not found." });
    }

    // Sauvegarder les modifications
    await restaurant.save();

    res.status(200).json({ message: "Dish updated successfully.", restaurant });
  } catch (error) {
    console.error("Error updating dish:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// DELETE A DISH
router.delete("/restaurants/:restaurantId/dishes/:dishId", async (req, res) => {
  const { restaurantId, dishId } = req.params;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Parcourir les catégories pour trouver le plat à supprimer
    let dishFound = false;

    for (const category of restaurant.dish_categories) {
      const dishIndex = category.dishes.findIndex(
        (dish) => dish._id.toString() === dishId
      );

      if (dishIndex > -1) {
        // Supprimer le plat trouvé avec splice
        category.dishes.splice(dishIndex, 1);
        dishFound = true;
        break;
      }
    }

    if (!dishFound) {
      return res.status(404).json({ message: "Dish not found." });
    }

    await restaurant.save();

    res.status(200).json({ message: "Dish deleted successfully.", restaurant });
  } catch (error) {
    console.error("Error deleting dish:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE CATEGORY ORDER
router.put(
  "/restaurants/:restaurantId/dishes/categories-list/order",
  async (req, res) => {
    const { restaurantId } = req.params;
    const { orderedCategoryIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Réorganiser les catégories selon l'ordre donné
      restaurant.dish_categories = orderedCategoryIds.map((categoryId) =>
        restaurant.dish_categories.find(
          (cat) => cat._id.toString() === categoryId
        )
      );

      await restaurant.save();

      res.status(200).json({
        message: "Category order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating category order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE DISH ORDER IN A CATEGORY
router.put(
  "/restaurants/:restaurantId/dishes/categories/:categoryId/dishes/order",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { orderedDishIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.dish_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Réorganiser les plats selon l'ordre fourni
      category.dishes = orderedDishIds.map((dishId) =>
        category.dishes.find((dish) => dish._id.toString() === dishId)
      );

      // Sauvegarder les modifications
      await restaurant.save();

      res.status(200).json({
        message: "Dish order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating dish order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

module.exports = router;
