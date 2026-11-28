const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authentificate-token");
const { authorizeRestaurantAccess } = require("../middleware/authorize-restaurant-access");
const { saveRestaurantWithEstablishment } = require("../services/commercial/establishments.service");

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// UPDATE RESTAURANT CONTACT INFO
router.put("/owner/restaurants/:id/contact", authenticateToken,
  authorizeRestaurantAccess({ paramName: "id", requiredOption: "restaurant" }), async (req, res) => {
  try {
    const { id } = req.params;
    const { address, email, phone, social_media } = req.body;

    const updatedRestaurant = await RestaurantModel.findById(id)
      .select("name address email phone website social_media");

    if (!updatedRestaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    for (const [field, value] of Object.entries({ address, email, phone, social_media })) {
      if (value !== undefined) updatedRestaurant.set(field, value);
    }
    await saveRestaurantWithEstablishment(updatedRestaurant);
    res.json({
      message: "Contact info updated successfully",
      restaurant: {
        _id: updatedRestaurant._id, address: updatedRestaurant.address, email: updatedRestaurant.email,
        phone: updatedRestaurant.phone, social_media: updatedRestaurant.social_media,
      },
    });
  } catch (error) {
    console.error("Error updating contact info:", error);
    res.status(500).json({ message: "Failed to update contact info" });
  }
});

module.exports = router;
