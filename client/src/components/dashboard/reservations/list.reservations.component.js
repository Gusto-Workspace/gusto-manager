import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// COMPONENTS
import ConfirmationModalReservationComponent from "./confirm-modal.reservations.component";
import CalendarToolbarReservationsComponent from "./calendar-toolbar.reservations.component";
import CalendarMonthReservationsComponent from "./calendar-month.reservations.component";
import DayToolbarReservationsComponent from "./day-toolbar.reservations.component";
import DayListReservationsComponent from "./day-list.reservations.component";
import FloorPlanDrawerReservationsComponent from "./floor-plan-drawer.reservations.component";
import {
  RESERVATION_DISPLAY_STATUS_KEYS,
  createReservationDisplayStatusBuckets,
  createReservationDisplayStatusCounter,
  getReservationDisplayStatus,
} from "@/components/_shared/reservations/reservation-status.utils";
import {
  getNextReservationServiceBoundaryAt,
  getReservationServiceClosureState,
} from "./service-closure.reservations";

const SEATS_FILTER_OPTIONS = [0, 2, 4, 6, 8, 10, 12];

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();
  const selectedDayKey =
    typeof router.query.day === "string" ? router.query.day : null;
  const focusedReservationId =
    typeof router.query.reservationId === "string"
      ? router.query.reservationId
      : null;

  /* ---------- States (général) ---------- */
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState(null);
  const [activeDayTab, setActiveDayTab] = useState("All");

  const calendarSearchRef = useRef(null);
  const daySearchRef = useRef(null);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [disableDayClick, setDisableDayClick] = useState(false);
  const [isFloorPlanDrawerOpen, setIsFloorPlanDrawerOpen] = useState(false);
  const [floorPlanMinSeatsFilter, setFloorPlanMinSeatsFilter] = useState(0);
  const [isFloorPlanPinned, setIsFloorPlanPinned] = useState(false);
  const [serviceClock, setServiceClock] = useState(() => Date.now());
  const [serviceFullSaving, setServiceFullSaving] = useState(false);
  const [serviceFullError, setServiceFullError] = useState("");

  const restaurantId = props.restaurantData?._id
    ? String(props.restaurantData._id)
    : "";
  const floorPlanPinnedStorageKey = restaurantId
    ? `gusto:reservations:floor-plan-pinned:${restaurantId}`
    : "";
  const showPinnedFloorPlan = Boolean(selectedDay && isFloorPlanPinned);
  const serviceClosureState = useMemo(
    () =>
      getReservationServiceClosureState(
        props.restaurantData,
        new Date(serviceClock),
      ),
    [props.restaurantData, serviceClock],
  );

  useEffect(() => {
    const now = new Date();
    const boundary = getNextReservationServiceBoundaryAt(
      props.restaurantData,
      now,
    );
    const untilBoundary = boundary
      ? boundary.getTime() - now.getTime() + 100
      : 60 * 1000;
    const delay = Math.min(Math.max(untilBoundary, 250), 60 * 1000);

    const timer = window.setTimeout(() => {
      setServiceClock(Date.now());
    }, delay);

    return () => window.clearTimeout(timer);
  }, [props.restaurantData, serviceClock]);

  const closeKeyboardOnly = useCallback(() => {
    setDisableDayClick(true);

    calendarSearchRef.current?.blur?.();
    daySearchRef.current?.blur?.();
    setIsKeyboardOpen(false);

    window.setTimeout(() => {
      setDisableDayClick(false);
    }, 400);
  }, []);

  const statusList = RESERVATION_DISPLAY_STATUS_KEYS;
  const dayStatusTabs = ["All", ...statusList];

  const statusTranslations = {
    All: t("list.status.all", "Toutes"),
    Waitlist: t("list.status.waitlist", "Liste d’attente"),
    Pending: t("list.status.pending", "En attente"),
    Confirmed: t("list.status.confirmed", "Confirmées"),
    Finished: t("list.status.finished", "Terminées"),
    Canceled: t("list.status.canceled", "Annulées"),
  };

  /* =========================================================
   * Utilitaires date/heure
   * =======================================================*/
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }
  function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  function toDateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function getReservationDateTime(reservation) {
    const date = new Date(reservation.reservationDate);
    if (Number.isNaN(date.getTime())) return null;
    const time = String(reservation.reservationTime || "");
    const [hours = "00", minutes = "00"] = time.split(":");
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    return date;
  }
  function capitalizeFirst(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function matchesGuestsFilter(reservation) {
    const minGuests = Math.max(0, Number(floorPlanMinSeatsFilter || 0));
    if (!minGuests) return true;
    return Number(reservation?.numberOfGuests || 0) >= minGuests;
  }

  useEffect(() => {
    if (!selectedDayKey) {
      setSelectedDay(null);
      return;
    }

    const [y, m, d] = selectedDayKey.split("-").map(Number);
    if (!y || !m || !d) return;

    setSelectedDay(new Date(y, m - 1, d, 12, 0, 0, 0));
  }, [selectedDayKey]);

  useEffect(() => {
    if (!floorPlanPinnedStorageKey) {
      setIsFloorPlanPinned(false);
      return;
    }

    try {
      setIsFloorPlanPinned(
        localStorage.getItem(floorPlanPinnedStorageKey) === "true",
      );
    } catch {
      setIsFloorPlanPinned(false);
    }
  }, [floorPlanPinnedStorageKey]);

  const setFloorPlanPinnedPreference = useCallback(
    (nextValue) => {
      const next = Boolean(nextValue);
      setIsFloorPlanPinned(next);

      if (next) {
        setIsFloorPlanDrawerOpen(false);
      }

      if (!floorPlanPinnedStorageKey) return;

      try {
        localStorage.setItem(
          floorPlanPinnedStorageKey,
          next ? "true" : "false",
        );
      } catch {}
    },
    [floorPlanPinnedStorageKey],
  );

  const clearFocusedReservationId = useCallback(() => {
    if (!router.isReady) return;
    if (!router.query?.reservationId) return;

    const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;

    const nextQuery = { ...router.query };
    delete nextQuery.reservationId;

    router
      .replace(
        {
          pathname: router.pathname,
          query: nextQuery,
        },
        undefined,
        { shallow: true, scroll: false },
      )
      .finally(() => {
        if (typeof window === "undefined") return;
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
        });
      });
  }, [router]);

  useEffect(() => {
    if (!focusedReservationId) return;
    if (!Array.isArray(props.reservations) || !props.reservations.length)
      return;

    const reservation = props.reservations.find(
      (item) => String(item?._id) === String(focusedReservationId),
    );
    if (!reservation) return;

    const reservationDateTime = getReservationDateTime(reservation);
    if (!reservationDateTime) return;

    setCurrentMonth(startOfMonth(reservationDateTime));
    setSelectedDay(
      new Date(
        reservationDateTime.getFullYear(),
        reservationDateTime.getMonth(),
        reservationDateTime.getDate(),
        12,
        0,
        0,
        0,
      ),
    );
    setActiveDayTab("All");
  }, [focusedReservationId, props.reservations]);

  function handleOpenFloorPlanDrawer() {
    setIsFloorPlanDrawerOpen(true);
  }

  function handleCloseFloorPlanDrawer() {
    setIsFloorPlanDrawerOpen(false);
  }

  /* =========================================================
   * Agrégats calendrier (pack par jour) + surbrillance recherche
   * =======================================================*/
  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const term = searchTerm.trim().toLowerCase();

    // Index par jour + comptage des matches de la recherche
    const dayAgg = {};
    (props.reservations || []).forEach((r) => {
      const dt = getReservationDateTime(r);
      if (!dt) return;
      if (dt < monthStart || dt > monthEnd) return;
      if (!matchesGuestsFilter(r)) return;

      const key = toDateKey(dt);
      if (!dayAgg[key]) {
        dayAgg[key] = {
          date: new Date(dt),
          total: 0,
          byStatus: createReservationDisplayStatusCounter(),
          matchTotal: 0,
          matchByStatus: createReservationDisplayStatusCounter(),
        };
      }

      dayAgg[key].total += 1;
      const s = getReservationDisplayStatus(r.status);
      if (dayAgg[key].byStatus[s] != null) {
        dayAgg[key].byStatus[s] += 1;
      }

      if (term) {
        const hay =
          `${r.customerName || ""} ${r.customerEmail || ""} ${r.customerPhone || ""} ${r.code || ""}`.toLowerCase();

        if (hay.includes(term)) {
          dayAgg[key].matchTotal += 1;

          const ms = getReservationDisplayStatus(r.status);
          if (dayAgg[key].matchByStatus[ms] != null) {
            dayAgg[key].matchByStatus[ms] += 1;
          }
        }
      }
    });

    // Construire une grille complète du mois (lundi → dimanche)
    const firstWeekday = new Date(monthStart).getDay(); // 0=dim...6=sam
    const leading = (firstWeekday + 6) % 7; // nb de cases avant le 1er du mois
    const last = new Date(monthEnd);
    const lastWeekday = last.getDay();
    const trailing = (7 - ((lastWeekday + 6) % 7) - 1 + 7) % 7; // nb de cases après le dernier jour

    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - leading);
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(gridEnd.getDate() + trailing);

    const days = [];
    for (
      let d = new Date(gridStart);
      d <= gridEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const k = toDateKey(d);
      const inMonth = d.getMonth() === currentMonth.getMonth();
      const agg = dayAgg[k];
      days.push({
        date: new Date(d),
        key: k,
        inMonth,
        total: agg?.total || 0,
        byStatus: agg?.byStatus || createReservationDisplayStatusCounter(),
        matchTotal: agg?.matchTotal || 0,
        matchByStatus:
          agg?.matchByStatus || createReservationDisplayStatusCounter(),
      });
    }
    return days;
  }, [props.reservations, currentMonth, searchTerm, floorPlanMinSeatsFilter]);

  /* =========================================================
   * Données vue Jour (réservations du jour + par statut)
   * -> le filtre de recherche RESTE actif en drill-down
   * =======================================================*/
  const dayData = useMemo(() => {
    if (!selectedDay) {
      return {
        byStatus: {
          All: [],
          ...createReservationDisplayStatusBuckets(),
        },
        counts: {
          All: 0,
          ...createReservationDisplayStatusCounter(),
        },
      };
    }

    const key = toDateKey(selectedDay);
    const term = searchTerm.trim().toLowerCase();

    // Liste filtrée et triée pour TOUTES
    const filteredSorted = (props.reservations || [])
      .filter((r) => {
        const dt = getReservationDateTime(r);
        if (!dt) return false;
        if (toDateKey(dt) !== key) return false;
        if (!matchesGuestsFilter(r)) return false;

        if (term) {
          const hay =
            `${r.customerName || ""} ${r.customerEmail || ""} ${r.customerPhone || ""} ${r.code || ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const A = getReservationDateTime(a)?.getTime() || 0;
        const B = getReservationDateTime(b)?.getTime() || 0;
        return A - B;
      });

    const by = {
      All: filteredSorted.slice(),
      ...createReservationDisplayStatusBuckets(),
    };

    filteredSorted.forEach((r) => {
      const displayStatus = getReservationDisplayStatus(r.status);
      if (by[displayStatus]) by[displayStatus].push(r);
    });

    const counts = Object.fromEntries(
      dayStatusTabs.map((s) => [s, (by[s] || []).length]),
    );

    return { byStatus: by, counts };
  }, [props.reservations, selectedDay, searchTerm, floorPlanMinSeatsFilter]);

  /* =========================================================
   * Navigation / actions
   * =======================================================*/
  function handleAddClick() {
    router.push(`/dashboard/reservations/add`);
  }
  function handleParametersClick() {
    router.push(`/dashboard/reservations/parameters`);
  }
  async function handleToggleServiceFull(nextActive) {
    if (
      serviceFullSaving ||
      serviceClosureState.automatic ||
      !serviceClosureState.currentService ||
      !props.restaurantData?._id
    ) {
      return;
    }

    try {
      setServiceFullSaving(true);
      setServiceFullError("");

      const token = localStorage.getItem("token");
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        {
          parameters: {
            manual_service_full_until: nextActive
              ? serviceClosureState.currentService.endAt.toISOString()
              : null,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(response.data.restaurant);
      setServiceClock(Date.now());
    } catch (toggleError) {
      setServiceFullError(
        toggleError?.response?.data?.message ||
          "Impossible de modifier la fermeture du service.",
      );
    } finally {
      setServiceFullSaving(false);
    }
  }
  function handleEditClick(reservation) {
    router.push(`/dashboard/reservations/add?reservationId=${reservation._id}`);
  }
  function openModalForAction(reservation, action) {
    setSelectedReservation(reservation);
    setActionType(action);
    setIsConfirmationModalOpen(true);
  }
  function closeModal() {
    setSelectedReservation(null);
    setActionType(null);
    setIsConfirmationModalOpen(false);
    setError(null);
  }

  const updateReservationStatus = useCallback(
    (newStatus) => {
      if (!selectedReservation) return;
      setIsProcessing(true);
      setError(null);
      const token = localStorage.getItem("token");
      axios
        .put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}/status`,
          { status: newStatus },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        )
        .then(async (response) => {
          props.setRestaurantData(response.data.restaurant);
          await props.refreshReservationsList?.(props.restaurantData?._id);

          closeModal();
        })
        .catch((error) => {
          console.error(`Error updating status to ${newStatus}:`, error);

          const status = error?.response?.status;
          const apiCode = error?.response?.data?.code;
          const apiMsg = error?.response?.data?.message;

          // ✅ Conflit de créneau / table (cas typique quand 2 résas sur le même slot)
          if (status === 409) {
            // si ton backend renvoie un code explicite
            if (apiCode === "NO_TABLE_AVAILABLE") {
              setError(
                "Ce créneau n’est plus disponible (aucune table libre).",
              );
              return;
            }

            // sinon on fallback sur un message clair
            setError(
              apiMsg ||
                "Ce créneau n’est plus disponible (table déjà occupée).",
            );
            return;
          }

          // ✅ Session / token
          if (status === 401 || status === 403) {
            setError("Session expirée. Reconnecte-toi.");
            return;
          }

          // ✅ fallback générique
          setError(
            apiMsg ||
              "Une erreur est survenue lors de la mise à jour du statut de la réservation.",
          );
        })

        .finally(() => {
          setIsProcessing(false);
        });
    },
    [
      selectedReservation,
      props.restaurantData,
      props.setRestaurantData,
      props.refreshReservationsList,
    ],
  );

  function deleteReservation() {
    if (!selectedReservation) return;
    setIsProcessing(true);
    setError(null);
    const token = localStorage.getItem("token");
    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then(async (response) => {
        props.setRestaurantData(response.data.restaurant);
        await props.refreshReservationsList?.(props.restaurantData?._id);
        closeModal();
      })
      .catch((error) => {
        console.error("Error deleting reservation:", error);
        setError(
          "Une erreur est survenue lors de la suppression de la réservation.",
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function captureBankHold() {
    if (!selectedReservation) return;

    setIsProcessing(true);
    setError(null);

    const token = localStorage.getItem("token");

    axios
      .post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}/bank-hold/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then(async (response) => {
        props.setRestaurantData(response.data.restaurant);
        await props.refreshReservationsList?.(props.restaurantData?._id);
        closeModal();
      })
      .catch((error) => {
        console.error("Error capturing bank hold:", error);
        setError(
          error?.response?.data?.message ||
            "Une erreur est survenue lors de la capture de l’empreinte bancaire.",
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function releaseBankHold() {
    if (!selectedReservation) return;

    setIsProcessing(true);
    setError(null);

    const token = localStorage.getItem("token");

    axios
      .post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}/bank-hold/release`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then(async (response) => {
        props.setRestaurantData(response.data.restaurant);
        await props.refreshReservationsList?.(props.restaurantData?._id);
        closeModal();
      })
      .catch((error) => {
        console.error("Error releasing bank hold:", error);
        setError(
          error?.response?.data?.message ||
            "Une erreur est survenue lors de la libération de l’empreinte bancaire.",
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function handleConfirmAction() {
    if (!selectedReservation) return;

    if (actionType === "delete") {
      deleteReservation();
      return;
    }

    if (actionType === "finish" || actionType === "finished") {
      updateReservationStatus("Finished");
      return;
    }

    if (actionType === "confirm") {
      updateReservationStatus("Confirmed");
      return;
    }

    if (actionType === "cancel" || actionType === "canceled") {
      updateReservationStatus("Canceled");
      return;
    }

    if (actionType === "reject" || actionType === "rejected") {
      updateReservationStatus("Rejected");
      return;
    }

    if (actionType === "capture_bank_hold") {
      captureBankHold();
      return;
    }

    if (actionType === "release_bank_hold") {
      releaseBankHold();
      return;
    }

    console.warn("Unknown actionType in handleConfirmAction:", actionType);
  }

  const keepFocus = (ref) => {
    if (!ref?.current) return;
    requestAnimationFrame(() => {
      if (ref.current) {
        const el = ref.current;
        const end = el.value?.length ?? 0;
        el.focus();
        try {
          el.setSelectionRange(end, end);
        } catch {}
      }
    });
  };

  useEffect(() => {
    if (!isKeyboardOpen) return;

    const handler = (e) => {
      const target = e.target;

      const cal = calendarSearchRef.current;
      const day = daySearchRef.current;

      if (cal && (target === cal || cal.contains(target))) return;
      if (day && (target === day || day.contains(target))) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }

      closeKeyboardOnly();
    };

    window.addEventListener("touchstart", handler, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerdown", handler, {
      capture: true,
      passive: false,
    });
    window.addEventListener("mousedown", handler, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener("touchstart", handler, { capture: true });
      window.removeEventListener("pointerdown", handler, { capture: true });
      window.removeEventListener("mousedown", handler, { capture: true });
    };
  }, [isKeyboardOpen, closeKeyboardOnly]);

  function handleSearchChangeCalendar(event) {
    setSearchTerm(event.target.value);
  }

  function handleSearchChangeDay(event) {
    setSearchTerm(event.target.value);
  }

  const calendarStatusList = statusList;

  return (
    <section className="flex flex-col gap-6">
      <hr className="hidden midTablet:block opacity-20" />

      {serviceFullError ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
          {serviceFullError}
        </p>
      ) : null}

      {!selectedDay ? (
        <>
          <CalendarToolbarReservationsComponent
            capitalizeFirst={capitalizeFirst}
            currentMonth={currentMonth}
            handleParametersClick={handleParametersClick}
            handleAddClick={handleAddClick}
            setCurrentMonth={setCurrentMonth}
            startOfMonth={startOfMonth}
            setSelectedDay={setSelectedDay}
            calendarSearchRef={calendarSearchRef}
            searchTerm={searchTerm}
            handleSearchChangeCalendar={handleSearchChangeCalendar}
            setSearchTerm={setSearchTerm}
            setIsKeyboardOpen={setIsKeyboardOpen}
            handleOpenFloorPlanDrawer={handleOpenFloorPlanDrawer}
            minSeatsFilter={floorPlanMinSeatsFilter}
            setMinSeatsFilter={setFloorPlanMinSeatsFilter}
            seatsFilterOptions={SEATS_FILTER_OPTIONS}
            serviceFullActive={serviceClosureState.closed}
            serviceFullAutomatic={serviceClosureState.automatic}
            hasCurrentService={Boolean(serviceClosureState.currentService)}
            serviceFullSaving={serviceFullSaving}
            onToggleServiceFull={handleToggleServiceFull}
          />
          <CalendarMonthReservationsComponent
            monthGridDays={monthGridDays}
            toDateKey={toDateKey}
            searchTerm={searchTerm}
            setSelectedDay={setSelectedDay}
            selectedDay={selectedDay}
            setActiveDayTab={setActiveDayTab}
            statusList={calendarStatusList}
            disableDayClick={disableDayClick}
            isKeyboardOpen={isKeyboardOpen}
          />
        </>
      ) : (
        <>
          <DayToolbarReservationsComponent
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            handleParametersClick={handleParametersClick}
            handleAddClick={handleAddClick}
            setSearchTerm={setSearchTerm}
            calendarSearchRef={calendarSearchRef}
            keepFocus={keepFocus}
            activeDayTab={activeDayTab}
            setActiveDayTab={setActiveDayTab}
            dayStatusTabs={dayStatusTabs}
            statusTranslations={statusTranslations}
            dayData={dayData}
            daySearchRef={daySearchRef}
            searchTerm={searchTerm}
            handleSearchChangeDay={handleSearchChangeDay}
            setIsKeyboardOpen={setIsKeyboardOpen}
            handleOpenFloorPlanDrawer={handleOpenFloorPlanDrawer}
            hideFloorPlanButtonOnDesktop={showPinnedFloorPlan}
            floorPlanPinned={isFloorPlanPinned}
            onToggleFloorPlanPinned={() =>
              setFloorPlanPinnedPreference(!isFloorPlanPinned)
            }
            minSeatsFilter={floorPlanMinSeatsFilter}
            setMinSeatsFilter={setFloorPlanMinSeatsFilter}
            seatsFilterOptions={SEATS_FILTER_OPTIONS}
            serviceFullActive={serviceClosureState.closed}
            serviceFullAutomatic={serviceClosureState.automatic}
            hasCurrentService={Boolean(serviceClosureState.currentService)}
            serviceFullSaving={serviceFullSaving}
            onToggleServiceFull={handleToggleServiceFull}
          />
          <div
            className={
              showPinnedFloorPlan
                ? "grid grid-cols-1 gap-6 min-[1024px]:grid-cols-2 min-[1024px]:items-start"
                : "block"
            }
          >
            <div className="min-w-0">
              <DayListReservationsComponent
                selectedDay={selectedDay}
                dayData={dayData}
                activeDayTab={activeDayTab}
                handleEditClick={handleEditClick}
                openModalForAction={openModalForAction}
                focusedReservationId={focusedReservationId}
                clearFocusedReservationId={clearFocusedReservationId}
                restaurantId={props.restaurantData?._id}
                tablesCatalog={
                  props.restaurantData?.reservationsSettings?.tables
                }
                compactRows={showPinnedFloorPlan}
              />
            </div>

            {showPinnedFloorPlan ? (
              <div className="hidden min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:block min-[1024px]:max-h-[calc(100vh-3rem)] min-[1024px]:min-h-[680px]">
                <FloorPlanDrawerReservationsComponent
                  variant="panel"
                  open
                  restaurantId={props.restaurantData?._id}
                  restaurantData={props.restaurantData}
                  reservations={props.reservations || []}
                  selectedDay={selectedDay}
                  floorPlanPinned={isFloorPlanPinned}
                  onToggleFloorPlanPinned={() =>
                    setFloorPlanPinnedPreference(false)
                  }
                />
              </div>
            ) : null}
          </div>
        </>
      )}

      <ConfirmationModalReservationComponent
        isOpen={isConfirmationModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirmAction}
        actionType={actionType}
        reservation={selectedReservation}
        isProcessing={isProcessing}
        error={error}
        t={t}
      />

      <FloorPlanDrawerReservationsComponent
        open={isFloorPlanDrawerOpen}
        onClose={handleCloseFloorPlanDrawer}
        restaurantId={props.restaurantData?._id}
        restaurantData={props.restaurantData}
        reservations={props.reservations || []}
        selectedDay={selectedDay}
        floorPlanPinned={isFloorPlanPinned}
        onToggleFloorPlanPinned={() =>
          setFloorPlanPinnedPreference(!isFloorPlanPinned)
        }
      />
    </section>
  );
}
