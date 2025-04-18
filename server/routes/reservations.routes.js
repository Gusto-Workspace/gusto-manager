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

      // Récupérer le document du restaurant
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Affecter les paramètres (les sous-documents de "tables" seront automatiquement castés
      // en instances de tableSubSchema et recevront leur _id si non fourni)
      restaurant.reservations.parameters = parameters;

      // Sauvegarder le document pour que Mongoose applique les defaults et le casting
      await restaurant.save();

      // (Optionnel) Recharger et peupler le document pour la réponse
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        });

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

    const parameters = restaurant.reservations.parameters;

    if (parameters.manage_disponibilities) {
      // Détermination du nombre de personnes et de la taille de table requise.
      const numGuests = Number(reservationData.numberOfGuests);
      const requiredTableSize = numGuests % 2 === 0 ? numGuests : numGuests + 1;

      // Filtrer les tables éligibles (telles dont le nombre de places correspond)
      const eligibleTables = parameters.tables.filter(
        (table) => Number(table.seats) === requiredTableSize
      );

      // Format de la date pour la comparaison (ex : "2025-02-10")
      const formattedDate = format(
        new Date(reservationData.reservationDate),
        "yyyy-MM-dd"
      );

      // Calcul de l'intervalle candidat en minutes depuis minuit.
      const candidateTime = reservationData.reservationTime;
      const [candidateHour, candidateMinute] = candidateTime
        .split(":")
        .map(Number);
      const candidateStart = candidateHour * 60 + candidateMinute;

      // Si la gestion de la durée est activée, définir la durée de réservation.
      const duration = parameters.reservation_duration
        ? Number(parameters.reservation_duration_minutes)
        : 0;
      const candidateEnd = candidateStart + duration;

      if (reservationData.table) {
        // --- Le restaurateur a sélectionné une table via le select.
        // Vérifier que la table fournie figure parmi les tables éligibles.
        const providedTable = eligibleTables.find(
          (table) => table._id.toString() === reservationData.table
        );
        if (!providedTable) {
          return res.status(400).json({ message: "Table invalide." });
        }
        // Vérifier la disponibilité de la table sélectionnée pour le créneau demandé.
        const conflictingReservation = restaurant.reservations.list.find(
          (r) => {
            const rDate = new Date(r.reservationDate);
            const formattedRDate = format(rDate, "yyyy-MM-dd");
            if (formattedRDate !== formattedDate) return false;
            if (!["Confirmed", "Active", "Late"].includes(r.status))
              return false;
            if (!r.table) return false;
            // Comparaison des tables
            if (r.table._id) {
              if (r.table._id.toString() !== providedTable._id.toString())
                return false;
            } else {
              if (r.table.name !== providedTable.name) return false;
            }
            if (parameters.reservation_duration) {
              const [rHour, rMinute] = r.reservationTime.split(":").map(Number);
              const rStart = rHour * 60 + rMinute;
              const rEnd = rStart + duration;
              return candidateStart < rEnd && candidateEnd > rStart;
            } else {
              return r.reservationTime === candidateTime;
            }
          }
        );
        if (conflictingReservation) {
          return res.status(409).json({
            message: "La table sélectionnée n'est plus disponible.",
          });
        }
        // On utilise la table sélectionnée.
        reservationData.table = providedTable;
      } else {
        // --- Affectation automatique : aucune table n'a été fournie.
        const conflictingReservations = restaurant.reservations.list.filter(
          (r) => {
            const rDate = new Date(r.reservationDate);
            const formattedRDate = format(rDate, "yyyy-MM-dd");
            if (formattedRDate !== formattedDate) return false;
            if (!["Confirmed", "Active", "Late"].includes(r.status))
              return false;
            if (!r.table || Number(r.table.seats) !== requiredTableSize)
              return false;
            if (parameters.reservation_duration) {
              const [rHour, rMinute] = r.reservationTime.split(":").map(Number);
              const rStart = rHour * 60 + rMinute;
              const rEnd = rStart + duration;
              return candidateStart < rEnd && candidateEnd > rStart;
            } else {
              return r.reservationTime === candidateTime;
            }
          }
        );

        if (conflictingReservations.length >= eligibleTables.length) {
          return res.status(409).json({
            message: "La table a été réservée entre-temps. Veuillez réessayer.",
          });
        }

        // Récupérer les identifiants des tables déjà réservées pour ce créneau.
        const reservedTableIds = conflictingReservations
          .map((r) => (r.table ? r.table._id.toString() : null))
          .filter(Boolean);

        // Sélectionner une table parmi les éligibles qui n'est pas déjà réservée.
        const assignedTable = eligibleTables.find(
          (table) => !reservedTableIds.includes(table._id.toString())
        );

        if (assignedTable) {
          reservationData.table = assignedTable;
        } else {
          return res.status(409).json({
            message: "La table a été réservée entre-temps. Veuillez réessayer.",
          });
        }
      }
    } else {
      // Si manage_disponibilities est false, le restaurateur saisit manuellement le nom de la table.
      // Ici, le champ n'est pas obligatoire.
      if (reservationData.table) {
        // S'il y a une valeur, la convertir en objet.
        reservationData.table = { name: reservationData.table };
      } else {
        // Sinon, on autorise le champ à rester vide (null)
        reservationData.table = null;
      }
    }

    // Créer la réservation.
    const newReservation = new ReservationModel({
      ...reservationData,
      restaurant_id: restaurantId,
      manual: true,
    });

    const savedReservation = await newReservation.save();

    // Ajouter l'ID de la réservation à la liste du restaurant.
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
      // Si le champ table est une chaîne, on la transforme en objet
      // selon la configuration de manage_disponibilities.
      // On ajoute ici une vérification pour le cas d'une chaîne vide.
      if (typeof updateData.table === "string") {
        if (updateData.table.trim() === "") {
          // Si la chaîne est vide, on assigne null.
          updateData.table = null;
        } else {
          const restaurantDoc = await RestaurantModel.findById(restaurantId);
          if (restaurantDoc?.reservations?.parameters?.manage_disponibilities) {
            // Si l'option est true, on cherche la table dans les paramètres (par _id)
            const tableDef = restaurantDoc.reservations.parameters.tables.find(
              (t) => t._id.toString() === updateData.table
            );
            if (tableDef) {
              updateData.table = tableDef;
            }
          } else {
            // Si manage_disponibilities est false, on attend que l'input contienne le nom de la table
            // On transforme alors la chaîne en un objet avec le nom seulement
            updateData.table = { name: updateData.table };
          }
        }
      }

      // Trouver et mettre à jour la réservation
      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true, runValidators: true }
      ).populate("table");

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // Vérifier que le restaurant existe et récupérer ses données actualisées
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

      res.status(200).json({ restaurant });
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

// Récupérer la liste des réservations d'un restaurant
router.get("/restaurants/:id/reservations", authenticateToken, async (req, res) => {
  const restaurantId = req.params.id;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ reservations: restaurant.reservations.list });
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
