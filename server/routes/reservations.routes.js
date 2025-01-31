const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const ReservationModel = require("../models/reservation.model");

// UPDATE RESTAURANT RESERVATIONS PARAMETERS
router.put(
  "/restaurants/:id/reservations/parameters",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const { parameters } = req.body;

    try {
      // Validation basique des paramètres
      if (typeof parameters !== "object") {
        return res.status(400).json({ message: "Invalid parameters format" });
      }

      // Mettre à jour les paramètres de réservation
      const updatedRestaurant = await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        { "reservations.parameters": parameters },
        { new: true }
      )
        .populate("owner_id", "firstname")
        .populate("menus");

      if (!updatedRestaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      res.status(200).json({
        message: "Reservation parameters updated successfully",
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      console.error("Error updating reservation parameters:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// CREATE A NEW RESERVATION
router.post("/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;
  const reservationData = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Créer une nouvelle réservation
    const newReservation = new ReservationModel({
      ...reservationData,
      restaurant_id: restaurantId,
    });

    const savedReservation = await newReservation.save();

    // Ajouter l'ID de la réservation à la liste du restaurant
    restaurant.reservations.list.push(savedReservation._id);
    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    res.status(201).json({
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error("Error creating reservation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// UPDATE RESERVATION STATUS
router.put("/reservations/:reservationId/status", async (req, res) => {
  const reservationId = req.params.reservationId;
  const { status } = req.body;

  try {
    const updatedReservation = await ReservationModel.findByIdAndUpdate(
      reservationId,
      { status },
      { new: true }
    );

    if (!updatedReservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.status(200).json({
      message: "Reservation status updated successfully",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("Error updating reservation status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
