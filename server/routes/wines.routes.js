const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// ADD A CATEGORY
router.post("/restaurants/:restaurantId/wines/categories", async (req, res) => {
  const { restaurantId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Category name is required." });
  }

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    const existingCategory = restaurant.wine_categories.find(
      (category) => category.name.toLowerCase() === name.toLowerCase()
    );

    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists." });
    }

    const newCategory = {
      name,
      wines: [],
    };

    restaurant.wine_categories.push(newCategory);
    await restaurant.save();

    res
      .status(201)
      .json({ message: "Category added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE A CATEGORY
router.put(
  "/restaurants/:restaurantId/wines/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { name, visible } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);

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
  "/restaurants/:restaurantId/wines/categories/:categoryId",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;

    try {
      const restaurant = await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        {
          $pull: { wine_categories: { _id: categoryId } },
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

// ADD A WINE TO A CATEGORY
router.post("/restaurants/:restaurantId/wines", async (req, res) => {
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

    // Trouver la catégorie à laquelle ajouter la boisson
    const category = restaurant.wine_categories.id(categoryId);

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Ajouter la nouvelle boisson à la catégorie
    category.wines.push(req.body);

    // Sauvegarder les modifications
    await restaurant.save();

    res.status(201).json({ message: "Wine added successfully.", restaurant });
  } catch (error) {
    console.error("Error adding wine:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE A WINE IN CATEGORY
router.put("/restaurants/:restaurantId/wines/:wineId", async (req, res) => {
  const { restaurantId, wineId } = req.params;
  const { name, appellation, volume, unit, price, year, showOnWebsite, bio } =
    req.body;

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

    // Trouver le plat à mettre à jour dans toutes les catégorie
    let wineFound = false;

    for (const category of restaurant.wine_categories) {
      const wine = category.wines.id(wineId);
      if (wine) {
        wine.appellation = appellation;
        wine.name = name;
        wine.volume = volume;
        wine.unit = unit;
        wine.price = price;
        wine.year = year;
        wine.showOnWebsite = showOnWebsite;
        wine.bio = bio;
        wineFound = true;
        break;
      }
    }

    if (!wineFound) {
      return res.status(404).json({ message: "Wine not found." });
    }

    await restaurant.save();

    res.status(200).json({ message: "Wine updated successfully.", restaurant });
  } catch (error) {
    console.error("Error updating wine:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// GET WINES BY CATEGORY
router.get("/categories/:categoryId/wines", async (req, res) => {
  const { categoryId } = req.params;

  try {
    // Rechercher la catégorie avec l'ID donné
    const restaurant = await RestaurantModel.findOne({
      "wine_categories._id": categoryId,
    });

    if (!restaurant) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Trouver la catégorie spécifique
    const category = restaurant.wine_categories.find(
      (cat) => cat._id.toString() === categoryId
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    // Retourner directement la catégorie trouvée
    res.status(200).json({ category });
  } catch (error) {
    console.error("Error fetching wines by category:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// GET WINES BY SUBCATEGORY
router.get(
  "/categories/:categoryId/subcategories/:subCategoryId/wines",
  async (req, res) => {
    const { categoryId, subCategoryId } = req.params;

    try {
      // Rechercher le restaurant qui contient la catégorie avec l'ID donné
      const restaurant = await RestaurantModel.findOne({
        "wine_categories._id": categoryId,
      });

      if (!restaurant) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Trouver la catégorie spécifique
      const category = restaurant.wine_categories.find(
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
      console.error("Error fetching wines by subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// DELETE A WINE
router.delete("/restaurants/:restaurantId/wines/:wineId", async (req, res) => {
  const { restaurantId, wineId } = req.params;
  const { categoryId, subCategoryId } = req.query;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    let wineFound = false;

    // Si un subCategoryId est fourni, chercher dans la sous-catégorie
    if (subCategoryId) {
      const category = restaurant.wine_categories.id(categoryId);
      if (!category)
        return res.status(404).json({ message: "Category not found." });

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory)
        return res.status(404).json({ message: "Subcategory not found." });

      const wineIndex = subCategory.wines.findIndex(
        (wine) => wine._id.toString() === wineId
      );
      if (wineIndex > -1) {
        subCategory.wines.splice(wineIndex, 1);
        wineFound = true;
      }
    } else {
      // Sinon, chercher dans la catégorie principale
      for (const category of restaurant.wine_categories) {
        const wineIndex = category.wines.findIndex(
          (wine) => wine._id.toString() === wineId
        );

        if (wineIndex > -1) {
          category.wines.splice(wineIndex, 1);
          wineFound = true;
          break;
        }
      }
    }

    if (!wineFound) {
      return res.status(404).json({ message: "Wine not found." });
    }

    await restaurant.save();
    res.status(200).json({ message: "Wine deleted successfully.", restaurant });
  } catch (error) {
    console.error("Error deleting wine:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE CATEGORY ORDER
router.put(
  "/restaurants/:restaurantId/wines/categories-list/order",
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
      restaurant.wine_categories = orderedCategoryIds.map((categoryId) =>
        restaurant.wine_categories.find(
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

// UPDATE WINE ORDER IN A CATEGORY
router.put(
  "/restaurants/:restaurantId/wines/categories/:categoryId/wines/order",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { orderedWineIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Réorganiser les plats selon l'ordre fourni
      category.wines = orderedWineIds.map((wineId) =>
        category.wines.find((wine) => wine._id.toString() === wineId)
      );

      // Sauvegarder les modifications
      await restaurant.save();

      res.status(200).json({
        message: "Wine order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating wine order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE WINE ORDER IN A SUBCATEGORY
router.put(
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories/:subCategoryId/wines/order",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { orderedWineIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      // Réorganiser les boissons dans la sous-catégorie selon l'ordre fourni
      subCategory.wines = orderedWineIds.map((wineId) =>
        subCategory.wines.find((wine) => wine._id.toString() === wineId)
      );

      // Sauvegarder les modifications
      await restaurant.save();

      res.status(200).json({
        message: "Wine order in subcategory updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating wine order in subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// ADD A SUBCATEGORY TO A CATEGORY
router.post(
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Subcategory name is required." });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const newSubCategory = { name, wines: [] };
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
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories/:subCategoryId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { name, visible } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
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
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories/:subCategoryId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
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

// ADD A WINE TO A SUBCATEGORY
router.post(
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories/:subCategoryId/wines",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId } = req.params;
    const { name, appellation, price, year, bio, volume, unit } = req.body;

    if (!name || !price) {
      return res
        .status(400)
        .json({ message: "Wine name and price are required." });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({ message: "Subcategory not found." });
      }

      subCategory.wines.push({
        name,
        appellation,
        price,
        year,
        bio,
        volume,
        unit,
      });

      await restaurant.save();

      res.status(201).json({
        message: "Wine added to subcategory successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error adding wine to subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// UPDATE SUBCATEGORIES ORDER
router.put(
  "/restaurants/:restaurantId/wines/categories/:categoryId/list-subcategories/order",
  async (req, res) => {
    const { restaurantId, categoryId } = req.params;
    const { orderedSubCategoryIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
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

// UPDATE A WINE IN A SUBCATEGORY
router.put(
  "/restaurants/:restaurantId/wines/categories/:categoryId/subcategories/:subCategoryId/wines/:wineId",
  async (req, res) => {
    const { restaurantId, categoryId, subCategoryId, wineId } = req.params;
    const { name, appellation, volume, unit, price, year, showOnWebsite, bio } =
      req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and price are required." });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const category = restaurant.wine_categories.id(categoryId);
      if (!category)
        return res.status(404).json({ message: "Category not found." });

      const subCategory = category.subCategories.id(subCategoryId);
      if (!subCategory)
        return res.status(404).json({ message: "Subcategory not found." });

      const wine = subCategory.wines.id(wineId);
      if (!wine) return res.status(404).json({ message: "Wine not found." });

      wine.appellation = appellation;
      wine.name = name;
      wine.volume = volume;
      wine.unit = unit;
      wine.price = price;
      wine.year = year;
      wine.showOnWebsite = showOnWebsite;
      wine.bio = bio;

      await restaurant.save();
      res
        .status(200)
        .json({ message: "Wine updated successfully.", restaurant });
    } catch (error) {
      console.error("Error updating wine in subcategory:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

module.exports = router;
