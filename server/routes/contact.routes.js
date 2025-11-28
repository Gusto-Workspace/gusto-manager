const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// UPDATE RESTAURANT CONTACT INFO
router.put("/owner/restaurants/:id/contact", async (req, res) => {
  try {
    const { id } = req.params;
    const { address, email, phone, social_media } = req.body;

    const updatedRestaurant = await RestaurantModel.findByIdAndUpdate(
      id,
      {
        address,
        email,
        phone,
        social_media,
      },
      { new: true }
    )
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    if (!updatedRestaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json({
      message: "Contact info updated successfully",
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error("Error updating contact info:", error);
    res.status(500).json({ message: "Failed to update contact info" });
  }
});

module.exports = router;
