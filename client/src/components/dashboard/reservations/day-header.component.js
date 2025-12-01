// SVG
import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";
import { ChevronLeft } from "lucide-react";

// I18N
import { useTranslation } from "react-i18next";

export default function DayHeaderComponent(props) {
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
                props.setSelectedDay(null);
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

      {/* Ligne 2 : [Retour] + [Dropdown statuts] —— [Recherche] */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              props.setSelectedDay(null);
              props.setSearchTerm("");
              props.keepFocus(props.calendarSearchRef);
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
            value={props.activeDayTab}
            onChange={(e) => props.setActiveDayTab(e.target.value)}
            className="h-10 px-3 rounded-lg border border-[#131E3690] bg-white"
          >
            {props.dayStatusTabs.map((s) => (
              <option key={s} value={s}>
                {props.statusTranslations[s]} ({props.dayData.counts[s] || 0})
              </option>
            ))}
          </select>
        </div>

        {/* Recherche jour (même ligne, à droite) */}
        <div className="relative w-full midTablet:w-[350px]">
          <input
            ref={props.daySearchRef}
            type="text"
            placeholder={t(
              "filters.search.placeholder",
              "Rechercher nom, email, tel, code…"
            )}
            value={props.searchTerm}
            onChange={props.handleSearchChangeDay}
            className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
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
      </div>
    </div>
  );
}
