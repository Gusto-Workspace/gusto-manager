import {
  ChevronDown,
  ChevronLeft,
  LayoutGrid,
  Search,
  Users,
  X,
} from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

export default function DayHeaderReservationsWebapp(props) {
  const { t } = useTranslation("reservations");
  const seatsFilterLabel = props.minSeatsFilter
    ? `${props.minSeatsFilter}+`
    : "Toutes";

  if (!props.selectedDay) return null;

  const dateStrLong = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(props.selectedDay);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-lightGrey">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                props.handleBack?.();
              }}
              className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
              aria-label={t("calendar.back", "Retour au calendrier")}
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-darkBlue truncate">
                  {t("titles.main")}
                </p>
                <p className="text-sm text-darkBlue/50 truncate">
                  {dateStrLong}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={props.handleOpenFloorPlanDrawer}
            className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 shadow-sm active:scale-[0.98] transition p-3.5"
            aria-label="Plan de salle"
            title="Plan de salle"
          >
            <LayoutGrid className="size-4 text-darkBlue/70" />
          </button>
        </div>

        {/* Filters row */}
        <div className="mt-6 flex flex-col gap-2">
          {/* Select */}
          <label className="sr-only" htmlFor="day-status-select-mobile">
            {t("list.status.filter", "Filtrer par statut")}
          </label>

          <select
            id="day-status-select-mobile"
            value={props.activeDayTab}
            onChange={(e) => props.setActiveDayTab(e.target.value)}
            className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/70 px-3 text-sm text-darkBlue outline-none focus:border-darkBlue/10 focus:outline-none focus:ring-0"
          >
            {props.dayStatusTabs.map((s) => (
              <option key={s} value={s}>
                {props.statusTranslations[s]} ({props.dayData.counts[s] || 0})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
              <input
                ref={props.daySearchRef}
                onFocus={() => props.setIsKeyboardOpen(true)}
                onBlur={() => props.setIsKeyboardOpen(false)}
                type="text"
                placeholder={t(
                  "filters.search.placeholder",
                  "Rechercher nom, email, tel, code…",
                )}
                value={props.searchTerm}
                onChange={props.handleSearchChangeDay}
                className={`h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${props.searchTerm ? "pr-10" : "pr-4"} pl-8 text-base outline-none focus:border-darkBlue/10 focus:outline-none focus:ring-0`}
              />
              {props.searchTerm && (
                <button
                  onClick={() => {
                    props.setSearchTerm("");
                    props.keepFocus(props.daySearchRef);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-8 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                  aria-label={t("buttons.clear", "Effacer")}
                >
                  <X className="size-4 text-darkBlue/60" />
                </button>
              )}
            </div>

            <div className="relative flex h-11 shrink-0 items-center gap-1 rounded-2xl border border-darkBlue/10 bg-white/70 py-2 pl-2 pr-8">
              <Users className="size-4 text-darkBlue/40" />
              <label className="sr-only" htmlFor="webapp-day-seats-filter">
                Couverts
              </label>
              <span className="text-sm text-darkBlue">{seatsFilterLabel}</span>
              <select
                id="webapp-day-seats-filter"
                value={props.minSeatsFilter}
                onChange={(event) =>
                  props.setMinSeatsFilter?.(Number(event.target.value || 0))
                }
                className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-2xl bg-transparent opacity-0 outline-none [-webkit-appearance:none] focus:outline-none focus:ring-0"
                title="Filtrer les réservations par couverts"
              >
                {(props.seatsFilterOptions || []).map((value) => (
                  <option key={value} value={value}>
                    {value ? `${value}+` : "Toutes"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-darkBlue/45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
