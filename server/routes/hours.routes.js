const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authentificate-token");
const { authorizeRestaurantAccess } = require("../middleware/authorize-restaurant-access");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const {
  sanitizeExceptionalClosures,
} = require("../services/reservations/restaurant-exceptional-closures.service");

// UPDATE RESTAURANT HOURS OPENING
router.put("/restaurants/:id/opening_hours", authenticateToken,
  authorizeRestaurantAccess({ paramName: "id", requiredOption: "restaurant" }), async (req, res) => {
  const restaurantId = req.params.id;
  const { openingHours, exceptionalClosures } = req.body;

  try {
    if (!Array.isArray(openingHours)) {
      return res.status(400).json({ message: "Invalid openingHours format" });
    }

    // Formater les heures d'ouverture sans limiter à une seule plage
    const formattedOpeningHours = openingHours.map((hour) => {
      return {
        day: hour.day,
        isClosed: hour.isClosed,
        hours: hour.isClosed
          ? []
          : hour.hours.map((h) => ({
              open: h.open,
              close: h.close,
            })),
      };
    });

    const update = { opening_hours: formattedOpeningHours };

    if (exceptionalClosures !== undefined) {
      if (!Array.isArray(exceptionalClosures)) {
        return res
          .status(400)
          .json({ message: "Invalid exceptionalClosures format" });
      }

      if (
        exceptionalClosures.some(
          (date) =>
            !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) ||
            !sanitizeExceptionalClosures([date]).length,
        )
      ) {
        return res
          .status(400)
          .json({ message: "Invalid exceptional closure date" });
      }

      const sanitizedClosures =
        sanitizeExceptionalClosures(exceptionalClosures);
      update.exceptional_closures = sanitizedClosures;
    }

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      update,
      { new: true, runValidators: true },
    )
      .select("opening_hours exceptional_closures");

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
