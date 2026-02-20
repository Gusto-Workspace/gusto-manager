import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// COMPONENTS
import ConfirmModalReservationsWebapp from "./confirm-modal.reservations.webapp";
import CalendarToolbarReservationsWebapp from "./calendar-toolbar.reservations.webapp";
import CalendarMonthReservationsWebapp from "./calendar-month.reservations.webapp";
import DayHeaderReservationsWebapp from "./day-header.reservations.webapp";
import DayListReservationsWebapp from "./day-list.reservations.webapp";

export default function ListReservationsWebapp(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const selectedDayKey =
    typeof router.query.day === "string" ? router.query.day : null;

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

  const closeKeyboardOnly = useCallback(() => {
    calendarSearchRef.current?.blur?.();
    daySearchRef.current?.blur?.();
    setIsKeyboardOpen(false);
  }, []);

  const statusList = [
    "Pending",
    "Confirmed",
    "Active",
    "Late",
    "Finished",
    "Canceled",
    "Rejected",
  ];
  const dayStatusTabs = ["All", ...statusList];

  const statusTranslations = {
    All: t("list.status.all", "Toutes"),
    Pending: t("list.status.pending"),
    Confirmed: t("list.status.confirmed"),
    Active: t("list.status.active"),
    Late: t("list.status.late"),
    Finished: t("list.status.finished"),
    Canceled: t("list.status.canceled", "Annulée"),
    Rejected: t("list.status.rejected", "Refusée"),
  };

  useEffect(() => {
    if (!selectedDayKey) {
      setSelectedDay(null);
      return;
    }

    const [y, m, d] = selectedDayKey.split("-").map(Number);
    if (!y || !m || !d) return;

    // midi pour éviter bugs fuseaux
    setSelectedDay(new Date(y, m - 1, d, 12, 0, 0, 0));
  }, [selectedDayKey]);

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

      const key = toDateKey(dt);
      if (!dayAgg[key]) {
        dayAgg[key] = {
          date: new Date(dt),
          total: 0,
          byStatus: {
            Pending: 0,
            Confirmed: 0,
            Active: 0,
            Late: 0,
            Finished: 0,
            Canceled: 0,
            Rejected: 0,
          },
          matchTotal: 0,
          matchByStatus: {
            Pending: 0,
            Confirmed: 0,
            Active: 0,
            Late: 0,
            Finished: 0,
            Canceled: 0,
            Rejected: 0,
          },
        };
      }

      dayAgg[key].total += 1;
      const s = r.status === "Rejected" ? "Canceled" : r.status; // regroupe Rejected dans Canceled
      if (dayAgg[key].byStatus[s] != null) {
        dayAgg[key].byStatus[s] += 1;
      }

      if (term) {
        const hay =
          `${r.customerName || ""} ${r.customerEmail || ""} ${r.customerPhone || ""} ${r.code || ""}`.toLowerCase();

        if (hay.includes(term)) {
          dayAgg[key].matchTotal += 1;

          const ms = r.status === "Rejected" ? "Canceled" : r.status; // même logique que byStatus
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
        byStatus: agg?.byStatus || {
          Pending: 0,
          Confirmed: 0,
          Active: 0,
          Late: 0,
          Finished: 0,
          Canceled: 0,
          Rejected: 0,
        },
        matchTotal: agg?.matchTotal || 0,
        matchByStatus: agg?.matchByStatus || {
          Pending: 0,
          Confirmed: 0,
          Active: 0,
          Late: 0,
          Finished: 0,
          Canceled: 0,
          Rejected: 0,
        },
      });
    }
    return days;
  }, [props.reservations, currentMonth, searchTerm]);

  /* =========================================================
   * Données vue Jour (réservations du jour + par statut)
   * -> le filtre de recherche RESTE actif en drill-down
   * =======================================================*/
  const dayData = useMemo(() => {
    if (!selectedDay) {
      return {
        byStatus: {
          All: [],
          Pending: [],
          Confirmed: [],
          Active: [],
          Late: [],
          Finished: [],
          Canceled: [],
          Rejected: [],
        },
        counts: {
          All: 0,
          Pending: 0,
          Confirmed: 0,
          Active: 0,
          Late: 0,
          Finished: 0,
          Canceled: 0,
          Rejected: 0,
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
      Pending: [],
      Confirmed: [],
      Active: [],
      Late: [],
      Finished: [],
      Canceled: [],
      Rejected: [],
    };

    filteredSorted.forEach((r) => {
      if (by[r.status]) by[r.status].push(r);
    });

    const counts = Object.fromEntries(
      dayStatusTabs.map((s) => [s, by[s].length]),
    );

    return { byStatus: by, counts };
  }, [props.reservations, selectedDay, searchTerm]);

  /* =========================================================
   * Navigation / actions
   * =======================================================*/
  function handleAddClick() {
    router.push(`/dashboard/webapp/reservations/add`);
  }
  function handleParametersClick() {
    router.push(`/dashboard/webapp/reservations/parameters`);
  }
  function handleEditClick(reservation) {
    router.push(
      `/dashboard/webapp/reservations/add?reservationId=${reservation._id}`,
    );
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
        .then((response) => {
          props.setRestaurantData(response.data.restaurant);

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
    [selectedReservation, props.restaurantData, props.setRestaurantData],
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
      .then((response) => {
        props.setRestaurantData(response.data.restaurant);
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

    if (actionType === "active") {
      updateReservationStatus("Active");
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

    console.warn("Unknown actionType in handleConfirmAction:", actionType);
  }

  // Assure le focus persistant sur l'input (corrige la perte de focus après 1 caractère)
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

  function handleSearchChangeCalendar(event) {
    setSearchTerm(event.target.value);
  }

  function handleSearchChangeDay(event) {
    setSearchTerm(event.target.value);
  }

  const calendarStatusList = [
    "Pending",
    "Confirmed",
    "Active",
    "Late",
    "Finished",
    "Canceled",
  ];

  return (
    <section className="flex flex-col gap-6">
      {isKeyboardOpen && (
        <div
          className="fixed inset-0 z-[999] bg-transparent"
          onPointerDownCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeKeyboardOnly();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}

      {!selectedDay ? (
        <>
          <CalendarToolbarReservationsWebapp
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
            restaurantData={props.restaurantData}
            setIsKeyboardOpen={setIsKeyboardOpen}
          />
          <CalendarMonthReservationsWebapp
            monthGridDays={monthGridDays}
            toDateKey={toDateKey}
            searchTerm={searchTerm}
            setSelectedDay={setSelectedDay}
            selectedDay={selectedDay}
            setActiveDayTab={setActiveDayTab}
            statusList={calendarStatusList}
          />
        </>
      ) : (
        <>
          <DayHeaderReservationsWebapp
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
          />
          {/* Liste du statut actif */}
          <DayListReservationsWebapp
            selectedDay={selectedDay}
            dayData={dayData}
            activeDayTab={activeDayTab}
            handleEditClick={handleEditClick}
            openModalForAction={openModalForAction}
          />
        </>
      )}

      <ConfirmModalReservationsWebapp
        isOpen={isConfirmationModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirmAction}
        actionType={actionType}
        reservation={selectedReservation}
        isProcessing={isProcessing}
        error={error}
        t={t}
      />
    </section>
  );
}
