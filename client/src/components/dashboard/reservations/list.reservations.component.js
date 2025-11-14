import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// Icons (Lucide)
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

// SVG
import { ReservationSvg } from "../../_shared/_svgs/_index";

// COMPONENTS
import ConfirmationModalReservationComponent from "./confirm-modal.reservations.component";
import CardReservationComponent from "./card.reservations.component";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  /* ---------- States (général) ---------- */
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  /* ---------- Nouveau : état calendrier/jour ---------- */
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date())
  );
  const [selectedDay, setSelectedDay] = useState(null); // Date | null
  const [activeDayTab, setActiveDayTab] = useState("All"); // "All" par défaut en vue Jour

  // Refs pour garder le focus sur les inputs recherche (calendrier et jour)
  const calendarSearchRef = useRef(null);
  const daySearchRef = useRef(null);

  const statusList = ["Pending", "Confirmed", "Active", "Late", "Finished"];
  const dayStatusTabs = ["All", ...statusList];

  const statusTranslations = {
    All: t("list.status.all", "Toutes"),
    Pending: t("list.status.pending"),
    Confirmed: t("list.status.confirmed"),
    Active: t("list.status.active"),
    Late: t("list.status.late"),
    Finished: t("list.status.finished"),
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
          },
          matchCount: 0,
        };
      }
      dayAgg[key].total += 1;
      if (dayAgg[key].byStatus[r.status] != null) {
        dayAgg[key].byStatus[r.status] += 1;
      }

      if (term) {
        const hay =
          `${r.customerName || ""} ${r.customerEmail || ""} ${r.customerPhone || ""} ${r.code || ""}`.toLowerCase();
        if (hay.includes(term)) {
          dayAgg[key].matchCount += 1;
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
        },
        matchCount: agg?.matchCount || 0, // <-- utilisé pour surbrillance
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
        },
        counts: {
          All: 0,
          Pending: 0,
          Confirmed: 0,
          Active: 0,
          Late: 0,
          Finished: 0,
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
    };
    filteredSorted.forEach((r) => {
      if (by[r.status]) by[r.status].push(r);
    });

    const counts = Object.fromEntries(
      dayStatusTabs.map((s) => [s, by[s].length])
    );
    return { byStatus: by, counts };
  }, [props.reservations, selectedDay, searchTerm]);

  /* =========================================================
   * Navigation / actions
   * =======================================================*/
  function handleAddClick() {
    router.push(`/dashboard/reservations/add`);
  }
  function handleParametersClick() {
    router.push(`/dashboard/reservations/parameters`);
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
          }
        )
        .then((response) => {
          props.setRestaurantData(response.data.restaurant);

          // Email auto si Pending -> Confirmed
          if (
            newStatus === "Confirmed" &&
            selectedReservation.status === "Pending"
          ) {
            axios
              .post("/api/confirm-reservation-email", {
                customerName: selectedReservation.customerName,
                customerEmail: selectedReservation.customerEmail,
                reservationDate: new Date(
                  selectedReservation.reservationDate
                ).toLocaleDateString("fr-FR"),
                reservationTime: selectedReservation.reservationTime,
                numberOfGuests: selectedReservation.numberOfGuests,
                restaurantName: props.restaurantData?.name,
              })
              .catch((err) => {
                console.error(
                  "Erreur lors de l'envoi de l'email de confirmation :",
                  err
                );
              });
          }

          closeModal();
        })
        .catch((error) => {
          console.error(`Error updating status to ${newStatus}:`, error);
          setError(
            "Une erreur est survenue lors de la mise à jour du statut de la réservation."
          );
        })
        .finally(() => {
          setIsProcessing(false);
        });
    },
    [selectedReservation, props.restaurantData, props.setRestaurantData]
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
        }
      )
      .then((response) => {
        props.setRestaurantData(response.data.restaurant);
        closeModal();
      })
      .catch((error) => {
        console.error("Error deleting reservation:", error);
        setError(
          "Une erreur est survenue lors de la suppression de la réservation."
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
    } else if (actionType === "finish") {
      updateReservationStatus("Finished");
    } else if (actionType === "active") {
      updateReservationStatus("Active");
    } else if (actionType === "confirm") {
      updateReservationStatus("Confirmed");
    }
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
    keepFocus(calendarSearchRef);
  }

  function handleSearchChangeDay(event) {
    setSearchTerm(event.target.value);
    keepFocus(daySearchRef);
  }

  /* =========================================================
   * Rendus UI
   * =======================================================*/

  // Toolbar : 2 lignes
  // Ligne 1 : [Icone + Titre non-cliquable en vue Calendrier] —— [Paramètres | Ajouter]
  // Ligne 2 : [Prev | Mois | Next | Aujourd'hui] —— [Recherche]
  function CalendarToolbar() {
    const monthYearLabel = capitalizeFirst(
      new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(currentMonth)
    );

    return (
      <div className="flex flex-col gap-6">
        {/* Ligne 1 */}
        <div className="flex items-center flex-wrap justify-between gap-3">
          <div className="flex gap-2 items-center min-h-[40px]">
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />
            {/* En vue calendrier, le titre n'est pas cliquable et sans underline */}
            <h1 className="pl-2 text-xl tablet:text-2xl flex midTablet:items-center gap-0 flex-col midTablet:flex-row midTablet:gap-2">
              <span className="select-none">{t("titles.main")}</span>
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleParametersClick}
              className="bg-violet px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.parameters")}
            </button>
            <button
              onClick={handleAddClick}
              className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.add")}
            </button>
          </div>
        </div>

        {/* Ligne 2 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Contrôles mois */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() =>
                setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                )
              }
              className="px-3 py-2 rounded-lg border border-[#131E3690] bg-white flex items-center gap-2"
              aria-label={t("calendar.prev", "Mois précédent")}
              title={t("calendar.prev", "Mois précédent")}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="sr-only">
                {t("calendar.prev", "Mois précédent")}
              </span>
            </button>

            <div className="px-3 flex-1 py-2 text-center rounded-lg border text-nowrap border-[#131E3690] bg-white/80">
              {monthYearLabel}
            </div>

            <button
              onClick={() =>
                setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                )
              }
              className="px-3 py-2 rounded-lg border border-[#131E3690] bg-white flex items-center gap-2"
              aria-label={t("calendar.next", "Mois suivant")}
              title={t("calendar.next", "Mois suivant")}
            >
              <ChevronRight className="w-4 h-4" />
              <span className="sr-only">
                {t("calendar.next", "Mois suivant")}
              </span>
            </button>

            <button
              onClick={() => {
                setCurrentMonth(startOfMonth(new Date()));
                setSelectedDay(null);
              }}
              className="px-3 py-2 mx-auto rounded-lg border border-[#131E3690] bg-white flex items-center gap-2"
              title={t("calendar.today", "Aujourd’hui")}
            >
              <CalendarDays className="w-4 h-4" />
              <span>{t("calendar.today", "Aujourd’hui")}</span>
            </button>
          </div>

          {/* Recherche (sur la même ligne que les boutons Mois) */}
          <div className="relative w-full midTablet:w-[350px]">
            <input
              ref={calendarSearchRef}
              type="text"
              placeholder={t(
                "filters.search.placeholder",
                "Rechercher nom, email, tel, code…"
              )}
              value={searchTerm}
              onChange={handleSearchChangeCalendar}
              className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  keepFocus(calendarSearchRef);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function CalendarMonth() {
    const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    return (
      <div className="flex flex-col gap-3 mt-6">
        {/* en-têtes jours de semaine */}
        <div className="grid grid-cols-7 gap-1 midTablet:gap-2 text-center text-sm opacity-70">
          {weekDays.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        {/* grille jours */}
        <div className="grid grid-cols-7 gap-1 midTablet:gap-2">
          {monthGridDays.map((d) => {
            const isToday = toDateKey(d.date) === toDateKey(new Date());
            const isSelected =
              selectedDay && toDateKey(d.date) === toDateKey(selectedDay);
            const hasMatch = !!searchTerm.trim() && d.matchCount > 0;

            const baseInMonth = d.inMonth
              ? "bg-white/80 border border-[#131E3615]"
              : "bg-white/60 border-transparent opacity-60";

            const matchOutline = hasMatch
              ? " outline outline-1 outline-[#131E36]/40"
              : "";
            const selectedOutline = isSelected
              ? " outline outline-2 outline-[#131E36]"
              : "";

            return (
              <button
                key={d.key}
                onClick={() => {
                  setSelectedDay(new Date(d.date));
                  setActiveDayTab("All"); // "Toutes" par défaut
                }}
                className={`relative p-1 midTablet:p-2 rounded-md midTablet:rounded-xl text-left transition ${baseInMonth}${matchOutline}${selectedOutline}`}
                aria-label={`Ouvrir le ${d.date.toLocaleDateString("fr-FR")}`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`text-sm ${isToday ? "font-bold text-blue" : ""}`}
                  >
                    {d.date.getDate()}
                  </div>

                  {d.total > 0 && (
                    <span className="text-xs px-1 py-0 midTablet:px-2 midTablet:py-0.5 rounded-full bg-[#131E3612] absolute -top-1 -right-1 midTablet:flex midTablet:top-auto midTablet:right-2">
                      {d.total}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  {statusList.map((s) => {
                    const pct = d.total
                      ? Math.round((d.byStatus[s] / d.total) * 100)
                      : 0;
                    return (
                      <div
                        key={s}
                        className="h-1 w-full rounded bg-[#131E3612] overflow-hidden"
                      >
                        <div
                          className="h-1"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              s === "Late"
                                ? "#FF914D"
                                : s === "Active"
                                  ? "#22c55e"
                                  : s === "Confirmed"
                                    ? "#3b82f6"
                                    : s === "Pending"
                                      ? "#93c5fd"
                                      : "#cbd5e1",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {!!searchTerm.trim() && d.matchCount > 0 && (
                  <div className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-[#131E36] text-white">
                    {d.matchCount}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function DayHeader() {
    if (!selectedDay) return null;

    const dateStrLong = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(selectedDay);

    return (
      <div className="flex flex-col gap-6">
        {/* Ligne 1 : Icône + Titre cliquable (retour calendrier) + " / date" | Paramètres / Ajouter */}
        <div className="flex items-center flex-wrap justify-between gap-3">
          <div className="flex gap-2 items-center min-h-[40px]">
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />
            <h1 className="pl-2 text-xl tablet:text-2xl flex gap-1 items-center midTablet:gap-2">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => {
                  setSelectedDay(null);
                }}
              >
                {t("titles.main")}
              </span>
              <span className="font-normal text-sm opacity-70 mt-0.5 midTablet:mt-1">
                - {dateStrLong}
              </span>
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleParametersClick}
              className="bg-violet px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.parameters")}
            </button>
            <button
              onClick={handleAddClick}
              className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.add")}
            </button>
          </div>
        </div>

        {/* Ligne 2 : [Retour] + [Dropdown statuts] —— [Recherche] */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectedDay(null);
                setSearchTerm("");
                keepFocus(calendarSearchRef);
              }}
              className="px-3 py-2 rounded-lg border border-[#131E3690] bg-white flex items-center gap-2"
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t("calendar.back", "Retour au calendrier")}</span>
            </button>

            {/* Dropdown statuts */}
            <label className="sr-only" htmlFor="day-status-select">
              {t("list.status.filter", "Filtrer par statut")}
            </label>
            <select
              id="day-status-select"
              value={activeDayTab}
              onChange={(e) => setActiveDayTab(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#131E3690] bg-white"
            >
              {dayStatusTabs.map((s) => (
                <option key={s} value={s}>
                  {statusTranslations[s]} ({dayData.counts[s] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Recherche jour (même ligne, à droite) */}
          <div className="relative w-full midTablet:w-[350px]">
            <input
              ref={daySearchRef}
              type="text"
              placeholder={t(
                "filters.search.placeholder",
                "Rechercher nom, email, tel, code…"
              )}
              value={searchTerm}
              onChange={handleSearchChangeDay}
              className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  keepFocus(daySearchRef);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function DayList() {
    if (!selectedDay) return null;

    const list = dayData.byStatus[activeDayTab] || [];

    if (!list.length) {
      return (
        <div className="p-6 bg-white bg-opacity-70 drop-shadow-sm rounded-lg w-full mx-auto text-center">
          <p className="italic">{t("list.card.empty")}</p>
        </div>
      );
    }

    // groupe par HH:mm pour séparateurs simples (optionnel)
    const byTime = {};
    list.forEach((r) => {
      const tkey = String(r.reservationTime || "--:--").slice(0, 5);
      if (!byTime[tkey]) byTime[tkey] = [];
      byTime[tkey].push(r);
    });
    const orderedTimes = Object.keys(byTime).sort((a, b) => a.localeCompare(b));

    return (
      <div className="flex flex-col gap-6">
        {orderedTimes.map((time) => (
          <div key={time} className="flex flex-col gap-3">
            <div className="relative">
              <h3 className="relative flex gap-2 items-center text-sm font-semibold w-fit px-4 mx-auto text-center uppercase bg-lightGrey z-20">
                {time}{" "}
                <span className="text-xs opacity-60">
                  ({byTime[time].length})
                </span>
              </h3>
              <hr className="bg-darkBlue/40 absolute h-[1px] w-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
            </div>

            <ul className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-4">
              {byTime[time].map((reservation) => (
                <CardReservationComponent
                  key={reservation._id}
                  reservation={reservation}
                  openModalForAction={openModalForAction}
                  handleEditClick={handleEditClick}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  /* =========================================================
   * Rendu principal
   * =======================================================*/
  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {!selectedDay ? (
        <>
          {/* Header calendrier */}
          <CalendarToolbar />
          {/* Calendrier mois (pack) */}
          <CalendarMonth />
        </>
      ) : (
        <>
          {/* Header jour (SVG + titre cliquable -> calendrier + / date ; dropdown statuts + retour + recherche) */}
          <DayHeader />
          {/* Liste du statut actif */}
          <DayList />
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
    </section>
  );
}
