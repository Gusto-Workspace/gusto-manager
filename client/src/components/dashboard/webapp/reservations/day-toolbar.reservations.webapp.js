import {
  ChevronDown,
  ChevronLeft,
  LayoutGrid,
  Pin,
  Search,
  Users,
  X,
  Printer,
} from "lucide-react";
import { QuickSlotClosureActionButton } from "../../reservations/quick-slot-closures.reservations.component";

// I18N
import { useTranslation } from "next-i18next";

export default function DayHeaderReservationsWebapp(props) {
  const { t } = useTranslation("reservations");
  const seatsFilterLabel = props.minSeatsFilter
    ? `Couverts : ${props.minSeatsFilter}+`
    : "Couverts : tous";

  if (!props.selectedDay) return null;

  const dateStrLong = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(props.selectedDay);

  return (
    <div className="flex flex-col gap-3 midTablet:gap-6">
      <div className="bg-lightGrey">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
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
                <p className="truncate text-lg font-semibold text-darkBlue midTablet:text-xl">
                  {t("titles.main")}
                </p>
                <p className="text-sm text-darkBlue/50 truncate">
                  {dateStrLong}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={props.onOpenPrintModal}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 p-3.5 shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 [@media(hover:hover)]:hover:bg-darkBlue/5"
              aria-label="Imprimer les réservations"
              title="Imprimer les réservations"
            >
              <Printer className="size-4 text-darkBlue/70" />
            </button>

            <QuickSlotClosureActionButton
              iconOnly
              onClick={props.onOpenQuickSlotClosures}
              closedSlotCount={props.closedSlotCount}
            />

            <button
              type="button"
              onClick={props.handleOpenFloorPlanDrawer}
              className={`inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 p-3.5 shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 [@media(hover:hover)]:hover:bg-darkBlue/5 ${
                props.hideFloorPlanButtonOnDesktop ? "min-[1024px]:hidden" : ""
              }`}
              aria-label="Plan de salle"
              title="Plan de salle"
            >
              <LayoutGrid className="size-4 text-darkBlue/70" />
            </button>

            {props.floorPlanPinned ? (
              <button
                type="button"
                onClick={props.onToggleFloorPlanPinned}
                className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-blue/20 bg-blue/10 text-blue transition active:scale-[0.98] min-[1024px]:inline-flex"
                aria-label="Désépingler le plan de salle"
                title="Désépingler le plan de salle"
              >
                <Pin className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 midTablet:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_minmax(160px,190px)]">
          <div className="relative col-span-2 min-w-0 midTablet:col-span-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-darkBlue/40" />
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
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl border border-darkBlue/10 bg-white transition [@media(hover:hover)]:hover:bg-darkBlue/5"
                aria-label={t("buttons.clear", "Effacer")}
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            )}
          </div>

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
                {s === "All"
                  ? "Statut : tous"
                  : `Statut : ${props.statusTranslations[s]}`}{" "}
                ({props.dayData.counts[s] || 0})
              </option>
            ))}
          </select>

          <div className="relative flex h-11 min-w-0 items-center gap-1 rounded-2xl border border-darkBlue/10 bg-white/70 py-2 pl-2 pr-7">
            <Users className="size-4 shrink-0 text-darkBlue/40" />
            <label className="sr-only" htmlFor="webapp-day-seats-filter">
              Filtrer par nombre minimum de couverts
            </label>
            <span className="truncate text-sm text-darkBlue">
              {seatsFilterLabel}
            </span>
            <select
              id="webapp-day-seats-filter"
              value={props.minSeatsFilter}
              onChange={(event) =>
                props.setMinSeatsFilter?.(Number(event.target.value || 0))
              }
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-2xl bg-transparent opacity-0 outline-none [-webkit-appearance:none] focus:outline-none focus:ring-0"
              title="Filtrer les réservations par nombre minimum de couverts"
            >
              {(props.seatsFilterOptions || []).map((value) => (
                <option key={value} value={value}>
                  {value ? `Couverts : ${value}+` : "Couverts : tous"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-darkBlue/45" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-darkBlue/10 rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm">
          <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
            <p className="shrink-0 text-xs text-darkBlue/50">Midi</p>
            <p className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-darkBlue">
              <Users className="size-4 text-darkBlue/40" />
              {props.dayData?.serviceCovers?.lunch || 0} couverts
            </p>
          </div>

          <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
            <p className="shrink-0 text-xs text-darkBlue/50">Soir</p>
            <p className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-darkBlue">
              <Users className="size-4 text-darkBlue/40" />
              {props.dayData?.serviceCovers?.dinner || 0} couverts
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
