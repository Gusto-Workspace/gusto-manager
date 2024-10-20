const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// UPDATE RESTAURANT HOURS OPENING
router.put("/owner/restaurants/:id/hours", async (req, res) => {
  const restaurantId = req.params.id;
  const { openingHours } = req.body;

  try {
    const formattedOpeningHours = openingHours.map((hour) => {
      return {
        day: hour.day,
        isClosed: hour.isClosed,
        hours: hour.isClosed ? [] : [{ open: hour.open, close: hour.close }],
      };
    });

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { opening_hours: formattedOpeningHours },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({
      message: "Opening hours updated successfully",
      restaurant,
    });
  } catch (error) {
    console.error("Error updating opening hours:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
