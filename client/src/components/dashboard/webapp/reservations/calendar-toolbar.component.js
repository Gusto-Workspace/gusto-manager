import { useContext, useMemo, useState } from "react";
import { useTranslation } from "next-i18next";
import { GlobalContext } from "@/contexts/global.context";

import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";

import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";

import BottomSheetChangeRestaurantComponent from "../_shared/bottom-sheet-change-restaurant.webapp.component";

export default function CalendarToolbarComponent(props) {
  const { t } = useTranslation("reservations");
  const { restaurantContext } = useContext(GlobalContext);

  const [sheetOpen, setSheetOpen] = useState(false);

  const monthYearLabel = props.capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(props.currentMonth),
  );

  const goPrev = () =>
    props.setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
    );

  const goNext = () =>
    props.setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
    );

  const goToday = () => {
    props.setCurrentMonth(props.startOfMonth(new Date()));
    props.setSelectedDay(null);
  };

  const clearSearch = () => {
    props.setSearchTerm("");
    props.calendarSearchRef?.current?.focus?.();
  };

  // ✅ Restos éligibles réservations (sert juste à savoir si on affiche le chevron / bottomsheet)
  const reservationsRestaurants = useMemo(() => {
    const list = restaurantContext?.restaurantsList || [];
    return list.filter((r) => r?.options?.reservations === true);
  }, [restaurantContext?.restaurantsList]);

  const canSwitchRestaurant = reservationsRestaurants.length > 1;

  const openSheet = () => {
    if (!canSwitchRestaurant) return;
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const currentName =
    restaurantContext?.restaurantData?.name || props.restaurantData?.name || "";

  return (
    <div className="relative">
      <BottomSheetChangeRestaurantComponent
        open={sheetOpen}
        onClose={closeSheet}
        restaurantContext={restaurantContext}
        currentName={currentName}
        t={t}
        optionKey="reservations"
        moduleLabel={t("titles.main", "Réservations")}
      />

      {/* ================= Toolbar ================= */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <div>
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px] shrink-0"
              fillColor="#131E3690"
            />
          </div>

          <button
            type="button"
            onClick={openSheet}
            className={`min-w-0 inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 transition ${
              canSwitchRestaurant
                ? "cursor-pointer hover:bg-darkBlue/5"
                : "cursor-default opacity-90"
            }`}
            disabled={!canSwitchRestaurant}
            aria-label={
              canSwitchRestaurant ? "Changer de restaurant" : "Restaurant"
            }
            title={canSwitchRestaurant ? "Changer de restaurant" : undefined}
          >
            <span className="truncate text-lg font-semibold text-darkBlue">
              {currentName}
            </span>
            {canSwitchRestaurant ? (
              <ChevronDown className="size-4 text-darkBlue/50 shrink-0" />
            ) : null}
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={props.handleParametersClick}
            className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-4"
            aria-label={t("buttons.parameters")}
            title={t("buttons.parameters")}
          >
            <SlidersHorizontal className="size-4 text-darkBlue/70" />
          </button>

          <button
            onClick={props.handleAddClick}
            className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition p-4"
            aria-label={t("buttons.add")}
            title={t("buttons.add")}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Month controls */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={goPrev}
          className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
          aria-label={t("calendar.prev", "Mois précédent")}
          title={t("calendar.prev", "Mois précédent")}
        >
          <ChevronLeft className="size-5 text-darkBlue/70" />
        </button>

        <button
          onClick={goToday}
          className="flex-1 h-12 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 text-darkBlue font-semibold text-sm"
        >
          {monthYearLabel}
        </button>

        <button
          onClick={goNext}
          className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
          aria-label={t("calendar.next", "Mois suivant")}
          title={t("calendar.next", "Mois suivant")}
        >
          <ChevronRight className="size-5 text-darkBlue/70" />
        </button>
      </div>

      {/* Search (calendar) */}
      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
        <input
          ref={props.calendarSearchRef}
          type="text"
          inputMode="search"
          placeholder={t(
            "filters.search.placeholder",
            "Rechercher nom, email, tel, code…",
          )}
          value={props.searchTerm}
          onChange={props.handleSearchChangeCalendar}
          className={`h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${
            props.searchTerm ? "pr-12" : "pr-4"
          } pl-9 text-base`}
        />
        {props.searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-9 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
            aria-label={t("buttons.clear", "Effacer")}
            title={t("buttons.clear", "Effacer")}
          >
            <X className="size-4 text-darkBlue/60" />
          </button>
        )}
      </div>
    </div>
  );
}
