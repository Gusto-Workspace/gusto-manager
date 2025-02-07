const express = require("express");
const router = express.Router();

// DATE FNS
const { format } = require("date-fns");

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
        .populate("menus")
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        });

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
  const reservationData = req.body; // contient reservationDate, reservationTime, numberOfGuests, etc.

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

    const parameters = restaurant.reservations.parameters;

    if (parameters.manage_disponibilities) {
      // Détermination du nombre de personnes et de la taille de table requise.
      // Exemple : pour 1 → table de 2 ; pour 3 → table de 4 ; pour 5 → table de 6, etc.
      const numGuests = Number(reservationData.numberOfGuests);
      const requiredTableSize = numGuests % 2 === 0 ? numGuests : numGuests + 1;

      // Filtrer les tables qui correspondent exactement à la taille requise.
      const eligibleTables = parameters.tables.filter(
        (table) => Number(table.seats) === requiredTableSize
      );

      // Format de la date pour la comparaison (ex : "2025-02-07")
      const formattedDate = format(new Date(reservationData.reservationDate), "yyyy-MM-dd");

      // Calculer le candidate interval (en minutes depuis minuit)
      const candidateTime = reservationData.reservationTime;
      const [candidateHour, candidateMinute] = candidateTime.split(":").map(Number);
      const candidateStart = candidateHour * 60 + candidateMinute;

      // Si la gestion de la durée est activée, définir la durée de réservation
      const duration = parameters.reservation_duration
        ? Number(parameters.reservation_duration_minutes)
        : 0;
      const candidateEnd = candidateStart + duration;

      // Filtrer les réservations existantes pour ce créneau,
      // en ne comptant que celles dont la table correspond au requiredTableSize.
      const conflictingReservations = restaurant.reservations.list.filter((r) => {
        const rDate = new Date(r.reservationDate);
        const formattedRDate = format(rDate, "yyyy-MM-dd");
        if (formattedRDate !== formattedDate) return false;
        if (!["Confirmed", "Active", "Late"].includes(r.status)) return false;
        if (!r.table || Number(r.table.seats) !== requiredTableSize) return false;

        if (parameters.reservation_duration) {
          // Vérifier le chevauchement des intervalles
          const [rHour, rMinute] = r.reservationTime.split(":").map(Number);
          const rStart = rHour * 60 + rMinute;
          const rEnd = rStart + duration;
          // Les intervalles se chevauchent si candidateStart < rEnd et candidateEnd > rStart
          return candidateStart < rEnd && candidateEnd > rStart;
        } else {
          // Si la gestion de la durée n'est pas activée, on compare les horaires exacts
          return r.reservationTime === candidateTime;
        }
      });

      if (conflictingReservations.length >= eligibleTables.length) {
        return res.status(409).json({
          message: "La table a été réservée entre-temps. Veuillez réessayer.",
        });
      }

      // Récupérer les noms des tables déjà réservées pour ce créneau (selon la vérification ci-dessus)
      const reservedTableNames = conflictingReservations
        .map((r) => r.table && r.table.name)
        .filter(Boolean);

      // Sélectionner une table parmi les éligibles non réservée
      const assignedTable = eligibleTables.find(
        (table) => !reservedTableNames.includes(table.name)
      );

      if (assignedTable) {
        reservationData.table = assignedTable;
      } else {
        return res.status(409).json({
          message: "La table a été réservée entre-temps. Veuillez réessayer.",
        });
      }
    }

    // Créer la réservation
    const newReservation = new ReservationModel({
      ...reservationData,
      restaurant_id: restaurantId,
    });

    const savedReservation = await newReservation.save();

    // Ajouter l'ID de la réservation au restaurant
    restaurant.reservations.list.push(savedReservation._id);
    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    res.status(201).json({ restaurant: updatedRestaurant });
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
      // Définition de l'objet de mise à jour
      const updateData = {
        status,
        finishedAt: status === "Finished" ? new Date() : null,
      };

      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
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

      // Vérifier que la réservation existe dans le tableau
      const reservationExists = restaurant.reservations.list.some(
        (resv) => resv._id.toString() === reservationId
      );

      if (!reservationExists) {
        return res
          .status(404)
          .json({ message: "Reservation not found in this restaurant" });
      }

      // Supprimer la réservation de la collection Reservations
      await ReservationModel.findByIdAndDelete(reservationId);

      // Retirer l'ID de la réservation du tableau de réservations du restaurant de façon atomique
      await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        { $pull: { "reservations.list": reservationId } },
        { new: true }
      );

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
