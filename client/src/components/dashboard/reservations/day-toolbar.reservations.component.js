// SVG
import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";
import {
  ChevronLeft,
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

  const dateStrLong = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(props.selectedDay);

  return (
    <div className="flex flex-col gap-6">
      {/* =========================
          ✅ MOBILE WEBAPP HEADER
          (uniquement < midTablet)
          ========================= */}
      <div className="midTablet:hidden bg-lightGrey">
        {/* Sticky container */}
        <div>
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: back */}
            <button
              onClick={() => {
                props.setSelectedDay(null);
                props.setSearchTerm("");
                props.keepFocus(props.calendarSearchRef);
              }}
              className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
              aria-label={t("calendar.back", "Retour au calendrier")}
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>

            {/* Center: title */}
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <ReservationSvg
                width={26}
                height={26}
                className="min-h-[26px] min-w-[26px]"
                fillColor="#131E3690"
              />
              <div className="min-w-0">
                <p className="text-xl font-semibold text-darkBlue truncate">
                  {t("titles.main")}
                </p>
                <p className="text-sm text-darkBlue/50 truncate">
                  {dateStrLong}
                </p>
              </div>
            </div>

            {/* Right: actions (compact) */}
            <div className="shrink-0 flex items-center gap-1">
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
            </div>
          </div>

          {/* Filters row */}
          <div className="mt-3 flex items-center gap-1">
            {/* Search */}
            <div className="flex items-center relative gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 w-full tablet:w-[340px] shadow-sm">
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

            {/* Select */}
            <label className="sr-only" htmlFor="day-status-select-mobile">
              {t("list.status.filter", "Filtrer par statut")}
            </label>
            <select
              id="day-status-select-mobile"
              value={props.activeDayTab}
              onChange={(e) => props.setActiveDayTab(e.target.value)}
              className="h-10 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 text-sm text-darkBlue "
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

      {/* =========================
          ✅ midTablet+ (TON HEADER INCHANGÉ)
          ========================= */}
      <div className="hidden midTablet:flex flex-col gap-2">
        {/* Ligne 1 */}
        <div className="flex items-center flex-wrap justify-between gap-3">
          <div className="flex gap-2 items-center min-h-[40px]">
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />

            <div className="flex flex-col">
              <h1 className="pl-2 text-xl flex-wrap tablet:text-2xl flex items-center gap-2">
                <span
                  className="cursor-pointer hover:underline"
                  onClick={() => {
                    props.setSelectedDay(null);
                  }}
                >
                  {t("titles.main")}
                </span>
              </h1>
              <span className="pl-2 font-normal text-xs opacity-70">
                {dateStrLong}
              </span>
            </div>
          </div>

          <div className="flex gap-1">
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

            <button
              onClick={() => {
                props.setSelectedDay(null);
                props.setSearchTerm("");
                props.keepFocus(props.calendarSearchRef);
              }}
              className="ml-6 inline-flex items-center gap-2 rounded-lg border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 py-2 text-sm font-semibold text-darkBlue"
              aria-label={t("calendar.back", "Retour au calendrier")}
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="size-4 text-darkBlue/60" />
              Retour
            </button>
          </div>
        </div>

        {/* Ligne 2 */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center relative gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 w-full tablet:w-[320px] shadow-sm">
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
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
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
              className="bg-white outline-none text-sm text-darkBlue"
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
    </div>
  );
}
