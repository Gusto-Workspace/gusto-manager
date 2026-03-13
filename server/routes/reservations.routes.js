const express = require("express");
const Stripe = require("stripe");
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
} = require("../services/reservations-mailer.service");

// SERVICE CUSTOMERS
const {
  upsertCustomer,
  onReservationCreated,
  onReservationStatusChanged,
} = require("../services/customers.service");

// ENCRYPTION
const { decryptApiKey } = require("../services/encryption.service");

const BANK_HOLD_IMMEDIATE_WINDOW_HOURS = 168; // 7 jours

const BANK_HOLD_SCHEDULE_BEFORE_HOURS = 72;

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

const BLOCKING_STATUSES = [
  "AwaitingBankHold",
  "Pending",
  "Confirmed",
  "Active",
  "Late",
];

// Statuts qui “bloquent” une table/slot (Pending uniquement si non expirée)
function isBlockingStatus(status) {
  return BLOCKING_STATUSES.includes(status);
}

function isBlockingReservation(r) {
  if (!r) return false;
  if (!isBlockingStatus(r.status)) return false;

  if (r.status === "AwaitingBankHold") {
    const bankHoldEnabled = Boolean(r?.bankHold?.enabled);
    const bankHoldExpiresAt = r?.bankHold?.expiresAt
      ? new Date(r.bankHold.expiresAt).getTime()
      : null;

    if (
      bankHoldEnabled &&
      Number.isFinite(bankHoldExpiresAt) &&
      bankHoldExpiresAt <= Date.now()
    ) {
      return false;
    }

    return true;
  }

  if (r.status === "Pending") {
    if (r.pendingExpiresAt == null) return true;
    return new Date(r.pendingExpiresAt).getTime() > Date.now();
  }

  return true;
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

  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    parseInt(hh, 10) || 0,
    parseInt(mm, 10) || 0,
    0,
    0,
  );
}

function computeReminder24hDueAt(reservationDateUTC, reservationTime) {
  const reservationDT = buildReservationDateTime(
    reservationDateUTC,
    reservationTime,
  );
  if (!reservationDT) return null;
  return new Date(reservationDT.getTime() - 24 * 60 * 60 * 1000);
}

function computeBankHoldActionExpiresAt(reservationDateUTC, reservationTime) {
  const now = new Date();
  const reservationDT = buildReservationDateTime(
    reservationDateUTC,
    reservationTime,
  );

  const in1h = new Date(now.getTime() + 60 * 60 * 1000);

  if (!reservationDT || Number.isNaN(reservationDT.getTime())) {
    return in1h;
  }

  return in1h.getTime() <= reservationDT.getTime() ? in1h : reservationDT;
}

function buildReminder24hFields({ status, reservationDate, reservationTime }) {
  const nextStatus = String(status || "").trim();

  if (nextStatus !== "Confirmed") {
    return {
      reminder24hDueAt: null,
      reminder24hSentAt: null,
      reminder24hLockedAt: null,
    };
  }

  const dueAt = computeReminder24hDueAt(reservationDate, reservationTime);

  if (!dueAt || dueAt.getTime() <= Date.now()) {
    return {
      reminder24hDueAt: null,
      reminder24hSentAt: null,
      reminder24hLockedAt: null,
    };
  }

  return {
    reminder24hDueAt: dueAt,
    reminder24hSentAt: null,
    reminder24hLockedAt: null,
  };
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

async function fetchRestaurantFull(restaurantId) {
  return RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("menus")
    .populate("employees")
    .populate({ path: "reservations.list" });
}

function getCustomerFullNameFromReservation(reservation) {
  const fn = String(reservation?.customerFirstName || "").trim();
  const ln = String(reservation?.customerLastName || "").trim();
  return `${fn} ${ln}`.trim();
}

async function notifyReservationAfterBankHoldFinalization(reservation) {
  const finalStatus = String(reservation?.status || "");

  if (!["Pending", "Confirmed"].includes(finalStatus)) return;

  await createAndBroadcastNotification({
    restaurantId: String(reservation.restaurant_id),
    module: "reservations",
    type: "reservation_created",
    data: {
      reservationId: String(reservation?._id),
      customerName: getCustomerFullNameFromReservation(reservation),
      numberOfGuests: reservation?.numberOfGuests,
      reservationDate: reservation?.reservationDate,
      reservationTime: reservation?.reservationTime,
      status: reservation?.status,
      tableName: reservation?.table?.name || null,
    },
  });
}

function cleanNamePart(v) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getBankHoldConfig(parameters = {}) {
  const enabled = Boolean(parameters?.bank_hold?.enabled);
  const amountPerPerson = Math.max(
    0,
    Number(parameters?.bank_hold?.amount_per_person || 0),
  );

  return {
    enabled,
    amountPerPerson,
  };
}

function computeBankHoldAmountTotal(amountPerPerson, numberOfGuests) {
  return Number(amountPerPerson || 0) * Number(numberOfGuests || 0);
}

function computeHoursUntilReservation(reservationDateUTC, reservationTime) {
  const dt = buildReservationDateTime(reservationDateUTC, reservationTime);
  if (!dt || Number.isNaN(dt.getTime())) return null;
  return (dt.getTime() - Date.now()) / 3600000;
}

function shouldUseImmediateBankHold(reservationDateUTC, reservationTime) {
  const hours = computeHoursUntilReservation(
    reservationDateUTC,
    reservationTime,
  );
  if (hours == null) return false;
  return hours <= BANK_HOLD_IMMEDIATE_WINDOW_HOURS;
}

function computeAuthorizationScheduledFor(reservationDateUTC, reservationTime) {
  const dt = buildReservationDateTime(reservationDateUTC, reservationTime);
  if (!dt || Number.isNaN(dt.getTime())) return null;

  const scheduled = new Date(
    dt.getTime() - BANK_HOLD_SCHEDULE_BEFORE_HOURS * 3600000,
  );

  return scheduled.getTime() < Date.now() ? new Date() : scheduled;
}

function getRestaurantStripeSecretKey(restaurant) {
  const encrypted = String(restaurant?.stripeSecretKey || "").trim();
  if (!encrypted) return null;

  try {
    const decrypted = decryptApiKey(encrypted);
    return String(decrypted || "").trim() || null;
  } catch (e) {
    console.error(
      "[bank-hold] impossible de déchiffrer la clé Stripe du restaurant",
      {
        restaurantId: String(restaurant?._id || ""),
        error: e?.message || e,
      },
    );
    return null;
  }
}

function buildBankHoldPlan({
  restaurant,
  parameters,
  reservationDateUTC,
  reservationTime,
  numberOfGuests,
}) {
  const cfg = getBankHoldConfig(parameters);
  const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);

  const amountTotal = computeBankHoldAmountTotal(
    cfg.amountPerPerson,
    numberOfGuests,
  );

  // feature off ou invalide
  if (!cfg.enabled || amountTotal <= 0) {
    return {
      enabled: false,
      reason: "disabled_or_zero",
      stripeReady: Boolean(stripeSecretKey),
      amountPerPerson: cfg.amountPerPerson,
      amountTotal,
      flow: "none",
      initialBankHoldStatus: "none",
      authorizationScheduledFor: null,
    };
  }

  // feature activée mais Stripe restaurant pas prêt
  if (!stripeSecretKey) {
    return {
      enabled: false,
      reason: "missing_stripe_key",
      stripeReady: false,
      amountPerPerson: cfg.amountPerPerson,
      amountTotal,
      flow: "none",
      initialBankHoldStatus: "none",
      authorizationScheduledFor: null,
    };
  }

  const immediate = shouldUseImmediateBankHold(
    reservationDateUTC,
    reservationTime,
  );

  return {
    enabled: true,
    reason: "ok",
    stripeReady: true,
    stripeSecretKey,
    amountPerPerson: cfg.amountPerPerson,
    amountTotal,
    flow: immediate ? "immediate" : "scheduled",
    initialBankHoldStatus: immediate
      ? "authorization_pending"
      : "setup_pending",
    authorizationScheduledFor: immediate
      ? null
      : computeAuthorizationScheduledFor(reservationDateUTC, reservationTime),
  };
}

function getStripeClientForRestaurant(restaurant) {
  const secretKey = getRestaurantStripeSecretKey(restaurant);
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

async function ensureStripeCustomerForReservation(stripe, reservation) {
  const existing = String(reservation?.bankHold?.stripeCustomerId || "").trim();
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: reservation.customerEmail || undefined,
    name: `${reservation.customerFirstName || ""} ${
      reservation.customerLastName || ""
    }`.trim(),
    phone: reservation.customerPhone || undefined,
    metadata: {
      reservationId: String(reservation._id),
      restaurantId: String(reservation.restaurant_id),
    },
  });

  reservation.bankHold.stripeCustomerId = customer.id;
  await reservation.save();

  return customer.id;
}

async function createPublicBankHoldIntent({ stripe, reservation, flow }) {
  const customerId = await ensureStripeCustomerForReservation(
    stripe,
    reservation,
  );

  if (flow === "scheduled") {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        reservationId: String(reservation._id),
        restaurantId: String(reservation.restaurant_id),
        type: "reservation_bank_hold_setup",
      },
    });

    return {
      type: "setup",
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(reservation?.bankHold?.amountTotal || 0) * 100),
    currency: "eur",
    customer: customerId,
    capture_method: "manual",
    setup_future_usage: "off_session",
    payment_method_types: ["card"],
    metadata: {
      reservationId: String(reservation._id),
      restaurantId: String(reservation.restaurant_id),
      type: "reservation_bank_hold_payment",
    },
  });

  return {
    type: "payment",
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

async function finalizePublicBankHoldReservation({
  reservationId,
  intentType,
  intentId,
}) {
  const reservation = await ReservationModel.findById(reservationId);
  if (!reservation) {
    throw new Error("Réservation introuvable.");
  }

  const restaurant = await RestaurantModel.findById(reservation.restaurant_id);
  if (!restaurant) {
    throw new Error("Restaurant introuvable.");
  }

  const stripe = getStripeClientForRestaurant(restaurant);
  if (!stripe) {
    throw new Error("Clé Stripe restaurant introuvable.");
  }

  const autoAccept = Boolean(restaurant?.reservations?.parameters?.auto_accept);
  const finalStatus = autoAccept ? "Confirmed" : "Pending";

  if (intentType === "setup") {
    const setupIntent = await stripe.setupIntents.retrieve(intentId);

    if (!setupIntent || setupIntent.status !== "succeeded") {
      throw new Error("Enregistrement de carte non finalisé.");
    }

    if (
      reservation?.bankHold?.setupIntentId &&
      String(reservation.bankHold.setupIntentId) !== String(setupIntent.id)
    ) {
      throw new Error("SetupIntent invalide pour cette réservation.");
    }

    reservation.bankHold.setupIntentId = setupIntent.id || "";
    reservation.bankHold.stripeCustomerId =
      setupIntent.customer || reservation.bankHold.stripeCustomerId || "";
    reservation.bankHold.stripePaymentMethodId =
      setupIntent.payment_method || "";
    reservation.bankHold.cardCollectedAt = new Date();
    reservation.bankHold.status = "card_saved";
    reservation.bankHold.lastError = "";
  } else if (intentType === "payment") {
    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);

    if (!paymentIntent) {
      throw new Error("PaymentIntent introuvable.");
    }

    const validStatuses = new Set(["requires_capture", "succeeded"]);
    if (!validStatuses.has(String(paymentIntent.status || ""))) {
      throw new Error("Autorisation bancaire non finalisée.");
    }

    if (
      reservation?.bankHold?.paymentIntentId &&
      String(reservation.bankHold.paymentIntentId) !== String(paymentIntent.id)
    ) {
      throw new Error("PaymentIntent invalide pour cette réservation.");
    }

    reservation.bankHold.paymentIntentId = paymentIntent.id || "";
    reservation.bankHold.stripeCustomerId =
      paymentIntent.customer || reservation.bankHold.stripeCustomerId || "";
    reservation.bankHold.stripePaymentMethodId =
      paymentIntent.payment_method || "";
    reservation.bankHold.cardCollectedAt = new Date();
    reservation.bankHold.authorizedAt = new Date();
    reservation.bankHold.status = "authorized";
    reservation.bankHold.lastError = "";
  } else {
    throw new Error("Type d’intent non supporté.");
  }

  reservation.status = finalStatus;

  const reminderFields = buildReminder24hFields({
    status: finalStatus,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
  });

  reservation.reminder24hDueAt = reminderFields.reminder24hDueAt;
  reservation.reminder24hSentAt = reminderFields.reminder24hSentAt;
  reservation.reminder24hLockedAt = reminderFields.reminder24hLockedAt;

  await reservation.save();

  await onReservationCreated(reservation.customer?._id, reservation);

  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(reservation.restaurant_id),
    reservation: reservation.toObject ? reservation.toObject() : reservation,
  });

  await notifyReservationAfterBankHoldFinalization(reservation);

  try {
    const restaurantName = restaurant?.name || "Restaurant";

    if (reservation.status === "Pending") {
      sendReservationEmail("pending", {
        reservation,
        restaurantName,
      }).catch((e) => {
        console.error(
          "Email finalize(public/pending) failed:",
          e?.response?.body || e,
        );
      });
    }

    if (reservation.status === "Confirmed") {
      sendReservationEmail("confirmed", {
        reservation,
        restaurantName,
      }).catch((e) => {
        console.error(
          "Email finalize(public/confirmed) failed:",
          e?.response?.body || e,
        );
      });
    }
  } catch (e) {
    console.error("Email finalize(public) failed:", e?.response?.body || e);
  }

  const updatedRestaurant = await fetchRestaurantFull(
    String(reservation.restaurant_id),
  );

  return {
    reservation,
    restaurant: updatedRestaurant,
  };
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
      let unassignedReservationsNeedingAssignment = 0;

      if (!prevManage && nextManage) {
        const ids = restaurant.reservations?.list || [];

        if (ids.length) {
          const reservations = await ReservationModel.find({
            _id: { $in: ids },
          })
            .select("status pendingExpiresAt table bankHold")
            .lean();

          manualTablesNeedingAssignment = reservations.filter((r) => {
            if (!isBlockingReservation(r)) return false;
            return (
              r?.table?.source === "manual" &&
              Boolean((r?.table?.name || "").trim())
            );
          }).length;

          unassignedReservationsNeedingAssignment = reservations.filter((r) => {
            if (!isBlockingReservation(r)) return false;
            // ✅ table complètement absente
            return !r?.table;
          }).length;
        }
      }

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        message: "Reservation parameters updated successfully",
        restaurant: updatedRestaurant,
        manualTablesNeedingAssignment,
        unassignedReservationsNeedingAssignment,
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

/* ---------------------------------------------------------
   FINALIZE BANK HOLD / CARD SETUP
--------------------------------------------------------- */
router.post(
  "/reservations/:reservationId/bank-hold/finalize-public",
  async (req, res) => {
    const { reservationId } = req.params;
    const { intentType, intentId } = req.body || {};

    try {
      if (!intentType || !intentId) {
        return res.status(400).json({
          message: "intentType et intentId sont requis.",
        });
      }

      const result = await finalizePublicBankHoldReservation({
        reservationId,
        intentType,
        intentId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error finalizing public bank hold:", error);
      return res.status(500).json({
        message:
          error?.message ||
          "Impossible de finaliser la validation de la carte bancaire.",
      });
    }
  },
);

/* ---------------------------------------------------------
   PREPARE BANK HOLD / CARD SETUP
--------------------------------------------------------- */

router.post(
  "/reservations/:reservationId/bank-hold/prepare",
  async (req, res) => {
    const { reservationId } = req.params;

    try {
      const reservation = await ReservationModel.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Réservation introuvable." });
      }

      if (reservation.status !== "AwaitingBankHold") {
        return res.status(400).json({
          message: "Cette réservation ne nécessite plus de validation carte.",
        });
      }

      if (
        reservation.bankHold?.expiresAt &&
        new Date(reservation.bankHold.expiresAt) < new Date()
      ) {
        return res.status(400).json({
          message: "Le délai de validation est expiré.",
        });
      }

      const restaurant = await RestaurantModel.findById(
        reservation.restaurant_id,
      );
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant introuvable." });
      }

      const stripe = getStripeClientForRestaurant(restaurant);
      if (!stripe) {
        return res.status(400).json({
          message: "Clé Stripe restaurant introuvable.",
        });
      }

      let clientSecret = null;
      let intentType = null;

      if (reservation.bankHold?.flow === "scheduled") {
        if (reservation.bankHold?.setupIntentId) {
          const setupIntent = await stripe.setupIntents.retrieve(
            reservation.bankHold.setupIntentId,
          );

          clientSecret = setupIntent.client_secret;
          intentType = "setup";
        } else {
          const created = await createPublicBankHoldIntent({
            stripe,
            reservation,
            flow: "scheduled",
          });

          reservation.bankHold.setupIntentId = created.setupIntentId;
          await reservation.save();

          clientSecret = created.clientSecret;
          intentType = "setup";
        }
      } else {
        if (reservation.bankHold?.paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            reservation.bankHold.paymentIntentId,
          );

          clientSecret = paymentIntent.client_secret;
          intentType = "payment";
        } else {
          const created = await createPublicBankHoldIntent({
            stripe,
            reservation,
            flow: "immediate",
          });

          reservation.bankHold.paymentIntentId = created.paymentIntentId;
          await reservation.save();

          clientSecret = created.clientSecret;
          intentType = "payment";
        }
      }

      return res.status(200).json({
        reservationId: String(reservation._id),
        intentType,
        clientSecret,
        flow: reservation.bankHold?.flow,
        amountTotal: reservation.bankHold?.amountTotal || 0,
        currency: reservation.bankHold?.currency || "eur",
      });
    } catch (error) {
      console.error("Error preparing public bank hold:", error);
      return res.status(500).json({
        message: "Impossible de préparer la validation de la carte.",
      });
    }
  },
);

/* ---------------------------------------------------------
   RETRY BANK HOLD / CARD SETUP
--------------------------------------------------------- */
router.post(
  "/reservations/:reservationId/bank-hold/retry",
  async (req, res) => {
    const { reservationId } = req.params;

    try {
      const reservation = await ReservationModel.findById(reservationId);

      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      if (reservation.status !== "AwaitingBankHold") {
        return res.status(400).json({
          message: "Cette réservation ne nécessite plus d’empreinte bancaire",
        });
      }

      if (
        reservation.bankHold?.expiresAt &&
        reservation.bankHold.expiresAt < new Date()
      ) {
        return res.status(400).json({
          message: "Le délai de validation est expiré",
        });
      }

      const baseUrl = String(req.body?.baseUrl || "").trim();
      if (!baseUrl) {
        return res.status(400).json({ message: "baseUrl manquant." });
      }

      return res.status(200).json({
        url: `${baseUrl}/reservations/${reservation._id}/bank-hold`,
      });
    } catch (err) {
      console.error(err);

      return res.status(500).json({
        message: "Impossible de relancer la validation",
      });
    }
  },
);

/* ---------------------------------------------------------
   RESUME PUBLIC BANK HOLD / CARD SETUP
--------------------------------------------------------- */
router.post(
  "/reservations/:reservationId/cancel-pending-bank-hold",
  async (req, res) => {
    const { reservationId } = req.params;

    try {
      const reservation = await ReservationModel.findById(reservationId);

      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      if (reservation.status !== "AwaitingBankHold") {
        return res.status(400).json({
          message:
            "Cette réservation n'est plus en attente d’empreinte bancaire.",
        });
      }

      reservation.status = "Canceled";
      reservation.canceledAt = new Date();

      reservation.reminder24hDueAt = null;
      reservation.reminder24hSentAt = null;
      reservation.reminder24hLockedAt = null;

      reservation.bankHold.lastError =
        "Réservation annulée par le client avant validation de l’empreinte bancaire.";

      await reservation.save();

      broadcastToRestaurant(String(reservation.restaurant_id), {
        type: "reservation_updated",
        restaurantId: String(reservation.restaurant_id),
        reservation: reservation.toObject
          ? reservation.toObject()
          : reservation,
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error canceling pending bank hold reservation:", error);
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

  if (reservationData.idempotencyKey) {
    const existing = await ReservationModel.findOne({
      restaurant_id: restaurantId,
      idempotencyKey: reservationData.idempotencyKey,
    });

    if (existing) {
      if (existing.status === "AwaitingBankHold") {
        if (
          existing.bankHold?.expiresAt &&
          new Date(existing.bankHold.expiresAt) < new Date()
        ) {
          return res.status(400).json({
            message: "Le délai de validation de la carte est expiré.",
          });
        }

        const baseOrigin = (() => {
          try {
            return new URL(String(reservationData.returnUrl || "")).origin;
          } catch {
            return "";
          }
        })();

        if (!baseOrigin) {
          return res.status(400).json({
            message: "returnUrl manquant pour reprendre la validation carte.",
          });
        }

        return res.status(200).json({
          requiresAction: true,
          reservationId: existing._id,
          redirectUrl: `${baseOrigin}/reservations/${existing._id}/bank-hold`,
        });
      }

      return res.status(200).json({
        reservation: existing,
      });
    }
  }

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

    const bankHoldPlan = buildBankHoldPlan({
      restaurant,
      parameters,
      reservationDateUTC: normalizedDay,
      reservationTime: reservationData.reservationTime,
      numberOfGuests: reservationData.numberOfGuests,
    });

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

      // ✅ si now est dans un blocked range => anchor = fin du blocked range
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
        status: { $in: BLOCKING_STATUSES },
      })
        .select("status reservationTime pendingExpiresAt table bankHold")
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

        if (reservedIds.has(String(wanted._id))) {
          return res
            .status(409)
            .json({ message: "La table sélectionnée n'est plus disponible." });
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

    const customerFirstName = cleanNamePart(reservationData.customerFirstName);
    const customerLastName = cleanNamePart(reservationData.customerLastName);

    if (!customerFirstName || !customerLastName) {
      return res.status(400).json({
        message: "customerFirstName et customerLastName sont requis.",
      });
    }

    const customerEmail = String(reservationData.customerEmail || "").trim();
    const customerPhone = String(reservationData.customerPhone || "").trim();

    const customer = await upsertCustomer({
      restaurantId,
      firstName: customerFirstName,
      lastName: customerLastName,
      email: customerEmail,
      phone: customerPhone,
    });

    // -------------------------------------------------
    // FLOW NORMAL (sans empreinte bancaire)
    // -------------------------------------------------
    if (!bankHoldPlan.enabled) {
      const newReservation = await ReservationModel.create({
        restaurant_id: restaurantId,
        idempotencyKey: reservationData.idempotencyKey || null,
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
        numberOfGuests: reservationData.numberOfGuests,
        reservationDate: normalizedDay,
        reservationTime: reservationData.reservationTime,
        commentary: reservationData.commentary,
        table: assignedTable,

        status: computedStatus,
        source: "public",
        pendingExpiresAt,

        ...buildReminder24hFields({
          status: computedStatus,
          reservationDate: normalizedDay,
          reservationTime: reservationData.reservationTime,
        }),

        activatedAt: null,
        finishedAt: null,
        customer: customer?._id || null,
      });

      await onReservationCreated(customer?._id, newReservation);

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
          customerName: getCustomerFullNameFromReservation(newReservation),
          numberOfGuests: newReservation?.numberOfGuests,
          reservationDate: newReservation?.reservationDate,
          reservationTime: newReservation?.reservationTime,
          status: newReservation?.status,
          tableName: newReservation?.table?.name || null,
        },
      });

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
    }

    // -------------------------------------------------
    // FLOW AVEC EMPREINTE / SETUP CARTE
    // -------------------------------------------------
    const returnUrl = String(reservationData.returnUrl || "").trim();
    if (!returnUrl) {
      return res.status(400).json({
        message: "returnUrl manquant pour la validation de la carte.",
      });
    }

    // ✅ expiration du lien = min(now + 1h, heure de réservation)
    const bankHoldExpiresAt = computeBankHoldActionExpiresAt(
      normalizedDay,
      reservationData.reservationTime,
    );

    const newReservation = await ReservationModel.create({
      restaurant_id: restaurantId,
      idempotencyKey: reservationData.idempotencyKey || null,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerPhone,
      numberOfGuests: reservationData.numberOfGuests,
      reservationDate: normalizedDay,
      reservationTime: reservationData.reservationTime,
      commentary: reservationData.commentary,
      table: assignedTable,
      customer: customer?._id || null,

      status: "AwaitingBankHold",
      source: "public",
      pendingExpiresAt: null,

      bankHold: {
        enabled: true,
        flow: bankHoldPlan.flow,
        amountPerPerson: Number(bankHoldPlan.amountPerPerson || 0),
        amountTotal: Number(bankHoldPlan.amountTotal || 0),
        currency: "eur",
        status: bankHoldPlan.initialBankHoldStatus,
        authorizationScheduledFor: bankHoldPlan.authorizationScheduledFor,
        expiresAt: bankHoldExpiresAt,
      },

      reminder24hDueAt: null,
      reminder24hSentAt: null,
      reminder24hLockedAt: null,

      activatedAt: null,
      finishedAt: null,
    });

    try {
      await onReservationCreated(customer?._id, newReservation);

      restaurant.reservations.list.push(newReservation._id);
      await restaurant.save();

      broadcastToRestaurant(restaurantId, {
        type: "reservation_created",
        restaurantId,
        reservation: newReservation,
      });

      const baseOrigin = new URL(returnUrl).origin;

      return res.status(200).json({
        requiresAction: true,
        reservationId: newReservation._id,
        redirectUrl: `${baseOrigin}/reservations/${newReservation._id}/bank-hold`,
      });
    } catch (error) {
      console.error("Error preparing bank hold reservation:", error);

      await ReservationModel.findByIdAndDelete(newReservation._id);

      return res.status(500).json({
        message: "Impossible de préparer la validation de la carte bancaire.",
      });
    }
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
    const requestBankHold = Boolean(req.body?.requestBankHold);

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

      const bankHoldPlan = requestBankHold
        ? buildBankHoldPlan({
            restaurant,
            parameters,
            reservationDateUTC: normalizedDay,
            reservationTime: reservationData.reservationTime,
            numberOfGuests: reservationData.numberOfGuests,
          })
        : {
            enabled: false,
            reason: "unchecked_by_dashboard",
            stripeReady: false,
            flow: "none",
            amountPerPerson: 0,
            amountTotal: 0,
            initialBankHoldStatus: "none",
            authorizationScheduledFor: null,
          };

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
          status: { $in: BLOCKING_STATUSES },
        })
          .select("status reservationTime pendingExpiresAt table bankHold")
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

      const customerFirstName = cleanNamePart(
        reservationData.customerFirstName,
      );
      const customerLastName = cleanNamePart(reservationData.customerLastName);

      if (!customerFirstName || !customerLastName) {
        return res.status(400).json({
          message: "customerFirstName et customerLastName sont requis.",
        });
      }

      const customerEmail = String(reservationData.customerEmail || "").trim();
      const customerPhone = String(reservationData.customerPhone || "").trim();

      if (requestBankHold && !customerEmail) {
        return res.status(400).json({
          message:
            "L’adresse email du client est obligatoire pour envoyer le lien d’empreinte bancaire.",
        });
      }

      const customer = await upsertCustomer({
        restaurantId,
        firstName: customerFirstName,
        lastName: customerLastName,
        email: customerEmail,
        phone: customerPhone,
      });

      // -------------------------------------------------
      // FLOW NORMAL (checkbox décochée ou feature inactive)
      // -------------------------------------------------
      if (!bankHoldPlan.enabled) {
        const newReservation = await ReservationModel.create({
          restaurant_id: restaurantId,
          customerFirstName,
          customerLastName,
          customerEmail,
          customerPhone,
          numberOfGuests: reservationData.numberOfGuests,
          reservationDate: normalizedDay,
          reservationTime: reservationData.reservationTime,
          commentary: reservationData.commentary,
          table: assignedTable,
          customer: customer?._id || null,
          status: "Confirmed",
          source: "dashboard",
          pendingExpiresAt: null,

          ...buildReminder24hFields({
            status: "Confirmed",
            reservationDate: normalizedDay,
            reservationTime: reservationData.reservationTime,
          }),

          activatedAt: null,
          finishedAt: null,
        });

        await onReservationCreated(customer?._id, newReservation);

        restaurant.reservations.list.push(newReservation._id);
        await restaurant.save();

        broadcastToRestaurant(restaurantId, {
          type: "reservation_created",
          restaurantId,
          reservation: newReservation,
        });

        try {
          const restaurantName = restaurant?.name || "Restaurant";
          sendReservationEmail("confirmed", {
            reservation: newReservation,
            restaurantName,
          })
            .then((r) => {
              if (r?.skipped) {
                console.log("[reservation-email-skip]", "confirmed", r.reason);
              }
            })
            .catch((e) => {
              console.error("Email create failed:", e?.response?.body || e);
            });
        } catch (e) {
          console.error(
            "Email create(dashboard/confirmed) failed:",
            e?.response?.body || e,
          );
        }

        const updatedRestaurant = await fetchRestaurantFull(restaurantId);
        return res.status(201).json({
          restaurant: updatedRestaurant,
          bankHoldRequested: false,
        });
      }

      // -------------------------------------------------
      // FLOW DASHBOARD AVEC EMPREINTE BANCAIRE
      // -------------------------------------------------
      const returnUrl = String(reservationData.returnUrl || "").trim();
      if (!returnUrl) {
        return res.status(400).json({
          message:
            "returnUrl manquant pour finaliser la validation de l’empreinte bancaire.",
        });
      }

     

      const bankHoldExpiresAt = computeBankHoldActionExpiresAt(
        normalizedDay,
        reservationData.reservationTime,
      );

      const newReservation = await ReservationModel.create({
        restaurant_id: restaurantId,
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
        numberOfGuests: reservationData.numberOfGuests,
        reservationDate: normalizedDay,
        reservationTime: reservationData.reservationTime,
        commentary: reservationData.commentary,
        table: assignedTable,
        customer: customer?._id || null,

        status: "AwaitingBankHold",
        source: "dashboard",
        pendingExpiresAt: null,

        bankHold: {
          enabled: true,
          flow: bankHoldPlan.flow,
          amountPerPerson: Number(bankHoldPlan.amountPerPerson || 0),
          amountTotal: Number(bankHoldPlan.amountTotal || 0),
          currency: "eur",
          status: bankHoldPlan.initialBankHoldStatus,
          authorizationScheduledFor: bankHoldPlan.authorizationScheduledFor,
          expiresAt: bankHoldExpiresAt,
        },

        reminder24hDueAt: null,
        reminder24hSentAt: null,
        reminder24hLockedAt: null,

        activatedAt: null,
        finishedAt: null,
      });

      try {
        await onReservationCreated(customer?._id, newReservation);

        restaurant.reservations.list.push(newReservation._id);
        await restaurant.save();

        broadcastToRestaurant(restaurantId, {
          type: "reservation_created",
          restaurantId,
          reservation: newReservation,
        });

        const baseOrigin = new URL(returnUrl).origin;
        const actionUrl = `${baseOrigin}/reservations/${newReservation._id}/bank-hold`;

        let emailSent = false;

        try {
          const restaurantName = restaurant?.name || "Restaurant";

          const mailResult = await sendReservationEmail(
            "bankHoldActionRequired",
            {
              reservation: newReservation,
              restaurantName,
              actionUrl,
              expiresAt: bankHoldExpiresAt,
              bankHoldAmountTotal: newReservation?.bankHold?.amountTotal,
            },
          );

          emailSent = !mailResult?.skipped;
        } catch (e) {
          console.error(
            "Email create(dashboard/bankHoldActionRequired) failed:",
            e?.response?.body || e,
          );
        }

        const updatedRestaurant = await fetchRestaurantFull(restaurantId);

        return res.status(201).json({
          restaurant: updatedRestaurant,
          bankHoldRequested: true,
          reservationId: newReservation._id,
          emailSent,
          redirectUrl: actionUrl,
        });
      } catch (error) {
        console.error(
          "Error preparing dashboard bank hold reservation:",
          error,
        );

        await ReservationModel.findByIdAndDelete(newReservation._id);

        return res.status(500).json({
          message:
            "Impossible de préparer la validation de l’empreinte bancaire.",
        });
      }
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
      const willBlockSlot = BLOCKING_STATUSES.includes(nextStatus);

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
          status: { $in: BLOCKING_STATUSES },
          _id: { $ne: reservationId },
        })
          .select("status reservationTime pendingExpiresAt table bankHold")
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

      // ✅ pendingExpiresAt si on repasse en Pending
      if (nextStatus === "Pending") {
        if (!reservation.pendingExpiresAt) {
          reservation.pendingExpiresAt = computePendingExpiresAt(restaurant);
        }
      } else {
        reservation.pendingExpiresAt = null;
      }

      const reminderFields = buildReminder24hFields({
        status: nextStatus,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
      });

      reservation.reminder24hDueAt = reminderFields.reminder24hDueAt;
      reservation.reminder24hSentAt = reminderFields.reminder24hSentAt;
      reservation.reminder24hLockedAt = reminderFields.reminder24hLockedAt;

      await reservation.save();

      // ✅ SSE: push temps réel à tous les devices connectés
      broadcastToRestaurant(restaurantId, {
        type: "reservation_updated",
        restaurantId,
        reservation: reservation.toObject
          ? reservation.toObject()
          : reservation, // ✅ FIX
      });

      // ✅ EMAILS (SAFE) — ne doit jamais casser la route
      const restaurantName = restaurant?.name || "Restaurant";
      const logSkip = (type, info) => {
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
      }

      // ✅ 1) s'assurer qu'on a un customerId (upsert si besoin)
      let customerId = reservation.customer;

      if (!customerId) {
        const customer = await upsertCustomer({
          restaurantId,
          firstName: reservation.customerFirstName,
          lastName: reservation.customerLastName,
          email: reservation.customerEmail,
          phone: reservation.customerPhone,
        });

        if (customer) {
          customerId = customer._id;

          // on persiste le lien côté réservation
          await ReservationModel.updateOne(
            { _id: reservation._id },
            { $set: { customer: customerId } },
          );
        }
      }

      // ✅ 2) update stats/historique customer (si on a un id)
      await onReservationStatusChanged(
        customerId,
        reservation,
        prevStatus,
        nextStatus,
      );

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

      const mustBlockSlot = BLOCKING_STATUSES.includes(candidateStatus);

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
          status: { $in: BLOCKING_STATUSES },
          _id: { $ne: reservationId },
        })
          .select("status reservationTime pendingExpiresAt table bankHold")
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

      const shouldRefreshReminder24h = touchesDateTime || statusExplicit;

      if (shouldRefreshReminder24h) {
        const nextStatus = String(updateData.status ?? existing.status);
        const nextDate = updateData.reservationDate ?? candidateDate;
        const nextTime = updateData.reservationTime ?? candidateTime;

        Object.assign(
          updateData,
          buildReminder24hFields({
            status: nextStatus,
            reservationDate: nextDate,
            reservationTime: nextTime,
          }),
        );
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
          "customerFirstName customerLastName numberOfGuests reservationDate reservationTime status table source pendingExpiresAt",
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
          customerName:
            `${String(r.customerFirstName || "").trim()} ${String(r.customerLastName || "").trim()}`.trim(),
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

/* ---------------------------------------------------------
   GET UNASSIGNED TABLES TO FIX (manage_disponibilities ON)
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/reservations/unassigned-tables",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).lean();
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const manage = Boolean(
        restaurant?.reservations?.parameters?.manage_disponibilities,
      );
      if (!manage) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      const ids = restaurant?.reservations?.list || [];
      if (!ids.length) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      const reservations = await ReservationModel.find({ _id: { $in: ids } })
        .select(
          "customerFirstName customerLastName numberOfGuests reservationDate reservationTime status table source pendingExpiresAt",
        )
        .lean();

      const toFix = reservations
        .filter((r) => {
          if (!isBlockingReservation(r)) return false;
          return !r?.table; // ✅ pas de table du tout
        })
        .map((r) => ({
          _id: r._id,
          customerName:
            `${String(r.customerFirstName || "").trim()} ${String(r.customerLastName || "").trim()}`.trim(),
          numberOfGuests: r.numberOfGuests ?? null,
          reservationDate: r.reservationDate,
          reservationTime: String(r.reservationTime || "").slice(0, 5),
          status: r.status,
          tableName: null,
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

      return res.status(200).json({ count: toFix.length, reservations: toFix });
    } catch (e) {
      console.error("Error getting unassigned tables to fix:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
