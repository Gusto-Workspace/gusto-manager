const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const MenuModel = require("../models/menu.model");

// ADD MENU
router.post("/restaurants/:restaurantId/add-menus", async (req, res) => {
  const { restaurantId } = req.params;
  const { combinations, description, name, type, price, dishes } = req.body;

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
      price,
    });
    await newMenu.save();

    // Ajoutez l'ID du menu au restaurant et sauvegardez
    restaurant.menus.push(newMenu._id);
    await restaurant.save();

    // Récupérez le restaurant peuplé avec les menus après la mise à jour
    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
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

    // Filtrez les plats du restaurant pour ne garder que ceux du menu
    const selectedDishes = [];
    restaurant.dish_categories.forEach((category) => {
      const dishes = category.dishes.filter((dish) =>
        menu.dishes.includes(dish._id.toString())
      );
      if (dishes.length > 0) {
        selectedDishes.push({
          category: category.name,
          dishes: dishes,
        });
      }
    });

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
      .populate("owner_id", "firstname")
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
      .populate("owner_id", "firstname")
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
