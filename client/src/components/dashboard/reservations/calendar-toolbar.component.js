// I18N
import { useTranslation } from "next-i18next";

// SVG
import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

 export default function CalendarToolbarComponent(props) {
    const { t } = useTranslation("reservations");
    const monthYearLabel = props.capitalizeFirst(
      new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(props.currentMonth)
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
                props.setCurrentMonth(
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

          {/* Recherche (sur la même ligne que les boutons Mois) */}
          <div className="relative w-full midTablet:w-[350px]">
            <input
              ref={props.calendarSearchRef}
              type="text"
              placeholder={t(
                "filters.search.placeholder",
                "Rechercher nom, email, tel, code…"
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
    );
  }