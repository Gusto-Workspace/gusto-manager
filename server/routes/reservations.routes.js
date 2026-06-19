const express = require("express");
const Stripe = require("stripe");
const { createHash, randomBytes, randomUUID } = require("crypto");
const router = express.Router();

// DATE-FNS
const { format } = require("date-fns");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const ReservationModel = require("../models/reservation.model");
const ReservationDayLockModel = require("../models/reservation-day-lock.model");
const {
  enrichReservationWithCustomerSummary,
  getRestaurantReservationsList,
} = require("../services/restaurant-reservations.service");

// SSE BUS
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// SERVICE NOTIFS
const {
  createAndBroadcastNotification,
} = require("../services/notifications.service");

// SERVICE MAILS RESERVATIONS
const {
  sendReservationEmail,
  sendRestaurantNewPublicReservationEmail,
  sanitizeReservationEmailTemplatesInput,
} = require("../services/reservations-mailer.service");

// SERVICE CUSTOMERS
const {
  upsertCustomer,
  onReservationCreated,
  onReservationStatusChanged,
} = require("../services/customers.service");
const { normalizeNamePart } = require("../services/name-normalization.service");

// ENCRYPTION
const { decryptApiKey } = require("../services/encryption.service");
const {
  buildReservationBankHoldStripeMetadata,
} = require("../services/reservation-bank-hold-metadata.service");
const {
  getCurrentReservationService,
  isPublicReservationBlockedByCurrentService,
} = require("../services/reservation-service-closure.service");

const BANK_HOLD_IMMEDIATE_WINDOW_HOURS = 168; // 7 jours

const BANK_HOLD_SCHEDULE_BEFORE_HOURS = 72;
const RESERVATION_DAY_LOCK_HOLD_MS = 10 * 1000;
const RESERVATION_DAY_LOCK_WAIT_MS = 4 * 1000;
const RESERVATION_DAY_LOCK_RETRY_MS = 120;

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

function normalizeTableIdList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function isFloorplanRoomEnabled(room) {
  return room?.enabled !== false;
}

function getFloorplanRooms(parameters = {}, { enabledOnly = false } = {}) {
  const rooms = Array.isArray(parameters?.floorplan?.rooms)
    ? parameters.floorplan.rooms
    : [];

  return enabledOnly ? rooms.filter(isFloorplanRoomEnabled) : rooms;
}

function getDisabledFloorplanTableIds(parameters = {}) {
  const ids = new Set();
  const rooms = getFloorplanRooms(parameters);

  rooms.forEach((room) => {
    if (isFloorplanRoomEnabled(room)) return;

    const objects = Array.isArray(room?.objects) ? room.objects : [];
    objects.forEach((obj) => {
      if (obj?.type !== "table" || !obj?.tableRefId) return;
      ids.add(String(obj.tableRefId || "").trim());
    });
  });

  return ids;
}

function getEnabledCatalogTables(parameters = {}) {
  const disabledTableIds = getDisabledFloorplanTableIds(parameters);
  const tables = Array.isArray(parameters?.tables) ? parameters.tables : [];

  if (!disabledTableIds.size) return tables;

  return tables.filter(
    (table) => !disabledTableIds.has(String(table?._id || "").trim()),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidHHmm(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

function normalizeReservationDateKey(value) {
  if (!value) return "";

  const stringValue = String(value).trim();
  const dateMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeReservationExceptionalOpeningsInput(value) {
  if (!Array.isArray(value)) return [];

  const byDate = new Map();

  value.forEach((opening) => {
    const date = normalizeReservationDateKey(opening?.date);
    if (!date) return;

    const hours = (Array.isArray(opening?.hours) ? opening.hours : [])
      .map((range) => ({
        open: String(range?.open || "").trim().slice(0, 5),
        close: String(range?.close || "").trim().slice(0, 5),
      }))
      .filter((range) => {
        if (!isValidHHmm(range.open) || !isValidHHmm(range.close)) {
          return false;
        }

        return minutesFromHHmm(range.open) < minutesFromHHmm(range.close);
      });

    if (!hours.length) return;
    byDate.set(date, { date, hours });
  });

  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

function getReservationExceptionalOpeningForDate(parameters, reservationDate) {
  const dateKey = normalizeReservationDateKey(reservationDate);
  if (!dateKey) return null;

  const openings = Array.isArray(parameters?.exceptional_openings)
    ? parameters.exceptional_openings
    : [];

  const opening = openings.find(
    (item) => normalizeReservationDateKey(item?.date) === dateKey,
  );

  if (!opening || !Array.isArray(opening.hours) || opening.hours.length === 0) {
    return null;
  }

  const hours = opening.hours.filter(
    (range) =>
      isValidHHmm(range?.open) &&
      isValidHHmm(range?.close) &&
      minutesFromHHmm(range.open) < minutesFromHHmm(range.close),
  );

  if (!hours.length) return null;
  return { day: "exceptional", isClosed: false, hours };
}

function getConfiguredTableIds(tableLike) {
  if (!tableLike || typeof tableLike !== "object") return [];

  const tableIds = normalizeTableIdList(tableLike.tableIds);
  if (tableIds.length > 0) return tableIds;

  if (tableLike._id) {
    return [String(tableLike._id)];
  }

  return [];
}

function buildCombinedTableSelectionKey(tableIds = []) {
  const ids = normalizeTableIdList(tableIds).sort();
  return ids.length > 1 ? `combo:${ids.join("+")}` : ids[0] || "";
}

function getConfiguredTableSelectionKey(tableLike) {
  const ids = getConfiguredTableIds(tableLike);
  return buildCombinedTableSelectionKey(ids);
}

function parseConfiguredTableSelection(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.startsWith("combo:")) {
    return {
      key: buildCombinedTableSelectionKey(raw.slice(6).split("+")),
    };
  }

  return {
    key: buildCombinedTableSelectionKey([raw]),
  };
}

function buildConfiguredTableLikeFromSelectionKey(selectionKey) {
  const normalizedKey = String(selectionKey || "").trim();
  if (!normalizedKey) return null;

  if (normalizedKey.startsWith("combo:")) {
    return {
      tableIds: normalizedKey.slice(6).split("+"),
    };
  }

  return {
    _id: normalizedKey,
    tableIds: [normalizedKey],
  };
}

function sortTableOptionsByPriority(options = []) {
  return [...options].sort((a, b) => {
    const pa = normalizeBookingPriority(a?.bookingPriority);
    const pb = normalizeBookingPriority(b?.bookingPriority);

    if (pa !== pb) return pb - pa;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function buildSingleTableOption(tableDef) {
  const id = String(tableDef?._id || "");

  return {
    _id: id,
    name: String(tableDef?.name || "").trim(),
    seats: Number(tableDef?.seats || 0),
    bookingPriority: normalizeBookingPriority(tableDef?.bookingPriority),
    onlineBookable: tableDef?.onlineBookable !== false,
    combinableWith: normalizeTableIdList(tableDef?.combinableWith),
    tableIds: id ? [id] : [],
    selectionKey: id,
    kind: "single",
  };
}

function buildCombinedTableOption(tableA, tableB) {
  const pair = [tableA, tableB].filter(Boolean).sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "fr", {
      sensitivity: "base",
      numeric: true,
    }),
  );

  const tableIds = normalizeTableIdList(pair.map((table) => table?._id));
  const selectionKey = buildCombinedTableSelectionKey(tableIds);

  return {
    _id: selectionKey,
    tableIds,
    name: pair.map((table) => String(table?.name || "")).join(" + "),
    seats: pair.reduce((sum, table) => sum + Number(table?.seats || 0), 0),
    bookingPriority: pair.reduce(
      (sum, table) => sum + normalizeBookingPriority(table?.bookingPriority),
      0,
    ),
    onlineBookable: pair.every((table) => table?.onlineBookable !== false),
    kind: "combo",
    componentTables: pair.map((table) => ({
      _id: String(table?._id || ""),
      name: String(table?.name || ""),
      seats: Number(table?.seats || 0),
    })),
  };
}

function getEligibleCombinedTables({
  parameters,
  requiredSize,
  channel = "dashboard",
}) {
  const tables = getEnabledCatalogTables(parameters);
  const catalogById = new Map(
    tables.map((table) => [String(table?._id || ""), table]),
  );
  const seenPairs = new Set();
  const combos = [];

  for (const table of tables) {
    const tableId = String(table?._id || "");
    if (!tableId) continue;

    const relatedIds = normalizeTableIdList(table?.combinableWith);

    for (const relatedId of relatedIds) {
      if (relatedId === tableId) continue;

      const other = catalogById.get(relatedId);
      if (!other?._id) continue;

      const otherLinks = normalizeTableIdList(other.combinableWith);
      if (!otherLinks.includes(tableId)) continue;

      const pairKey = [tableId, relatedId].sort().join("+");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const combinedSeats =
        Number(table?.seats || 0) + Number(other?.seats || 0);

      if (combinedSeats !== Number(requiredSize)) continue;

      if (
        channel === "public" &&
        (table?.onlineBookable === false || other?.onlineBookable === false)
      ) {
        continue;
      }

      combos.push(buildCombinedTableOption(table, other));
    }
  }

  return sortTableOptionsByPriority(combos);
}

function getAvailableConfiguredTableOptions({
  parameters,
  singleSeatSizes = [],
  comboSeatSize = 0,
  channel = "dashboard",
  allowLargerSingleTables = false,
  minimumSingleSeats = 0,
  maximumSingleSeats = 0,
  blockingReservations,
  overlaps,
  blockedTableIds = new Set(),
}) {
  const singleOptions = getEligibleTables({
    parameters,
    singleSeatSizes,
    channel,
    allowLargerSingleTables,
    minimumSingleSeats,
    maximumSingleSeats,
  });

  const singleState = computeCapacityState({
    blockingReservations,
    overlaps,
    eligibleTables: singleOptions,
    blockedTableIds,
  });

  const freeSingleOptions = singleOptions.filter((tableDef) =>
    isConfiguredTableFree({
      tableDef,
      blockingReservations,
      overlaps,
      blockedTableIds,
    }),
  );

  if (
    singleState.capacity > 0 &&
    singleState.reservedIds.size + singleState.unassignedCount <
      singleState.capacity &&
    freeSingleOptions.length > 0
  ) {
    return {
      mode: "single",
      options: freeSingleOptions,
      singleState,
    };
  }

  if (singleState.unassignedCount > 0) {
    return {
      mode: "blocked_by_unassigned",
      options: [],
      singleState,
    };
  }

  if (!comboSeatSize) {
    return {
      mode: "none",
      options: [],
      singleState,
    };
  }

  const comboOptions = getEligibleCombinedTables({
    parameters,
    requiredSize: comboSeatSize,
    channel,
  });

  const freeComboOptions = comboOptions.filter((tableDef) =>
    isConfiguredTableFree({
      tableDef,
      blockingReservations,
      overlaps,
      blockedTableIds,
    }),
  );

  return {
    mode: freeComboOptions.length > 0 ? "combo" : "none",
    options: freeComboOptions,
    singleState,
  };
}

function findConfiguredOptionBySelectionKey(options = [], selectionKey = "") {
  const normalizedKey = String(selectionKey || "");
  if (!normalizedKey) return null;

  return (
    options.find(
      (option) => getConfiguredTableSelectionKey(option) === normalizedKey,
    ) || null
  );
}

function buildTableChangePayload(oldTableDef, newTableDef) {
  if (!oldTableDef || !newTableDef) return null;

  return {
    oldTableId: getConfiguredTableSelectionKey(oldTableDef) || null,
    oldTableName: oldTableDef?.name || null,
    newTableId: getConfiguredTableSelectionKey(newTableDef) || null,
    newTableName: newTableDef?.name || null,
  };
}

function getCurrentConfiguredOptionFromCatalog({
  parameters,
  currentTable,
  singleSeatSizes = [],
  comboSeatSize = 0,
  channel = "dashboard",
  allowLargerSingleTables = false,
  minimumSingleSeats = 0,
  maximumSingleSeats = 0,
}) {
  const currentIds = getConfiguredTableIds(currentTable);
  if (currentIds.length === 0) return null;

  const tables = getEnabledCatalogTables(parameters);
  const catalogById = new Map(
    tables.map((table) => [String(table?._id || ""), table]),
  );

  if (currentIds.length === 1) {
    const table = catalogById.get(currentIds[0]);
    if (!table) return null;
    const allowedSeats = new Set(
      (Array.isArray(singleSeatSizes) ? singleSeatSizes : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
    const tableSeats = Number(table?.seats);
    const minSeats = Number(minimumSingleSeats || 0);
    const maxSeats = Number(maximumSingleSeats || 0);
    const seatsMatch =
      allowLargerSingleTables && Number.isFinite(minSeats) && minSeats > 0
        ? tableSeats >= minSeats &&
          (!Number.isFinite(maxSeats) ||
            maxSeats <= 0 ||
            tableSeats <= maxSeats)
        : allowedSeats.has(tableSeats);
    if (!seatsMatch) return null;
    if (channel === "public" && table?.onlineBookable === false) return null;
    return buildSingleTableOption(table);
  }

  if (currentIds.length === 2) {
    const pair = currentIds.map((id) => catalogById.get(id));
    if (pair.some((table) => !table?._id)) return null;

    const [tableA, tableB] = pair;
    const aLinks = normalizeTableIdList(tableA?.combinableWith);
    const bLinks = normalizeTableIdList(tableB?.combinableWith);

    if (
      !aLinks.includes(String(tableB?._id || "")) ||
      !bLinks.includes(String(tableA?._id || ""))
    ) {
      return null;
    }

    const option = buildCombinedTableOption(tableA, tableB);
    if (Number(option?.seats) !== Number(comboSeatSize)) return null;
    if (channel === "public" && option?.onlineBookable === false) return null;
    return option;
  }

  return null;
}

function computeCapacityState({
  blockingReservations,
  overlaps,
  eligibleTables,
  blockedTableIds = new Set(),
}) {
  const capacity = eligibleTables.length;
  const eligibleSeatSizes = new Set(
    eligibleTables
      .map((table) => Number(table?.seats))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  const eligibleIds = new Set(
    eligibleTables.map((t) => getConfiguredTableSelectionKey(t)),
  );
  const eligibleByName = new Map(
    eligibleTables.map((t) => [
      String(t.name || "")
        .trim()
        .toLowerCase(),
      getConfiguredTableSelectionKey(t),
    ]),
  );

  const reservedIds = new Set();
  blockedTableIds.forEach((id) => {
    reservedIds.add(String(id));
  });
  let unassignedCount = 0;

  blockingReservations.forEach((r) => {
    if (!r?.table) return;
    if (!overlaps(r)) return;

    // ----- CONFIGURED -----
    if (r.table.source === "configured") {
      const id = getConfiguredTableSelectionKey(r.table);
      const reservationIds = getConfiguredTableIds(r.table);

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
      const seatsOk = eligibleSeatSizes.has(Number(r.table.seats));
      if (seatsOk && reservationIds.length <= 1) {
        unassignedCount += 1;
        return;
      }

      return;
    }

    // ----- MANUAL -----
    if (r.table.source === "manual") {
      const name = String(r.table.name || "").trim();
      const seatsOk = eligibleSeatSizes.has(Number(r.table.seats));
      if (name && seatsOk) unassignedCount += 1;
    }
  });

  return { capacity, reservedIds, unassignedCount };
}

function isConfiguredTableFree({
  tableDef,
  blockingReservations,
  overlaps,
  blockedTableIds = new Set(),
}) {
  const targetIds = getConfiguredTableIds(tableDef);
  if (targetIds.length === 0) return false;

  const targetIdSet = new Set(targetIds);
  const targetName = String(tableDef?.name || "");

  if (targetIds.some((targetId) => blockedTableIds.has(targetId))) {
    return false;
  }

  const conflict = blockingReservations.find((r) => {
    if (!r?.table) return false;
    if (!overlaps(r)) return false;

    const reservationIds = getConfiguredTableIds(r.table);
    const sharesTable =
      reservationIds.length > 0 &&
      reservationIds.some((reservationId) => targetIdSet.has(reservationId));
    const sameName =
      reservationIds.length === 0 && String(r.table.name || "") === targetName;

    return sharesTable || sameName;
  });

  return !conflict;
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
  "Waitlist",
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

  if (r.status === "Waitlist") {
    const state = String(r?.waitlistOffer?.state || "").trim();
    const expiresAt = r?.waitlistOffer?.offerExpiresAt
      ? new Date(r.waitlistOffer.offerExpiresAt).getTime()
      : null;

    return (
      state === "offered" &&
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now()
    );
  }

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

function getEligibleSingleTableSeatSizesFromGuests(n) {
  const g = Number(n || 0);
  if (!Number.isFinite(g) || g <= 0) return [];
  if (g === 1) return [1, 2];
  return [requiredTableSizeFromGuests(g)];
}

function getRequiredCombinedTableSizeFromGuests(n) {
  const g = Number(n || 0);
  if (!Number.isFinite(g) || g <= 1) return 0;
  return requiredTableSizeFromGuests(g);
}

function getMinimumSingleTableSeatsFromGuests(n) {
  const g = Number(n || 0);
  if (!Number.isFinite(g) || g <= 0) return 0;
  if (g <= 3) return g;
  return g % 2 === 0 ? g - 1 : g;
}

function getMaximumSingleTableSeatsFromGuests(n) {
  const g = Number(n || 0);
  if (!Number.isFinite(g) || g <= 0) return 0;
  if (g === 1) return 2;
  if (g === 2) return 4;
  return 0;
}

function normalizeBookingPriority(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sortTablesByPriority(tables = []) {
  return [...tables].sort((a, b) => {
    const pa = normalizeBookingPriority(a?.bookingPriority);
    const pb = normalizeBookingPriority(b?.bookingPriority);

    if (pa !== pb) return pb - pa;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function filterActiveOrUpcomingTableBlockedRanges(
  ranges = [],
  now = new Date(),
) {
  const nowTs = now.getTime();

  return (Array.isArray(ranges) ? ranges : []).filter((range) => {
    const endTs = new Date(range?.endAt).getTime();
    return Number.isFinite(endTs) && endTs > nowTs;
  });
}

function isTableBlockOverlapping({ block, candidateStart, candidateEnd }) {
  if (!block) return false;

  const blockStart = new Date(block.startAt).getTime();
  const blockEnd = new Date(block.endAt).getTime();

  if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) return false;

  const start = candidateStart.getTime();
  const end = candidateEnd.getTime();

  return start <= blockEnd && end > blockStart;
}

function getBlockedTableIdsForDateTime(
  parameters,
  candidateDateTime,
  occupancyMs,
) {
  const ranges = Array.isArray(parameters?.table_blocked_ranges)
    ? parameters.table_blocked_ranges
    : [];

  if (!(candidateDateTime instanceof Date)) return new Set();
  if (Number.isNaN(candidateDateTime.getTime())) return new Set();

  const candidateStart = new Date(candidateDateTime);
  const candidateEnd = new Date(
    candidateDateTime.getTime() + Math.max(1, Number(occupancyMs) || 0),
  );

  const ids = new Set();

  for (const range of ranges) {
    if (
      isTableBlockOverlapping({
        block: range,
        candidateStart,
        candidateEnd,
      })
    ) {
      ids.add(String(range.tableId));
    }
  }

  return ids;
}

function getEligibleTables({
  parameters,
  singleSeatSizes = [],
  channel = "dashboard",
  allowLargerSingleTables = false,
  minimumSingleSeats = 0,
  maximumSingleSeats = 0,
}) {
  let pool = getEnabledCatalogTables(parameters);
  const allowedSeats = new Set(
    (Array.isArray(singleSeatSizes) ? singleSeatSizes : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  const minSeats = Number(minimumSingleSeats || 0);
  const maxSeats = Number(maximumSingleSeats || 0);

  pool = pool.filter((table) => {
    const tableSeats = Number(table.seats);
    return allowLargerSingleTables && Number.isFinite(minSeats) && minSeats > 0
      ? tableSeats >= minSeats &&
          (!Number.isFinite(maxSeats) ||
            maxSeats <= 0 ||
            tableSeats <= maxSeats)
      : allowedSeats.has(tableSeats);
  });

  if (channel === "public") {
    pool = pool.filter((table) => table?.onlineBookable !== false);
  }

  return sortTablesByPriority(pool).map(buildSingleTableOption);
}

function buildAssignedTablePayload(tableDef) {
  const tableIds = getConfiguredTableIds(tableDef);

  return {
    tableIds,
    name: String(tableDef?.name || "").trim(),
    seats: Number(tableDef?.seats || 0),
    source: "configured",
  };
}

function normalizeDashboardTableInput({
  table,
  tableMode,
  manageDisponibilities = false,
}) {
  const rawMode = String(tableMode || "")
    .trim()
    .toLowerCase();
  const rawValue = String(table || "").trim();

  if (rawMode === "empty") {
    return { mode: "empty", value: "" };
  }

  if (rawMode === "manual") {
    return {
      mode: rawValue ? "manual" : "empty",
      value: rawValue,
    };
  }

  if (rawMode === "configured") {
    const selection = parseConfiguredTableSelection(rawValue);
    return selection
      ? { mode: "configured", value: selection.key }
      : { mode: "empty", value: "" };
  }

  if (!rawValue || rawValue === "auto") {
    return { mode: "empty", value: "" };
  }

  if (manageDisponibilities) {
    const selection = parseConfiguredTableSelection(rawValue);
    return selection
      ? { mode: "configured", value: selection.key }
      : { mode: "empty", value: "" };
  }

  return { mode: "manual", value: rawValue };
}

async function getConfiguredTableAvailabilityForCandidate({
  restaurantId,
  parameters,
  reservationDateUTC,
  reservationTime,
  numberOfGuests,
  reservationIdToExclude = null,
  channel = "dashboard",
  allowLargerSingleTables = false,
}) {
  const singleSeatSizes =
    getEligibleSingleTableSeatSizesFromGuests(numberOfGuests);
  const minimumSingleSeats =
    getMinimumSingleTableSeatsFromGuests(numberOfGuests);
  const maximumSingleSeats =
    getMaximumSingleTableSeatsFromGuests(numberOfGuests);
  const comboSeatSize = getRequiredCombinedTableSizeFromGuests(numberOfGuests);
  const formattedDate = format(reservationDateUTC, "yyyy-MM-dd");
  const candidateStart = minutesFromHHmm(reservationTime);
  const durCandidate = getOccupancyMinutes(parameters, reservationTime);
  const candidateEnd = candidateStart + durCandidate;
  const candidateDateTime = buildReservationDateTime(
    reservationDateUTC,
    reservationTime,
  );
  const blockedTableIds = getBlockedTableIdsForDateTime(
    parameters,
    candidateDateTime,
    getReservationOccupancyMs(parameters, reservationTime),
  );

  const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

  const query = {
    restaurant_id: restaurantId,
    reservationDate: { $gte: dayStart, $lte: dayEnd },
    status: { $in: BLOCKING_STATUSES },
  };

  if (reservationIdToExclude) {
    query._id = { $ne: reservationIdToExclude };
  }

  const dayReservations = await ReservationModel.find(query)
    .select(
      "status reservationTime pendingExpiresAt table bankHold waitlistOffer",
    )
    .lean();

  const blockingReservations = dayReservations.filter(isBlockingReservation);

  const overlaps = (reservation) => {
    const reservationStart = minutesFromHHmm(reservation.reservationTime);
    const reservationDuration = getOccupancyMinutes(
      parameters,
      reservation.reservationTime,
    );
    const reservationEnd = reservationStart + reservationDuration;

    if (durCandidate > 0 && reservationDuration > 0) {
      return candidateStart < reservationEnd && candidateEnd > reservationStart;
    }

    return String(reservation.reservationTime).slice(0, 5) === reservationTime;
  };

  return {
    ...getAvailableConfiguredTableOptions({
      parameters,
      singleSeatSizes,
      comboSeatSize,
      channel,
      allowLargerSingleTables,
      minimumSingleSeats,
      maximumSingleSeats,
      blockingReservations,
      overlaps,
      blockedTableIds,
    }),
    blockingReservations,
    overlaps,
    blockedTableIds,
    singleSeatSizes,
    minimumSingleSeats,
    maximumSingleSeats,
    comboSeatSize,
  };
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

function getSmartAvailabilitySetupStatus(parameters = {}) {
  const rooms = getFloorplanRooms(parameters, { enabledOnly: true });
  const allRooms = getFloorplanRooms(parameters);
  const tables = Array.isArray(parameters?.tables) ? parameters.tables : [];

  const catalogTableIds = new Set(
    tables.map((table) => String(table?._id || "").trim()).filter(Boolean),
  );

  const placedTableIds = new Set();
  let roomsWithPlacedTables = 0;

  rooms.forEach((room) => {
    const objects = Array.isArray(room?.objects) ? room.objects : [];
    let roomHasPlacedTable = false;

    objects.forEach((obj) => {
      if (obj?.type !== "table" || !obj?.tableRefId) return;

      const tableRefId = String(obj.tableRefId || "").trim();
      if (!tableRefId || !catalogTableIds.has(tableRefId)) return;

      placedTableIds.add(tableRefId);
      roomHasPlacedTable = true;
    });

    if (roomHasPlacedTable) {
      roomsWithPlacedTables += 1;
    }
  });

  return {
    roomsCount: allRooms.length,
    activeRoomsCount: rooms.length,
    tablesCount: tables.length,
    placedTablesCount: placedTableIds.size,
    roomsWithPlacedTables,
    canEnable: rooms.length > 0 && tables.length > 0 && placedTableIds.size > 0,
  };
}

function computePendingExpiresAt(restaurant, anchorDate = null) {
  const now = anchorDate instanceof Date ? anchorDate : new Date();
  const opening = restaurant?.opening_hours;

  const PENDING_MINUTES = Math.max(
    1,
    Number(restaurant?.reservationsSettings?.pending_duration_minutes) || 120,
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

function getReservationIntervalMinutes(parameters) {
  const interval = Number(parameters?.interval || 30);
  return Number.isFinite(interval) && interval > 0 ? interval : 30;
}

function getReservationDayHours({
  restaurant,
  parameters,
  reservationDateUTC,
}) {
  const normalizedDay = normalizeReservationDayToUTC(reservationDateUTC);
  if (!normalizedDay) return null;

  const exceptionalOpening = getReservationExceptionalOpeningForDate(
    parameters,
    normalizedDay,
  );
  if (exceptionalOpening) return exceptionalOpening;

  const jsDay = normalizedDay.getUTCDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const sourceHours = parameters?.same_hours_as_restaurant
    ? restaurant?.opening_hours
    : parameters?.reservation_hours;

  if (!Array.isArray(sourceHours) || !sourceHours[dayIndex]) {
    return null;
  }

  return sourceHours[dayIndex];
}

function isReservationTimeWithinConfiguredHours({
  restaurant,
  parameters,
  reservationDateUTC,
  reservationTime,
}) {
  const dayHours = getReservationDayHours({
    restaurant,
    parameters,
    reservationDateUTC,
  });

  if (
    !dayHours ||
    dayHours?.isClosed ||
    !Array.isArray(dayHours?.hours) ||
    dayHours.hours.length === 0
  ) {
    return false;
  }

  const candidateMinutes = minutesFromHHmm(reservationTime);
  const intervalMinutes = getReservationIntervalMinutes(parameters);

  return dayHours.hours.some((range) => {
    if (!isValidHHmm(range?.open) || !isValidHHmm(range?.close)) return false;

    const openMinutes = minutesFromHHmm(range.open);
    const closeMinutes = minutesFromHHmm(range.close);

    if (candidateMinutes < openMinutes || candidateMinutes > closeMinutes) {
      return false;
    }

    return (candidateMinutes - openMinutes) % intervalMinutes === 0;
  });
}

function getReservationOccupancyMs(parameters, reservationTime) {
  return Math.max(
    1,
    getOccupancyMinutes(parameters, reservationTime) * 60 * 1000,
  );
}

function validateReservationSlotInput({
  restaurant,
  parameters,
  reservationDateUTC,
  reservationTime,
  numberOfGuests,
  channel = "dashboard",
}) {
  const normalizedDay = normalizeReservationDayToUTC(reservationDateUTC);
  if (!normalizedDay) {
    return { status: 400, message: "reservationDate invalide." };
  }

  const normalizedTime = String(reservationTime || "")
    .trim()
    .slice(0, 5);
  if (!isValidHHmm(normalizedTime)) {
    return { status: 400, message: "reservationTime invalide (HH:mm)." };
  }

  const guests = Number(numberOfGuests);
  if (!Number.isInteger(guests) || guests < 1) {
    return { status: 400, message: "numberOfGuests invalide." };
  }

  if (
    !isReservationTimeWithinConfiguredHours({
      restaurant,
      parameters,
      reservationDateUTC: normalizedDay,
      reservationTime: normalizedTime,
    })
  ) {
    return {
      status: 409,
      message: "Le créneau sélectionné n'est pas réservable.",
    };
  }

  const candidateDT = buildReservationDateTime(normalizedDay, normalizedTime);
  if (!candidateDT || Number.isNaN(candidateDT.getTime())) {
    return { status: 400, message: "reservationTime invalide (HH:mm)." };
  }

  if (channel === "public" && candidateDT.getTime() <= Date.now()) {
    return {
      status: 400,
      message: "Le créneau sélectionné doit être dans le futur.",
    };
  }

  return {
    normalizedDay,
    normalizedTime,
    guests,
    candidateDT,
  };
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

function isDateTimeBlocked(parameters, candidateDT, occupancyMs = 0) {
  if (!candidateDT) return false;
  const ranges = Array.isArray(parameters?.blocked_ranges)
    ? parameters.blocked_ranges
    : [];
  const candidateStart = new Date(candidateDT);
  const candidateEnd = new Date(
    candidateDT.getTime() + Math.max(1, Number(occupancyMs) || 0),
  );

  return ranges.some((r) => {
    const start = new Date(r.startAt).getTime();
    const end = new Date(r.endAt).getTime();
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      candidateStart.getTime() <= end &&
      candidateEnd.getTime() > start
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

async function acquireReservationDayLock({ restaurantId, reservationDateUTC }) {
  const normalizedDay = normalizeReservationDayToUTC(reservationDateUTC);
  if (!normalizedDay) {
    const error = new Error("invalid_reservation_day_lock");
    error.code = "INVALID_RESERVATION_DAY_LOCK";
    throw error;
  }

  const owner = randomUUID();
  const deadline = Date.now() + RESERVATION_DAY_LOCK_WAIT_MS;

  do {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + RESERVATION_DAY_LOCK_HOLD_MS);

    try {
      const lock = await ReservationDayLockModel.findOneAndUpdate(
        {
          restaurant_id: restaurantId,
          reservationDate: normalizedDay,
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        {
          $set: {
            owner,
            lockedUntil,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );

      if (lock && String(lock.owner || "") === owner) {
        return {
          owner,
          restaurantId: String(restaurantId),
          reservationDate: normalizedDay,
        };
      }
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    if (Date.now() >= deadline) break;
    await sleep(RESERVATION_DAY_LOCK_RETRY_MS);
  } while (Date.now() < deadline);

  const error = new Error("reservation_day_lock_timeout");
  error.code = "RESERVATION_DAY_LOCK_TIMEOUT";
  throw error;
}

async function releaseReservationDayLock(lock) {
  if (!lock?.owner || !lock?.restaurantId || !lock?.reservationDate) return;

  await ReservationDayLockModel.updateOne(
    {
      restaurant_id: lock.restaurantId,
      reservationDate: lock.reservationDate,
      owner: lock.owner,
    },
    {
      $set: { lockedUntil: null },
      $unset: { owner: 1 },
    },
  );
}

function buildPublicIdempotentReservationResponse(
  existingReservation,
  returnUrl,
) {
  if (existingReservation?.status === "AwaitingBankHold") {
    if (
      existingReservation.bankHold?.expiresAt &&
      new Date(existingReservation.bankHold.expiresAt) < new Date()
    ) {
      return {
        status: 400,
        body: {
          message: "Le délai de validation de la carte est expiré.",
        },
      };
    }

    const baseOrigin = (() => {
      try {
        return new URL(String(returnUrl || "")).origin;
      } catch {
        return "";
      }
    })();

    if (!baseOrigin) {
      return {
        status: 400,
        body: {
          message: "returnUrl manquant pour reprendre la validation carte.",
        },
      };
    }

    return {
      status: 200,
      body: {
        requiresAction: true,
        reservationId: existingReservation._id,
        redirectUrl: `${baseOrigin}/reservations/${existingReservation._id}/bank-hold`,
      },
    };
  }

  return {
    status: 200,
    body: {
      reservation: existingReservation,
    },
  };
}

function sanitizePublicReservationAvailability(reservation) {
  if (!reservation || typeof reservation !== "object") return reservation;

  const table = reservation?.table
    ? {
        tableIds: normalizeTableIdList(reservation.table.tableIds),
        seats: Number(reservation.table.seats || 0),
        source: String(reservation.table.source || "").trim() || null,
      }
    : null;

  return {
    _id: reservation._id,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
    status: reservation.status,
    pendingExpiresAt: reservation.pendingExpiresAt || null,
    table,
    bankHold: reservation?.bankHold
      ? {
          enabled: Boolean(reservation.bankHold.enabled),
          expiresAt: reservation.bankHold.expiresAt || null,
        }
      : { enabled: false, expiresAt: null },
    waitlistOffer: reservation?.waitlistOffer
      ? {
          state: String(reservation.waitlistOffer.state || "").trim() || null,
          offerExpiresAt: reservation.waitlistOffer.offerExpiresAt || null,
        }
      : { state: null, offerExpiresAt: null },
  };
}

async function fetchRestaurantFull(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("menus")
    .populate("employees")
    .lean();

  return restaurant || null;
}

function getCustomerFullNameFromReservation(reservation) {
  const fn = String(reservation?.customerFirstName || "").trim();
  const ln = String(reservation?.customerLastName || "").trim();
  return `${fn} ${ln}`.trim();
}

async function ensureReservationCustomerLinked(reservation) {
  if (reservation?.customer) return reservation.customer;
  if (!reservation?._id) return null;

  const customer = await upsertCustomer({
    restaurantId: reservation.restaurant_id,
    firstName: reservation.customerFirstName,
    lastName: reservation.customerLastName,
    email: reservation.customerEmail,
    phone: reservation.customerPhone,
  });

  if (!customer?._id) return null;

  reservation.customer = customer._id;

  await ReservationModel.updateOne(
    { _id: reservation._id },
    { $set: { customer: customer._id } },
  );

  return customer._id;
}

async function syncCustomerOnFirstReservationConfirmation(reservation) {
  const customerId = await ensureReservationCustomerLinked(reservation);
  await onReservationCreated(customerId, reservation);
  return customerId;
}

async function buildRealtimeReservationPayload(reservation) {
  return enrichReservationWithCustomerSummary(reservation);
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
  return normalizeNamePart(v);
}

function createReservationRouteError(status, message, code = null) {
  const error = new Error(message || "Internal server error");
  error.status = Number(status) || 500;
  if (code) {
    error.code = code;
  }
  return error;
}

function buildReservationRouteErrorResponse(error, defaultMessage) {
  if (!error) return null;

  if (error?.status) {
    return {
      status: error.status,
      payload: {
        ...(error?.code ? { code: error.code } : {}),
        message: error.message || defaultMessage,
      },
    };
  }

  if (error?.code === "RESERVATION_DAY_LOCK_TIMEOUT") {
    return {
      status: 423,
      payload: {
        code: "DAY_LOCK_TIMEOUT",
        message:
          "Une autre réservation est en cours de traitement sur cette date. Veuillez réessayer.",
      },
    };
  }

  return null;
}

function buildPublicReservationManagement(reservation) {
  const status = String(reservation?.status || "").trim();
  const baseState = {
    canModify: false,
    canCancel: false,
    reasonCode: null,
    reasonMessage: "",
  };

  if (!reservation) {
    return {
      ...baseState,
      reasonCode: "NOT_FOUND",
      reasonMessage: "Réservation introuvable.",
    };
  }

  if (status === "AwaitingBankHold") {
    const bankHoldExpiresAt = reservation?.bankHold?.expiresAt
      ? new Date(reservation.bankHold.expiresAt).getTime()
      : null;

    if (Number.isFinite(bankHoldExpiresAt) && bankHoldExpiresAt <= Date.now()) {
      return {
        ...baseState,
        reasonCode: "BANK_HOLD_EXPIRED",
        reasonMessage:
          "Le délai de validation de cette réservation a expiré. Merci de contacter le restaurant.",
      };
    }

    return {
      ...baseState,
      reasonCode: "AWAITING_BANK_HOLD",
      reasonMessage:
        "Cette réservation doit d’abord être validée via l’empreinte bancaire.",
    };
  }

  if (status === "Pending" && reservation?.pendingExpiresAt) {
    const pendingExpiresAt = new Date(reservation.pendingExpiresAt).getTime();
    if (Number.isFinite(pendingExpiresAt) && pendingExpiresAt <= Date.now()) {
      return {
        ...baseState,
        reasonCode: "PENDING_EXPIRED",
        reasonMessage:
          "Cette réservation n’est plus modifiable en ligne car son délai de confirmation a expiré.",
      };
    }
  }

  if (!["Pending", "Confirmed"].includes(status)) {
    return {
      ...baseState,
      reasonCode: "STATUS_LOCKED",
      reasonMessage:
        "Cette réservation ne peut plus être modifiée ni annulée en ligne.",
    };
  }

  const reservationDateTime = buildReservationDateTime(
    reservation?.reservationDate,
    reservation?.reservationTime,
  );

  if (
    !(reservationDateTime instanceof Date) ||
    Number.isNaN(reservationDateTime.getTime())
  ) {
    return {
      ...baseState,
      reasonCode: "INVALID_DATETIME",
      reasonMessage:
        "Cette réservation ne peut pas être gérée en ligne pour le moment.",
    };
  }

  if (reservationDateTime.getTime() <= Date.now()) {
    return {
      ...baseState,
      reasonCode: "PAST_RESERVATION",
      reasonMessage:
        "Cette réservation n’est plus modifiable en ligne car le créneau est passé.",
    };
  }

  return {
    ...baseState,
    canModify: true,
    canCancel: true,
  };
}

function buildReservationPublicResponse(reservation) {
  return {
    reservation,
    management: buildPublicReservationManagement(reservation),
  };
}

function assertPublicReservationMutationAllowed(reservation) {
  const management = buildPublicReservationManagement(reservation);

  if (management.canModify && management.canCancel) {
    return management;
  }

  throw createReservationRouteError(
    409,
    management.reasonMessage ||
      "Cette réservation ne peut pas être modifiée en ligne.",
    "NOT_MODIFIABLE",
  );
}

async function broadcastReservationUpdated(restaurantId, reservation) {
  broadcastToRestaurant(String(restaurantId), {
    type: "reservation_updated",
    restaurantId: String(restaurantId),
    reservation: await buildRealtimeReservationPayload(reservation),
  });
}

async function sendReservationStatusTransitionEmails({
  reservation,
  restaurant,
  prevStatus,
  nextStatus,
}) {
  const restaurantName = restaurant?.name || "Restaurant";
  const reservationId = String(reservation?._id || "");
  const logSkip = (type, info) => {
    console.log("[reservation-email-skip]", type, {
      reservationId,
      prevStatus,
      nextStatus,
      ...info,
    });
  };

  try {
    if (prevStatus === "Pending" && nextStatus === "Confirmed") {
      sendReservationEmail("confirmed", {
        reservation,
        restaurantName,
        restaurant,
      })
        .then((r) => r?.skipped && logSkip("confirmed", { reason: r.reason }))
        .catch((e) =>
          console.error("Email transition failed:", e?.response?.body || e),
        );
    }

    if (prevStatus !== "Canceled" && nextStatus === "Canceled") {
      sendReservationEmail("canceled", {
        reservation,
        restaurantName,
        restaurant,
      })
        .then((r) => r?.skipped && logSkip("canceled", { reason: r.reason }))
        .catch((e) =>
          console.error("Email transition failed:", e?.response?.body || e),
        );
    }

    if (prevStatus !== "Rejected" && nextStatus === "Rejected") {
      sendReservationEmail("rejected", {
        reservation,
        restaurantName,
        restaurant,
      })
        .then((r) => r?.skipped && logSkip("rejected", { reason: r.reason }))
        .catch((e) =>
          console.error("Email transition failed:", e?.response?.body || e),
        );
    }
  } catch (e) {
    console.error("Email status transition failed:", e?.response?.body || e);
  }
}

const PUBLIC_RESERVATION_UPDATE_FIELDS = new Set([
  "reservationDate",
  "reservationTime",
  "numberOfGuests",
  "customerFirstName",
  "customerLastName",
  "customerEmail",
  "customerPhone",
  "commentary",
]);

function sanitizePublicReservationUpdateData(rawData = {}) {
  const source =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? rawData
      : {};
  const invalidFields = Object.keys(source).filter(
    (key) => !PUBLIC_RESERVATION_UPDATE_FIELDS.has(key),
  );

  if (invalidFields.length > 0) {
    throw createReservationRouteError(
      400,
      "Seuls la date, l’horaire, le nombre de couverts et les informations client peuvent être modifiés.",
      "INVALID_PAYLOAD",
    );
  }

  return Object.fromEntries(
    Object.entries(source).filter(([key]) =>
      PUBLIC_RESERVATION_UPDATE_FIELDS.has(key),
    ),
  );
}

async function updateReservationDetailsInternal({
  restaurantId,
  reservationId,
  updateData,
  channel = "dashboard",
}) {
  const existing = await ReservationModel.findById(reservationId);
  if (!existing) {
    throw createReservationRouteError(404, "Reservation not found");
  }

  if (String(existing.restaurant_id) !== String(restaurantId)) {
    throw createReservationRouteError(404, "Reservation not found");
  }

  const restaurantLean = await RestaurantModel.findById(restaurantId).lean();
  if (!restaurantLean) {
    throw createReservationRouteError(404, "Restaurant not found");
  }

  const previousReservationSlot = {
    restaurantId: String(existing.restaurant_id),
    reservationDate: existing.reservationDate,
    reservationTime: existing.reservationTime,
    status: existing.status,
  };

  const parameters = restaurantLean?.reservationsSettings || {};
  const nextUpdateData = { ...(updateData || {}) };

  const existingDate = normalizeReservationDayToUTC(existing.reservationDate);
  if (!existingDate) {
    throw createReservationRouteError(
      400,
      "reservationDate invalide.",
      "INVALID_PAYLOAD",
    );
  }

  const existingTime = String(existing.reservationTime || "00:00").slice(0, 5);
  const existingGuests = Number(existing.numberOfGuests || 0);

  const hasReservationDate = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "reservationDate",
  );
  const hasReservationTime = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "reservationTime",
  );
  const hasNumberOfGuests = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "numberOfGuests",
  );
  const hasCustomerFirstName = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "customerFirstName",
  );
  const hasCustomerLastName = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "customerLastName",
  );

  const nextDate = hasReservationDate
    ? normalizeReservationDayToUTC(nextUpdateData.reservationDate)
    : existingDate;
  if (hasReservationDate && !nextDate) {
    throw createReservationRouteError(
      400,
      "reservationDate invalide.",
      "INVALID_PAYLOAD",
    );
  }

  const nextTime = hasReservationTime
    ? String(nextUpdateData.reservationTime || "00:00").slice(0, 5)
    : existingTime;
  if (hasReservationTime && !isValidHHmm(nextTime)) {
    throw createReservationRouteError(
      400,
      "reservationTime invalide (HH:mm).",
      "INVALID_PAYLOAD",
    );
  }

  const nextGuests = hasNumberOfGuests
    ? Number(nextUpdateData.numberOfGuests)
    : existingGuests;
  if (hasNumberOfGuests && (!Number.isInteger(nextGuests) || nextGuests < 1)) {
    throw createReservationRouteError(
      400,
      "numberOfGuests invalide.",
      "INVALID_PAYLOAD",
    );
  }

  const touchesDateTime =
    nextDate?.getTime() !== existingDate?.getTime() ||
    nextTime !== existingTime;
  const touchesGuests = nextGuests !== existingGuests;

  let candidateDate = nextDate;
  let candidateTime = nextTime;
  let candidateGuests = nextGuests;

  if (touchesDateTime || touchesGuests) {
    const slotValidation = validateReservationSlotInput({
      restaurant: restaurantLean,
      parameters,
      reservationDateUTC: nextDate,
      reservationTime: nextTime,
      numberOfGuests: nextGuests,
      channel,
    });

    if (slotValidation?.message) {
      const message = slotValidation.message;
      let code = slotValidation.status === 400 ? "INVALID_PAYLOAD" : null;

      if (slotValidation.status === 409) {
        code = "SLOT_BLOCKED";
        if (message.includes("Aucune table n’est disponible")) {
          code = "NO_TABLE_AVAILABLE";
        }
      }

      throw createReservationRouteError(
        slotValidation.status || 400,
        message,
        code,
      );
    }

    candidateDate = slotValidation.normalizedDay;
    candidateTime = slotValidation.normalizedTime;
    candidateGuests = slotValidation.guests;
  }

  const candidateOccupancyMs = getReservationOccupancyMs(
    parameters,
    candidateTime,
  );

  if (hasReservationDate) {
    nextUpdateData.reservationDate = candidateDate;
  }
  if (hasReservationTime) {
    nextUpdateData.reservationTime = candidateTime;
  }
  if (hasNumberOfGuests) {
    nextUpdateData.numberOfGuests = candidateGuests;
  }

  if (hasCustomerFirstName || hasCustomerLastName) {
    const nextCustomerFirstName = hasCustomerFirstName
      ? cleanNamePart(nextUpdateData.customerFirstName)
      : cleanNamePart(existing.customerFirstName);
    const nextCustomerLastName = hasCustomerLastName
      ? cleanNamePart(nextUpdateData.customerLastName)
      : cleanNamePart(existing.customerLastName);

    if (!nextCustomerFirstName && !nextCustomerLastName) {
      throw createReservationRouteError(
        400,
        "Un prénom ou un nom client est requis.",
        "INVALID_PAYLOAD",
      );
    }

    if (hasCustomerFirstName) {
      nextUpdateData.customerFirstName = nextCustomerFirstName;
    }
    if (hasCustomerLastName) {
      nextUpdateData.customerLastName = nextCustomerLastName;
    }
  }

  if (touchesDateTime) {
    const candidateDT = buildReservationDateTime(candidateDate, candidateTime);

    if (isDateTimeBlocked(parameters, candidateDT, candidateOccupancyMs)) {
      throw createReservationRouteError(
        409,
        "Les réservations sont temporairement indisponibles sur ce créneau.",
        "SLOT_BLOCKED",
      );
    }
  }

  const statusExplicit = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "status",
  );

  if (
    touchesDateTime &&
    !statusExplicit &&
    ["Active", "Late"].includes(String(existing.status || ""))
  ) {
    nextUpdateData.status = "Confirmed";
    nextUpdateData.finishedAt = null;
    nextUpdateData.activatedAt = null;
  }

  const touchesTableExplicitly = Object.prototype.hasOwnProperty.call(
    nextUpdateData,
    "table",
  );
  const shouldCheckTables =
    touchesDateTime ||
    touchesGuests ||
    touchesTableExplicitly ||
    statusExplicit;

  let tableReassigned = false;
  let tableChange = null;

  const candidateStatus = String(nextUpdateData.status ?? existing.status);
  const mustBlockSlot = BLOCKING_STATUSES.includes(candidateStatus);
  const normalizedDashboardTableInput = touchesTableExplicitly
    ? normalizeDashboardTableInput({
        table: nextUpdateData.table,
        tableMode: nextUpdateData.tableMode,
        manageDisponibilities: Boolean(parameters.manage_disponibilities),
      })
    : null;

  if (Object.prototype.hasOwnProperty.call(nextUpdateData, "tableMode")) {
    delete nextUpdateData.tableMode;
  }

  const shouldValidateConfiguredSelection =
    mustBlockSlot &&
    shouldCheckTables &&
    ((!touchesTableExplicitly && Boolean(parameters.manage_disponibilities)) ||
      normalizedDashboardTableInput?.mode === "configured" ||
      (Boolean(parameters.manage_disponibilities) &&
        normalizedDashboardTableInput?.mode === "empty"));
  const allowLargerSingleTablesForManualSelection =
    normalizedDashboardTableInput?.mode === "configured" &&
    !parameters.manage_disponibilities;
  let dayLock = null;

  try {
    if (shouldValidateConfiguredSelection) {
      dayLock = await acquireReservationDayLock({
        restaurantId,
        reservationDateUTC: candidateDate,
      });
    }

    if (shouldValidateConfiguredSelection) {
      const availableConfig = await getConfiguredTableAvailabilityForCandidate({
        restaurantId,
        parameters,
        reservationDateUTC: candidateDate,
        reservationTime: candidateTime,
        numberOfGuests: candidateGuests,
        reservationIdToExclude: reservationId,
        allowLargerSingleTables: allowLargerSingleTablesForManualSelection,
      });
      const availableOptions = availableConfig.options;
      const currentSelectionKey = getConfiguredTableSelectionKey(
        existing?.table,
      );
      const currentCatalogOption = getCurrentConfiguredOptionFromCatalog({
        parameters,
        currentTable: existing?.table,
        singleSeatSizes: availableConfig.singleSeatSizes,
        comboSeatSize: availableConfig.comboSeatSize,
        channel: "dashboard",
        allowLargerSingleTables: !parameters.manage_disponibilities,
        minimumSingleSeats: availableConfig.minimumSingleSeats,
        maximumSingleSeats: availableConfig.maximumSingleSeats,
      });
      const currentOption =
        currentCatalogOption &&
        isConfiguredTableFree({
          tableDef: currentCatalogOption,
          blockingReservations: availableConfig.blockingReservations,
          overlaps: availableConfig.overlaps,
          blockedTableIds: availableConfig.blockedTableIds,
        })
          ? currentCatalogOption
          : null;

      const assignWanted = (tableDef) => {
        nextUpdateData.table = buildAssignedTablePayload(tableDef);
      };

      if (normalizedDashboardTableInput?.mode === "configured") {
        const wanted =
          normalizedDashboardTableInput.value === currentSelectionKey
            ? currentOption
            : findConfiguredOptionBySelectionKey(
                availableOptions,
                normalizedDashboardTableInput.value,
              );

        if (!wanted) {
          throw createReservationRouteError(
            409,
            "La table sélectionnée n'est plus disponible.",
            "SLOT_BLOCKED",
          );
        }

        assignWanted(wanted);
      } else {
        if (
          touchesTableExplicitly &&
          normalizedDashboardTableInput?.mode === "empty"
        ) {
          throw createReservationRouteError(
            400,
            "La table est obligatoire quand le placement automatique est actif.",
            "INVALID_PAYLOAD",
          );
        }

        const currentEligible =
          findConfiguredOptionBySelectionKey(
            availableOptions,
            currentSelectionKey,
          ) || currentOption;

        if (currentEligible) {
          assignWanted(currentEligible);
        } else {
          const free = availableOptions[0] || null;

          if (!free) {
            throw createReservationRouteError(
              409,
              "Aucune table n’est disponible pour ce créneau. Contactez le client.",
              "NO_TABLE_AVAILABLE",
            );
          }

          if (currentSelectionKey) {
            tableReassigned = true;
            tableChange = buildTableChangePayload(existing?.table, free);
          }

          assignWanted(free);
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(nextUpdateData, "table")) {
      if (normalizedDashboardTableInput?.mode === "manual") {
        const requiredSize = requiredTableSizeFromGuests(candidateGuests);
        nextUpdateData.table = {
          name: normalizedDashboardTableInput.value,
          seats: requiredSize || 2,
          source: "manual",
        };
      } else if (normalizedDashboardTableInput?.mode === "configured") {
        const requestedTable = buildConfiguredTableLikeFromSelectionKey(
          normalizedDashboardTableInput.value,
        );
        const wanted = getCurrentConfiguredOptionFromCatalog({
          parameters,
          currentTable: requestedTable,
          singleSeatSizes:
            getEligibleSingleTableSeatSizesFromGuests(candidateGuests),
          comboSeatSize:
            getRequiredCombinedTableSizeFromGuests(candidateGuests),
          channel: "dashboard",
          allowLargerSingleTables: !parameters.manage_disponibilities,
          minimumSingleSeats:
            getMinimumSingleTableSeatsFromGuests(candidateGuests),
          maximumSingleSeats:
            getMaximumSingleTableSeatsFromGuests(candidateGuests),
        });

        if (!wanted) {
          throw createReservationRouteError(
            409,
            "La table sélectionnée n'est plus disponible.",
            "SLOT_BLOCKED",
          );
        }

        nextUpdateData.table = buildAssignedTablePayload(wanted);
      } else {
        nextUpdateData.table = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(nextUpdateData, "status")) {
      const tmp = {
        activatedAt: existing.activatedAt,
        finishedAt: existing.finishedAt,
        status: existing.status,
      };

      existing.status = nextUpdateData.status;
      applyActivationFields(existing, nextUpdateData.status);
      nextUpdateData.activatedAt = existing.activatedAt;
      nextUpdateData.finishedAt = existing.finishedAt;

      existing.status = tmp.status;
      existing.activatedAt = tmp.activatedAt;
      existing.finishedAt = tmp.finishedAt;
    }

    const shouldRefreshReminder24h = touchesDateTime || statusExplicit;

    if (shouldRefreshReminder24h) {
      const nextStatus = String(nextUpdateData.status ?? existing.status);
      const nextReminderDate = nextUpdateData.reservationDate ?? candidateDate;
      const nextReminderTime = nextUpdateData.reservationTime ?? candidateTime;

      Object.assign(
        nextUpdateData,
        buildReminder24hFields({
          status: nextStatus,
          reservationDate: nextReminderDate,
          reservationTime: nextReminderTime,
        }),
      );
    }

    const updatedReservation = await ReservationModel.findByIdAndUpdate(
      reservationId,
      nextUpdateData,
      { new: true, runValidators: true },
    );

    if (!updatedReservation) {
      throw createReservationRouteError(404, "Reservation not found");
    }

    await broadcastReservationUpdated(restaurantId, updatedReservation);

    return {
      updatedReservation,
      previousReservationSlot,
      tableReassigned,
      tableChange,
    };
  } finally {
    await releaseReservationDayLock(dayLock);
  }
}

async function updateReservationStatusInternal({
  restaurantId,
  reservationId,
  requestedStatus,
}) {
  const requestedStatusValue = String(requestedStatus || "").trim();
  if (!requestedStatusValue) {
    throw createReservationRouteError(
      400,
      "status manquant.",
      "INVALID_PAYLOAD",
    );
  }

  const nextStatus =
    requestedStatusValue === "Active" || requestedStatusValue === "Late"
      ? "Confirmed"
      : requestedStatusValue;
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
    throw createReservationRouteError(
      400,
      "status invalide.",
      "INVALID_PAYLOAD",
    );
  }

  const reservation = await ReservationModel.findById(reservationId);
  if (!reservation) {
    throw createReservationRouteError(404, "Reservation not found");
  }

  if (String(reservation.restaurant_id) !== String(restaurantId)) {
    throw createReservationRouteError(
      403,
      "Reservation does not belong to this restaurant",
    );
  }

  const prevStatus = String(reservation.status || "");
  const previousReservationSlot = {
    restaurantId: String(reservation.restaurant_id),
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
    status: prevStatus,
  };

  if (prevStatus === nextStatus) {
    return {
      updatedReservation: reservation,
      tableReassigned: false,
      tableChange: null,
      noOp: true,
      prevStatus,
      nextStatus,
      previousReservationSlot,
    };
  }

  const restaurant = await RestaurantModel.findById(restaurantId).lean();
  if (!restaurant) {
    throw createReservationRouteError(404, "Restaurant not found");
  }

  const parameters = restaurant?.reservationsSettings || {};
  const normalizedDay = normalizeReservationDayToUTC(
    reservation.reservationDate,
  );
  if (!normalizedDay) {
    throw createReservationRouteError(
      400,
      "reservationDate invalide.",
      "INVALID_PAYLOAD",
    );
  }

  const normalizedTime = String(reservation.reservationTime || "00:00").slice(
    0,
    5,
  );
  const occupancyMs = getReservationOccupancyMs(parameters, normalizedTime);
  const willBlockSlot = BLOCKING_STATUSES.includes(nextStatus);
  let dayLock = null;

  try {
    if (parameters.manage_disponibilities && willBlockSlot) {
      dayLock = await acquireReservationDayLock({
        restaurantId,
        reservationDateUTC: normalizedDay,
      });
    }

    if (willBlockSlot) {
      const candidateDT = buildReservationDateTime(
        normalizedDay,
        normalizedTime,
      );

      if (isDateTimeBlocked(parameters, candidateDT, occupancyMs)) {
        throw createReservationRouteError(
          409,
          "Le créneau n'est plus disponible.",
          "SLOT_BLOCKED",
        );
      }
    }

    const mustCheckTable = ["Pending", "Confirmed", "Active", "Late"].includes(
      nextStatus,
    );
    let tableReassigned = false;
    let tableChange = null;
    const hasConfiguredTable =
      String(reservation?.table?.source || "") === "configured";

    if (
      mustCheckTable &&
      (parameters.manage_disponibilities || hasConfiguredTable)
    ) {
      const singleSeatSizes = getEligibleSingleTableSeatSizesFromGuests(
        reservation.numberOfGuests,
      );
      const minimumSingleSeats = getMinimumSingleTableSeatsFromGuests(
        reservation.numberOfGuests,
      );
      const maximumSingleSeats = getMaximumSingleTableSeatsFromGuests(
        reservation.numberOfGuests,
      );
      const comboSeatSize = getRequiredCombinedTableSizeFromGuests(
        reservation.numberOfGuests,
      );
      const formattedDate = format(normalizedDay, "yyyy-MM-dd");
      const candidateStart = minutesFromHHmm(normalizedTime);
      const durCandidate = getOccupancyMinutes(parameters, normalizedTime);
      const candidateEnd = candidateStart + durCandidate;
      const candidateDateTime = buildReservationDateTime(
        normalizedDay,
        normalizedTime,
      );
      const blockedTableIds = getBlockedTableIdsForDateTime(
        parameters,
        candidateDateTime,
        occupancyMs,
      );

      const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
      const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

      const dayReservations = await ReservationModel.find({
        restaurant_id: restaurantId,
        reservationDate: { $gte: dayStart, $lte: dayEnd },
        status: { $in: BLOCKING_STATUSES },
        _id: { $ne: reservationId },
      })
        .select(
          "status reservationTime pendingExpiresAt table bankHold waitlistOffer",
        )
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

      const availableConfig = getAvailableConfiguredTableOptions({
        parameters,
        singleSeatSizes,
        comboSeatSize,
        channel: "dashboard",
        blockingReservations,
        overlaps,
        blockedTableIds,
      });
      const availableOptions = availableConfig.options;
      const currentSelectionKey = getConfiguredTableSelectionKey(
        reservation?.table,
      );
      const currentCatalogOption = getCurrentConfiguredOptionFromCatalog({
        parameters,
        currentTable: reservation?.table,
        singleSeatSizes,
        comboSeatSize,
        channel: "dashboard",
        allowLargerSingleTables: !parameters.manage_disponibilities,
        minimumSingleSeats,
        maximumSingleSeats,
      });
      const currentOption =
        findConfiguredOptionBySelectionKey(
          availableOptions,
          currentSelectionKey,
        ) ||
        (currentCatalogOption &&
        isConfiguredTableFree({
          tableDef: currentCatalogOption,
          blockingReservations,
          overlaps,
          blockedTableIds,
        })
          ? currentCatalogOption
          : null);

      if (!currentOption) {
        if (!parameters.manage_disponibilities) {
          throw createReservationRouteError(
            409,
            "La table attribuée n’est plus disponible pour ce créneau.",
            "SLOT_BLOCKED",
          );
        }

        const newTable = availableOptions[0] || null;
        if (!newTable) {
          throw createReservationRouteError(
            409,
            "Aucune table n’est disponible pour ce créneau. Contactez le client.",
            "NO_TABLE_AVAILABLE",
          );
        }

        tableReassigned = true;
        tableChange = buildTableChangePayload(reservation?.table, newTable);
        reservation.table = {
          ...buildAssignedTablePayload(newTable),
        };
      }
    }

    reservation.status = nextStatus;

    if (prevStatus === "Waitlist") {
      reservation.waitlistOffer = reservation.waitlistOffer || {};
      if (nextStatus === "Confirmed") {
        reservation.waitlistOffer.state = "accepted";
        reservation.waitlistOffer.acceptedAt =
          reservation.waitlistOffer.acceptedAt || new Date();
      } else if (["Canceled", "Rejected"].includes(nextStatus)) {
        reservation.waitlistOffer.state =
          nextStatus === "Rejected" ? "declined" : "expired";
        if (nextStatus === "Rejected") {
          reservation.waitlistOffer.declinedAt =
            reservation.waitlistOffer.declinedAt || new Date();
        } else {
          reservation.waitlistOffer.expiredAt =
            reservation.waitlistOffer.expiredAt || new Date();
        }
      }
      reservation.waitlistOffer.tokenHash = "";
      reservation.waitlistOffer.tokenExpiresAt = null;
    }

    applyActivationFields(reservation, nextStatus);
    applyCancelFields(reservation, nextStatus);
    applyRejectFields(reservation, nextStatus);

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

    let customerId = reservation.customer || null;

    if (
      prevStatus !== "Confirmed" &&
      nextStatus === "Confirmed" &&
      !customerId
    ) {
      customerId =
        await syncCustomerOnFirstReservationConfirmation(reservation);
    } else if (customerId) {
      await onReservationStatusChanged(
        customerId,
        reservation,
        prevStatus,
        nextStatus,
      );
    }

    await broadcastReservationUpdated(restaurantId, reservation);
    await sendReservationStatusTransitionEmails({
      reservation,
      restaurant,
      prevStatus,
      nextStatus,
    });

    return {
      updatedReservation: reservation,
      tableReassigned,
      tableChange,
      noOp: false,
      prevStatus,
      nextStatus,
      previousReservationSlot,
    };
  } finally {
    await releaseReservationDayLock(dayLock);
  }
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

function buildStripeCustomerPayloadFromReservation(reservation) {
  const fullName =
    `${String(reservation?.customerFirstName || "").trim()} ${String(
      reservation?.customerLastName || "",
    ).trim()}`.trim();

  return {
    email: reservation?.customerEmail || undefined,
    name: fullName || undefined,
    phone: reservation?.customerPhone || undefined,
    metadata: {
      reservationId: String(reservation?._id || ""),
      restaurantId: String(reservation?.restaurant_id || ""),
    },
  };
}

async function ensureStripeCustomerForReservation(stripe, reservation) {
  const existing = String(reservation?.bankHold?.stripeCustomerId || "").trim();
  const customerPayload =
    buildStripeCustomerPayloadFromReservation(reservation);

  if (existing) {
    try {
      await stripe.customers.update(existing, customerPayload);
      return existing;
    } catch (error) {
      const errorCode = String(error?.code || error?.raw?.code || "").trim();
      if (errorCode !== "resource_missing") {
        throw error;
      }
    }
  }

  const customer = await stripe.customers.create(customerPayload);

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
      metadata: buildReservationBankHoldStripeMetadata({
        reservation,
        type: "reservation_bank_hold_setup",
      }),
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
    metadata: buildReservationBankHoldStripeMetadata({
      reservation,
      type: "reservation_bank_hold_payment",
    }),
  });

  return {
    type: "payment",
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

function getWaitlistSettings(restaurantOrParameters = {}) {
  const source =
    restaurantOrParameters?.reservationsSettings ||
    restaurantOrParameters ||
    {};
  const waitlist = source?.waitlist || {};
  const waitlistEnabled = Boolean(waitlist.enabled || waitlist.public_enabled);

  return {
    enabled: Boolean(waitlist.enabled),
    public_enabled: Boolean(waitlist.public_enabled),
    auto_promote_enabled: Boolean(waitlist.auto_promote_enabled),
    auto_cleanup_enabled:
      waitlistEnabled && Boolean(waitlist.auto_cleanup_enabled),
    auto_cleanup_delay_minutes: Math.max(
      1,
      Number(waitlist.auto_cleanup_delay_minutes || 1440),
    ),
    public_offer_delay_minutes: Math.max(
      1,
      Number(waitlist.public_offer_delay_minutes || 60),
    ),
  };
}

function isPublicWaitlistEnabled(restaurant) {
  const settings = getWaitlistSettings(restaurant);
  return Boolean(settings.enabled && settings.public_enabled);
}

function isAutoWaitlistPromotionEnabled(restaurant) {
  const settings = getWaitlistSettings(restaurant);
  return Boolean(settings.enabled && settings.auto_promote_enabled);
}

function createWaitlistOfferToken() {
  return randomBytes(32).toString("hex");
}

function hashWaitlistOfferToken(token) {
  return createHash("sha256")
    .update(String(token || "").trim())
    .digest("hex");
}

function getPublicWebsiteOrigin(website) {
  const raw = String(website || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch (_) {
    try {
      return new URL(`https://${raw}`).origin;
    } catch (error) {
      return "";
    }
  }
}

function buildWaitlistOfferUrl({ restaurant, token }) {
  const origin = getPublicWebsiteOrigin(restaurant?.website);
  const safeToken = String(token || "").trim();
  if (!origin || !safeToken) return "";
  return `${origin}/reservations/waitlist-offer/${safeToken}`;
}

function computeWaitlistOfferExpiresAt(restaurant, now = new Date()) {
  const settings = getWaitlistSettings(restaurant);
  return new Date(
    now.getTime() + settings.public_offer_delay_minutes * 60 * 1000,
  );
}

function isWaitlistOfferActive(reservation, now = new Date()) {
  if (String(reservation?.status || "") !== "Waitlist") return false;
  const state = String(reservation?.waitlistOffer?.state || "").trim();
  if (state !== "offered") return false;
  const expiresAt = reservation?.waitlistOffer?.offerExpiresAt
    ? new Date(reservation.waitlistOffer.offerExpiresAt)
    : null;
  return Boolean(
    expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() > now.getTime(),
  );
}

function buildWaitlistOfferPublicSnapshot(reservation, restaurant = null) {
  return {
    state: String(reservation?.waitlistOffer?.state || "").trim() || "waiting",
    offerExpiresAt: reservation?.waitlistOffer?.offerExpiresAt || null,
    reservation: {
      _id: reservation?._id,
      restaurant_id: reservation?.restaurant_id,
      restaurantName: restaurant?.name || "Restaurant",
      customerFirstName: reservation?.customerFirstName || "",
      numberOfGuests: reservation?.numberOfGuests || 0,
      reservationDate: reservation?.reservationDate || null,
      reservationTime: reservation?.reservationTime || "",
      status: reservation?.status || "",
    },
  };
}

function buildDayRangeFromReservationDate(reservationDate) {
  const normalizedDay = normalizeReservationDayToUTC(reservationDate);
  if (!normalizedDay) return null;
  const formattedDate = format(normalizedDay, "yyyy-MM-dd");
  return {
    normalizedDay,
    dayStart: new Date(`${formattedDate}T00:00:00.000Z`),
    dayEnd: new Date(`${formattedDate}T23:59:59.999Z`),
  };
}

function getWaitlistWaitingStateQuery() {
  return {
    $or: [
      { "waitlistOffer.state": { $exists: false } },
      { "waitlistOffer.state": null },
      { "waitlistOffer.state": "" },
      { "waitlistOffer.state": "waiting" },
    ],
  };
}

async function findActiveWaitlistOfferForSlot({
  restaurantId,
  reservationDate,
  reservationTime,
  excludeReservationId = null,
}) {
  const dayRange = buildDayRangeFromReservationDate(reservationDate);
  if (!dayRange) return null;
  const now = new Date();
  const query = {
    restaurant_id: restaurantId,
    reservationDate: { $gte: dayRange.dayStart, $lte: dayRange.dayEnd },
    reservationTime: String(reservationTime || "").slice(0, 5),
    status: "Waitlist",
    "waitlistOffer.state": "offered",
    "waitlistOffer.offerExpiresAt": { $gt: now },
  };

  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }

  return ReservationModel.findOne(query).lean();
}

async function resolveWaitlistAssignableTable({
  restaurantId,
  restaurant,
  reservation,
  reservationIdToExclude = null,
  channel = "public",
}) {
  const parameters = restaurant?.reservationsSettings || {};
  const normalizedDay = normalizeReservationDayToUTC(
    reservation?.reservationDate,
  );
  const normalizedTime = String(reservation?.reservationTime || "").slice(0, 5);

  if (!normalizedDay || !isValidHHmm(normalizedTime)) {
    return { available: false, table: null, reason: "invalid_slot" };
  }

  const candidateDT = buildReservationDateTime(normalizedDay, normalizedTime);
  const occupancyMs = getReservationOccupancyMs(parameters, normalizedTime);

  if (isDateTimeBlocked(parameters, candidateDT, occupancyMs)) {
    return { available: false, table: null, reason: "slot_blocked" };
  }

  if (!parameters.manage_disponibilities) {
    return {
      available: true,
      table: reservation?.table || null,
      reason: "availability_not_managed",
    };
  }

  const availableConfig = await getConfiguredTableAvailabilityForCandidate({
    restaurantId,
    parameters,
    reservationDateUTC: normalizedDay,
    reservationTime: normalizedTime,
    numberOfGuests: reservation?.numberOfGuests,
    reservationIdToExclude,
    channel,
  });

  const currentSelectionKey = getConfiguredTableSelectionKey(
    reservation?.table,
  );
  const currentOption =
    currentSelectionKey &&
    findConfiguredOptionBySelectionKey(
      availableConfig.options,
      currentSelectionKey,
    );
  const free = currentOption || availableConfig.options[0] || null;

  if (!free) {
    return { available: false, table: null, reason: "no_table_available" };
  }

  return {
    available: true,
    table: buildAssignedTablePayload(free),
    reason: "table_available",
  };
}

async function triggerWaitlistAutoPromotionForSlot({
  restaurantId,
  reservationDate,
  reservationTime,
}) {
  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant || !isAutoWaitlistPromotionEnabled(restaurant)) {
    return { promoted: false, reason: "auto_promote_disabled" };
  }

  const normalizedDay = normalizeReservationDayToUTC(reservationDate);
  const normalizedTime = String(reservationTime || "").slice(0, 5);
  if (!normalizedDay || !isValidHHmm(normalizedTime)) {
    return { promoted: false, reason: "invalid_slot" };
  }

  const activeOffer = await findActiveWaitlistOfferForSlot({
    restaurantId,
    reservationDate: normalizedDay,
    reservationTime: normalizedTime,
  });
  if (activeOffer) {
    return { promoted: false, reason: "active_offer_exists" };
  }

  const origin = getPublicWebsiteOrigin(restaurant.website);
  if (!origin) {
    console.error("[waitlist-auto-promote] missing public website origin", {
      restaurantId: String(restaurantId),
    });
    return { promoted: false, reason: "missing_public_website" };
  }

  const dayRange = buildDayRangeFromReservationDate(normalizedDay);
  if (!dayRange) return { promoted: false, reason: "invalid_day" };

  let dayLock = null;

  try {
    dayLock = await acquireReservationDayLock({
      restaurantId,
      reservationDateUTC: normalizedDay,
    });

    const activeOfferAfterLock = await findActiveWaitlistOfferForSlot({
      restaurantId,
      reservationDate: normalizedDay,
      reservationTime: normalizedTime,
    });
    if (activeOfferAfterLock) {
      return { promoted: false, reason: "active_offer_exists" };
    }

    const candidates = await ReservationModel.find({
      restaurant_id: restaurantId,
      reservationDate: { $gte: dayRange.dayStart, $lte: dayRange.dayEnd },
      reservationTime: normalizedTime,
      status: "Waitlist",
      ...getWaitlistWaitingStateQuery(),
    }).sort({ createdAt: 1, _id: 1 });

    for (const candidate of candidates) {
      const availability = await resolveWaitlistAssignableTable({
        restaurantId,
        restaurant,
        reservation: candidate,
        reservationIdToExclude: candidate._id,
        channel: "public",
      });

      if (!availability.available) continue;

      const now = new Date();
      const token = createWaitlistOfferToken();
      const tokenHash = hashWaitlistOfferToken(token);
      const offerExpiresAt = computeWaitlistOfferExpiresAt(restaurant, now);
      const actionUrl = buildWaitlistOfferUrl({ restaurant, token });

      if (!actionUrl) {
        return { promoted: false, reason: "missing_action_url" };
      }

      const update = {
        $set: {
          table: availability.table || null,
          "waitlistOffer.state": "offered",
          "waitlistOffer.offeredAt": now,
          "waitlistOffer.offerExpiresAt": offerExpiresAt,
          "waitlistOffer.tokenHash": tokenHash,
          "waitlistOffer.tokenExpiresAt": offerExpiresAt,
          "waitlistOffer.acceptedAt": null,
          "waitlistOffer.declinedAt": null,
          "waitlistOffer.expiredAt": null,
        },
      };

      const promotedReservation = await ReservationModel.findOneAndUpdate(
        {
          _id: candidate._id,
          restaurant_id: restaurantId,
          status: "Waitlist",
          ...getWaitlistWaitingStateQuery(),
        },
        update,
        { new: true },
      );

      if (!promotedReservation) continue;

      let emailSent = false;
      try {
        const result = await sendReservationEmail("waitlistOffer", {
          reservation: promotedReservation,
          restaurantName: restaurant?.name || "Restaurant",
          restaurant,
          actionUrl,
          expiresAt: offerExpiresAt,
        });
        emailSent = !result?.skipped;
      } catch (error) {
        console.error(
          "[waitlist-auto-promote-email-error]",
          promotedReservation?._id?.toString?.(),
          error?.response?.body || error,
        );
      }

      if (emailSent) {
        promotedReservation.waitlistOffer.emailSentAt = new Date();
        await promotedReservation.save();
      }

      broadcastToRestaurant(String(restaurantId), {
        type: "reservation_updated",
        restaurantId: String(restaurantId),
        reservation: await buildRealtimeReservationPayload(promotedReservation),
      });

      await createAndBroadcastNotification({
        restaurantId: String(restaurantId),
        module: "reservations",
        type: "reservation_waitlist_offer_sent",
        data: {
          reservationId: String(promotedReservation?._id),
          customerName: getCustomerFullNameFromReservation(promotedReservation),
          numberOfGuests: promotedReservation?.numberOfGuests,
          reservationDate: promotedReservation?.reservationDate,
          reservationTime: promotedReservation?.reservationTime,
          status: promotedReservation?.status,
        },
      });

      return {
        promoted: true,
        reservation: promotedReservation,
        emailSent,
      };
    }

    return { promoted: false, reason: "no_confirmable_waitlist" };
  } finally {
    await releaseReservationDayLock(dayLock);
  }
}

async function triggerWaitlistAutoPromotionForReservationSlot(reservation) {
  if (!reservation?.restaurantId && !reservation?.restaurant_id) {
    return { promoted: false, reason: "missing_restaurant" };
  }

  return triggerWaitlistAutoPromotionForSlot({
    restaurantId: reservation.restaurantId || reservation.restaurant_id,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
  });
}

async function triggerWaitlistAutoPromotionIfBlockingSlotWasFreed(slot) {
  const prevStatus = String(slot?.status || "").trim();
  if (!slot?.restaurantId && !slot?.restaurant_id) return null;
  if (
    !["AwaitingBankHold", "Pending", "Confirmed", "Active", "Late"].includes(
      prevStatus,
    )
  ) {
    return null;
  }

  return triggerWaitlistAutoPromotionForReservationSlot(slot);
}

async function triggerWaitlistAutoPromotionForRestaurant(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "_id reservationsSettings website",
  );
  if (!restaurant || !isAutoWaitlistPromotionEnabled(restaurant)) {
    return { promoted: 0 };
  }

  const waitlists = await ReservationModel.find({
    restaurant_id: restaurantId,
    status: "Waitlist",
    ...getWaitlistWaitingStateQuery(),
  })
    .select("reservationDate reservationTime")
    .sort({ reservationDate: 1, reservationTime: 1, createdAt: 1 })
    .lean();

  const seen = new Set();
  let promoted = 0;

  for (const item of waitlists) {
    const day = normalizeReservationDayToUTC(item.reservationDate);
    const time = String(item.reservationTime || "").slice(0, 5);
    if (!day || !time) continue;
    const key = `${day.toISOString().slice(0, 10)}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const result = await triggerWaitlistAutoPromotionForSlot({
      restaurantId,
      reservationDate: day,
      reservationTime: time,
    });
    if (result?.promoted) promoted += 1;
  }

  return { promoted };
}

async function expireWaitlistOfferAndPromoteNext(reservation) {
  if (!reservation?._id) return null;
  const now = new Date();
  const expired = await ReservationModel.findOneAndUpdate(
    {
      _id: reservation._id,
      status: "Waitlist",
      "waitlistOffer.state": "offered",
      "waitlistOffer.offerExpiresAt": { $lte: now },
    },
    {
      $set: {
        "waitlistOffer.state": "expired",
        "waitlistOffer.expiredAt": now,
        "waitlistOffer.tokenHash": "",
        "waitlistOffer.tokenExpiresAt": null,
        table: null,
      },
    },
    { new: true },
  );

  if (!expired) return null;

  broadcastToRestaurant(String(expired.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(expired.restaurant_id),
    reservation: await buildRealtimeReservationPayload(expired),
  });

  await triggerWaitlistAutoPromotionForReservationSlot(expired);
  return expired;
}

async function runWaitlistMaintenance() {
  const now = new Date();

  const expiredOffers = await ReservationModel.find({
    status: "Waitlist",
    "waitlistOffer.state": "offered",
    "waitlistOffer.offerExpiresAt": { $ne: null, $lte: now },
  }).select(
    "_id restaurant_id reservationDate reservationTime status waitlistOffer table",
  );

  for (const reservation of expiredOffers) {
    await expireWaitlistOfferAndPromoteNext(reservation);
  }

  const simpleWaitlists = await ReservationModel.find({
    status: "Waitlist",
    $or: [
      { "waitlistOffer.state": { $exists: false } },
      { "waitlistOffer.state": null },
      { "waitlistOffer.state": "" },
      { "waitlistOffer.state": "waiting" },
    ],
  }).select("_id restaurant_id reservationDate reservationTime waitlistOffer");

  const restaurantCache = new Map();

  for (const reservation of simpleWaitlists) {
    const restaurantId = String(reservation.restaurant_id || "");
    if (!restaurantId) continue;

    if (!restaurantCache.has(restaurantId)) {
      restaurantCache.set(
        restaurantId,
        await RestaurantModel.findById(restaurantId).select(
          "reservationsSettings",
        ),
      );
    }

    const restaurant = restaurantCache.get(restaurantId);
    const settings = getWaitlistSettings(restaurant);
    if (!settings.auto_cleanup_enabled) continue;

    const reservationDateTime = buildReservationDateTime(
      reservation.reservationDate,
      reservation.reservationTime,
    );
    if (!reservationDateTime) continue;

    const cleanupAt = new Date(
      reservationDateTime.getTime() +
        settings.auto_cleanup_delay_minutes * 60 * 1000,
    );

    if (cleanupAt.getTime() > now.getTime()) continue;

    await ReservationModel.deleteOne({
      _id: reservation._id,
      status: "Waitlist",
      ...getWaitlistWaitingStateQuery(),
    });

    broadcastToRestaurant(restaurantId, {
      type: "reservation_deleted",
      restaurantId,
      reservationId: String(reservation._id),
    });
  }
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

  if (reservation.status !== "AwaitingBankHold") {
    throw new Error("Cette réservation ne nécessite plus de validation carte.");
  }

  const now = new Date();
  const bankHoldExpiresAt = reservation?.bankHold?.expiresAt
    ? new Date(reservation.bankHold.expiresAt)
    : null;
  if (
    bankHoldExpiresAt &&
    !Number.isNaN(bankHoldExpiresAt.getTime()) &&
    bankHoldExpiresAt <= now
  ) {
    throw new Error("Le délai de validation de la carte est expiré.");
  }

  const restaurant = await RestaurantModel.findById(reservation.restaurant_id);
  if (!restaurant) {
    throw new Error("Restaurant introuvable.");
  }

  const stripe = getStripeClientForRestaurant(restaurant);
  if (!stripe) {
    throw new Error("Clé Stripe restaurant introuvable.");
  }

  const autoAccept = Boolean(restaurant?.reservationsSettings?.auto_accept);
  const finalStatus = autoAccept ? "Confirmed" : "Pending";
  let bankHoldUpdates = {};
  let paymentIntentToRelease = "";

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

    bankHoldUpdates = {
      setupIntentId: setupIntent.id || "",
      stripeCustomerId:
        setupIntent.customer || reservation.bankHold.stripeCustomerId || "",
      stripePaymentMethodId: setupIntent.payment_method || "",
      cardCollectedAt: now,
      status: "card_saved",
      lastError: "",
    };
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

    bankHoldUpdates = {
      paymentIntentId: paymentIntent.id || "",
      stripeCustomerId:
        paymentIntent.customer || reservation.bankHold.stripeCustomerId || "",
      stripePaymentMethodId: paymentIntent.payment_method || "",
      cardCollectedAt: now,
      authorizedAt: now,
      status: "authorized",
      lastError: "",
    };
    paymentIntentToRelease = String(paymentIntent.id || "").trim();
  } else {
    throw new Error("Type d’intent non supporté.");
  }

  const reminderFields = buildReminder24hFields({
    status: finalStatus,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
  });

  const pendingExpiresAt =
    finalStatus === "Pending" ? computePendingExpiresAt(restaurant) : null;

  const finalizedReservation = await ReservationModel.findOneAndUpdate(
    {
      _id: reservationId,
      status: "AwaitingBankHold",
      $or: [
        { "bankHold.expiresAt": null },
        { "bankHold.expiresAt": { $gt: now } },
      ],
    },
    {
      $set: {
        status: finalStatus,
        pendingExpiresAt,
        reminder24hDueAt: reminderFields.reminder24hDueAt,
        reminder24hSentAt: reminderFields.reminder24hSentAt,
        reminder24hLockedAt: reminderFields.reminder24hLockedAt,
        ...Object.fromEntries(
          Object.entries(bankHoldUpdates).map(([key, value]) => [
            `bankHold.${key}`,
            value,
          ]),
        ),
      },
    },
    { new: true },
  );

  if (!finalizedReservation) {
    if (paymentIntentToRelease) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentToRelease);
      } catch (error) {
        const code = String(error?.code || error?.raw?.code || "").trim();
        if (
          code !== "resource_missing" &&
          code !== "payment_intent_unexpected_state"
        ) {
          console.error(
            "[bank-hold] impossible d'annuler l'autorisation devenue invalide",
            {
              reservationId: String(reservationId),
              paymentIntentId: paymentIntentToRelease,
              error: error?.raw?.message || error?.message || error,
            },
          );
        }
      }
    }

    const latestReservation = await ReservationModel.findById(reservationId)
      .select("status bankHold.expiresAt")
      .lean();

    if (!latestReservation) {
      throw new Error("Réservation introuvable.");
    }

    if (latestReservation.status !== "AwaitingBankHold") {
      throw new Error(
        "Cette réservation ne nécessite plus de validation carte.",
      );
    }

    const latestExpiresAt = latestReservation?.bankHold?.expiresAt
      ? new Date(latestReservation.bankHold.expiresAt)
      : null;
    if (
      latestExpiresAt &&
      !Number.isNaN(latestExpiresAt.getTime()) &&
      latestExpiresAt <= new Date()
    ) {
      throw new Error("Le délai de validation de la carte est expiré.");
    }

    throw new Error("Impossible de finaliser cette réservation.");
  }

  if (
    finalizedReservation.status === "Confirmed" &&
    !finalizedReservation.customer
  ) {
    await syncCustomerOnFirstReservationConfirmation(finalizedReservation);
  }

  broadcastToRestaurant(String(finalizedReservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(finalizedReservation.restaurant_id),
    reservation: await buildRealtimeReservationPayload(finalizedReservation),
  });

  await notifyReservationAfterBankHoldFinalization(finalizedReservation);

  try {
    const restaurantName = restaurant?.name || "Restaurant";
    const shouldNotifyRestaurantOnNewPublicReservation = Boolean(
      restaurant?.reservationsSettings
        ?.notify_restaurant_on_new_public_reservation,
    );

    if (finalizedReservation.status === "Pending") {
      sendReservationEmail("pending", {
        reservation: finalizedReservation,
        restaurantName,
        restaurant,
      }).catch((e) => {
        console.error(
          "Email finalize(public/pending) failed:",
          e?.response?.body || e,
        );
      });
    }

    if (finalizedReservation.status === "Confirmed") {
      sendReservationEmail("confirmed", {
        reservation: finalizedReservation,
        restaurantName,
        restaurant,
      }).catch((e) => {
        console.error(
          "Email finalize(public/confirmed) failed:",
          e?.response?.body || e,
        );
      });
    }

    if (shouldNotifyRestaurantOnNewPublicReservation) {
      sendRestaurantNewPublicReservationEmail({
        reservation: finalizedReservation,
        restaurant,
      }).catch((e) => {
        console.error(
          "Restaurant email finalize(public) failed:",
          e?.response?.body || e,
        );
      });
    }
  } catch (e) {
    console.error("Email finalize(public) failed:", e?.response?.body || e);
  }

  const updatedRestaurant = await fetchRestaurantFull(
    String(finalizedReservation.restaurant_id),
  );

  return {
    reservation: finalizedReservation,
    restaurant: updatedRestaurant,
  };
}

async function captureReservationBankHold({ restaurantId, reservationId }) {
  const reservation = await ReservationModel.findById(reservationId);
  if (!reservation) {
    throw new Error("Réservation introuvable.");
  }

  if (String(reservation.restaurant_id) !== String(restaurantId)) {
    throw new Error("Cette réservation n’appartient pas à ce restaurant.");
  }

  if (!reservation.bankHold?.enabled) {
    throw new Error(
      "Aucune empreinte bancaire n’est activée sur cette réservation.",
    );
  }

  if (String(reservation.bankHold?.status || "") !== "authorized") {
    throw new Error("Cette empreinte bancaire ne peut pas être capturée.");
  }

  const paymentIntentId = String(
    reservation.bankHold?.paymentIntentId || "",
  ).trim();
  if (!paymentIntentId) {
    throw new Error("PaymentIntent introuvable pour cette réservation.");
  }

  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant) {
    throw new Error("Restaurant introuvable.");
  }

  const stripe = getStripeClientForRestaurant(restaurant);
  if (!stripe) {
    throw new Error("Clé Stripe restaurant introuvable.");
  }

  const bankHoldMetadata = buildReservationBankHoldStripeMetadata({
    reservation,
    type: "reservation_bank_hold_payment",
  });

  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId, {
    metadata: bankHoldMetadata,
  });

  const latestChargeId = String(paymentIntent?.latest_charge || "").trim();
  if (latestChargeId) {
    try {
      await stripe.charges.update(latestChargeId, {
        metadata: bankHoldMetadata,
      });
    } catch (error) {
      console.error(
        "[bank-hold] impossible de mettre a jour le snapshot de charge",
        {
          reservationId: String(reservation?._id || ""),
          chargeId: latestChargeId,
          error: error?.raw?.message || error?.message || error,
        },
      );
    }
  }

  reservation.bankHold.status = "captured";
  reservation.bankHold.capturedAt = new Date();
  reservation.bankHold.lastError = "";

  await reservation.save();

  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(reservation.restaurant_id),
    reservation: await buildRealtimeReservationPayload(reservation),
  });

  const updatedRestaurant = await fetchRestaurantFull(restaurantId);

  return {
    restaurant: updatedRestaurant,
    reservation: reservation.toObject ? reservation.toObject() : reservation,
    paymentIntentStatus: paymentIntent?.status || null,
  };
}

async function releaseReservationBankHold({ restaurantId, reservationId }) {
  const reservation = await ReservationModel.findById(reservationId);
  if (!reservation) {
    throw new Error("Réservation introuvable.");
  }

  if (String(reservation.restaurant_id) !== String(restaurantId)) {
    throw new Error("Cette réservation n’appartient pas à ce restaurant.");
  }

  if (!reservation.bankHold?.enabled) {
    throw new Error(
      "Aucune empreinte bancaire n’est activée sur cette réservation.",
    );
  }

  if (String(reservation.bankHold?.status || "") !== "authorized") {
    throw new Error("Cette empreinte bancaire ne peut pas être libérée.");
  }

  const paymentIntentId = String(
    reservation.bankHold?.paymentIntentId || "",
  ).trim();
  if (!paymentIntentId) {
    throw new Error("PaymentIntent introuvable pour cette réservation.");
  }

  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant) {
    throw new Error("Restaurant introuvable.");
  }

  const stripe = getStripeClientForRestaurant(restaurant);
  if (!stripe) {
    throw new Error("Clé Stripe restaurant introuvable.");
  }

  const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

  reservation.bankHold.status = "released";
  reservation.bankHold.releasedAt = new Date();
  reservation.bankHold.lastError = "";

  await reservation.save();

  broadcastToRestaurant(String(reservation.restaurant_id), {
    type: "reservation_updated",
    restaurantId: String(reservation.restaurant_id),
    reservation: await buildRealtimeReservationPayload(reservation),
  });

  const updatedRestaurant = await fetchRestaurantFull(restaurantId);

  return {
    restaurant: updatedRestaurant,
    reservation: reservation.toObject ? reservation.toObject() : reservation,
    paymentIntentStatus: paymentIntent?.status || null,
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
        restaurant?.reservationsSettings?.manage_disponibilities,
      );

      restaurant.reservationsSettings = restaurant.reservationsSettings || {};

      const existing = restaurant.reservationsSettings?.toObject?.()
        ? restaurant.reservationsSettings.toObject()
        : restaurant.reservationsSettings || {};

      const nextBankHold =
        Object.prototype.hasOwnProperty.call(parameters, "bank_hold") &&
        parameters.bank_hold &&
        typeof parameters.bank_hold === "object"
          ? {
              ...(existing.bank_hold || {}),
              ...parameters.bank_hold,
            }
          : existing.bank_hold || {};

      if (
        Boolean(nextBankHold?.enabled) &&
        !getRestaurantStripeSecretKey(restaurant)
      ) {
        return res.status(400).json({
          message:
            "Stripe doit être configuré avant d’activer l’empreinte bancaire.",
          code: "missing_stripe_key",
          stripeReady: false,
        });
      }

      const nextBlocked =
        Object.prototype.hasOwnProperty.call(parameters, "blocked_ranges") &&
        Array.isArray(parameters.blocked_ranges)
          ? parameters.blocked_ranges
          : existing.blocked_ranges || [];

      const nextExceptionalOpenings =
        Object.prototype.hasOwnProperty.call(
          parameters,
          "exceptional_openings",
        ) && Array.isArray(parameters.exceptional_openings)
          ? sanitizeReservationExceptionalOpeningsInput(
              parameters.exceptional_openings,
            )
          : sanitizeReservationExceptionalOpeningsInput(
              existing.exceptional_openings || [],
            );

      const nextWaitlist =
        Object.prototype.hasOwnProperty.call(parameters, "waitlist") &&
        parameters.waitlist &&
        typeof parameters.waitlist === "object"
          ? getWaitlistSettings({
              ...existing,
              waitlist: {
                ...(existing.waitlist || {}),
                ...parameters.waitlist,
              },
            })
          : getWaitlistSettings(existing);

      const nextTableBlocked =
        Object.prototype.hasOwnProperty.call(
          parameters,
          "table_blocked_ranges",
        ) && Array.isArray(parameters.table_blocked_ranges)
          ? filterActiveOrUpcomingTableBlockedRanges(
              parameters.table_blocked_ranges,
            )
          : filterActiveOrUpcomingTableBlockedRanges(
              existing.table_blocked_ranges || [],
            );

      const hasEmailTemplates = Object.prototype.hasOwnProperty.call(
        parameters,
        "email_templates",
      );
      const nextEmailTemplates = hasEmailTemplates
        ? sanitizeReservationEmailTemplatesInput({
            ...(existing.email_templates || {}),
            ...(parameters.email_templates || {}),
          })
        : existing.email_templates || {};

      const nextReservationSettings = {
        ...existing,
        ...parameters,
        blocked_ranges: nextBlocked,
        exceptional_openings: nextExceptionalOpenings,
        table_blocked_ranges: nextTableBlocked,
        email_templates: nextEmailTemplates,
        waitlist: nextWaitlist,
      };

      if (
        Object.prototype.hasOwnProperty.call(
          parameters,
          "manual_service_full_until",
        )
      ) {
        if (!parameters.manual_service_full_until) {
          nextReservationSettings.manual_service_full_until = null;
        } else {
          const currentService = getCurrentReservationService({
            restaurant,
            parameters: nextReservationSettings,
          });

          if (!currentService) {
            return res.status(409).json({
              code: "NO_ACTIVE_RESERVATION_SERVICE",
              message:
                "Le mode complet ne peut être activé que pendant un service.",
            });
          }

          nextReservationSettings.manual_service_full_until =
            currentService.endAt;
        }
      }

      const nextManage = Boolean(
        nextReservationSettings?.manage_disponibilities,
      );

      if (!prevManage && nextManage) {
        const setupStatus = getSmartAvailabilitySetupStatus(
          nextReservationSettings,
        );

        if (!setupStatus.canEnable) {
          return res.status(400).json({
            code: "SMART_AVAILABILITY_SETUP_REQUIRED",
            message:
              "Créez d’abord une salle et placez au moins une table sur le plan avant d’activer le placement automatique.",
            details: setupStatus,
          });
        }
      }

      restaurant.reservationsSettings = nextReservationSettings;

      await restaurant.save();

      let manualTablesNeedingAssignment = 0;
      let unassignedReservationsNeedingAssignment = 0;

      if (!prevManage && nextManage) {
        const reservations = await getRestaurantReservationsList(restaurantId, {
          select: "status pendingExpiresAt table bankHold",
          lean: true,
        });

        manualTablesNeedingAssignment = reservations.filter((r) => {
          if (!isBlockingReservation(r)) return false;
          return (
            r?.table?.source === "manual" &&
            Boolean((r?.table?.name || "").trim())
          );
        }).length;

        unassignedReservationsNeedingAssignment = reservations.filter((r) => {
          if (!isBlockingReservation(r)) return false;
          return !r?.table;
        }).length;
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
      if (Number(error?.statusCode || 0) === 400) {
        return res.status(400).json({
          message:
            error?.message ||
            "Les modèles d’emails contiennent des variables invalides.",
          details: error?.details || null,
        });
      }
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
    const { startAt, endAt, note, allDay } = req.body;

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

      if (end <= new Date()) {
        return res.status(400).json({
          message: "endAt must be in the future",
        });
      }

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // ✅ SAFE INIT (évite crash si reservations/parameters n'existent pas)
      restaurant.reservationsSettings = restaurant.reservationsSettings || {};
      restaurant.reservationsSettings.blocked_ranges =
        restaurant.reservationsSettings.blocked_ranges || [];

      // purge rapide des ranges finies
      const now = new Date();
      const ranges = restaurant.reservationsSettings.blocked_ranges;
      restaurant.reservationsSettings.blocked_ranges = ranges.filter(
        (r) => new Date(r.endAt) > now,
      );

      restaurant.reservationsSettings.blocked_ranges.push({
        startAt: start,
        endAt: end,
        allDay: Boolean(allDay),
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
      restaurant.reservationsSettings = restaurant.reservationsSettings || {};
      restaurant.reservationsSettings.blocked_ranges =
        restaurant.reservationsSettings.blocked_ranges || [];

      const ranges = restaurant.reservationsSettings.blocked_ranges;
      restaurant.reservationsSettings.blocked_ranges = ranges.filter(
        (r) => String(r._id) !== String(rangeId),
      );

      await restaurant.save();

      await triggerWaitlistAutoPromotionForRestaurant(restaurantId);

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
   TABLE BLOCKED RANGES: ADD
--------------------------------------------------------- */
router.post(
  "/restaurants/:id/reservations/table-blocked-ranges",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const { tableId, startAt, endAt, note } = req.body;

    try {
      if (!tableId || !startAt || !endAt) {
        return res.status(400).json({
          message: "tableId, startAt and endAt are required",
        });
      }

      const start = new Date(startAt);
      const end = new Date(endAt);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid dates" });
      }

      if (end <= start) {
        return res.status(400).json({ message: "endAt must be after startAt" });
      }

      if (end <= new Date()) {
        return res.status(400).json({
          message: "endAt must be in the future",
        });
      }

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      restaurant.reservationsSettings = restaurant.reservationsSettings || {};
      restaurant.reservationsSettings.table_blocked_ranges =
        restaurant.reservationsSettings.table_blocked_ranges || [];

      const tableExists = (restaurant.reservationsSettings.tables || []).some(
        (t) => String(t._id) === String(tableId),
      );

      if (!tableExists) {
        return res.status(400).json({ message: "Table invalide." });
      }

      restaurant.reservationsSettings.table_blocked_ranges =
        filterActiveOrUpcomingTableBlockedRanges(
          restaurant.reservationsSettings.table_blocked_ranges,
        );

      restaurant.reservationsSettings.table_blocked_ranges.push({
        tableId,
        startAt: start,
        endAt: end,
        note: (note || "").toString(),
      });

      await restaurant.save();

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(201).json({
        message: "Table blocked range added",
        restaurant: updatedRestaurant,
      });
    } catch (e) {
      console.error("Error adding table blocked range:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   TABLE BLOCKED RANGES: DELETE
--------------------------------------------------------- */
router.delete(
  "/restaurants/:id/reservations/table-blocked-ranges/:rangeId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, rangeId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      restaurant.reservationsSettings = restaurant.reservationsSettings || {};
      restaurant.reservationsSettings.table_blocked_ranges =
        restaurant.reservationsSettings.table_blocked_ranges || [];

      const ranges = restaurant.reservationsSettings.table_blocked_ranges;

      restaurant.reservationsSettings.table_blocked_ranges = ranges.filter(
        (r) => String(r._id) !== String(rangeId),
      );
      restaurant.reservationsSettings.table_blocked_ranges =
        filterActiveOrUpcomingTableBlockedRanges(
          restaurant.reservationsSettings.table_blocked_ranges,
        );

      await restaurant.save();

      await triggerWaitlistAutoPromotionForRestaurant(restaurantId);

      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        message: "Table blocked range removed",
        restaurant: updatedRestaurant,
      });
    } catch (e) {
      console.error("Error deleting table blocked range:", e);
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
        reservation: await buildRealtimeReservationPayload(reservation),
      });

      await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed({
        restaurantId: String(reservation.restaurant_id),
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        status: "AwaitingBankHold",
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error canceling pending bank hold reservation:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* --------------------------
   CREATE A PUBLIC WAITLIST ENTRY
----------------------------- */
router.post("/restaurants/:id/reservations/waitlist", async (req, res) => {
  const restaurantId = req.params.id;
  const reservationData = req.body || {};

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant?.options?.reservations === false) {
      return res.status(403).json({
        message: "Le module de réservation n’est pas actif pour ce restaurant.",
      });
    }

    if (!isPublicWaitlistEnabled(restaurant)) {
      return res.status(403).json({
        message: "La liste d’attente n’est pas disponible pour ce restaurant.",
      });
    }

    const parameters = restaurant?.reservationsSettings || {};
    const slotValidation = validateReservationSlotInput({
      restaurant,
      parameters,
      reservationDateUTC: reservationData.reservationDate,
      reservationTime: reservationData.reservationTime,
      numberOfGuests: reservationData.numberOfGuests,
      channel: "public",
    });

    if (slotValidation?.message) {
      return res
        .status(slotValidation.status || 400)
        .json({ message: slotValidation.message });
    }

    const {
      normalizedDay,
      normalizedTime,
      guests: normalizedGuests,
      candidateDT,
    } = slotValidation;
    const occupancyMs = getReservationOccupancyMs(parameters, normalizedTime);

    if (
      isPublicReservationBlockedByCurrentService({
        restaurant,
        parameters,
        candidateDateTime: candidateDT,
        occupancyMs,
      })
    ) {
      return res.status(409).json({
        message:
          "Les réservations en ligne sont fermées pour le service en cours.",
      });
    }

    if (isDateTimeBlocked(parameters, candidateDT, occupancyMs)) {
      return res.status(409).json({
        message:
          "Les réservations sont temporairement indisponibles sur ce créneau.",
      });
    }

    if (!parameters.manage_disponibilities) {
      return res.status(409).json({
        message:
          "Ce créneau ne peut pas recevoir d’inscription en liste d’attente.",
      });
    }

    let dayLock = null;

    try {
      dayLock = await acquireReservationDayLock({
        restaurantId,
        reservationDateUTC: normalizedDay,
      });

      if (reservationData.idempotencyKey) {
        const existing = await ReservationModel.findOne({
          restaurant_id: restaurantId,
          idempotencyKey: reservationData.idempotencyKey,
        });

        if (existing) {
          return res.status(200).json({
            message: "Votre demande est déjà inscrite en liste d’attente.",
            reservation: existing,
          });
        }
      }

      const availability = await resolveWaitlistAssignableTable({
        restaurantId,
        restaurant,
        reservation: {
          reservationDate: normalizedDay,
          reservationTime: normalizedTime,
          numberOfGuests: normalizedGuests,
        },
        channel: "public",
      });

      if (availability.available) {
        return res.status(409).json({
          code: "SLOT_AVAILABLE",
          message:
            "Ce créneau est encore disponible. Merci d’effectuer une réservation classique.",
        });
      }

      const customerFirstName = cleanNamePart(
        reservationData.customerFirstName,
      );
      const customerLastName = cleanNamePart(reservationData.customerLastName);

      if (!customerFirstName && !customerLastName) {
        return res.status(400).json({
          message: "Un prénom ou un nom client est requis.",
        });
      }

      const customerEmail = String(reservationData.customerEmail || "").trim();
      const customerPhone = String(reservationData.customerPhone || "").trim();

      if (!customerEmail && !customerPhone) {
        return res.status(400).json({
          message: "Un email ou un téléphone est requis.",
        });
      }

      const recentDuplicateThreshold = new Date(Date.now() - 15 * 60 * 1000);
      const duplicate = await ReservationModel.findOne({
        restaurant_id: restaurantId,
        reservationDate: normalizedDay,
        reservationTime: normalizedTime,
        numberOfGuests: normalizedGuests,
        status: "Waitlist",
        createdAt: { $gte: recentDuplicateThreshold },
        $or: [
          customerEmail ? { customerEmail } : null,
          customerPhone ? { customerPhone } : null,
        ].filter(Boolean),
      });

      if (duplicate) {
        return res.status(200).json({
          message: "Votre demande est déjà inscrite en liste d’attente.",
          reservation: duplicate,
        });
      }

      const waitlistReservation = await ReservationModel.create({
        restaurant_id: restaurantId,
        idempotencyKey: reservationData.idempotencyKey || null,
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
        numberOfGuests: normalizedGuests,
        reservationDate: normalizedDay,
        reservationTime: normalizedTime,
        commentary: reservationData.commentary,
        table: null,
        customer: null,
        status: "Waitlist",
        source: "public",
        pendingExpiresAt: null,
        bankHold: { enabled: false, flow: "none", status: "none" },
        waitlistOffer: { state: "waiting" },
        reminder24hDueAt: null,
        reminder24hSentAt: null,
        reminder24hLockedAt: null,
        activatedAt: null,
        finishedAt: null,
      });

      broadcastToRestaurant(restaurantId, {
        type: "reservation_created",
        restaurantId,
        reservation: await buildRealtimeReservationPayload(waitlistReservation),
      });

      await createAndBroadcastNotification({
        restaurantId,
        module: "reservations",
        type: "reservation_waitlist_created",
        data: {
          reservationId: String(waitlistReservation?._id),
          customerName: getCustomerFullNameFromReservation(waitlistReservation),
          numberOfGuests: waitlistReservation?.numberOfGuests,
          reservationDate: waitlistReservation?.reservationDate,
          reservationTime: waitlistReservation?.reservationTime,
          status: waitlistReservation?.status,
        },
      });

      return res.status(201).json({
        message:
          "Votre demande a été ajoutée à la liste d’attente. Vous recevrez un email si une place se libère.",
        reservation: waitlistReservation,
      });
    } finally {
      await releaseReservationDayLock(dayLock);
    }
  } catch (error) {
    if (error?.code === "RESERVATION_DAY_LOCK_TIMEOUT") {
      return res.status(423).json({
        message:
          "Une autre demande est en cours de traitement sur cette date. Veuillez réessayer.",
      });
    }
    console.error("Error creating waitlist reservation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/reservations/waitlist-offers/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Token manquant." });
  }

  try {
    const reservation = await ReservationModel.findOne({
      "waitlistOffer.tokenHash": hashWaitlistOfferToken(token),
    });

    if (!reservation) {
      return res.status(404).json({ message: "Proposition introuvable." });
    }

    const restaurant = await RestaurantModel.findById(
      reservation.restaurant_id,
    ).select("name");

    if (isWaitlistOfferActive(reservation)) {
      return res
        .status(200)
        .json(buildWaitlistOfferPublicSnapshot(reservation, restaurant));
    }

    if (
      reservation.status === "Waitlist" &&
      reservation.waitlistOffer?.state === "offered"
    ) {
      await expireWaitlistOfferAndPromoteNext(reservation);
      return res.status(410).json({
        message: "Cette proposition a expiré.",
        ...buildWaitlistOfferPublicSnapshot(reservation, restaurant),
      });
    }

    return res
      .status(200)
      .json(buildWaitlistOfferPublicSnapshot(reservation, restaurant));
  } catch (error) {
    console.error("Error fetching waitlist offer:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/reservations/waitlist-offers/:token/accept", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Token manquant." });
  }

  try {
    const tokenHash = hashWaitlistOfferToken(token);
    const reservation = await ReservationModel.findOne({
      "waitlistOffer.tokenHash": tokenHash,
    });

    if (!reservation) {
      return res.status(404).json({ message: "Proposition introuvable." });
    }

    if (!isWaitlistOfferActive(reservation)) {
      if (
        reservation.status === "Waitlist" &&
        reservation.waitlistOffer?.state === "offered"
      ) {
        await expireWaitlistOfferAndPromoteNext(reservation);
      }
      return res.status(409).json({
        message: "Cette proposition n’est plus disponible.",
      });
    }

    const restaurant = await RestaurantModel.findById(
      reservation.restaurant_id,
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    const normalizedDay = normalizeReservationDayToUTC(
      reservation.reservationDate,
    );
    const normalizedTime = String(reservation.reservationTime || "").slice(
      0,
      5,
    );
    let dayLock = null;

    try {
      dayLock = await acquireReservationDayLock({
        restaurantId: reservation.restaurant_id,
        reservationDateUTC: normalizedDay,
      });

      const availability = await resolveWaitlistAssignableTable({
        restaurantId: reservation.restaurant_id,
        restaurant,
        reservation,
        reservationIdToExclude: reservation._id,
        channel: "public",
      });

      if (!availability.available) {
        return res.status(409).json({
          message: "Cette place n’est plus disponible.",
        });
      }

      const parameters = restaurant?.reservationsSettings || {};
      const bankHoldPlan = buildBankHoldPlan({
        restaurant,
        parameters,
        reservationDateUTC: normalizedDay,
        reservationTime: normalizedTime,
        numberOfGuests: reservation.numberOfGuests,
      });

      const now = new Date();
      const updateSet = {
        table: availability.table || null,
        "waitlistOffer.state": "accepted",
        "waitlistOffer.acceptedAt": now,
        "waitlistOffer.tokenHash": "",
        "waitlistOffer.tokenExpiresAt": null,
      };

      if (bankHoldPlan.enabled) {
        const bankHoldExpiresAt = computeBankHoldActionExpiresAt(
          normalizedDay,
          normalizedTime,
        );
        Object.assign(updateSet, {
          status: "AwaitingBankHold",
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
        });
      } else {
        Object.assign(updateSet, {
          status: "Confirmed",
          pendingExpiresAt: null,
          bankHold: { enabled: false, flow: "none", status: "none" },
          ...buildReminder24hFields({
            status: "Confirmed",
            reservationDate: normalizedDay,
            reservationTime: normalizedTime,
          }),
        });
      }

      const acceptedReservation = await ReservationModel.findOneAndUpdate(
        {
          _id: reservation._id,
          status: "Waitlist",
          "waitlistOffer.state": "offered",
          "waitlistOffer.tokenHash": tokenHash,
          "waitlistOffer.offerExpiresAt": { $gt: now },
        },
        { $set: updateSet },
        { new: true },
      );

      if (!acceptedReservation) {
        return res.status(409).json({
          message: "Cette proposition n’est plus disponible.",
        });
      }

      if (acceptedReservation.status === "Confirmed") {
        await syncCustomerOnFirstReservationConfirmation(acceptedReservation);
      }

      broadcastToRestaurant(String(acceptedReservation.restaurant_id), {
        type: "reservation_updated",
        restaurantId: String(acceptedReservation.restaurant_id),
        reservation: await buildRealtimeReservationPayload(acceptedReservation),
      });

      await createAndBroadcastNotification({
        restaurantId: String(acceptedReservation.restaurant_id),
        module: "reservations",
        type: "reservation_waitlist_accepted",
        data: {
          reservationId: String(acceptedReservation?._id),
          customerName: getCustomerFullNameFromReservation(acceptedReservation),
          numberOfGuests: acceptedReservation?.numberOfGuests,
          reservationDate: acceptedReservation?.reservationDate,
          reservationTime: acceptedReservation?.reservationTime,
          status: acceptedReservation?.status,
        },
      });

      if (acceptedReservation.status === "Confirmed") {
        sendReservationEmail("confirmed", {
          reservation: acceptedReservation,
          restaurantName: restaurant?.name || "Restaurant",
          restaurant,
        }).catch((e) =>
          console.error(
            "Email waitlist accepted failed:",
            e?.response?.body || e,
          ),
        );
      }

      if (acceptedReservation.status === "AwaitingBankHold") {
        const origin = getPublicWebsiteOrigin(restaurant.website);
        if (!origin) {
          return res.status(500).json({
            message:
              "La place est acceptée, mais le lien de validation carte est indisponible. Contactez le restaurant.",
            reservation: acceptedReservation,
          });
        }

        return res.status(200).json({
          message:
            "Votre place est réservée temporairement. Merci de valider l’empreinte bancaire.",
          requiresAction: true,
          reservationId: acceptedReservation._id,
          redirectUrl: `${origin}/reservations/${acceptedReservation._id}/bank-hold`,
          reservation: acceptedReservation,
        });
      }

      return res.status(200).json({
        message: "Votre réservation est confirmée.",
        reservation: acceptedReservation,
      });
    } finally {
      await releaseReservationDayLock(dayLock);
    }
  } catch (error) {
    if (error?.code === "RESERVATION_DAY_LOCK_TIMEOUT") {
      return res.status(423).json({
        message:
          "Une autre action est en cours sur ce créneau. Veuillez réessayer.",
      });
    }
    console.error("Error accepting waitlist offer:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/reservations/waitlist-offers/:token/decline",
  async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Token manquant." });
    }

    try {
      const tokenHash = hashWaitlistOfferToken(token);
      const now = new Date();
      const declinedReservation = await ReservationModel.findOneAndUpdate(
        {
          status: "Waitlist",
          "waitlistOffer.state": "offered",
          "waitlistOffer.tokenHash": tokenHash,
          "waitlistOffer.offerExpiresAt": { $gt: now },
        },
        {
          $set: {
            table: null,
            "waitlistOffer.state": "declined",
            "waitlistOffer.declinedAt": now,
            "waitlistOffer.tokenHash": "",
            "waitlistOffer.tokenExpiresAt": null,
          },
        },
        { new: true },
      );

      if (!declinedReservation) {
        return res.status(404).json({
          message: "Cette proposition n’est plus disponible.",
        });
      }

      broadcastToRestaurant(String(declinedReservation.restaurant_id), {
        type: "reservation_updated",
        restaurantId: String(declinedReservation.restaurant_id),
        reservation: await buildRealtimeReservationPayload(declinedReservation),
      });

      await createAndBroadcastNotification({
        restaurantId: String(declinedReservation.restaurant_id),
        module: "reservations",
        type: "reservation_waitlist_declined",
        data: {
          reservationId: String(declinedReservation?._id),
          customerName: getCustomerFullNameFromReservation(declinedReservation),
          numberOfGuests: declinedReservation?.numberOfGuests,
          reservationDate: declinedReservation?.reservationDate,
          reservationTime: declinedReservation?.reservationTime,
          status: declinedReservation?.status,
        },
      });

      await triggerWaitlistAutoPromotionForReservationSlot(declinedReservation);

      return res.status(200).json({
        message: "Votre refus a bien été pris en compte.",
        reservation: declinedReservation,
      });
    } catch (error) {
      console.error("Error declining waitlist offer:", error);
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
      const existingResponse = buildPublicIdempotentReservationResponse(
        existing,
        reservationData.returnUrl,
      );
      return res.status(existingResponse.status).json(existingResponse.body);
    }
  }

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const parameters = restaurant?.reservationsSettings || {};
    const autoAccept = Boolean(parameters.auto_accept);

    const slotValidation = validateReservationSlotInput({
      restaurant,
      parameters,
      reservationDateUTC: reservationData.reservationDate,
      reservationTime: reservationData.reservationTime,
      numberOfGuests: reservationData.numberOfGuests,
      channel: "public",
    });
    if (slotValidation?.message) {
      return res
        .status(slotValidation.status || 400)
        .json({ message: slotValidation.message });
    }

    const {
      normalizedDay,
      normalizedTime,
      guests: normalizedGuests,
      candidateDT,
    } = slotValidation;
    const occupancyMs = getReservationOccupancyMs(parameters, normalizedTime);

    if (
      isPublicReservationBlockedByCurrentService({
        restaurant,
        parameters,
        candidateDateTime: candidateDT,
        occupancyMs,
      })
    ) {
      return res.status(409).json({
        message:
          "Les réservations en ligne sont fermées pour le service en cours.",
      });
    }

    let dayLock = null;

    try {
      dayLock = await acquireReservationDayLock({
        restaurantId,
        reservationDateUTC: normalizedDay,
      });

      if (reservationData.idempotencyKey) {
        const existing = await ReservationModel.findOne({
          restaurant_id: restaurantId,
          idempotencyKey: reservationData.idempotencyKey,
        });

        if (existing) {
          const existingResponse = buildPublicIdempotentReservationResponse(
            existing,
            reservationData.returnUrl,
          );
          return res
            .status(existingResponse.status)
            .json(existingResponse.body);
        }
      }

      const bankHoldPlan = buildBankHoldPlan({
        restaurant,
        parameters,
        reservationDateUTC: normalizedDay,
        reservationTime: normalizedTime,
        numberOfGuests: normalizedGuests,
      });

      if (isDateTimeBlocked(parameters, candidateDT, occupancyMs)) {
        return res.status(409).json({
          message:
            "Les réservations sont temporairement indisponibles sur ce créneau.",
        });
      }

      const computedStatus = autoAccept ? "Confirmed" : "Pending";

      let pendingExpiresAt = null;

      if (!autoAccept) {
        const params = restaurant?.reservationsSettings || {};
        const now = new Date();

        // ✅ si now est dans un blocked range => anchor = fin du blocked range
        const activeEnd = getActiveBlockedRangeEnd(params, now);
        const anchor = activeEnd || now;

        pendingExpiresAt = computePendingExpiresAt(restaurant, anchor);
      }

      let assignedTable = null;

      if (parameters.manage_disponibilities) {
        const singleSeatSizes =
          getEligibleSingleTableSeatSizesFromGuests(normalizedGuests);
        const comboSeatSize =
          getRequiredCombinedTableSizeFromGuests(normalizedGuests);
        const formattedDate = format(normalizedDay, "yyyy-MM-dd");
        const candidateStart = minutesFromHHmm(normalizedTime);
        const durCandidate = getOccupancyMinutes(parameters, normalizedTime);
        const candidateEnd = candidateStart + durCandidate;
        const blockedTableIds = getBlockedTableIdsForDateTime(
          parameters,
          candidateDT,
          occupancyMs,
        );

        const dayStart = new Date(`${formattedDate}T00:00:00.000Z`);
        const dayEnd = new Date(`${formattedDate}T23:59:59.999Z`);

        const dayReservations = await ReservationModel.find({
          restaurant_id: restaurantId,
          reservationDate: { $gte: dayStart, $lte: dayEnd },
          status: { $in: BLOCKING_STATUSES },
        })
          .select(
            "status reservationTime pendingExpiresAt table bankHold waitlistOffer",
          )
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
          return String(r.reservationTime).slice(0, 5) === normalizedTime;
        };

        const availableConfig = getAvailableConfiguredTableOptions({
          parameters,
          singleSeatSizes,
          comboSeatSize,
          channel: "public",
          blockingReservations,
          overlaps,
          blockedTableIds,
        });

        const availableOptions = availableConfig.options;

        if (!availableOptions.length) {
          return res.status(409).json({
            code: "NO_TABLE_AVAILABLE",
            message:
              "Aucune table n’est disponible pour ce créneau. Veuillez réessayer.",
          });
        }

        if (reservationData.table) {
          const requestedSelection = parseConfiguredTableSelection(
            reservationData.table,
          );
          const wanted = findConfiguredOptionBySelectionKey(
            availableOptions,
            requestedSelection?.key,
          );
          if (!wanted) {
            return res.status(409).json({
              message: "La table sélectionnée n'est plus disponible.",
            });
          }

          assignedTable = buildAssignedTablePayload(wanted);
        } else {
          const free = availableOptions[0] || null;
          if (!free) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Aucune table n’est disponible pour ce créneau. Veuillez réessayer.",
            });
          }
          assignedTable = buildAssignedTablePayload(free);
        }
      } else {
        const name = (reservationData.table || "").toString().trim();
        if (name) {
          const requiredSize = requiredTableSizeFromGuests(normalizedGuests);
          assignedTable = {
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

      if (!customerFirstName && !customerLastName) {
        return res.status(400).json({
          message: "Un prénom ou un nom client est requis.",
        });
      }

      const customerEmail = String(reservationData.customerEmail || "").trim();
      const customerPhone = String(reservationData.customerPhone || "").trim();
      const shouldNotifyRestaurantOnNewPublicReservation = Boolean(
        restaurant?.reservationsSettings
          ?.notify_restaurant_on_new_public_reservation,
      );

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
          numberOfGuests: normalizedGuests,
          reservationDate: normalizedDay,
          reservationTime: normalizedTime,
          commentary: reservationData.commentary,
          table: assignedTable,

          status: computedStatus,
          source: "public",
          pendingExpiresAt,

          ...buildReminder24hFields({
            status: computedStatus,
            reservationDate: normalizedDay,
            reservationTime: normalizedTime,
          }),

          activatedAt: null,
          finishedAt: null,
          customer: null,
        });

        if (computedStatus === "Confirmed") {
          await syncCustomerOnFirstReservationConfirmation(newReservation);
        }

        broadcastToRestaurant(restaurantId, {
          type: "reservation_created",
          restaurantId,
          reservation: await buildRealtimeReservationPayload(newReservation),
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
              restaurant,
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
              restaurant,
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
          if (shouldNotifyRestaurantOnNewPublicReservation) {
            sendRestaurantNewPublicReservationEmail({
              reservation: newReservation,
              restaurant,
            })
              .then((result) => {
                if (result?.skipped) {
                  console.log("[restaurant-public-reservation-email-skip]", {
                    reason: result?.reason,
                  });
                }
              })
              .catch((e) => {
                console.error(
                  "Restaurant public reservation email failed:",
                  e?.response?.body || e,
                );
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

      const bankHoldExpiresAt = computeBankHoldActionExpiresAt(
        normalizedDay,
        normalizedTime,
      );

      const newReservation = await ReservationModel.create({
        restaurant_id: restaurantId,
        idempotencyKey: reservationData.idempotencyKey || null,
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
        numberOfGuests: normalizedGuests,
        reservationDate: normalizedDay,
        reservationTime: normalizedTime,
        commentary: reservationData.commentary,
        table: assignedTable,
        customer: null,

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
        broadcastToRestaurant(restaurantId, {
          type: "reservation_created",
          restaurantId,
          reservation: await buildRealtimeReservationPayload(newReservation),
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
    } finally {
      await releaseReservationDayLock(dayLock);
    }
  } catch (error) {
    if (error?.code === "RESERVATION_DAY_LOCK_TIMEOUT") {
      return res.status(423).json({
        message:
          "Une autre réservation est en cours de traitement sur cette date. Veuillez réessayer.",
      });
    }
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

      const parameters = restaurant?.reservationsSettings || {};

      const slotValidation = validateReservationSlotInput({
        restaurant,
        parameters,
        reservationDateUTC: reservationData.reservationDate,
        reservationTime: reservationData.reservationTime,
        numberOfGuests: reservationData.numberOfGuests,
        channel: "dashboard",
      });
      if (slotValidation?.message) {
        return res
          .status(slotValidation.status || 400)
          .json({ message: slotValidation.message });
      }

      const {
        normalizedDay,
        normalizedTime,
        guests: normalizedGuests,
        candidateDT,
      } = slotValidation;
      const occupancyMs = getReservationOccupancyMs(parameters, normalizedTime);
      let dayLock = null;

      try {
        dayLock = await acquireReservationDayLock({
          restaurantId,
          reservationDateUTC: normalizedDay,
        });

        const bankHoldPlan = requestBankHold
          ? buildBankHoldPlan({
              restaurant,
              parameters,
              reservationDateUTC: normalizedDay,
              reservationTime: normalizedTime,
              numberOfGuests: normalizedGuests,
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

        if (isDateTimeBlocked(parameters, candidateDT, occupancyMs)) {
          return res.status(409).json({
            message:
              "Les réservations sont temporairement indisponibles sur ce créneau.",
          });
        }

        let assignedTable = null;
        const normalizedTableInput = normalizeDashboardTableInput({
          table: reservationData.table,
          tableMode: reservationData.tableMode,
          manageDisponibilities: Boolean(parameters.manage_disponibilities),
        });

        if (normalizedTableInput.mode === "manual") {
          const requiredSize = requiredTableSizeFromGuests(normalizedGuests);
          assignedTable = {
            name: normalizedTableInput.value,
            seats: requiredSize || 2,
            source: "manual",
          };
        } else if (normalizedTableInput.mode === "configured") {
          const availableConfig =
            await getConfiguredTableAvailabilityForCandidate({
              restaurantId,
              parameters,
              reservationDateUTC: normalizedDay,
              reservationTime: normalizedTime,
              numberOfGuests: normalizedGuests,
              allowLargerSingleTables: !parameters.manage_disponibilities,
            });

          const wanted = findConfiguredOptionBySelectionKey(
            availableConfig.options,
            normalizedTableInput.value,
          );

          if (!wanted) {
            return res.status(409).json({
              message: "La table sélectionnée n'est plus disponible.",
            });
          }

          assignedTable = buildAssignedTablePayload(wanted);
        } else if (parameters.manage_disponibilities) {
          const availableConfig =
            await getConfiguredTableAvailabilityForCandidate({
              restaurantId,
              parameters,
              reservationDateUTC: normalizedDay,
              reservationTime: normalizedTime,
              numberOfGuests: normalizedGuests,
            });
          const free = availableConfig.options[0] || null;

          if (!free) {
            return res.status(409).json({
              code: "NO_TABLE_AVAILABLE",
              message:
                "Aucune table n’est disponible pour ce créneau. Contactez le client.",
            });
          }

          assignedTable = buildAssignedTablePayload(free);
        }

        const customerFirstName = cleanNamePart(
          reservationData.customerFirstName,
        );
        const customerLastName = cleanNamePart(
          reservationData.customerLastName,
        );

        if (!customerFirstName && !customerLastName) {
          return res.status(400).json({
            message: "Un prénom ou un nom client est requis.",
          });
        }

        const customerEmail = String(
          reservationData.customerEmail || "",
        ).trim();
        const customerPhone = String(
          reservationData.customerPhone || "",
        ).trim();

        if (requestBankHold && !customerEmail) {
          return res.status(400).json({
            message:
              "L’adresse email du client est obligatoire pour envoyer le lien d’empreinte bancaire.",
          });
        }

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
            numberOfGuests: normalizedGuests,
            reservationDate: normalizedDay,
            reservationTime: normalizedTime,
            commentary: reservationData.commentary,
            table: assignedTable,
            customer: null,
            status: "Confirmed",
            source: "dashboard",
            pendingExpiresAt: null,

            ...buildReminder24hFields({
              status: "Confirmed",
              reservationDate: normalizedDay,
              reservationTime: normalizedTime,
            }),

            activatedAt: null,
            finishedAt: null,
          });

          await syncCustomerOnFirstReservationConfirmation(newReservation);

          broadcastToRestaurant(restaurantId, {
            type: "reservation_created",
            restaurantId,
            reservation: await buildRealtimeReservationPayload(newReservation),
          });

          try {
            const restaurantName = restaurant?.name || "Restaurant";
            sendReservationEmail("confirmed", {
              reservation: newReservation,
              restaurantName,
              restaurant,
            })
              .then((r) => {
                if (r?.skipped) {
                  console.log(
                    "[reservation-email-skip]",
                    "confirmed",
                    r.reason,
                  );
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
          normalizedTime,
        );

        const newReservation = await ReservationModel.create({
          restaurant_id: restaurantId,
          customerFirstName,
          customerLastName,
          customerEmail,
          customerPhone,
          numberOfGuests: normalizedGuests,
          reservationDate: normalizedDay,
          reservationTime: normalizedTime,
          commentary: reservationData.commentary,
          table: assignedTable,
          customer: null,

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
          broadcastToRestaurant(restaurantId, {
            type: "reservation_created",
            restaurantId,
            reservation: await buildRealtimeReservationPayload(newReservation),
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
                restaurant,
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
      } finally {
        await releaseReservationDayLock(dayLock);
      }
    } catch (error) {
      if (error?.code === "RESERVATION_DAY_LOCK_TIMEOUT") {
        return res.status(423).json({
          message:
            "Une autre réservation est en cours de traitement sur cette date. Veuillez réessayer.",
        });
      }
      console.error("Error creating dashboard reservation:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   CAPTURE BANK HOLD
--------------------------------------------------------- */
router.post(
  "/restaurants/:id/reservations/:reservationId/bank-hold/capture",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;

    try {
      const result = await captureReservationBankHold({
        restaurantId,
        reservationId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error capturing reservation bank hold:", error);

      return res.status(400).json({
        message:
          error?.message || "Impossible de capturer l’empreinte bancaire.",
      });
    }
  },
);

/* ---------------------------------------------------------
   RELEASE BANK HOLD
--------------------------------------------------------- */
router.post(
  "/restaurants/:id/reservations/:reservationId/bank-hold/release",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, reservationId } = req.params;

    try {
      const result = await releaseReservationBankHold({
        restaurantId,
        reservationId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error releasing reservation bank hold:", error);

      return res.status(400).json({
        message:
          error?.message || "Impossible de libérer l’empreinte bancaire.",
      });
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
      const result = await updateReservationStatusInternal({
        restaurantId,
        reservationId,
        requestedStatus: status,
      });
      if (!result.noOp) {
        await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed(
          result.previousReservationSlot,
        );
      }
      const updatedRestaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        restaurant: updatedRestaurant,
        tableReassigned: result.tableReassigned,
        tableChange: result.tableChange,
        ...(result.noOp ? { noOp: true } : {}),
      });
    } catch (error) {
      const knownError = buildReservationRouteErrorResponse(
        error,
        "Impossible de mettre à jour le statut de la réservation.",
      );
      if (knownError) {
        return res.status(knownError.status).json(knownError.payload);
      }

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
    return res.status(200).json(buildReservationPublicResponse(reservation));
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/reservations/:reservationId", async (req, res) => {
  const { reservationId } = req.params;

  try {
    const updateData = sanitizePublicReservationUpdateData(req.body);

    if (Object.keys(updateData).length === 0) {
      throw createReservationRouteError(
        400,
        "Aucune modification à enregistrer.",
        "INVALID_PAYLOAD",
      );
    }

    const existingReservation = await ReservationModel.findById(reservationId);
    if (!existingReservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    assertPublicReservationMutationAllowed(existingReservation);

    const result = await updateReservationDetailsInternal({
      restaurantId: String(existingReservation.restaurant_id),
      reservationId,
      updateData,
      channel: "public",
    });
    await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed(
      result.previousReservationSlot,
    );

    return res.status(200).json({
      message: "Votre réservation a bien été modifiée.",
      ...buildReservationPublicResponse(result.updatedReservation),
    });
  } catch (error) {
    const knownError = buildReservationRouteErrorResponse(
      error,
      "Impossible de modifier la réservation.",
    );
    if (knownError) {
      return res.status(knownError.status).json(knownError.payload);
    }

    console.error("Error updating public reservation:", error);
    return res.status(500).json({
      message: "Impossible de modifier la réservation.",
    });
  }
});

router.post("/reservations/:reservationId/cancel", async (req, res) => {
  const { reservationId } = req.params;

  try {
    const existingReservation = await ReservationModel.findById(reservationId);
    if (!existingReservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    assertPublicReservationMutationAllowed(existingReservation);

    const result = await updateReservationStatusInternal({
      restaurantId: String(existingReservation.restaurant_id),
      reservationId,
      requestedStatus: "Canceled",
    });
    if (!result.noOp) {
      await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed(
        result.previousReservationSlot,
      );
    }

    return res.status(200).json({
      message: "Votre réservation a bien été annulée.",
      ...buildReservationPublicResponse(result.updatedReservation),
    });
  } catch (error) {
    const knownError = buildReservationRouteErrorResponse(
      error,
      "Impossible d’annuler la réservation.",
    );
    if (knownError) {
      return res.status(knownError.status).json(knownError.payload);
    }

    console.error("Error canceling public reservation:", error);
    return res.status(500).json({
      message: "Impossible d’annuler la réservation.",
    });
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
      const result = await updateReservationDetailsInternal({
        restaurantId,
        reservationId,
        updateData,
        channel: "dashboard",
      });
      await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed(
        result.previousReservationSlot,
      );
      const restaurant = await fetchRestaurantFull(restaurantId);

      return res.status(200).json({
        restaurant,
        tableReassigned: result.tableReassigned,
        tableChange: result.tableChange,
      });
    } catch (error) {
      const knownError = buildReservationRouteErrorResponse(
        error,
        "Impossible de mettre à jour la réservation.",
      );
      if (knownError) {
        return res.status(knownError.status).json(knownError.payload);
      }

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

      const reservation = await ReservationModel.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      if (String(reservation.restaurant_id) !== String(restaurantId)) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      if (
        String(reservation?.bankHold?.status || "") === "captured" &&
        String(reservation?.bankHold?.paymentIntentId || "").trim()
      ) {
        const stripe = getStripeClientForRestaurant(restaurant);

        if (stripe) {
          try {
            const bankHoldMetadata = buildReservationBankHoldStripeMetadata({
              reservation,
              type: "reservation_bank_hold_payment",
            });

            const paymentIntent = await stripe.paymentIntents.update(
              String(reservation.bankHold.paymentIntentId).trim(),
              {
                metadata: bankHoldMetadata,
              },
            );

            const latestChargeId = String(
              paymentIntent?.latest_charge || "",
            ).trim();
            if (latestChargeId) {
              await stripe.charges.update(latestChargeId, {
                metadata: bankHoldMetadata,
              });
            }
          } catch (error) {
            console.error(
              "[bank-hold] impossible de persister le snapshot avant suppression",
              {
                reservationId: String(reservation?._id || ""),
                error: error?.raw?.message || error?.message || error,
              },
            );
          }
        }
      }

      // delete reservation doc
      await ReservationModel.findByIdAndDelete(reservationId);

      // ✅ SSE: suppression instantanée pour tous les devices
      broadcastToRestaurant(restaurantId, {
        type: "reservation_deleted",
        restaurantId,
        reservationId: String(reservationId),
      });

      await triggerWaitlistAutoPromotionIfBlockingSlotWasFreed({
        restaurantId,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        status: reservation.status,
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
   GET PUBLIC RESERVATIONS AVAILABILITY LIST
--------------------------------------------------------- */
router.get("/public/restaurants/:id/reservations", async (req, res) => {
  const restaurantId = req.params.id;

  try {
    const restaurant =
      await RestaurantModel.findById(restaurantId).select("_id");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const reservations = await getRestaurantReservationsList(restaurantId, {
      select:
        "reservationDate reservationTime status pendingExpiresAt table bankHold.enabled bankHold.expiresAt waitlistOffer.state waitlistOffer.offerExpiresAt",
      lean: true,
    });

    return res.status(200).json({
      reservations: reservations.map(sanitizePublicReservationAvailability),
    });
  } catch (error) {
    console.error("Error fetching public reservations availability:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/* ---------------------------------------------------------
   GET RESERVATIONS LIST
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/reservations",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      const restaurant =
        await RestaurantModel.findById(restaurantId).select("_id");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const reservations = await getRestaurantReservationsList(restaurantId, {
        lean: true,
      });

      return res.status(200).json({ reservations });
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

      const parameters = restaurant?.reservationsSettings || {};
      const manage = Boolean(parameters?.manage_disponibilities);

      // ✅ si pas de gestion intelligente, rien à corriger
      if (!manage) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      const reservations = await getRestaurantReservationsList(restaurantId, {
        select:
          "customerFirstName customerLastName numberOfGuests reservationDate reservationTime status table source pendingExpiresAt",
        lean: true,
      });

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
        restaurant?.reservationsSettings?.manage_disponibilities,
      );
      if (!manage) {
        return res.status(200).json({ count: 0, reservations: [] });
      }

      const reservations = await getRestaurantReservationsList(restaurantId, {
        select:
          "customerFirstName customerLastName numberOfGuests reservationDate reservationTime status table source pendingExpiresAt",
        lean: true,
      });

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
module.exports.runWaitlistMaintenance = runWaitlistMaintenance;
module.exports.triggerWaitlistAutoPromotionForSlot =
  triggerWaitlistAutoPromotionForSlot;
module.exports.triggerWaitlistAutoPromotionForReservationSlot =
  triggerWaitlistAutoPromotionForReservationSlot;
