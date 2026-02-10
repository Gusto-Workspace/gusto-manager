const express = require("express");
const router = express.Router();

// DATE-FNS
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

// SERVICE MAILS RESERVATIONS
const {
  sendReservationEmail,
} = require("../services/reservationsMailer.service");

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

function computeCapacityState({
  blockingReservations,
  overlaps,
  eligibleTables,
  requiredSize,
}) {
  const capacity = eligibleTables.length;

  const eligibleIds = new Set(eligibleTables.map((t) => String(t._id)));
  const eligibleByName = new Map(
    eligibleTables.map((t) => [
      String(t.name || "")
        .trim()
        .toLowerCase(),
      String(t._id),
    ]),
  );

  const reservedIds = new Set();
  let unassignedCount = 0;

  blockingReservations.forEach((r) => {
    if (!r?.table) return;
    if (!overlaps(r)) return;

    // ----- CONFIGURED -----
    if (r.table.source === "configured") {
      const id = r.table.tableId ? String(r.table.tableId) : null;

      // 1) cas normal: tableId encore dans le pool
      if (id && eligibleIds.has(id)) {
        reservedIds.add(id);
        return;
      }

      // 2) fallback: match par nom (si la table a été recréée)
      const n = String(r.table.name || "")
        .trim()
        .toLowerCase();
      const mappedId = n ? eligibleByName.get(n) : null;
      if (mappedId) {
        reservedIds.add(mappedId);
        return;
      }

      // 3) dernier fallback: on considère que ça consomme quand même 1 slot
      //    si ça ressemble à une table du pool (même taille)
      const seatsOk = Number(r.table.seats) === Number(requiredSize);
      if (seatsOk) {
        unassignedCount += 1;
        return;
      }

      return;
    }

    // ----- MANUAL -----
    if (r.table.source === "manual") {
      const name = String(r.table.name || "").trim();
      const seatsOk = Number(r.table.seats) === Number(requiredSize);
      if (name && seatsOk) unassignedCount += 1;
    }
  });

  return { capacity, reservedIds, unassignedCount };
}

function normalizeReservationDayToUTC(dateInput) {
  if (!dateInput) return null;

  // cas string "YYYY-MM-DD"
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split("-").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

// Statuts qui “bloquent” une table/slot (Pending uniquement si non expirée)
function isBlockingStatus(status) {
  return ["Pending", "Confirmed", "Active", "Late"].includes(status);
}

function isBlockingReservation(r) {
  if (!r) return false;
  if (!isBlockingStatus(r.status)) return false;
  if (r.status !== "Pending") return true;
  // Pending => bloquant seulement si non expiré
  if (r.pendingExpiresAt == null) return true; // safety
  return new Date(r.pendingExpiresAt).getTime() > Date.now();
}

function getServiceBucketFromTime(reservationTime) {
  const [hh = "0"] = String(reservationTime || "00:00").split(":");
  return Number(hh) < 16 ? "lunch" : "dinner";
}

function getOccupancyMinutes(parameters, reservationTime) {
  const bucket = getServiceBucketFromTime(reservationTime);
  const v =
    bucket === "lunch"
      ? parameters?.table_occupancy_lunch_minutes
      : parameters?.table_occupancy_dinner_minutes;

  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function minutesFromHHmm(timeStr) {
  const [h, m] = String(timeStr || "00:00")
    .split(":")
    .map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function requiredTableSizeFromGuests(n) {
  const g = Number(n || 0);
  if (g <= 0) return 0;
  return g % 2 === 0 ? g : g + 1;
}

function getActiveBlockedRangeEnd(parameters, now = new Date()) {
  const ranges = Array.isArray(parameters?.blocked_ranges)
    ? parameters.blocked_ranges
    : [];

  const t = now.getTime();

  let maxEnd = null;

  for (const r of ranges) {
    const start = new Date(r.startAt).getTime();
    const end = new Date(r.endAt).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (t >= start && t < end) {
      if (!maxEnd || end > maxEnd.getTime()) {
        maxEnd = new Date(end);
      }
    }
  }

  return maxEnd; // Date | null
}

function computePendingExpiresAt(restaurant, anchorDate = null) {
  const now = anchorDate instanceof Date ? anchorDate : new Date();
  const opening = restaurant?.opening_hours;

  const PENDING_MINUTES = Math.max(
    1,
    Number(restaurant?.reservations?.parameters?.pending_duration_minutes) ||
      120,
  );

  try {
    if (!Array.isArray(opening) || opening.length !== 7) {
      return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    }

    let minutesRemaining = PENDING_MINUTES;
    let cursor = new Date(now);

    // max 7 jours de recherche
    for (let safety = 0; safety < 7 && minutesRemaining > 0; safety++) {
      const jsDay = cursor.getDay();
      const dayIndex = jsDay === 0 ? 6 : jsDay - 1;

      const ranges = Array.isArray(opening[dayIndex]?.hours)
        ? opening[dayIndex].hours
        : [];

      for (const range of ranges) {
        if (!range.open || !range.close) continue;

        const [openH, openM] = range.open.split(":").map(Number);
        const [closeH, closeM] = range.close.split(":").map(Number);

        const openTime = new Date(cursor);
        openTime.setHours(openH, openM, 0, 0);

        const closeTime = new Date(cursor);
        closeTime.setHours(closeH, closeM, 0, 0);

        // start = max(cursor, openTime)
        const start = cursor < openTime ? openTime : cursor;

        if (start >= closeTime) continue;

        const availableMinutes = Math.floor((closeTime - start) / 60000);

        if (availableMinutes >= minutesRemaining) {
          return new Date(start.getTime() + minutesRemaining * 60000);
        }

        minutesRemaining -= availableMinutes;
        cursor = new Date(closeTime);
      }

      // next day 00:00
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }

    return new Date(now.getTime() + 12 * 60 * 60 * 1000);
  } catch {
    return new Date(now.getTime() + 12 * 60 * 60 * 1000);
  }
}

function buildReservationDateTime(reservationDateUTC, reservationTime) {
  const d = new Date(reservationDateUTC);
  if (Number.isNaN(d.getTime())) return null;

  const [hh = "00", mm = "00"] = String(reservationTime || "00:00").split(":");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();

  return new Date(
    Date.UTC(y, m, day, parseInt(hh, 10) || 0, parseInt(mm, 10) || 0, 0, 0),
  );
}

function isDateTimeBlocked(parameters, candidateDT) {
  if (!candidateDT) return false;
  const ranges = Array.isArray(parameters?.blocked_ranges)
    ? parameters.blocked_ranges
    : [];
  const t = candidateDT.getTime();

  return ranges.some((r) => {
    const start = new Date(r.startAt).getTime();
    const end = new Date(r.endAt).getTime();
    return (
      Number.isFinite(start) && Number.isFinite(end) && t >= start && t < end
    );
  });
}

function applyActivationFields(reservation, nextStatus) {
  const ACTIVE_LIKE = new Set(["Active", "Late"]);
  if (ACTIVE_LIKE.has(nextStatus)) {
    if (!reservation.activatedAt) reservation.activatedAt = new Date();
  } else {
    reservation.activatedAt = null;
  }
  reservation.finishedAt = nextStatus === "Finished" ? new Date() : null;
}

function applyCancelFields(reservation, nextStatus) {
  if (nextStatus === "Canceled") {
    if (!reservation.canceledAt) reservation.canceledAt = new Date();
  } else {
    reservation.canceledAt = null;
  }
}

function applyRejectFields(reservation, nextStatus) {
  if (nextStatus === "Rejected") {
    if (!reservation.rejectedAt) reservation.rejectedAt = new Date();
  } else {
    reservation.rejectedAt = null;
  }
}

// ✅ refresh complet restaurant (ton front l’utilise partout)
// (si un jour ça devient lourd => on fera une route plus légère + pagination)
async function fetchRestaurantFull(restaurantId) {
  return RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("menus")
    .populate("employees")
    .populate({ path: "reservations.list" });
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

      // ✅ ancien état (avant merge)
      const prevManage = Boolean(
        restaurant?.reservations?.parameters?.manage_disponibilities,
      );

      restaurant.reservations = restaurant.reservations || {};
      restaurant.reservations.parameters =
        restaurant.reservations.parameters || {};

      const existing = restaurant.reservations.parameters?.toObject?.()
        ? restaurant.reservations.parameters.toObject()
        : restaurant.reservations.parameters || {};

      const nextBlocked =
        Object.prototype.hasOwnProperty.call(parameters, "blocked_ranges") &&
        Array.isArray(parameters.blocked_ranges)
          ? parameters.blocked_ranges
          : existing.blocked_ranges || [];

      restaurant.reservations.parameters = {
        ...existing,
        ...parameters,
        blocked_ranges: nextBlocked,
      };

      await restaurant.save();

      const nextManage = Boolean(
        restaurant?.reservations?.parameters?.manage_disponibilities,
      );

      let manualTablesNeedingAssignment = 0;

      // ✅ Si on vient d’activer la gestion intelligente,
      // on compte les réservations encore "bloquantes" avec table saisie à la main (table.name mais pas table._id)
      if (!prevManage && nextManage) {
        const ids = restaurant.reservations?.list || [];

        if (ids.length) {
          const reservations = await ReservationModel.find({
            _id: { $in: ids },
          })
            .select("status pendingExpiresAt table")
            .lean();

          manualTablesNeedingAssignment = reservations.filter((r) => {
            // réutilise tes helpers globaux du fichier
            if (!isBlockingReservation(r)) return false;

            return (
              r?.table?.source === "manual" &&
              Boolean((r?.table?.name || "").trim())
            );
          }).length;
        }
      }

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        message: "Reservation parameters updated successfully",
        restaurant: updatedRestaurant,
        manualTablesNeedingAssignment,
      });
    } catch (error) {
      console.error("Error updating reservation parameters:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   BLOCKED RANGES: ADD
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

      // ✅ SAFE INIT (évite crash si reservations/parameters n'existent pas)
      restaurant.reservations = restaurant.reservations || {};
      restaurant.reservations.parameters =
        restaurant.reservations.parameters || {};
      restaurant.reservations.parameters.blocked_ranges =
        restaurant.reservations.parameters.blocked_ranges || [];

      // purge rapide des ranges finies
      const now = new Date();
      const ranges = restaurant.reservations.parameters.blocked_ranges;
      restaurant.reservations.parameters.blocked_ranges = ranges.filter(
        (r) => new Date(r.endAt) > now,
      );

      restaurant.reservations.parameters.blocked_ranges.push({
        startAt: start,
        endAt: end,
        note: (note || "").toString(),
      });

      await restaurant.save();

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

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

      // ✅ SAFE INIT (évite crash si reservations/parameters n'existent pas)
      restaurant.reservations = restaurant.reservations || {};
      restaurant.reservations.parameters =
        restaurant.reservations.parameters || {};
      restaurant.reservations.parameters.blocked_ranges =
        restaurant.reservations.parameters.blocked_ranges || [];

      const ranges = restaurant.reservations.parameters.blocked_ranges;
      restaurant.reservations.parameters.blocked_ranges = ranges.filter(
        (r) => String(r._id) !== String(rangeId),
      );

      await restaurant.save();

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

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

/* --------------------------
   CREATE A NEW RESERVATION (public)
----------------------------- */
router.post("/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;
  const reservationData = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const parameters = restaurant?.reservations?.parameters || {};
    const autoAccept = Boolean(parameters.auto_accept);

    const normalizedDay = normalizeReservationDayToUTC(
      reservationData.reservationDate,
    );
    if (!normalizedDay) {
      return res.status(400).json({ message: "reservationDate invalide." });
    }

    const candidateDT = buildReservationDateTime(
      normalizedDay,
      reservationData.reservationTime,
    );
    if (isDateTimeBlocked(parameters, candidateDT)) {
      return res.status(409).json({
        message:
          "Les réservations sont temporairement indisponibles sur ce créneau.",
      });
    }

    const computedStatus = autoAccept ? "Confirmed" : "Pending";

    let pendingExpiresAt = null;

    if (!autoAccept) {
      const params = restaurant?.reservations?.parameters || {};
      const now = new Date();

      // ✅ si now est dans un blocked range => anchor = fin du blocked range (max end si overlaps)
      const activeEnd = getActiveBlockedRangeEnd(params, now);
      const anchor = activeEnd || now;

      pendingExpiresAt = computePendingExpiresAt(restaurant, anchor);
    }

    let assignedTable = null;

    if (parameters.manage_disponibilities) {
      const numGuests = Number(reservationData.numberOfGuests);
      const requiredSize = requiredTableSizeFromGuests(numGuests);

      const eligibleTables = (parameters.tables || []).filter(
        (table) => Number(table.seats) === requiredSize,
      );

      if (!eligibleTables.length) {
        return res.status(409).json({
          message: "Aucune table configurée pour ce nombre de personnes.",
        });
      }

      const formattedDate = format(normalizedDay, "yyyy-MM-dd");

      const candidateStart = minutesFromHHmm(reservationData.reservationTime);
      const durCandidate = getOccupancyMinutes(
        parameters,
        reservationData.reservationTime,
      );
      const candidateEnd = candidateStart + durCandidate;

      const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
      const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

      const dayReservations = await ReservationModel.find({
        restaurant_id: restaurantId,
        reservationDate: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ["Pending", "Confirmed", "Active", "Late"] },
      })
        .select("status reservationTime pendingExpiresAt table")
        .lean();

      const blockingReservations = dayReservations.filter(
        isBlockingReservation,
      );

      const overlaps = (r) => {
        const rStart = minutesFromHHmm(r.reservationTime);
        const rDur = getOccupancyMinutes(parameters, r.reservationTime);
        const rEnd = rStart + rDur;

        if (durCandidate > 0 && rDur > 0) {
          return candidateStart < rEnd && candidateEnd > rStart;
        }
        return (
          String(r.reservationTime).slice(0, 5) ===
          String(reservationData.reservationTime).slice(0, 5)
        );
      };

      const { capacity, reservedIds, unassignedCount } = computeCapacityState({
        blockingReservations,
        overlaps,
        requiredSize,
        eligibleTables,
      });

      // ✅ si la capacité est déjà full à cause des manuelles
      if (reservedIds.size + unassignedCount >= capacity) {
        return res.status(409).json({
          code: "NO_TABLE_AVAILABLE",
          message:
            "Aucune table n’est disponible pour ce créneau. Veuillez réessayer.",
        });
      }

      if (reservationData.table) {
        const wanted = eligibleTables.find(
          (t) => String(t._id) === String(reservationData.table),
        );
        if (!wanted)
          return res.status(400).json({ message: "Table invalide." });

        // ✅ table déjà prise explicitement
        if (reservedIds.has(String(wanted._id))) {
          return res
            .status(409)
            .json({ message: "La table sélectionnée n'est plus disponible." });
        }

        // ✅ capacité potentiellement full à cause des 'unassigned'
        if (reservedIds.size + unassignedCount >= capacity) {
          return res.status(409).json({
            code: "NO_TABLE_AVAILABLE",
            message:
              "Ce créneau est complet (tables manuelles non assignées). Assignez une table aux réservations concernées.",
          });
        }

        assignedTable = {
          tableId: wanted._id,
          name: wanted.name,
          seats: wanted.seats,
          source: "configured",
        };
      } else {
        // auto assign
        const free = eligibleTables.find(
          (t) => !reservedIds.has(String(t._id)),
        );
        if (!free) {
          return res.status(409).json({
            code: "NO_TABLE_AVAILABLE",
            message:
              "Aucune table n’est disponible pour ce créneau. Veuillez réessayer.",
          });
        }
        assignedTable = {
          tableId: free._id,
          name: free.name,
          seats: free.seats,
          source: "configured",
        };
      }
    } else {
      // ✅ mode manuel : on accepte le nom de table saisi à la main
      const name = (reservationData.table || "").toString().trim();
      if (name) {
        const requiredSize = requiredTableSizeFromGuests(
          reservationData.numberOfGuests,
        );
        assignedTable = {
          tableId: null,
          name,
          seats: requiredSize || 2,
          source: "manual",
        };
      } else {
        assignedTable = null;
      }
    }

    const newReservation = await ReservationModel.create({
      restaurant_id: restaurantId,
      customerName: reservationData.customerName,
      customerEmail: reservationData.customerEmail,
      customerPhone: reservationData.customerPhone,
      numberOfGuests: reservationData.numberOfGuests,
      reservationDate: normalizedDay,
      reservationTime: reservationData.reservationTime,
      commentary: reservationData.commentary,
      table: assignedTable,

      status: computedStatus,
      source: "public",
      pendingExpiresAt,

      activatedAt: null,
      finishedAt: null,
    });

    restaurant.reservations.list.push(newReservation._id);
    await restaurant.save();

    broadcastToRestaurant(restaurantId, {
      type: "reservation_created",
      restaurantId,
      reservation: newReservation,
    });

    await createAndBroadcastNotification({
      restaurantId,
      module: "reservations",
      type: "reservation_created",
      data: {
        reservationId: String(newReservation?._id),
        customerName: newReservation?.customerName,
        numberOfGuests: newReservation?.numberOfGuests,
        reservationDate: newReservation?.reservationDate,
        reservationTime: newReservation?.reservationTime,
        status: newReservation?.status,
        tableName: newReservation?.table?.name || null,
      },
    });

    // ✅ email client selon statut final (Pending / Confirmed)
    try {
      const restaurantName = restaurant?.name || "Restaurant";
      if (newReservation.status === "Pending") {
        sendReservationEmail("pending", {
          reservation: newReservation,
          restaurantName,
        })
          .then((r) => {
            if (r?.skipped)
              console.log("[reservation-email-skip]", "pending", {
                reason: r?.reason,
              });
          })
          .catch((e) => {
            console.error("Email create failed:", e?.response?.body || e);
          });
      }
      if (newReservation.status === "Confirmed") {
        sendReservationEmail("confirmed", {
          reservation: newReservation,
          restaurantName,
        })
          .then((r) => {
            if (r?.skipped)
              console.log("[reservation-email-skip]", "confirmed", {
                reason: r?.reason,
              });
          })
          .catch((e) => {
            console.error("Email create failed:", e?.response?.body || e);
          });
      }
    } catch (e) {
      console.error("Email create(public) failed:", e?.response?.body || e);
    }

    const updatedRestaurant = await fetchRestaurantFull(restaurantId);
    return res.status(201).json({ restaurant: updatedRestaurant });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/* --------------------------
   CREATE A NEW RESERVATION (dashboard)
----------------------------- */
router.post(
  "/dashboard/restaurants/:id/reservations",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const reservationData = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant)
        return res.status(404).json({ message: "Restaurant not found" });

      const parameters = restaurant?.reservations?.parameters || {};

      const normalizedDay = normalizeReservationDayToUTC(
        reservationData.reservationDate,
      );
      if (!normalizedDay) {
        return res.status(400).json({ message: "reservationDate invalide." });
      }

      const candidateDT = buildReservationDateTime(
        normalizedDay,
        reservationData.reservationTime,
      );
      if (isDateTimeBlocked(parameters, candidateDT)) {
        return res.status(409).json({
          message:
            "Les réservations sont temporairement indisponibles sur ce créneau.",
        });
      }

      const computedStatus = "Confirmed";
      const pendingExpiresAt = null;

      let assignedTable = null;

      if (parameters.manage_disponibilities) {
        const numGuests = Number(reservationData.numberOfGuests);
        const requiredSize = requiredTableSizeFromGuests(numGuests);

        const eligibleTables = (parameters.tables || []).filter(
          (table) => Number(table.seats) === requiredSize,
        );

        if (!eligibleTables.length) {
          return res.status(409).json({
            message: "Aucune table configurée pour ce nombre de personnes.",
          });
        }

        const formattedDate = format(normalizedDay, "yyyy-MM-dd");

        const candidateStart = minutesFromHHmm(reservationData.reservationTime);
        const durCandidate = getOccupancyMinutes(
          parameters,
          reservationData.reservationTime,
        );
        const candidateEnd = candidateStart + durCandidate;

        const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
        const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

        const dayReservations = await ReservationModel.find({
          restaurant_id: restaurantId,
          reservationDate: { $gte: dayStart, $lte: dayEnd },
          status: { $in: ["Pending", "Confirmed", "Active", "Late"] },
        })
          .select("status reservationTime pendingExpiresAt table")
          .lean();

        const blockingReservations = dayReservations.filter(
          isBlockingReservation,
        );

        const overlaps = (r) => {
          const rStart = minutesFromHHmm(r.reservationTime);
          const rDur = getOccupancyMinutes(parameters, r.reservationTime);
          const rEnd = rStart + rDur;

          if (durCandidate > 0 && rDur > 0) {
            return candidateStart < rEnd && candidateEnd > rStart;
          }
          return (
            String(r.reservationTime).slice(0, 5) ===
            String(reservationData.reservationTime).slice(0, 5)
          );
        };

        const { capacity, reservedIds, unassignedCount } = computeCapacityState(
          {
            blockingReservations,
            overlaps,
            requiredSize,
            eligibleTables,
          },
        );

        if (reservedIds.size + unassignedCount >= capacity) {
          return res.status(409).json({
            code: "NO_TABLE_AVAILABLE",
            message:
              "Aucune table n’est disponible pour ce créneau. Contactez le client.",
          });
        }

        const wants = reservationData.table;

        if (wants && wants !== "auto") {
          const wanted = eligibleTables.find(
            (t) => String(t._id) === String(wants),
          );
          if (!wanted)
            return res.status(400).json({ message: "Table invalide." });

          if (reservedIds.has(String(wanted._id))) {
            return res.status(409).json({
              message: "La table sélectionnée n'est plus disponible.",
            });
          }

          if (reservedIds.size + unassignedCount >= capacity) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Ce créneau est complet (tables manuelles non assignées). Assignez une table aux réservations concernées.",
            });
          }

          assignedTable = {
            tableId: wanted._id,
            name: wanted.name,
            seats: wanted.seats,
            source: "configured",
          };
        } else {
          const free = eligibleTables.find(
            (t) => !reservedIds.has(String(t._id)),
          );
          if (!free) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Aucune table n’est disponible pour ce créneau. Contactez le client.",
            });
          }
          assignedTable = {
            tableId: free._id,
            name: free.name,
            seats: free.seats,
            source: "configured",
          };
        }
      } else {
        // ✅ mode manuel : nom de table libre
        const name = (reservationData.table || "").toString().trim();
        if (name) {
          const requiredSize = requiredTableSizeFromGuests(
            reservationData.numberOfGuests,
          );
          assignedTable = {
            tableId: null,
            name,
            seats: requiredSize || 2,
            source: "manual",
          };
        } else {
          assignedTable = null;
        }
      }

      const newReservation = await ReservationModel.create({
        restaurant_id: restaurantId,
        customerName: reservationData.customerName,
        customerEmail: reservationData.customerEmail,
        customerPhone: reservationData.customerPhone,
        numberOfGuests: reservationData.numberOfGuests,
        reservationDate: normalizedDay,
        reservationTime: reservationData.reservationTime,
        commentary: reservationData.commentary,
        table: assignedTable,

        status: computedStatus,
        source: "dashboard",
        pendingExpiresAt,

        activatedAt: null,
        finishedAt: null,
      });

      restaurant.reservations.list.push(newReservation._id);
      await restaurant.save();

      broadcastToRestaurant(restaurantId, {
        type: "reservation_created",
        restaurantId,
        reservation: newReservation,
      });

      // ✅ email client : création dashboard => Confirmed
      try {
        const restaurantName = restaurant?.name || "Restaurant";
        sendReservationEmail("confirmed", {
          reservation: newReservation,
          restaurantName,
        })
          .then((r) => {
            if (r?.skipped)
              console.log("[reservation-email-skip]", "confirmed", r.reason);
          })
          .catch((e) => {
            console.error("Email create failed:", e?.response?.body || e);
          });
      } catch (e) {
        console.error(
          "Email create(dashboard) failed:",
          e?.response?.body || e,
        );
      }

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);
      return res.status(201).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error creating dashboard reservation:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   UPDATE RESERVATION STATUS 
--------------------------------------------------------- */
router.put(
  "/restaurants/:id/reservations/:reservationId/status",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;
    const { status } = req.body;

    try {
      const nextStatus = String(status || "").trim();
      if (!nextStatus) {
        return res.status(400).json({ message: "status manquant." });
      }

      // whitelist des statuts si tu veux sécuriser
      const ALLOWED = new Set([
        "Pending",
        "Confirmed",
        "Active",
        "Late",
        "Finished",
        "Canceled",
        "Rejected",
      ]);
      if (!ALLOWED.has(nextStatus)) {
        return res.status(400).json({ message: "status invalide." });
      }

      const reservation = await ReservationModel.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      if (String(reservation.restaurant_id) !== String(restaurantId)) {
        return res
          .status(403)
          .json({ message: "Reservation does not belong to this restaurant" });
      }

      const prevStatus = String(reservation.status || "");

      // ✅ no-op (évite double emails / double SSE)
      if (prevStatus === nextStatus) {
        const updatedRestaurant = await fetchRestaurantFull(restaurantId);
        return res.status(200).json({
          restaurant: updatedRestaurant,
          tableReassigned: false,
          tableChange: null,
          noOp: true,
        });
      }

      const restaurant = await RestaurantModel.findById(restaurantId).lean();
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const parameters = restaurant?.reservations?.parameters || {};

      // ✅ si on repasse en statut "bloquant" (Confirmed/Active/Late/Pending),
      // on vérifie que le créneau n'est pas dans un blocked_range
      const willBlockSlot = ["Pending", "Confirmed", "Active", "Late"].includes(
        nextStatus,
      );

      if (willBlockSlot) {
        const normalizedDay = normalizeReservationDayToUTC(
          reservation.reservationDate,
        );
        if (!normalizedDay) {
          return res.status(400).json({ message: "reservationDate invalide." });
        }

        const candidateDT = buildReservationDateTime(
          normalizedDay,
          reservation.reservationTime,
        );

        if (isDateTimeBlocked(parameters, candidateDT)) {
          return res.status(409).json({
            code: "SLOT_BLOCKED",
            message: "Le créneau n'est plus disponible.",
          });
        }
      }

      // ✅ table check uniquement quand on met un statut qui occupe une table
      const mustCheckTable = ["Confirmed", "Active", "Late"].includes(
        nextStatus,
      );

      let tableReassigned = false;
      let tableChange = null;

      if (mustCheckTable && parameters.manage_disponibilities) {
        const requiredSize = requiredTableSizeFromGuests(
          reservation.numberOfGuests,
        );
        const eligibleTables = (parameters.tables || []).filter(
          (t) => Number(t.seats) === requiredSize,
        );

        if (!eligibleTables.length) {
          return res.status(409).json({
            message: "Aucune table configurée pour ce nombre de personnes.",
          });
        }

        const normalizedDay = normalizeReservationDayToUTC(
          reservation.reservationDate,
        );
        if (!normalizedDay) {
          return res.status(400).json({ message: "reservationDate invalide." });
        }

        const formattedDate = format(normalizedDay, "yyyy-MM-dd");

        const candidateStart = minutesFromHHmm(reservation.reservationTime);
        const durCandidate = getOccupancyMinutes(
          parameters,
          reservation.reservationTime,
        );
        const candidateEnd = candidateStart + durCandidate;

        const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
        const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

        const dayReservations = await ReservationModel.find({
          restaurant_id: restaurantId,
          reservationDate: { $gte: dayStart, $lte: dayEnd },
          status: { $in: ["Pending", "Confirmed", "Active", "Late"] },
          _id: { $ne: reservationId },
        })
          .select("status reservationTime pendingExpiresAt table")
          .lean();

        const blockingReservations = dayReservations.filter(
          isBlockingReservation,
        );

        const overlaps = (r) => {
          const rStart = minutesFromHHmm(r.reservationTime);
          const rDur = getOccupancyMinutes(parameters, r.reservationTime);
          const rEnd = rStart + rDur;

          if (durCandidate > 0 && rDur > 0) {
            return candidateStart < rEnd && candidateEnd > rStart;
          }
          return (
            String(r.reservationTime).slice(0, 5) ===
            String(reservation.reservationTime).slice(0, 5)
          );
        };

        const currentTableId = reservation?.table?.tableId
          ? String(reservation.table.tableId)
          : null;

        const currentTableName = reservation?.table?.name
          ? String(reservation.table.name)
          : null;

        const isCurrentFree = () => {
          if (!currentTableId && !currentTableName) return false;

          const conflict = blockingReservations.find((r) => {
            if (!r.table) return false;
            const same =
              (currentTableId &&
                r.table.tableId &&
                String(r.table.tableId) === currentTableId) ||
              (currentTableName &&
                String(r.table.name || "") === currentTableName);
            return same && overlaps(r);
          });

          return !conflict;
        };

        if (!isCurrentFree()) {
          const { capacity, reservedIds, unassignedCount } =
            computeCapacityState({
              blockingReservations,
              overlaps,
              eligibleTables,
              requiredSize,
            });

          if (reservedIds.size + unassignedCount >= capacity) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Aucune table n’est disponible pour ce créneau (tables manuelles non assignées). Assignez une table aux réservations concernées.",
            });
          }

          const newTable = eligibleTables.find(
            (t) => !reservedIds.has(String(t._id)),
          );
          if (!newTable) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Aucune table n’est disponible pour ce créneau. Contactez le client.",
            });
          }

          tableReassigned = true;
          tableChange = {
            oldTableId: currentTableId,
            oldTableName: currentTableName,
            newTableId: String(newTable._id),
            newTableName: newTable.name || null,
          };

          reservation.table = {
            tableId: newTable._id,
            name: newTable.name,
            seats: newTable.seats,
            source: "configured",
          };
        }
      }

      // ✅ status + champs dérivés
      reservation.status = nextStatus;

      applyActivationFields(reservation, nextStatus);
      applyCancelFields(reservation, nextStatus);
      applyRejectFields(reservation, nextStatus);

      // ✅ (optionnel mais cohérent) pendingExpiresAt si on repasse en Pending
      if (nextStatus === "Pending") {
        if (!reservation.pendingExpiresAt) {
          reservation.pendingExpiresAt = computePendingExpiresAt(restaurant);
        }
      } else {
        reservation.pendingExpiresAt = null;
      }

      await reservation.save();

      // ✅ SSE: push temps réel à tous les devices connectés
      broadcastToRestaurant(restaurantId, {
        type: "reservation_updated",
        restaurantId,
        reservation: reservation.toObject
          ? reservation.toObject()
          : reservation,
      });

      // ✅ EMAILS (SAFE) — ne doit jamais casser la route
      const restaurantName = restaurant?.name || "Restaurant";
      const logSkip = (type, info) => {
        // log propre (utile en prod)
        console.log("[reservation-email-skip]", type, {
          reservationId: String(reservationId),
          prevStatus,
          nextStatus,
          ...info,
        });
      };

      try {
        // Pending -> Confirmed
        if (prevStatus === "Pending" && nextStatus === "Confirmed") {
          sendReservationEmail("confirmed", { reservation, restaurantName })
            .then(
              (r) => r?.skipped && logSkip("confirmed", { reason: r.reason }),
            )
            .catch((e) =>
              console.error("Email transition failed:", e?.response?.body || e),
            );
        }

        if (prevStatus !== "Canceled" && nextStatus === "Canceled") {
          sendReservationEmail("canceled", { reservation, restaurantName })
            .then(
              (r) => r?.skipped && logSkip("canceled", { reason: r.reason }),
            )
            .catch((e) =>
              console.error("Email transition failed:", e?.response?.body || e),
            );
        }

        if (prevStatus !== "Rejected" && nextStatus === "Rejected") {
          sendReservationEmail("rejected", { reservation, restaurantName })
            .then(
              (r) => r?.skipped && logSkip("rejected", { reason: r.reason }),
            )
            .catch((e) =>
              console.error("Email transition failed:", e?.response?.body || e),
            );
        }
      } catch (e) {
        console.error(
          "Email status transition failed:",
          e?.response?.body || e,
        );
        // on ignore pour ne jamais bloquer la route
      }

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        restaurant: updatedRestaurant,
        tableReassigned,
        tableChange,
      });
    } catch (error) {
      console.error("Error updating reservation status:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   GET A SINGLE RESERVATION
--------------------------------------------------------- */
router.get("/reservations/:reservationId", async (req, res) => {
  const { reservationId } = req.params;

  try {
    const reservation = await ReservationModel.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    return res.status(200).json({ reservation });
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// UPDATE RESERVATION DETAILS
router.put(
  "/restaurants/:id/reservations/:reservationId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;
    const updateData = req.body || {};

    try {
      const existing = await ReservationModel.findById(reservationId);
      if (!existing) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      const restaurantLean =
        await RestaurantModel.findById(restaurantId).lean();
      if (!restaurantLean) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const parameters = restaurantLean?.reservations?.parameters || {};

      // ✅ on ne bloque sur pause QUE si date/heure changent
      const existingDate = normalizeReservationDayToUTC(
        existing.reservationDate,
      );
      const existingTime = String(existing.reservationTime || "00:00").slice(
        0,
        5,
      );

      const nextDate = updateData.reservationDate
        ? normalizeReservationDayToUTC(updateData.reservationDate)
        : existingDate;

      const nextTime = Object.prototype.hasOwnProperty.call(
        updateData,
        "reservationTime",
      )
        ? String(updateData.reservationTime || "00:00").slice(0, 5)
        : existingTime;

      const touchesDateTime =
        nextDate?.getTime() !== existingDate?.getTime() ||
        nextTime !== existingTime;

      // ---------------------------------------------
      // ✅ Candidate date/time/guests (pour checks)
      // ---------------------------------------------
      const candidateDate = updateData.reservationDate
        ? normalizeReservationDayToUTC(updateData.reservationDate)
        : normalizeReservationDayToUTC(existing.reservationDate);

      const candidateTime = String(
        updateData.reservationTime ?? existing.reservationTime ?? "00:00",
      ).slice(0, 5);

      const candidateGuests = Number(
        updateData.numberOfGuests ?? existing.numberOfGuests ?? 0,
      );

      if (!candidateDate) {
        return res.status(400).json({ message: "reservationDate invalide." });
      }

      if (!/^\d{2}:\d{2}$/.test(candidateTime)) {
        return res
          .status(400)
          .json({ message: "reservationTime invalide (HH:mm)." });
      }

      if (!Number.isFinite(candidateGuests) || candidateGuests < 1) {
        return res.status(400).json({ message: "numberOfGuests invalide." });
      }

      // ✅ pause check uniquement si date/heure changent
      if (touchesDateTime) {
        const candidateDT = buildReservationDateTime(
          candidateDate,
          candidateTime,
        );
        if (isDateTimeBlocked(parameters, candidateDT)) {
          return res.status(409).json({
            message:
              "Les réservations sont temporairement indisponibles sur ce créneau.",
          });
        }
      }

      // ---------------------
      // ✅ Grace logic
      // ---------------------
      const gracePeriod = 5 * 60000;

      const statusExplicit = Object.prototype.hasOwnProperty.call(
        updateData,
        "status",
      );

      if (touchesDateTime && !statusExplicit) {
        const base = buildReservationDateTime(candidateDate, candidateTime);
        const reservationWithGrace = new Date(base.getTime() + gracePeriod);

        const now = new Date();

        if (existing.status === "Late" && now < reservationWithGrace) {
          updateData.status = "Confirmed";
          updateData.finishedAt = null;
          updateData.activatedAt = null;
        }

        if (existing.status === "Confirmed" && now >= reservationWithGrace) {
          updateData.status = "Late";
          updateData.finishedAt = null;
          // Late => activatedAt doit exister
          updateData.activatedAt = existing.activatedAt || new Date();
        }
      }

      const touchesGuests =
        Number(candidateGuests) !== Number(existing.numberOfGuests || 0);

      const touchesTableExplicitly = Object.prototype.hasOwnProperty.call(
        updateData,
        "table",
      );

      // ✅ On ne vérifie les tables que si on touche au slot (date/heure/guests),
      // ou si on change explicitement la table / le status
      const shouldCheckTables =
        touchesDateTime ||
        touchesGuests ||
        touchesTableExplicitly ||
        statusExplicit;

      // ---------------------------------------------
      // ✅ TABLE AVAILABILITY CHECK (optimisé)
      // ---------------------------------------------
      let tableReassigned = false;
      let tableChange = null;

      // le statut candidat (si on le change), sinon statut actuel
      const candidateStatus = String(updateData.status ?? existing.status);

      const mustBlockSlot = ["Pending", "Confirmed", "Active", "Late"].includes(
        candidateStatus,
      );

      if (
        parameters.manage_disponibilities &&
        mustBlockSlot &&
        shouldCheckTables
      ) {
        const requiredSize = requiredTableSizeFromGuests(candidateGuests);

        const eligibleTables = (parameters.tables || []).filter(
          (t) => Number(t.seats) === requiredSize,
        );

        if (!eligibleTables.length) {
          return res.status(409).json({
            message: "Aucune table configurée pour ce nombre de personnes.",
          });
        }

        const formattedDate = format(candidateDate, "yyyy-MM-dd");

        const candidateStart = minutesFromHHmm(candidateTime);
        const durCandidate = getOccupancyMinutes(parameters, candidateTime);
        const candidateEnd = candidateStart + durCandidate;

        const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
        const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

        const dayReservations = await ReservationModel.find({
          restaurant_id: restaurantId,
          reservationDate: { $gte: dayStart, $lte: dayEnd },
          status: { $in: ["Pending", "Confirmed", "Active", "Late"] },
          _id: { $ne: reservationId },
        })
          .select("status reservationTime pendingExpiresAt table")
          .lean();

        const blockingReservations = dayReservations.filter(
          isBlockingReservation,
        );

        const overlaps = (r) => {
          const rStart = minutesFromHHmm(r.reservationTime);
          const rDur = getOccupancyMinutes(parameters, r.reservationTime);
          const rEnd = rStart + rDur;

          if (durCandidate > 0 && rDur > 0)
            return candidateStart < rEnd && candidateEnd > rStart;

          return String(r.reservationTime).slice(0, 5) === candidateTime;
        };

        // table demandée: updateData.table (string id) / "auto" / null / undefined
        let requestedTableId = Object.prototype.hasOwnProperty.call(
          updateData,
          "table",
        )
          ? updateData.table
          : undefined;

        if (requestedTableId === "") requestedTableId = null;
        if (requestedTableId === "auto") requestedTableId = undefined;

        if (requestedTableId === null) {
          return res.status(400).json({
            message:
              "La table est obligatoire quand la gestion intelligente est active.",
          });
        }

        // si pas demandé -> on tente de garder la table existante si possible
        const currentId = existing?.table?.tableId
          ? String(existing.table.tableId)
          : null;

        const assignWanted = (tableDef) => {
          updateData.table = {
            tableId: tableDef._id,
            name: tableDef.name,
            seats: tableDef.seats,
            source: "configured",
          };
        };

        const isTableFree = (tableDef) => {
          const conflict = blockingReservations.find((r) => {
            if (!r.table) return false;
            const same =
              (r.table.tableId &&
                String(r.table.tableId) === String(tableDef._id)) ||
              String(r.table.name || "") === String(tableDef.name || "");

            return same && overlaps(r);
          });
          return !conflict;
        };

        if (typeof requestedTableId === "string") {
          const wanted = eligibleTables.find(
            (t) => String(t._id) === String(requestedTableId),
          );
          if (!wanted)
            return res.status(400).json({ message: "Table invalide." });

          if (!isTableFree(wanted)) {
            return res.status(409).json({
              message: "La table sélectionnée n'est plus disponible.",
            });
          }

          assignWanted(wanted);
        } else {
          // pas demandé explicitement => garder si compatible + libre, sinon auto-assign
          const currentEligible = currentId
            ? eligibleTables.find((t) => String(t._id) === currentId)
            : null;

          if (currentEligible && isTableFree(currentEligible)) {
            assignWanted(currentEligible);
          } else {
            const { capacity, reservedIds, unassignedCount } =
              computeCapacityState({
                blockingReservations,
                overlaps,
                eligibleTables,
                requiredSize,
              });

            if (reservedIds.size + unassignedCount >= capacity) {
              return res.status(409).json({
                code: "NO_TABLE_AVAILABLE",
                message:
                  "Aucune table n’est disponible pour ce créneau. Contactez le client.",
              });
            }

            const free = eligibleTables.find(
              (t) => !reservedIds.has(String(t._id)),
            );

            if (!free) {
              return res.status(409).json({
                code: "NO_TABLE_AVAILABLE",
                message:
                  "Aucune table n’est disponible pour ce créneau. Contactez le client.",
              });
            }

            if (currentEligible) {
              tableReassigned = true;
              tableChange = {
                oldTableId: String(currentEligible._id),
                oldTableName: currentEligible.name || null,
                newTableId: String(free._id),
                newTableName: free.name || null,
              };
            }

            assignWanted(free);
          }
        }
      } else {
        // ✅ mode manuel : on stocke le nom saisi à la main (si présent)
        if (Object.prototype.hasOwnProperty.call(updateData, "table")) {
          const name = (updateData.table || "").toString().trim();
          if (!name) {
            updateData.table = null;
          } else {
            const requiredSize = requiredTableSizeFromGuests(candidateGuests);
            updateData.table = {
              tableId: null,
              name,
              seats: requiredSize || 2,
              source: "manual",
            };
          }
        }
      }

      // ---------------------------------------------
      // ✅ activatedAt / finishedAt si status change
      // ---------------------------------------------
      if (Object.prototype.hasOwnProperty.call(updateData, "status")) {
        const tmp = {
          activatedAt: existing.activatedAt,
          finishedAt: existing.finishedAt,
          status: updateData.status,
        };

        existing.status = updateData.status;
        applyActivationFields(existing, updateData.status);
        updateData.activatedAt = existing.activatedAt;
        updateData.finishedAt = existing.finishedAt;

        // restore
        existing.status = tmp.status;
        existing.activatedAt = tmp.activatedAt;
        existing.finishedAt = tmp.finishedAt;
      }

      // ✅ update réservation
      const updatedReservation = await ReservationModel.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true, runValidators: true },
      );

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // ✅ SSE: push update temps réel à tous les devices
      broadcastToRestaurant(restaurantId, {
        type: "reservation_updated",
        restaurantId,
        reservation: updatedReservation.toObject
          ? updatedReservation.toObject()
          : updatedReservation,
      });

      const restaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        restaurant,
        tableReassigned,
        tableChange,
      });
    } catch (error) {
      console.error("Error updating reservation:", error);
      return res.status(500).json({ message: "Internal server error" });
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
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // delete reservation doc
      await ReservationModel.findByIdAndDelete(reservationId);

      // pull from restaurant list
      await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        { $pull: { "reservations.list": reservationId } },
        { new: true },
      );

      // ✅ SSE: suppression instantanée pour tous les devices
      broadcastToRestaurant(restaurantId, {
        type: "reservation_deleted",
        restaurantId,
        reservationId: String(reservationId),
      });

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        message: "Reservation deleted successfully",
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      console.error("Error deleting reservation:", error);
      return res.status(500).json({ message: "Internal server error" });
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
      });

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      return res
        .status(200)
        .json({ reservations: restaurant.reservations.list });
    } catch (error) {
      console.error("Error fetching reservations:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   GET MANUAL TABLES TO FIX (manage_disponibilities ON)
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/reservations/manual-tables",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).lean();
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const parameters = restaurant?.reservations?.parameters || {};
      const manage = Boolean(parameters?.manage_disponibilities);

      // ✅ si pas de gestion intelligente, rien à corriger
      if (!manage) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      const ids = restaurant?.reservations?.list || [];
      if (!ids.length) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      // On récupère les réservations avec table "manuelle"
      const reservations = await ReservationModel.find({ _id: { $in: ids } })
        .select(
          "customerName numberOfGuests reservationDate reservationTime status table source pendingExpiresAt",
        )
        .lean();

      const toFix = reservations
        .filter((r) => {
          // doit bloquer un slot (Pending non expirée, Confirmed/Active/Late)
          if (!isBlockingReservation(r)) return false;

          return (
            r?.table?.source === "manual" &&
            Boolean((r?.table?.name || "").trim())
          );
        })
        .map((r) => ({
          _id: r._id,
          customerName: r.customerName || "",
          numberOfGuests: r.numberOfGuests ?? null,
          reservationDate: r.reservationDate,
          reservationTime: String(r.reservationTime || "").slice(0, 5),
          status: r.status,
          tableName: r?.table?.name || null,
          source: r.source || null,
        }))
        .sort((a, b) => {
          const aDT = buildReservationDateTime(
            normalizeReservationDayToUTC(a.reservationDate),
            a.reservationTime,
          );
          const bDT = buildReservationDateTime(
            normalizeReservationDayToUTC(b.reservationDate),
            b.reservationTime,
          );
          return (aDT?.getTime() || 0) - (bDT?.getTime() || 0);
        });

      return res.status(200).json({
        count: toFix.length,
        reservations: toFix,
      });
    } catch (e) {
      console.error("Error getting manual tables to fix:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
