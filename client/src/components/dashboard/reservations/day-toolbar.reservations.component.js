import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import {
  Plus,
  SlidersHorizontal,
  Search,
  LayoutGrid,
  X,
  Filter,
} from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

export default function DayToolbarReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  if (!props.selectedDay) return null;

  const handleBackToCalendar = () => {
    props.setSelectedDay(null);
    props.setSearchTerm("");
    props.keepFocus(props.calendarSearchRef);
  };

  const dateStrLong = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(props.selectedDay);

  return (
    <div className="flex flex-col gap-2">
      <CatalogHeaderDashboardComponent
        title={t("titles.main")}
        onBack={handleBackToCalendar}
        backLabel={t("calendar.back", "Retour au calendrier")}
        subtitle={dateStrLong}
        actions={
          <>
            <button
              onClick={props.handleParametersClick}
              className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] w-[40px]"
              aria-label={t("buttons.parameters")}
              title={t("buttons.parameters")}
            >
              <SlidersHorizontal className="size-4 text-darkBlue/70" />
            </button>

            <button
              onClick={props.handleOpenFloorPlanDrawer}
              className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] w-[40px]"
              aria-label="Plan de salle"
              title="Plan de salle"
            >
              <LayoutGrid className="size-4 text-darkBlue/70" />
            </button>

            <button
              onClick={props.handleAddClick}
              className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition h-[40px] w-[40px]"
              aria-label={t("buttons.add")}
              title={t("buttons.add")}
            >
              <Plus className="size-4" />
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-2 midTablet:flex-row midTablet:items-center midTablet:justify-end">
        <div className="flex items-center relative gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 w-full midTablet:w-[320px] shadow-sm">
          <Search className="size-4 text-darkBlue/40" />

          <input
            ref={props.daySearchRef}
            onFocus={() => props.setIsKeyboardOpen(true)}
            onBlur={() => props.setIsKeyboardOpen(false)}
            type="text"
            placeholder="Rechercher (nom, email, téléphone)…"
            value={props.searchTerm}
            onChange={props.handleSearchChangeDay}
            className="w-full outline-none text-sm text-darkBlue placeholder:text-darkBlue/40"
          />
          {props.searchTerm && (
            <button
              onClick={() => {
                props.setSearchTerm("");
                props.keepFocus(props.daySearchRef);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
              aria-label={t("buttons.clear", "Effacer")}
            >
              <X className="size-4 text-darkBlue/60" />
            </button>
          )}
        </div>

        <label className="sr-only" htmlFor="day-status-select">
          {t("list.status.filter", "Filtrer par statut")}
        </label>
        <div className="flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 shadow-sm">
          <Filter className="size-4 text-darkBlue/40" />

          <select
            id="day-status-select"
            value={props.activeDayTab}
            onChange={(e) => props.setActiveDayTab(e.target.value)}
            className="bg-white outline-none text-sm text-darkBlue w-full"
          >
            {props.dayStatusTabs.map((s) => (
              <option key={s} value={s}>
                {props.statusTranslations[s]} ({props.dayData.counts[s] || 0})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
