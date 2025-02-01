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
router.put(
  "/restaurants/:id/reservations/:reservationId/status",
  authenticateToken,
  async (req, res) => {
    const reservationId = req.params.reservationId;
    const restaurantId = req.params.id;
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

      res.status(200).json({
        restaurant,
      });
    } catch (error) {
      console.error("Error updating reservation status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET A SINGLE RESERVATION
router.get("/reservations/:reservationId", async (req, res) => {
  const { reservationId } = req.params;

  try {
    const reservation =
      await ReservationModel.findById(reservationId).populate("table"); // Populate si vous avez des références comme "table"

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.status(200).json({ reservation });
  } catch (error) {
    console.error("Error fetching reservation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// UPDATE RESERVATION DETAILS
router.put(
  "/restaurants/:id/reservations/:reservationId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;
    const updateData = req.body;

    try {
      // Trouver et mettre à jour la réservation
      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true, runValidators: true }
      ).populate("table");

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // Vérifier que le restaurant existe
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

      res.status(200).json({
        restaurant,
      });
    } catch (error) {
      console.error("Error updating reservation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// DELETE A RESERVATION
router.delete(
  "/restaurants/:id/reservations/:reservationId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const reservationIndex = restaurant.reservations.list.findIndex(
        (resv) => resv._id.toString() === reservationId
      );

      if (reservationIndex === -1) {
        return res
          .status(404)
          .json({ message: "Reservation not found in this restaurant" });
      }

      await ReservationModel.findByIdAndDelete(reservationId);

      restaurant.reservations.list.splice(reservationIndex, 1);
      await restaurant.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        })
        .populate("owner_id", "firstname")
        .populate("menus");

      res.status(200).json({
        message: "Reservation deleted successfully",
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      console.error("Error deleting reservation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

module.exports = router;
