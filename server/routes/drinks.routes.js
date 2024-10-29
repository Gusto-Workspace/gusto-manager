const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// ADD A CATEGORY
router.post(
  "/restaurants/:restaurantId/drinks/categories",
  async (req, res) => {
    const { restaurantId } = req.params;
    const { name } = req.body;

    // Validation des données
    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }

    try {
      // Vérifier si le restaurant existe
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Vérifier si la catégorie existe déjà
      const existingCategory = restaurant.drink_categories.find(
        (category) => category.name.toLowerCase() === name.toLowerCase()
      );

      if (existingCategory) {
        return res.status(400).json({ message: "Category already exists." });
      }

      // Ajouter la nouvelle catégorie
      const newCategory = {
        name,
        drinks: [],
      };

      restaurant.drink_categories.push(newCategory);

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
  "/restaurants/:restaurantId/drinks/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { name, visible } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Mettre à jour le nom et la visibilité si fournis
      if (name !== undefined) category.name = name;
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
  "/restaurants/:restaurantId/drinks/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;

    try {
      const restaurant = await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        {
          $pull: { drink_categories: { _id: categoryId } },
        },
        { new: true }
      ).populate("owner_id", "firstname");

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

// ADD A DRINK TO A CATEGORY
router.post("/restaurants/:restaurantId/drinks", async (req, res) => {
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
    const restaurant = await RestaurantModel.findById(restaurantId).populate(
      "owner_id",
      "firstname"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver la catégorie à laquelle ajouter la boisson
    const category = restaurant.drink_categories.id(categoryId);

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Ajouter la nouvelle boisson à la catégorie
    category.drinks.push(req.body);

    // Sauvegarder les modifications
    await restaurant.save();

    res.status(201).json({ message: "Drink added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding drink:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE A DRINK IN CATEGORY
router.put("/restaurants/:restaurantId/drinks/:drinkId", async (req, res) => {
  const { restaurantId, drinkId } = req.params;
  const { name, description, price, showOnWebsite, bio } = req.body;

  // Validation des données
  if (!name || !price) {
    return res.status(400).json({ message: "Name and price are required." });
  }

  try {
    // Vérifier si le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId).populate(
      "owner_id",
      "firstname"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver le plat à mettre à jour dans toutes les catégories
    let drinkFound = false;

    for (const category of restaurant.drink_categories) {
      const drink = category.drinks.id(drinkId);
      if (drink) {
        // Mettre à jour les informations du plat
        drink.name = name;
        drink.description = description;
        drink.price = price;
        drink.showOnWebsite = showOnWebsite;
        drink.bio = bio;

        drinkFound = true;
        break; // Sortir de la boucle une fois la boisson trouvée et mis à jour
      }
    }

    if (!drinkFound) {
      return res.status(404).json({ message: "Drink not found." });
    }

    // Sauvegarder les modifications
    await restaurant.save();

    res
      .status(200)
      .json({ message: "Drink updated successfully.", restaurant });
  } catch (error) {
    console.error("Error updating drink:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// GET DRINKS BY CATEGORY
router.get("/categories/:categoryId/drinks", async (req, res) => {
  const { categoryId } = req.params;

  try {
    // Rechercher la catégorie avec l'ID donné
    const restaurant = await RestaurantModel.findOne({
      "drink_categories._id": categoryId,
    });

    if (!restaurant) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Trouver la catégorie spécifique
    const category = restaurant.drink_categories.find(
      (cat) => cat._id.toString() === categoryId
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Retourner directement la catégorie trouvée
    res.status(200).json({ category });
  } catch (error) {
    console.error("Error fetching drinks by category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// GET DRINKS BY SUBCATEGORY
router.get(
  "/categories/:categoryId/subcategories/:subCategoryId/drinks",
  async (req, res) => {
    const { categoryId, subCategoryId } = req.params;

    try {
      // Rechercher le restaurant qui contient la catégorie avec l'ID donné
      const restaurant = await RestaurantModel.findOne({
        "drink_categories._id": categoryId,
      });

      if (!restaurant) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Trouver la catégorie spécifique
      const category = restaurant.drink_categories.find(
        (cat) => cat._id.toString() === categoryId
      );

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Trouver la sous-catégorie spécifique
      const subCategory = category.subCategories.find(
        (subCat) => subCat._id.toString() === subCategoryId
      );

      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      // Retourner la categorie et sous-catégorie trouvées

      res.status(200).json({ category, subCategory });
    } catch (error) {
      console.error("Error fetching drinks by subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// DELETE A DRINK
router.delete(
  "/restaurants/:restaurantId/drinks/:drinkId",
  async (req, res) => {
    const { restaurantId, drinkId } = req.params;
    const { categoryId, subCategoryId } = req.query;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      let drinkFound = false;

      // Si un subCategoryId est fourni, chercher dans la sous-catégorie
      if (subCategoryId) {
        const category = restaurant.drink_categories.id(categoryId);
        if (!category) {
          return res.status(404).json({ message: "Category not found." });
        }

        const subCategory = category.subCategories.id(subCategoryId);
        if (!subCategory) {
          return res.status(404).json({ message: "Subcategory not found." });
        }

        const drinkIndex = subCategory.drinks.findIndex(
          (drink) => drink._id.toString() === drinkId
        );
        if (drinkIndex > -1) {
          subCategory.drinks.splice(drinkIndex, 1);
          drinkFound = true;
        }
      } else {
        // Sinon, chercher dans la catégorie principale
        for (const category of restaurant.drink_categories) {
          const drinkIndex = category.drinks.findIndex(
            (drink) => drink._id.toString() === drinkId
          );

          if (drinkIndex > -1) {
            category.drinks.splice(drinkIndex, 1);
            drinkFound = true;
            break;
          }
        }
      }

      if (!drinkFound) {
        return res.status(404).json({ message: "Drink not found." });
      }

      await restaurant.save();

      res
        .status(200)
        .json({ message: "Drink deleted successfully.", restaurant });
    } catch (error) {
      console.error("Error deleting drink:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE CATEGORY ORDER
router.put(
  "/restaurants/:restaurantId/drinks/categories-list/order",
  async (req, res) => {
    const { restaurantId } = req.params;
    const { orderedCategoryIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Réorganiser les catégories selon l'ordre donné
      restaurant.drink_categories = orderedCategoryIds.map((categoryId) =>
        restaurant.drink_categories.find(
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

// UPDATE DRINK ORDER IN A CATEGORY
router.put(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/drinks/order",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { orderedDrinkIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Réorganiser les plats selon l'ordre fourni
      category.drinks = orderedDrinkIds.map((drinkId) =>
        category.drinks.find((drink) => drink._id.toString() === drinkId)
      );

      // Sauvegarder les modifications
      await restaurant.save();

      res.status(200).json({
        message: "Drink order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating drink order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE DRINK ORDER IN A SUBCATEGORY
router.put(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories/:subCategoryId/drinks/order",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { orderedDrinkIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      // Réorganiser les boissons dans la sous-catégorie selon l'ordre fourni
      subCategory.drinks = orderedDrinkIds.map((drinkId) =>
        subCategory.drinks.find((drink) => drink._id.toString() === drinkId)
      );

      // Sauvegarder les modifications
      await restaurant.save();

      res.status(200).json({
        message: "Drink order in subcategory updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating drink order in subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// ADD A SUBCATEGORY TO A CATEGORY
router.post(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Subcategory name is required." });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const newSubCategory = { name, drinks: [] };
      category.subCategories.push(newSubCategory);

      await restaurant.save();

      res
        .status(201)
        .json({ message: "Subcategory added successfully.", restaurant });
    } catch (error) {
      console.error("Error adding subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE A SUBCATEGORY
router.put(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories/:subCategoryId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { name, visible } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      if (name !== undefined) subCategory.name = name;
      if (visible !== undefined) subCategory.visible = visible;

      await restaurant.save();

      res
        .status(200)
        .json({ message: "Subcategory updated successfully.", restaurant });
    } catch (error) {
      console.error("Error updating subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// DELETE A SUBCATEGORY
router.delete(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories/:subCategoryId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Utiliser $pull pour retirer la sous-catégorie
      category.subCategories = category.subCategories.filter(
        (subCategory) => subCategory._id.toString() !== subCategoryId
      );

      await restaurant.save();

      res
        .status(200)
        .json({ message: "Subcategory deleted successfully.", restaurant });
    } catch (error) {
      console.error("Error deleting subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// ADD A DRINK TO A SUBCATEGORY
router.post(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories/:subCategoryId/drinks",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { name, price, description } = req.body;

    if (!name || !price) {
      return res
        .status(400)
        .json({ message: "Drink name and price are required." });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      subCategory.drinks.push({ name, price, description });

      await restaurant.save();

      res.status(201).json({
        message: "Drink added to subcategory successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error adding drink to subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE SUBCATEGORIES ORDER
router.put(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/list-subcategories/order",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { orderedSubCategoryIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Réorganiser les sous-catégories selon l'ordre donné
      category.subCategories = orderedSubCategoryIds.map((subCategoryId) =>
        category.subCategories.find(
          (sub) => sub._id.toString() === subCategoryId
        )
      );

      await restaurant.save();

      res.status(200).json({
        message: "Subcategory order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating subcategory order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE A DRINK IN A SUBCATEGORY
router.put(
  "/restaurants/:restaurantId/drinks/categories/:categoryId/subcategories/:subCategoryId/drinks/:drinkId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId, drinkId } = req.params;
    const { name, description, price, showOnWebsite, bio } = req.body;

    // Validation des données
    if (!name || !price) {
      return res.status(400).json({ message: "Name and price are required." });
    }

    try {
      // Vérifier si le restaurant existe
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Trouver la catégorie
      const category = restaurant.drink_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Trouver la sous-catégorie
      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      // Trouver la boisson dans la sous-catégorie
      const drink = subCategory.drinks.id(drinkId);
      if (!drink) {
        return res.status(404).json({ message: "Drink not found." });
      }

      // Mettre à jour les informations de la boisson
      drink.name = name;
      drink.description = description;
      drink.price = price;
      drink.showOnWebsite = showOnWebsite;
      drink.bio = bio;

      // Sauvegarder les modifications
      await restaurant.save();

      res
        .status(200)
        .json({ message: "Drink updated successfully.", restaurant });
    } catch (error) {
      console.error("Error updating drink in subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

module.exports = router;
