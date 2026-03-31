const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const MenuModel = require("../models/menu.model");

function buildCustomGroupRelations(group, dishesLength) {
  const totalRelations = Math.max((dishesLength || 0) - 1, 0);

  if (totalRelations === 0) {
    return [];
  }

  const explicitRelations = Array.isArray(group?.relations)
    ? group.relations
        .slice(0, totalRelations)
        .map((relation) => (relation === "and" ? "and" : "or"))
    : [];

  if (explicitRelations.length === totalRelations) {
    return explicitRelations;
  }

  const fallbackRelation = group?.relation === "and" ? "and" : "or";

  return Array.from({ length: totalRelations }, (_, index) => {
    return explicitRelations[index] || fallbackRelation;
  });
}

// ADD MENU
router.post("/restaurants/:restaurantId/add-menus", async (req, res) => {
  const { restaurantId } = req.params;
  const { combinations, description, name, type, price, dishes, customGroups } =
    req.body;

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
      customGroups,
      price,
    });
    await newMenu.save();

    // Ajoutez l'ID du menu au restaurant et sauvegardez
    restaurant.menus.push(newMenu._id);
    await restaurant.save();

    // Récupérez le restaurant peuplé avec les menus après la mise à jour
    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname").populate("employees")
      .populate("menus");

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

// GET MENU BY ID
router.get("/menus/:menuId", async (req, res) => {
  const { menuId } = req.params;

  try {
    // Récupérez le menu par son ID
    const menu = await MenuModel.findById(menuId);
    if (!menu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    // Récupérez les plats en fonction de restaurant_id du menu
    const restaurant = await RestaurantModel.findById(
      menu.restaurant_id
    ).lean();
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const allCategories = restaurant.dish_categories || [];
    const menuDishIds = (menu.dishes || []).map((dishId) => dishId.toString());
    const selectedDishes = [];

    const findDishAcrossCategories = (dishId) => {
      const normalizedDishId = dishId?.toString?.() || String(dishId || "");

      for (const category of allCategories) {
        const dish = (category.dishes || []).find(
          (item) => item._id.toString() === normalizedDishId,
        );

        if (dish) {
          return { category, dish };
        }
      }

      return null;
    };

    if (
      menu.type === "custom" &&
      Array.isArray(menu.customGroups) &&
      menu.customGroups.length > 0
    ) {
      menu.customGroups.forEach((group) => {
        const normalizedCategoryId = group.categoryId
          ? String(group.categoryId)
          : "";

        const categoryById = allCategories.find(
          (category) => category._id.toString() === normalizedCategoryId,
        );

        const resolvedDishes = (group.dishes || [])
          .map((dishId) => {
            if (categoryById) {
              return (categoryById.dishes || []).find(
                (dish) => dish._id.toString() === dishId.toString(),
              );
            }

            const found = findDishAcrossCategories(dishId);
            return found?.dish || null;
          })
          .filter(Boolean);

        if (resolvedDishes.length > 0) {
          const fallbackCategory = !categoryById
            ? findDishAcrossCategories(group.dishes?.[0])?.category
            : null;
          const relations = buildCustomGroupRelations(
            group,
            resolvedDishes.length,
          );

          selectedDishes.push({
            categoryId:
              categoryById?._id?.toString() ||
              fallbackCategory?._id?.toString() ||
              normalizedCategoryId,
            category:
              categoryById?.name ||
              fallbackCategory?.name ||
              group.categoryName ||
              "",
            relation: relations[0] || group.relation || "or",
            relations,
            dishes: resolvedDishes,
          });
        }
      });
    } else {
      allCategories.forEach((category) => {
        const dishes = (category.dishes || []).filter((dish) =>
          menuDishIds.includes(dish._id.toString()),
        );

        if (dishes.length > 0) {
          selectedDishes.push({
            categoryId: category._id.toString(),
            category: category.name,
            relation: "or",
            relations: Array.from(
              { length: Math.max(dishes.length - 1, 0) },
              () => "or",
            ),
            dishes,
          });
        }
      });
    }

    // Retournez le menu avec les détails des plats
    res.status(200).json({ menu, selectedDishes });
  } catch (error) {
    console.error("Error fetching menu:", error);
    res
      .status(500)
      .json({ message: "An error occurred while fetching the menu" });
  }
});

// UPDATE MENU
router.put(
  "/restaurants/:restaurantId/menus/:menuId/update",
  async (req, res) => {
    const { restaurantId, menuId } = req.params;
    const updateData = req.body;

    try {
      // Mettre à jour le menu avec les données fournies
      const menu = await MenuModel.findByIdAndUpdate(menuId, updateData, {
        new: true,
      });

      if (!menu) {
        return res.status(404).json({ message: "Menu not found" });
      }

      // Récupérer le restaurant avec les menus mis à jour
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus");

      res.status(200).json({
        message: "Menu updated successfully",
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      console.error("Error updating menu:", error);
      res.status(500).json({
        message: "An error occurred while updating the menu",
      });
    }
  }
);

// DELETE MENU
router.delete("/restaurants/:restaurantId/menus/:menuId", async (req, res) => {
  const { restaurantId, menuId } = req.params;

  try {
    // Supprimer le menu par ID
    const menu = await MenuModel.findByIdAndDelete(menuId);
    if (!menu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    // Retirer la référence du menu supprimé dans le restaurant
    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $pull: { menus: menuId } },
      { new: true }
    )
      .populate("owner_id", "firstname").populate("employees")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({
      message: "Menu deleted successfully",
      restaurant,
    });
  } catch (error) {
    console.error("Error deleting menu:", error);
    res
      .status(500)
      .json({ message: "An error occurred while deleting the menu" });
  }
});

// UPDATE MENU ORDER
router.put("/restaurants/:restaurantId/menus/order", async (req, res) => {
  const { restaurantId } = req.params;
  const { orderedMenuIds } = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname").populate("employees")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    restaurant.menus = orderedMenuIds.map((menuId) =>
      restaurant.menus.find((menu) => menu._id.toString() === menuId)
    );

    await restaurant.save();

    res.status(200).json({
      message: "Menu order updated successfully.",
      restaurant,
    });
  } catch (error) {
    console.error("Error updating menu order:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

module.exports = router;
