// I18N
import { useTranslation } from "next-i18next";

// SVG
import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";

// LUCIDE
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Plus,
  X,
  LayoutGrid,
} from "lucide-react";

export default function CalendarToolbarReservationsComponent(props) {
  const { t } = useTranslation("reservations");

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

  return (
    <div className="flex flex-col gap-2">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: icon + title (inchangé) */}
        <div className="min-w-0 flex-1 flex items-center gap-2 h-[48px] midTablet:h-auto">
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
                  onClick={() => router.push("/dashboard/reservations")}
                >
                  {t("titles.main")}
                </span>
              </h1>
              <span className="ml-2 text-xs font-semibold text-darkBlue/50">
                Calendrier
              </span>
            </div>
        </div>

        {/* Right: actions (icônes) */}
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

      <div className="flex gap-2 flex-wrap items-center justify-between">
        {/* Month controls (pills) */}
        <div className="flex-1 flex items-center gap-1">
          <button
            onClick={goPrev}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] px-2"
            aria-label={t("calendar.prev", "Mois précédent")}
            title={t("calendar.prev", "Mois précédent")}
          >
            <ChevronLeft className="size-5 text-darkBlue/70" />
          </button>

          <div className="flex-1 h-[42px] inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 text-darkBlue font-semibold text-sm">
            {monthYearLabel}
          </div>

          <button
            onClick={goNext}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] px-2"
            aria-label={t("calendar.next", "Mois suivant")}
            title={t("calendar.next", "Mois suivant")}
          >
            <ChevronRight className="size-5 text-darkBlue/70" />
          </button>

          <button
            onClick={goToday}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] px-2"
            aria-label={t("calendar.today", "Aujourd’hui")}
            title={t("calendar.today", "Aujourd’hui")}
          >
            <CalendarDays className="size-5 text-darkBlue/70" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center relative gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 w-full tablet:w-[320px] shadow-sm">
          <Search className="size-4 text-darkBlue/40" />
          <input
            ref={props.calendarSearchRef}
            onFocus={() => props.setIsKeyboardOpen(true)}
            onBlur={() => props.setIsKeyboardOpen(false)}
            type="text"
            inputMode="search"
            placeholder="Rechercher (nom, email, téléphone)…"
            value={props.searchTerm}
            onChange={props.handleSearchChangeCalendar}
            className="w-full outline-none text-sm text-darkBlue placeholder:text-darkBlue/40"
          />

          {props.searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
              aria-label={t("buttons.clear", "Effacer")}
              title={t("buttons.clear", "Effacer")}
            >
              <X className="size-4 text-darkBlue/60" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
