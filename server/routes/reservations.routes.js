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

// GET RESTAURANT RESERVATIONS PARAMETERS
router.get(
  "/restaurants/:id/reservations/parameters",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      const restaurant =
        await RestaurantModel.findById(restaurantId).select("reservations");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      res.status(200).json({
        reservations: restaurant.reservations,
      });
    } catch (error) {
      console.error("Error fetching reservation parameters:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// CREATE A NEW RESERVATION
router.post("/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;
  const reservationData = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const newReservation = new ReservationModel({
      ...reservationData,
      restaurant_id: restaurantId,
    });

    const savedReservation = await newReservation.save();

    // Ajouter l'ID de la réservation à la liste du restaurant
    restaurant.reservations.list.push(savedReservation._id);
    await restaurant.save();

    res.status(201).json({
      message: "Reservation created successfully",
      reservation: savedReservation,
    });
  } catch (error) {
    console.error("Error creating reservation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET ALL RESERVATIONS FOR A RESTAURANT
router.get("/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;

  try {
    const reservations = await ReservationModel.find({
      restaurant_id: restaurantId,
    });

    res.status(200).json({
      reservations,
    });
  } catch (error) {
    console.error("Error fetching reservations:", error);
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

// DELETE A RESERVATION
router.delete("/reservations/:reservationId", async (req, res) => {
  const reservationId = req.params.reservationId;

  try {
    const deletedReservation =
      await ReservationModel.findByIdAndDelete(reservationId);

    if (!deletedReservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Optionnel : Retirer l'ID de la réservation de la liste du restaurant
    await RestaurantModel.findByIdAndUpdate(deletedReservation.restaurant_id, {
      $pull: { "reservations.list": reservationId },
    });

    res.status(200).json({
      message: "Reservation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting reservation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
