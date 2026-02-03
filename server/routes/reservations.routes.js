const express = require("express");
const router = express.Router();

// DATE FNS
const { format } = require("date-fns");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const ReservationModel = require("../models/reservation.model");

// SSE BUS
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// SERVICE NOTIFS
const {
  createAndBroadcastNotification,
} = require("../services/notifications.service");

/* ---------------------------------------------------------
   Helpers: blocked ranges (pause réservations)
--------------------------------------------------------- */

function buildReservationDateTime(reservationDate, reservationTime) {
  const d = new Date(reservationDate);
  const [hh = "00", mm = "00"] = String(reservationTime || "00:00").split(":");
  d.setHours(parseInt(hh, 10) || 0, parseInt(mm, 10) || 0, 0, 0);
  return d;
}

function isDateTimeBlocked(parameters, candidateDT) {
  const ranges = parameters?.blocked_ranges || [];
  const t = candidateDT.getTime();

  return ranges.some((r) => {
    const start = new Date(r.startAt).getTime();
    const end = new Date(r.endAt).getTime();
    return t >= start && t < end; // [start, end)
  });
}

/* ---------------------------------------------------------
   UPDATE RESTAURANT RESERVATIONS PARAMETERS
--------------------------------------------------------- */
router.put(
  "/restaurants/:id/reservations/parameters",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const { parameters } = req.body;

    try {
      if (!parameters || typeof parameters !== "object") {
        return res.status(400).json({ message: "Invalid parameters format" });
      }

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      restaurant.reservations = restaurant.reservations || {};
      restaurant.reservations.parameters =
        restaurant.reservations.parameters || {};

      const existing = restaurant.reservations.parameters?.toObject?.()
        ? restaurant.reservations.parameters.toObject()
        : restaurant.reservations.parameters || {};

      restaurant.reservations.parameters = {
        ...existing,
        ...parameters,
        blocked_ranges: Array.isArray(parameters.blocked_ranges)
          ? parameters.blocked_ranges
          : existing.blocked_ranges || [],
      };

      await restaurant.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees")
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
  },
);

/* ---------------------------------------------------------
   BLOCKED RANGES: ADD
   POST /restaurants/:id/reservations/blocked-ranges
--------------------------------------------------------- */
router.post(
  "/restaurants/:id/reservations/blocked-ranges",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const { startAt, endAt, note } = req.body;

    try {
      if (!startAt || !endAt) {
        return res
          .status(400)
          .json({ message: "startAt and endAt are required" });
      }

      const start = new Date(startAt);
      const end = new Date(endAt);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid dates" });
      }

      if (end <= start) {
        return res.status(400).json({ message: "endAt must be after startAt" });
      }

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Optionnel: purge rapide avant ajout (évite d'accumuler)
      const now = new Date();
      const ranges = restaurant?.reservations?.parameters?.blocked_ranges || [];
      restaurant.reservations.parameters.blocked_ranges = ranges.filter(
        (r) => new Date(r.endAt) > now,
      );

      restaurant.reservations.parameters.blocked_ranges.push({
        startAt: start,
        endAt: end,
        note: (note || "").toString(),
      });

      await restaurant.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees")
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        });

      return res.status(201).json({
        message: "Blocked range added",
        restaurant: updatedRestaurant,
      });
    } catch (e) {
      console.error("Error adding blocked range:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   BLOCKED RANGES: DELETE
   DELETE /restaurants/:id/reservations/blocked-ranges/:rangeId
--------------------------------------------------------- */
router.delete(
  "/restaurants/:id/reservations/blocked-ranges/:rangeId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, rangeId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const ranges = restaurant?.reservations?.parameters?.blocked_ranges || [];
      restaurant.reservations.parameters.blocked_ranges = ranges.filter(
        (r) => String(r._id) !== String(rangeId),
      );

      await restaurant.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees")
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        });

      return res.status(200).json({
        message: "Blocked range removed",
        restaurant: updatedRestaurant,
      });
    } catch (e) {
      console.error("Error deleting blocked range:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   CREATE A NEW RESERVATION (site public)
--------------------------------------------------------- */
router.post("/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;
  const reservationData = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const parameters = restaurant.reservations.parameters;

    // ✅ CHECK: créneau bloqué (pause)
    const candidateDT = buildReservationDateTime(
      reservationData.reservationDate,
      reservationData.reservationTime,
    );

    if (isDateTimeBlocked(parameters, candidateDT)) {
      return res.status(409).json({
        message:
          "Les réservations sont temporairement indisponibles sur ce créneau.",
      });
    }

    if (parameters.manage_disponibilities) {
      const numGuests = Number(reservationData.numberOfGuests);
      const requiredTableSize = numGuests % 2 === 0 ? numGuests : numGuests + 1;

      const eligibleTables = parameters.tables.filter(
        (table) => Number(table.seats) === requiredTableSize,
      );

      const formattedDate = format(
        new Date(reservationData.reservationDate),
        "yyyy-MM-dd",
      );

      const candidateTime = reservationData.reservationTime;
      const [candidateHour, candidateMinute] = candidateTime
        .split(":")
        .map(Number);
      const candidateStart = candidateHour * 60 + candidateMinute;

      const duration = parameters.reservation_duration
        ? Number(parameters.reservation_duration_minutes)
        : 0;
      const candidateEnd = candidateStart + duration;

      if (reservationData.table) {
        const providedTable = eligibleTables.find(
          (table) => table._id.toString() === reservationData.table,
        );
        if (!providedTable) {
          return res.status(400).json({ message: "Table invalide." });
        }

        const conflictingReservation = restaurant.reservations.list.find(
          (r) => {
            const rDate = new Date(r.reservationDate);
            const formattedRDate = format(rDate, "yyyy-MM-dd");
            if (formattedRDate !== formattedDate) return false;
            if (!["Confirmed", "Active", "Late"].includes(r.status))
              return false;
            if (!r.table) return false;

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
          },
        );

        if (conflictingReservation) {
          return res.status(409).json({
            message: "La table sélectionnée n'est plus disponible.",
          });
        }

        reservationData.table = providedTable;
      } else {
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
          },
        );

        if (conflictingReservations.length >= eligibleTables.length) {
          return res.status(409).json({
            message: "La table a été réservée entre-temps. Veuillez réessayer.",
          });
        }

        const reservedTableIds = conflictingReservations
          .map((r) => (r.table ? r.table._id.toString() : null))
          .filter(Boolean);

        const assignedTable = eligibleTables.find(
          (table) => !reservedTableIds.includes(table._id.toString()),
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
      if (reservationData.table) {
        reservationData.table = { name: reservationData.table };
      } else {
        reservationData.table = null;
      }
    }

    const isManual = Boolean(reservationData?.manual === true);

    const newReservation = new ReservationModel({
      ...reservationData,
      restaurant_id: restaurantId,
      manual: isManual,
    });

    const savedReservation = await newReservation.save();

    const populatedReservation = await ReservationModel.findById(
      savedReservation._id,
    ).populate("table");

    // 🔔 push temps réel
    broadcastToRestaurant(restaurantId, {
      type: "reservation_created",
      restaurantId,
      reservation: populatedReservation,
    });

    if (!isManual) {
      await createAndBroadcastNotification({
        restaurantId,
        module: "reservations",
        type: "reservation_created",
        data: {
          reservationId: String(populatedReservation?._id),
          customerName: populatedReservation?.customerName,
          numberOfGuests: populatedReservation?.numberOfGuests,
          reservationDate: populatedReservation?.reservationDate,
          reservationTime: populatedReservation?.reservationTime,
          status: populatedReservation?.status,
          tableName: populatedReservation?.table?.name || null,
        },
      });
    }

    restaurant.reservations.list.push(savedReservation._id);
    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees")
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

/* ---------------------------------------------------------
   UPDATE RESERVATION STATUS
--------------------------------------------------------- */
router.put(
  "/restaurants/:id/reservations/:reservationId/status",
  authenticateToken,
  async (req, res) => {
    const reservationId = req.params.reservationId;
    const restaurantId = req.params.id;
    const { status } = req.body;

    try {
      const updateData = {
        status,
        finishedAt: status === "Finished" ? new Date() : null,
      };

      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true },
      ).populate("table");

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees")
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        });

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      res.status(200).json({ restaurant });
    } catch (error) {
      console.error("Error updating reservation status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   GET A SINGLE RESERVATION
--------------------------------------------------------- */
router.get("/reservations/:reservationId", async (req, res) => {
  const { reservationId } = req.params;

  try {
    const reservation =
      await ReservationModel.findById(reservationId).populate("table");

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.status(200).json({ reservation });
  } catch (error) {
    console.error("Error fetching reservation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ---------------------------------------------------------
   UPDATE RESERVATION DETAILS
--------------------------------------------------------- */
router.put(
  "/restaurants/:id/reservations/:reservationId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;
    const updateData = req.body;

    try {
      const existingReservation =
        await ReservationModel.findById(reservationId);
      if (!existingReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      const gracePeriod = 5 * 60000;

      const touchesDateTime =
        Object.prototype.hasOwnProperty.call(updateData, "reservationDate") ||
        Object.prototype.hasOwnProperty.call(updateData, "reservationTime");

      const statusExplicit = Object.prototype.hasOwnProperty.call(
        updateData,
        "status",
      );

      if (touchesDateTime && !statusExplicit) {
        const baseDate = updateData.reservationDate
          ? new Date(updateData.reservationDate)
          : new Date(existingReservation.reservationDate);

        const timeStr = String(
          updateData.reservationTime ??
            existingReservation.reservationTime ??
            "00:00",
        );

        const [hh = "00", mm = "00"] = timeStr.split(":");
        baseDate.setHours(parseInt(hh, 10) || 0, parseInt(mm, 10) || 0, 0, 0);

        const reservationWithGrace = new Date(baseDate.getTime() + gracePeriod);
        const now = new Date();

        if (
          existingReservation.status === "Late" &&
          now < reservationWithGrace
        ) {
          updateData.status = "Confirmed";
          updateData.finishedAt = null;
        }

        if (
          existingReservation.status === "Confirmed" &&
          now >= reservationWithGrace
        ) {
          updateData.status = "Late";
          updateData.finishedAt = null;
        }
      }

      if (typeof updateData.table === "string") {
        if (updateData.table.trim() === "") {
          updateData.table = null;
        } else {
          const restaurantDoc = await RestaurantModel.findById(restaurantId);
          if (restaurantDoc?.reservations?.parameters?.manage_disponibilities) {
            const tableDef = restaurantDoc.reservations.parameters.tables.find(
              (t) => t._id.toString() === updateData.table,
            );
            if (tableDef) {
              updateData.table = tableDef;
            }
          } else {
            updateData.table = { name: updateData.table };
          }
        }
      }

      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true, runValidators: true },
      ).populate("table");

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees")
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
  },
);

/* ---------------------------------------------------------
   DELETE A RESERVATION
--------------------------------------------------------- */
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

      const reservationExists = restaurant.reservations.list.some(
        (resv) => resv._id.toString() === reservationId,
      );

      if (!reservationExists) {
        return res
          .status(404)
          .json({ message: "Reservation not found in this restaurant" });
      }

      await ReservationModel.findByIdAndDelete(reservationId);

      await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        { $pull: { "reservations.list": reservationId } },
        { new: true },
      );

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate({
          path: "reservations.list",
          populate: { path: "table" },
        })
        .populate("employees")
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
  },
);

/* ---------------------------------------------------------
   GET RESERVATIONS LIST
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/reservations",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate({
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
  },
);

module.exports = router;
