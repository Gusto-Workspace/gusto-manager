import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

// DATE
import { format } from "date-fns";

// I18N
import { useTranslation } from "next-i18next";

// CALENDAR
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

// AXIOS
import axios from "axios";

// SVG
import {
  CommunitySvg,
  UserSvg,
  EmailSvg,
  PhoneSvg,
  CommentarySvg,
  ClockSvg,
  CalendarSvg,
  TableSvg,
} from "../../../_shared/_svgs/_index";

// LUCIDE
import { Loader2, Save, X, ChevronLeft } from "lucide-react";

/* ---------------------------------------
   ✅ Simple Modal (inline)
--------------------------------------- */
function InfoModal({ open, title, message, confirmLabel = "OK", onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[520px] rounded-3xl border border-darkBlue/10 bg-white/90 shadow-xl backdrop-blur-md">
          <div className="p-5 midTablet:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-darkBlue">{title}</p>
                <p className="mt-2 text-sm text-darkBlue/70 whitespace-pre-line">
                  {message}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-2xl px-5 h-11 text-sm font-semibold text-white bg-blue hover:bg-blue/90 active:scale-[0.98] transition"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getServiceBucketFromTime(reservationTime) {
  const [hh = "0"] = String(reservationTime || "00:00").split(":");
  return Number(hh) < 16 ? "lunch" : "dinner";
}

function getOccupancyMinutesFront(parameters, reservationTime) {
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

function isBlockingReservationFront(r) {
  if (!r) return false;
  if (
    !["AwaitingBankHold", "Pending", "Confirmed", "Active", "Late"].includes(
      r.status,
    )
  )
    return false;

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

  if (r.status !== "Pending") return true;

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

  if (!r.pendingExpiresAt) return true;
  return new Date(r.pendingExpiresAt).getTime() > Date.now();
}

function requiredTableSizeFromGuestsFront(n) {
  const g = Number(n || 0);
  if (g <= 0) return 0;
  if (g === 1) return 1;
  return g % 2 === 0 ? g : g + 1;
}

function normalizeBookingPriorityFront(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sortTablesByPriorityFront(tables = []) {
  return [...tables].sort((a, b) => {
    const pa = normalizeBookingPriorityFront(a?.bookingPriority);
    const pb = normalizeBookingPriorityFront(b?.bookingPriority);

    if (pa !== pb) return pb - pa;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function normalizeTableIdListFront(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function getConfiguredTableIdsFront(tableLike) {
  if (!tableLike || typeof tableLike !== "object") return [];

  const tableIds = normalizeTableIdListFront(tableLike.tableIds);
  if (tableIds.length > 0) return tableIds;

  if (tableLike._id) {
    return [String(tableLike._id)];
  }

  return [];
}

function buildCombinedTableSelectionKeyFront(tableIds = []) {
  const ids = normalizeTableIdListFront(tableIds).sort();
  return ids.length > 1 ? `combo:${ids.join("+")}` : ids[0] || "";
}

function getConfiguredTableSelectionKeyFront(tableLike) {
  return buildCombinedTableSelectionKeyFront(
    getConfiguredTableIdsFront(tableLike),
  );
}

function buildSingleTableOptionFront(tableDef) {
  const id = String(tableDef?._id || "");

  return {
    ...tableDef,
    _id: id,
    tableIds: id ? [id] : [],
    selectionKey: id,
    kind: "single",
  };
}

function buildCombinedTableOptionFront(tableA, tableB) {
  const pair = [tableA, tableB].filter(Boolean).sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "fr", {
      sensitivity: "base",
      numeric: true,
    }),
  );

  const tableIds = normalizeTableIdListFront(pair.map((table) => table?._id));
  const selectionKey = buildCombinedTableSelectionKeyFront(tableIds);

  return {
    _id: selectionKey,
    tableIds,
    name: pair.map((table) => String(table?.name || "")).join(" + "),
    seats: pair.reduce((sum, table) => sum + Number(table?.seats || 0), 0),
    bookingPriority: pair.reduce(
      (sum, table) =>
        sum + normalizeBookingPriorityFront(table?.bookingPriority),
      0,
    ),
    kind: "combo",
    componentTables: pair.map((table) => ({
      _id: String(table?._id || ""),
      name: String(table?.name || ""),
      seats: Number(table?.seats || 0),
    })),
  };
}

function computeCapacityStateFront({
  blockingReservations,
  overlaps,
  eligibleTables,
  requiredSize,
  blockedTableIds = new Set(),
}) {
  const capacity = eligibleTables.length;

  const eligibleIds = new Set(
    eligibleTables.map((table) => getConfiguredTableSelectionKeyFront(table)),
  );
  const eligibleByName = new Map(
    eligibleTables.map((table) => [
      String(table?.name || "")
        .trim()
        .toLowerCase(),
      getConfiguredTableSelectionKeyFront(table),
    ]),
  );

  const reservedIds = new Set();
  blockedTableIds.forEach((id) => reservedIds.add(String(id)));
  let unassignedCount = 0;

  blockingReservations.forEach((reservation) => {
    if (!reservation?.table) return;
    if (!overlaps(reservation)) return;

    if (reservation.table.source === "configured") {
      const selectionKey = getConfiguredTableSelectionKeyFront(
        reservation.table,
      );
      const reservationIds = getConfiguredTableIdsFront(reservation.table);

      if (selectionKey && eligibleIds.has(selectionKey)) {
        reservedIds.add(selectionKey);
        return;
      }

      const normalizedName = String(reservation.table.name || "")
        .trim()
        .toLowerCase();
      const mappedId = normalizedName
        ? eligibleByName.get(normalizedName)
        : null;
      if (mappedId) {
        reservedIds.add(mappedId);
        return;
      }

      if (
        Number(reservation.table.seats) === Number(requiredSize) &&
        reservationIds.length <= 1
      ) {
        unassignedCount += 1;
      }
      return;
    }

    if (reservation.table.source === "manual") {
      const name = String(reservation.table.name || "").trim();
      if (name && Number(reservation.table.seats) === Number(requiredSize)) {
        unassignedCount += 1;
      }
    }
  });

  return { capacity, reservedIds, unassignedCount };
}

function isConfiguredTableFreeFront({
  tableDef,
  blockingReservations,
  overlaps,
  blockedTableIds = new Set(),
}) {
  const targetIds = getConfiguredTableIdsFront(tableDef);
  if (targetIds.length === 0) return false;

  const targetIdSet = new Set(targetIds);
  const targetName = String(tableDef?.name || "");

  if (targetIds.some((targetId) => blockedTableIds.has(targetId))) {
    return false;
  }

  return !blockingReservations.find((reservation) => {
    if (!reservation?.table) return false;
    if (!overlaps(reservation)) return false;

    const reservationIds = getConfiguredTableIdsFront(reservation.table);
    const sharesTable =
      reservationIds.length > 0 &&
      reservationIds.some((reservationId) => targetIdSet.has(reservationId));
    const sameName =
      reservationIds.length === 0 &&
      String(reservation.table.name || "") === targetName;

    return sharesTable || sameName;
  });
}

function getEligibleSingleTablesFront({ parameters, requiredSize }) {
  const pool = (
    Array.isArray(parameters?.tables) ? parameters.tables : []
  ).filter((table) => Number(table?.seats) === Number(requiredSize));

  return sortTablesByPriorityFront(pool).map(buildSingleTableOptionFront);
}

function getEligibleCombinedTablesFront({ parameters, requiredSize }) {
  const tables = Array.isArray(parameters?.tables) ? parameters.tables : [];
  const catalogById = new Map(
    tables.map((table) => [String(table?._id || ""), table]),
  );
  const seenPairs = new Set();
  const combos = [];

  for (const table of tables) {
    const tableId = String(table?._id || "");
    if (!tableId) continue;

    const relatedIds = normalizeTableIdListFront(table?.combinableWith);

    for (const relatedId of relatedIds) {
      if (relatedId === tableId) continue;

      const other = catalogById.get(relatedId);
      if (!other?._id) continue;

      const otherLinks = normalizeTableIdListFront(other?.combinableWith);
      if (!otherLinks.includes(tableId)) continue;

      const pairKey = [tableId, relatedId].sort().join("+");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const combinedSeats =
        Number(table?.seats || 0) + Number(other?.seats || 0);

      if (combinedSeats !== Number(requiredSize)) continue;

      combos.push(buildCombinedTableOptionFront(table, other));
    }
  }

  return sortTablesByPriorityFront(combos);
}

function getAvailableConfiguredTableOptionsFront({
  parameters,
  requiredSize,
  blockingReservations,
  overlaps,
  blockedTableIds = new Set(),
}) {
  const singleOptions = getEligibleSingleTablesFront({
    parameters,
    requiredSize,
  });

  const singleState = computeCapacityStateFront({
    blockingReservations,
    overlaps,
    eligibleTables: singleOptions,
    requiredSize,
    blockedTableIds,
  });

  const freeSingleOptions = singleOptions.filter((tableDef) =>
    isConfiguredTableFreeFront({
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

  const comboOptions = getEligibleCombinedTablesFront({
    parameters,
    requiredSize,
  });

  const freeComboOptions = comboOptions.filter((tableDef) =>
    isConfiguredTableFreeFront({
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

function buildReservationDateTimeFront(dateInput, timeStr) {
  const d =
    dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const [hh = 0, mm = 0] = String(timeStr || "00:00")
    .split(":")
    .map(Number);

  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    Number(hh) || 0,
    Number(mm) || 0,
    0,
    0,
  );
}

function getBlockedTableIdsFront(parameters, reservationDate, reservationTime) {
  const ranges = Array.isArray(parameters?.table_blocked_ranges)
    ? parameters.table_blocked_ranges
    : [];

  const occupancyMinutes = getOccupancyMinutesFront(
    parameters,
    reservationTime,
  );
  const candidateStart = buildReservationDateTimeFront(
    reservationDate,
    reservationTime,
  );

  if (!candidateStart) return new Set();

  const candidateEnd = new Date(
    candidateStart.getTime() + Math.max(0, occupancyMinutes) * 60 * 1000,
  );

  const ids = new Set();

  ranges.forEach((range) => {
    const start = new Date(range.startAt).getTime();
    const end = new Date(range.endAt).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    if (candidateStart.getTime() < end && candidateEnd.getTime() > start) {
      ids.add(String(range.tableId));
    }
  });

  return ids;
}

export default function AddReservationComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();
  const reservations = Array.isArray(props.reservations)
    ? props.reservations
    : [];

  const isEditing = !!props.reservation;

  const manageDisponibilities =
    props.restaurantData?.reservationsSettings?.manage_disponibilities;

  const subtitle = isEditing
    ? t("buttons.edit", "Modifier une réservation")
    : t("buttons.add", "Ajouter une réservation");

  const [reservationData, setReservationData] = useState({
    reservationDate: new Date(),
    reservationTime: "",
    numberOfGuests: "",
    customerFirstName: "",
    customerLastName: "",
    customerEmail: "",
    customerPhone: "",
    commentary: "",
    table: "",
    requestBankHold: Boolean(
      props.restaurantData?.reservationsSettings?.bank_hold?.enabled,
    ),
  });

  const [availableTimes, setAvailableTimes] = useState([]);
  const [availableTables, setAvailableTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasUserChangedSlot, setHasUserChangedSlot] = useState(false);
  const [hasUserChangedTable, setHasUserChangedTable] = useState(false);

  // ✅ Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [postModalRedirect, setPostModalRedirect] = useState(false);

  const bankHoldFeatureEnabled = Boolean(
    props.restaurantData?.reservationsSettings?.bank_hold?.enabled,
  );

  const shouldRequestBankHold =
    !isEditing &&
    bankHoldFeatureEnabled &&
    Boolean(reservationData.requestBankHold);

  const closeModal = () => {
    setModalOpen(false);
    if (postModalRedirect) {
      setPostModalRedirect(false);
      router.push("/dashboard/webapp/reservations");
    }
  };

  function isToday(date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  useEffect(() => {
    if (!props.reservation) return;

    const r = props.reservation;

    let tableValue = "";

    if (manageDisponibilities) {
      if (r?.table?.source === "configured") {
        tableValue = getConfiguredTableSelectionKeyFront(r.table);
      } else if (r?.table?.source === "manual") {
        tableValue = String(r?.table?.name || "").trim();
      }
    } else {
      tableValue = String(r?.table?.name || "").trim();
    }

    setReservationData({
      reservationDate: r.reservationDate
        ? new Date(r.reservationDate)
        : new Date(),
      reservationTime: r.reservationTime || "",
      numberOfGuests: r.numberOfGuests || 1,
      customerFirstName: r.customerFirstName || "",
      customerLastName: r.customerLastName || "",
      customerEmail: r.customerEmail || "",
      customerPhone: r.customerPhone || "",
      commentary: r.commentary || "",
      table: tableValue,
      requestBankHold: false,
    });
    setHasUserChangedSlot(false);
    setHasUserChangedTable(false);
  }, [
    props.reservation,
    manageDisponibilities,
    props.restaurantData?.reservationsSettings?.tables,
  ]);

  useEffect(() => {
    if (
      !props?.restaurantData?.reservationsSettings ||
      !reservationData.reservationDate
    )
      return;

    const selectedDay = reservationData.reservationDate.getDay();
    const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;

    const parameters = props.restaurantData.reservationsSettings;

    const dayHours = parameters.same_hours_as_restaurant
      ? props.restaurantData.opening_hours[dayIndex]
      : parameters.reservation_hours[dayIndex];

    // -----------------------------
    // Si fermé => aucun créneau
    // -----------------------------
    if (dayHours?.isClosed) {
      setAvailableTimes([]);
      setIsLoading(false);
      return;
    }

    // -----------------------------
    // Génère les créneaux (base)
    // -----------------------------
    if (Array.isArray(dayHours.hours) && dayHours.hours.length > 0) {
      const interval = parameters.interval || 30;

      let allAvailableTimes = dayHours.hours.flatMap(({ open, close }) =>
        generateTimeOptions(open, close, interval),
      );

      // Filtre "aujourd’hui" => ne pas proposer dans le passé
      if (isToday(reservationData.reservationDate)) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        allAvailableTimes = allAvailableTimes.filter((time) => {
          const [hour, minute] = time.split(":").map(Number);
          const timeInMinutes = hour * 60 + minute;
          return timeInMinutes > currentMinutes;
        });
      }

      // -----------------------------
      // ✅ Filtre dispo basé sur capacité (si manage ON)
      // (aligné backend: pool éligible + overlap + manual unassigned)
      // -----------------------------
      if (parameters.manage_disponibilities) {
        const guests = Number(reservationData.numberOfGuests || 0);
        const requiredSize = requiredTableSizeFromGuestsFront(guests);

        if (requiredSize > 0) {
          const formattedSelectedDate = format(
            reservationData.reservationDate,
            "yyyy-MM-dd",
          );

          const dayReservations = reservations.filter((r) => {
            const resDate = new Date(r.reservationDate);
            const formattedResDate = format(resDate, "yyyy-MM-dd");
            if (formattedResDate !== formattedSelectedDate) return false;
            if (!isBlockingReservationFront(r)) return false;
            if (isEditing && String(r._id) === String(props.reservation?._id))
              return false;
            return true;
          });

          allAvailableTimes = allAvailableTimes.filter((time) => {
            const candidateStart = minutesFromHHmm(time);
            const durCandidate = getOccupancyMinutesFront(parameters, time);
            const candidateEnd = candidateStart + durCandidate;
            const blockedTableIds = getBlockedTableIdsFront(
              parameters,
              reservationData.reservationDate,
              time,
            );

            const overlaps = (r) => {
              const rTime = String(r.reservationTime || "").slice(0, 5);
              const rStart = minutesFromHHmm(rTime);
              const rDur = getOccupancyMinutesFront(parameters, rTime);
              const rEnd = rStart + rDur;

              if (durCandidate > 0 && rDur > 0) {
                return candidateStart < rEnd && candidateEnd > rStart;
              }
              return rTime === String(time).slice(0, 5);
            };

            return (
              getAvailableConfiguredTableOptionsFront({
                parameters,
                requiredSize,
                blockingReservations: dayReservations,
                overlaps,
                blockedTableIds,
              }).options.length > 0
            );
          });
        }
      }

      setAvailableTimes(allAvailableTimes);
    } else {
      setAvailableTimes([]);
    }

    setIsLoading(false);
  }, [
    reservationData.reservationDate,
    reservationData.numberOfGuests,
    props.restaurantData.opening_hours,
    props.restaurantData?.reservationsSettings?.reservation_hours,
    props.restaurantData?.reservationsSettings?.interval,
    props.restaurantData.reservationsSettings.manage_disponibilities,
    props.restaurantData.reservationsSettings.same_hours_as_restaurant,
    props.restaurantData.reservationsSettings.tables,
    reservations,
    isEditing,
    props.reservation,
  ]);

  useEffect(() => {
    const parameters = props.restaurantData.reservationsSettings;

    if (!parameters.manage_disponibilities) {
      setAvailableTables([]);
      return;
    }

    if (
      !reservationData.numberOfGuests ||
      !reservationData.reservationDate ||
      !reservationData.reservationTime
    ) {
      setAvailableTables([]);
      return;
    }

    const guests = Number(reservationData.numberOfGuests || 0);
    const requiredSize = requiredTableSizeFromGuestsFront(guests);
    if (!requiredSize) {
      setAvailableTables([]);
      return;
    }

    const formattedSelectedDate = format(
      reservationData.reservationDate,
      "yyyy-MM-dd",
    );

    const candidateTime = String(reservationData.reservationTime || "").slice(
      0,
      5,
    );

    const candidateStart = minutesFromHHmm(candidateTime);
    const durCandidate = getOccupancyMinutesFront(parameters, candidateTime);
    const candidateEnd = candidateStart + durCandidate;
    const blockedTableIds = getBlockedTableIdsFront(
      parameters,
      reservationData.reservationDate,
      candidateTime,
    );

    const overlaps = (r) => {
      const rTime = String(r.reservationTime || "").slice(0, 5);
      const rStart = minutesFromHHmm(rTime);
      const rDur = getOccupancyMinutesFront(parameters, rTime);
      const rEnd = rStart + rDur;

      if (durCandidate > 0 && rDur > 0) {
        return candidateStart < rEnd && candidateEnd > rStart;
      }
      return rTime === candidateTime;
    };

    // réservations du jour + bloquantes (en excluant la réservation éditée)
    const dayBlocking = reservations.filter((r) => {
      const resDate = new Date(r.reservationDate);
      const formattedResDate = format(resDate, "yyyy-MM-dd");
      if (formattedResDate !== formattedSelectedDate) return false;
      if (!isBlockingReservationFront(r)) return false;
      if (isEditing && String(r._id) === String(props.reservation?._id))
        return false;
      return true;
    });

    const availableConfig = getAvailableConfiguredTableOptionsFront({
      parameters,
      requiredSize,
      blockingReservations: dayBlocking,
      overlaps,
      blockedTableIds,
    });

    setAvailableTables(availableConfig.options);
  }, [
    reservationData.reservationDate,
    reservationData.reservationTime,
    reservationData.numberOfGuests,
    isEditing,
    props.reservation,
    reservations,
    props.restaurantData?.reservationsSettings,
  ]);

  useEffect(() => {
    const parameters = props.restaurantData?.reservationsSettings;
    if (!parameters?.manage_disponibilities) return;

    const hasPickedSlot =
      Boolean(reservationData.numberOfGuests) &&
      Boolean(reservationData.reservationDate) &&
      Boolean(reservationData.reservationTime);

    // Si pas de slot => on vide la table
    if (!hasPickedSlot) {
      if (reservationData.table) {
        setReservationData((p) => ({ ...p, table: "" }));
      }
      return;
    }

    if (isEditing && !hasUserChangedSlot && reservationData.table) return;

    // Si aucune table dispo
    if (!availableTables || availableTables.length === 0) {
      if (!isEditing && reservationData.table) {
        setReservationData((p) => ({ ...p, table: "" }));
      }
      // en édition, on peut garder la table affichée même si plus dispo
      // (le backend tranchera au submit, ou tu peux afficher un message)
      return;
    }

    const current = String(reservationData.table || "");
    const stillValid = availableTables.some((t) => String(t._id) === current);

    // si encore valide, ne rien faire
    if (current && stillValid) return;

    // ✅ sinon auto-assign
    const nextId = String(availableTables[0]._id);
    if (current !== nextId) {
      setReservationData((p) => ({ ...p, table: nextId }));
    }
  }, [
    availableTables,
    isEditing,
    hasUserChangedSlot,
    reservationData.numberOfGuests,
    reservationData.reservationDate,
    reservationData.reservationTime,
    reservationData.table,
    props.restaurantData?.reservationsSettings,
  ]);

  function generateTimeOptions(openTime, closeTime, interval) {
    const times = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    const start = openHour * 60 + openMinute;
    const end = closeHour * 60 + closeMinute;

    const intervalMinutes = parseInt(interval, 10);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) return times;

    for (let minutes = start; minutes <= end; minutes += intervalMinutes) {
      const hour = Math.floor(minutes / 60)
        .toString()
        .padStart(2, "0");
      const minute = (minutes % 60).toString().padStart(2, "0");
      times.push(`${hour}:${minute}`);
    }
    return times;
  }

  function handleDateChange(selectedDate) {
    setHasUserChangedSlot(true);
    setReservationData((prevData) => ({
      ...prevData,
      reservationDate: selectedDate,
      reservationTime: "",
      table: isEditing ? prevData.table : "",
    }));
  }

  function disableClosedDays({ date, view }) {
    if (view !== "month") return false;

    const selectedDay = date.getDay();
    const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;
    const parameters = props.restaurantData.reservationsSettings;
    const dayHours = parameters.same_hours_as_restaurant
      ? props.restaurantData.opening_hours[dayIndex]
      : parameters.reservation_hours[dayIndex];

    return dayHours.isClosed;
  }

  function handleInputChange(e) {
    const { name, value, type, checked } = e.target;

    if (name === "numberOfGuests") setHasUserChangedSlot(true);

    if (name === "table") setHasUserChangedTable(true);

    setReservationData((prevData) => ({
      ...prevData,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "numberOfGuests" ? { reservationTime: "", table: "" } : {}),
    }));
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!reservationData.reservationTime) {
      setError(t("errors.selectTime"));
      return;
    }

    if (
      shouldRequestBankHold &&
      !String(reservationData.customerEmail || "").trim()
    ) {
      setError(
        "L’adresse email du client est obligatoire pour envoyer le lien d’empreinte bancaire.",
      );
      return;
    }

    setIsSubmitting(true);

    const updatedData = { ...reservationData };

    // auto => prend la 1ère table dispo côté front (mais backend recheck)
    if (!isEditing && !updatedData.table) {
      updatedData.table = availableTables?.[0]?._id
        ? String(availableTables[0]._id)
        : null;
    }

    const formattedDate = format(updatedData.reservationDate, "yyyy-MM-dd");
    const formattedTime = updatedData.reservationTime;

    // ✅ EDIT: si slot NON modifié => on envoie seulement les champs "non-slot"
    let reservationPayload;

    let slotChanged = hasUserChangedSlot;
    let tableChanged = hasUserChangedTable;

    if (
      manageDisponibilities &&
      hasPickedSlot &&
      !updatedData.table &&
      Array.isArray(tablesForSelect) &&
      tablesForSelect.length > 0 &&
      (!isEditing || slotChanged || tableChanged)
    ) {
      const forced = String(tablesForSelect[0]._id);
      updatedData.table = forced;

      setReservationData((prev) => ({ ...prev, table: forced }));

      tableChanged = true;
    }

    if (isEditing && !slotChanged && !tableChanged) {
      reservationPayload = {
        customerFirstName: updatedData.customerFirstName,
        customerLastName: updatedData.customerLastName,
        customerEmail: updatedData.customerEmail,
        customerPhone: updatedData.customerPhone,
        commentary: updatedData.commentary,
      };
    } else if (isEditing && !slotChanged && tableChanged) {
      reservationPayload = {
        customerFirstName: updatedData.customerFirstName,
        customerLastName: updatedData.customerLastName,
        customerEmail: updatedData.customerEmail,
        customerPhone: updatedData.customerPhone,
        commentary: updatedData.commentary,
        table: updatedData.table,
      };
    } else {
      // slot modifié => payload complet
      reservationPayload = {
        reservationDate: formattedDate,
        reservationTime: formattedTime,
        numberOfGuests: updatedData.numberOfGuests,
        customerFirstName: updatedData.customerFirstName,
        customerLastName: updatedData.customerLastName,
        customerEmail: updatedData.customerEmail,
        customerPhone: updatedData.customerPhone,
        commentary: updatedData.commentary,
        table: updatedData.table,
      };

      if (!isEditing) {
        reservationPayload.requestBankHold = shouldRequestBankHold;
        reservationPayload.returnUrl = `${String(
          props.restaurantData?.website ||
            process.env.NEXT_PUBLIC_SITE_URL ||
            "",
        ).replace(/\/+$/, "")}/reservations/bank-hold/finalize`;
      }
    }

    try {
      const token = localStorage.getItem("token");
      let response;

      if (isEditing) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/${props.reservation._id}`,
          reservationPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/dashboard/restaurants/${props.restaurantData._id}/reservations`,
          { ...reservationPayload, table: updatedData.table },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // ✅ backend peut renvoyer { restaurant, tableReassigned, tableChange: {oldTableName,newTableName} }
      const { restaurant, tableReassigned, tableChange } = response.data || {};

      if (restaurant) props.setRestaurantData(restaurant);
      await props.refreshReservationsList?.(props.restaurantData?._id);

      // ✅ MODALE: table réassignée
      if (tableReassigned) {
        const oldName = tableChange?.oldTableName || "la table initiale";
        const newName = tableChange?.newTableName || "une autre table";
        setModalTitle("Table réassignée");
        setModalMsg(
          `La table "${oldName}" n’est plus disponible à ce créneau.\nLa réservation a été automatiquement basculée sur "${newName}".`,
        );
        setPostModalRedirect(true);
        setModalOpen(true);
        return; // on attend la fermeture de la modale pour redirect
      }

      const { bankHoldRequested, emailSent } = response.data || {};

      if (bankHoldRequested) {
        setModalTitle(
          emailSent ? "Empreinte bancaire demandée" : "Réservation créée",
        );
        setModalMsg(
          emailSent
            ? "La réservation a bien été créée en attente d’empreinte bancaire. Un email a été envoyé au client pour valider sa carte."
            : "La réservation a bien été créée en attente d’empreinte bancaire, mais l’email n’a pas pu être envoyé automatiquement. Vous pourrez prévoir un renvoi depuis le détail de la réservation.",
        );
        setPostModalRedirect(true);
        setModalOpen(true);
        return;
      }

      router.push("/dashboard/webapp/reservations");
    } catch (err) {
      // ✅ Cas “aucune table dispo” => backend 409 avec code
      const code = err?.response?.data?.code;
      if (code === "NO_TABLE_AVAILABLE") {
        setModalTitle("Aucune table disponible");
        setModalMsg(
          "Aucune table n’est disponible pour ce créneau.\nVous devez contacter le client pour proposer un autre horaire ou une autre date.",
        );
        setPostModalRedirect(false);
        setModalOpen(true);
        return;
      }

      setError(
        err.response?.data?.message ||
          "Une erreur est survenue lors de la soumission de la réservation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatTimeDisplay(reservationTime) {
    const [hour, minute] = reservationTime.split(":");
    return `${hour}h${minute}`;
  }

  function handleTimeSelect(reservationTime) {
    setHasUserChangedSlot(true);
    setReservationData((prevData) => ({
      ...prevData,
      reservationTime,
      table: isEditing ? prevData.table : "",
    }));
  }

  const canPickTime = Boolean(reservationData.numberOfGuests);
  const canSubmit = Boolean(reservationData.reservationTime) && !isSubmitting;

  const reservationDateLabel = reservationData?.reservationDate
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(reservationData.reservationDate)
    : "";

  const hasPickedSlot =
    Boolean(reservationData.numberOfGuests) &&
    Boolean(reservationData.reservationDate) &&
    Boolean(reservationData.reservationTime);

  const currentTableOption = useMemo(() => {
    if (!isEditing || !manageDisponibilities || hasUserChangedSlot) return null;

    const selectionKey = String(reservationData.table || "");
    if (!selectionKey) return null;

    const exists = (availableTables || []).some(
      (table) => String(table._id) === selectionKey,
    );
    if (exists) return null;

    const tableIds = getConfiguredTableIdsFront(props.reservation?.table);

    return {
      _id: selectionKey,
      tableIds,
      name: props.reservation?.table?.name || "Table actuelle",
      seats: props.reservation?.table?.seats || null,
      kind: tableIds.length > 1 ? "combo" : "single",
    };
  }, [
    isEditing,
    manageDisponibilities,
    hasUserChangedSlot,
    props.reservation,
    availableTables,
    reservationData.table,
  ]);

  const tablesForSelect = currentTableOption
    ? [currentTableOption, ...(availableTables || [])]
    : availableTables || [];

  const tableRoomMap = useMemo(() => {
    const map = new Map();

    const rooms =
      props.restaurantData?.reservationsSettings?.floorplan?.rooms || [];

    rooms.forEach((room) => {
      const roomName = String(room?.name || "").trim();
      const objects = Array.isArray(room?.objects) ? room.objects : [];

      objects.forEach((obj) => {
        if (obj?.type !== "table") return;
        if (!obj?.tableRefId) return;

        const key = String(obj.tableRefId);

        // on garde la première salle trouvée pour cette table
        if (!map.has(key)) {
          map.set(key, roomName || "Salle sans nom");
        }
      });
    });

    return map;
  }, [props.restaurantData?.reservationsSettings?.floorplan?.rooms]);

  const tablesForSelectWithRoom = useMemo(() => {
    return (tablesForSelect || []).map((table) => {
      const roomNames = Array.from(
        new Set(
          getConfiguredTableIdsFront(table)
            .map((id) => tableRoomMap.get(String(id)))
            .filter(Boolean),
        ),
      );

      let roomName = "Autres tables";
      if (roomNames.length === 1) {
        roomName = roomNames[0];
      } else if (roomNames.length > 1) {
        roomName = "Combinaisons";
      }

      return {
        ...table,
        roomName,
      };
    });
  }, [tablesForSelect, tableRoomMap]);

  const groupedTablesForSelect = useMemo(() => {
    const groupsMap = new Map();

    // ordre réel des salles dans le floorplan
    const roomOrder =
      props.restaurantData?.reservationsSettings?.floorplan?.rooms?.map(
        (room) => String(room?.name || "").trim() || "Salle sans nom",
      ) || [];

    tablesForSelectWithRoom.forEach((table) => {
      const roomName = String(table?.roomName || "Autres tables");

      if (!groupsMap.has(roomName)) {
        groupsMap.set(roomName, []);
      }

      groupsMap.get(roomName).push(table);
    });

    const groups = Array.from(groupsMap.entries()).map(([label, tables]) => ({
      label,
      tables,
    }));

    groups.sort((a, b) => {
      const ia = roomOrder.indexOf(a.label);
      const ib = roomOrder.indexOf(b.label);

      const aKnown = ia !== -1;
      const bKnown = ib !== -1;

      if (aKnown && bKnown) return ia - ib;
      if (aKnown) return -1;
      if (bKnown) return 1;

      if (a.label === "Autres tables") return 1;
      if (b.label === "Autres tables") return -1;

      return a.label.localeCompare(b.label, "fr");
    });

    return groups;
  }, [
    tablesForSelectWithRoom,
    props.restaurantData?.reservationsSettings?.floorplan?.rooms,
  ]);

  useEffect(() => {
    if (!manageDisponibilities) return;
    if (!hasPickedSlot) return;

    const list = Array.isArray(tablesForSelect) ? tablesForSelect : [];
    if (list.length !== 1) return;

    const onlyId = list[0]?._id ? String(list[0]._id) : "";
    if (!onlyId) return;

    // si aucune table enregistrée dans le state => on force
    if (!reservationData.table) {
      setReservationData((prev) => ({ ...prev, table: onlyId }));
      setHasUserChangedTable(true); // pour que l’edit envoie `table`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageDisponibilities, hasPickedSlot, tablesForSelect]);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue/70">
          <Loader2 className="size-4 animate-spin" />
          <span className="italic">{t("messages.loading")}</span>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ✅ MODALE */}
      <InfoModal
        open={modalOpen}
        title={modalTitle}
        message={modalMsg}
        confirmLabel="Compris"
        onClose={closeModal}
      />

      <section className="flex flex-col gap-4">
        <div className="midTablet:hidden  bg-lightGrey">
          <div className="flex items-center justify-between gap-3 h-[50px]">
            <button
              onClick={() => router.push("/dashboard/webapp/reservations")}
              className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
              aria-label={t("calendar.back", "Retour au calendrier")}
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-darkBlue truncate">
                  {subtitle}
                </p>
                <p className="text-sm text-darkBlue/50 truncate">
                  {reservationDateLabel ? `${reservationDateLabel}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {/* 1) Nombre de personnes */}
          <div className="w-full midTablet:max-w-[550px] rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
                <CommunitySvg width={20} height={20} className="opacity-50" />
                <span>{t("labels.add.guests")}</span>
              </div>
              <span className="text-xs text-darkBlue/50">
                {t("messages.guestsHint", "Étape 1")}
              </span>
            </div>

            <div className="w-full mt-4 grid grid-cols-1">
              <input
                type="number"
                id="numberOfGuests"
                name="numberOfGuests"
                min={1}
                value={reservationData.numberOfGuests}
                onWheel={(e) => e.target.blur()}
                onChange={handleInputChange}
                required
                className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
              />
            </div>
          </div>

          {/* 2) Date */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
                <CalendarSvg width={20} height={20} className="opacity-50" />
                <span>{t("labels.add.date")}</span>
              </div>
              <span className="text-xs text-darkBlue/50">
                {t("messages.dateHintStep", "Étape 2")}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/80 p-2">
              <Calendar
                onChange={handleDateChange}
                value={reservationData.reservationDate}
                view="month"
                locale="fr-FR"
                tileDisabled={disableClosedDays}
                className="drop-shadow-sm"
              />
            </div>
          </div>

          {/* 3) Créneau */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
                <ClockSvg width={20} height={20} className="opacity-50" />
                <span>{t("labels.add.time")}</span>
              </div>
              <span className="text-xs text-darkBlue/50">
                {t("messages.timeHintStep", "Étape 3")}
              </span>
            </div>

            <div className="mt-4">
              {!canPickTime ? (
                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 text-sm text-darkBlue/60">
                  {t(
                    "messages.guestsFirst",
                    "Renseignez d’abord le nombre de personnes pour voir les créneaux.",
                  )}
                </div>
              ) : availableTimes.length > 0 ? (
                <div className="grid grid-cols-5 midTablet:grid-cols-6 gap-2">
                  {availableTimes.map((reservationTime) => {
                    const selected =
                      reservationData.reservationTime === reservationTime;
                    return (
                      <button
                        type="button"
                        key={reservationTime}
                        onClick={() => handleTimeSelect(reservationTime)}
                        className={[
                          "inline-flex items-center justify-center",
                          "h-10 px-4 rounded-lg midTablet:rounded-xl text-sm font-semibold",
                          "border transition",
                          selected
                            ? "bg-blue text-white border-blue shadow-sm"
                            : "bg-white/80 text-darkBlue border-darkBlue/10 hover:bg-darkBlue/5",
                        ].join(" ")}
                        aria-pressed={selected}
                      >
                        {formatTimeDisplay(reservationTime)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 text-sm text-darkBlue/60">
                  {t("labels.add.close")}
                </div>
              )}
            </div>
          </div>

          {/* Informations Client et Table */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
            <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-6 midTablet:gap-8">
              <div className="flex flex-col gap-3">
                <label
                  htmlFor="customerName"
                  className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
                >
                  <UserSvg width={20} height={20} className="opacity-50" />
                  Informations client
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="customerFirstName"
                    placeholder="Prénom"
                    value={reservationData.customerFirstName}
                    onChange={handleInputChange}
                    required
                    className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  />
                  <input
                    type="text"
                    name="customerLastName"
                    placeholder="Nom"
                    value={reservationData.customerLastName}
                    onChange={handleInputChange}
                    required
                    className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  />
                </div>
              </div>

              <div className="relative flex flex-col gap-3">
                <label
                  htmlFor="customerEmail"
                  className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
                >
                  <EmailSvg width={20} height={20} className="opacity-50" />
                  {t("labels.add.email")}
                </label>
                <input
                  type="email"
                  id="customerEmail"
                  name="customerEmail"
                  value={reservationData.customerEmail}
                  onChange={handleInputChange}
                  required={shouldRequestBankHold}
                  className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                />
                <p className="text-[11px] ml-2 pt-1 text-darkBlue/55 absolute bottom-1 translate-y-full">
                  *Requis pour les rappels de réservation et les empreintes
                  bancaires
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <label
                  htmlFor="customerPhone"
                  className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
                >
                  <PhoneSvg width={20} height={20} className="opacity-50" />
                  {t("labels.add.phone")}
                </label>
                <input
                  type="tel"
                  id="customerPhone"
                  name="customerPhone"
                  value={reservationData.customerPhone}
                  onChange={handleInputChange}
                  className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                />
              </div>

              <div className="flex flex-col gap-3">
                <label
                  htmlFor="table"
                  className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
                >
                  <TableSvg width={20} height={20} className="opacity-50" />
                  {t("labels.add.table")}
                </label>

                {manageDisponibilities ? (
                  <select
                    id="table"
                    name="table"
                    value={reservationData.table}
                    onChange={handleInputChange}
                    required={Boolean(hasPickedSlot && manageDisponibilities)}
                    className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  >
                    {!hasPickedSlot ? (
                      <option value="" disabled>
                        Choisissez d’abord un créneau
                      </option>
                    ) : tablesForSelect.length === 0 ? (
                      <option value="" disabled>
                        Aucune table disponible
                      </option>
                    ) : (
                      groupedTablesForSelect.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.tables.map((table) => (
                            <option key={table._id} value={table._id}>
                              {table.name
                                ? `${table.name} · ${table.seats} places${
                                    table.kind === "combo"
                                      ? " (combinaison)"
                                      : ""
                                  }`
                                : `Table de ${table.seats} places`}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    id="table"
                    name="table"
                    value={reservationData.table}
                    onChange={handleInputChange}
                    className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  />
                )}
              </div>
            </div>
          </div>

          {!isEditing && bankHoldFeatureEnabled && (
            <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="requestBankHold"
                  checked={Boolean(reservationData.requestBankHold)}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 rounded border-darkBlue/20"
                />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-darkBlue">
                    Demander une empreinte bancaire
                  </span>
                  <span className="text-sm text-darkBlue/60">
                    Si cette option reste cochée, le client recevra un email
                    pour valider sa carte bancaire avant confirmation définitive
                    de la réservation.
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Commentaire */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="commentary"
                className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
              >
                <CommentarySvg width={20} height={20} className="opacity-50" />
                {t("labels.add.commentary")}
              </label>

              <textarea
                id="commentary"
                name="commentary"
                value={reservationData.commentary}
                onChange={handleInputChange}
                rows={5}
                className="w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-3 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20 resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}

          <div className="flex flex-col midTablet:flex-row items-stretch midTablet:items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard/webapp/reservations")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-5 h-11 text-sm font-semibold text-darkBlue"
            >
              <X className="size-4 text-darkBlue/60" />
              {t("buttons.cancel")}
            </button>

            <button
              type="submit"
              disabled={!canSubmit || isLoading || isSubmitting}
              className={[
                "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
                "text-sm font-semibold text-white",
                "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
                !canSubmit || isLoading || isSubmitting
                  ? "opacity-50 cursor-not-allowed"
                  : "",
              ].join(" ")}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("buttons.loading")}
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {isEditing ? t("buttons.update") : t("buttons.validate")}
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
