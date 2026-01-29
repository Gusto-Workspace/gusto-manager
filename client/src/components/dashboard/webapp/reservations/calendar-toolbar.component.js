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
} from "lucide-react";

export default function CalendarToolbarComponent(props) {
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
    <div className="flex flex-col gap-6">
      {/* =========================
          ✅ MOBILE WEBAPP (uniquement < midTablet)
          - SVG + titre inchangés
          - boutons + search modernisés
          ========================= */}
      <div className="midTablet:hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: icon + title (inchangé) */}
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />
            <h1 className="pl-2 text-xl flex items-center gap-2">
              <span className="select-none">{t("titles.main")}</span>
            </h1>
          </div>

          {/* Right: actions (icônes) */}
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

        {/* Month controls (pills) */}
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

        {/* Search (webapp) */}
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

      {/* =========================
          ✅ midTablet+ (TON TOOLBAR INCHANGÉ)
          ========================= */}
      <div className="hidden midTablet:flex flex-col gap-6">
        {/* Ligne 1 */}
        <div className="flex items-center flex-wrap justify-between gap-3">
          <div className="flex gap-2 items-center min-h-[40px]">
            <ReservationSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />
            <h1 className="pl-2 text-xl tablet:text-2xl flex midTablet:items-center gap-0 flex-col midTablet:flex-row midTablet:gap-2">
              <span className="select-none">{t("titles.main")}</span>
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={props.handleParametersClick}
              className="bg-violet px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.parameters")}
            </button>
            <button
              onClick={props.handleAddClick}
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
                props.setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
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
                props.setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
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
                props.setCurrentMonth(props.startOfMonth(new Date()));
                props.setSelectedDay(null);
              }}
              className="px-3 py-2 mx-auto rounded-lg border border-[#131E3690] bg-white flex items-center gap-2"
              title={t("calendar.today", "Aujourd’hui")}
            >
              <CalendarDays className="w-4 h-4" />
              <span>{t("calendar.today", "Aujourd’hui")}</span>
            </button>
          </div>

          {/* Recherche */}
          <div className="relative w-full midTablet:w-[350px]">
            <input
              ref={props.calendarSearchRef}
              type="text"
              placeholder={t(
                "filters.search.placeholder",
                "Rechercher nom, email, tel, code…",
              )}
              value={props.searchTerm}
              onChange={props.handleSearchChangeCalendar}
              className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
            />
            {props.searchTerm && (
              <button
                onClick={() => {
                  props.setSearchTerm("");
                  props.calendarSearchRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
