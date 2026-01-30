import { useRouter } from "next/router";

// SVG
import { ReservationSvg } from "@/components/_shared/_svgs/reservation.svg";
import { ChevronLeft, Plus, SlidersHorizontal, Search, X } from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

export default function DayHeaderComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

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
        <div>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                router.back();
              }}
              className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
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

          {/* Filters row */}
          <div className="mt-6 flex items-center gap-2">
            {/* Select */}
            <label className="sr-only" htmlFor="day-status-select-mobile">
              {t("list.status.filter", "Filtrer par statut")}
            </label>
            <select
              id="day-status-select-mobile"
              value={props.activeDayTab}
              onChange={(e) => props.setActiveDayTab(e.target.value)}
              className="h-11 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 text-sm text-darkBlue "
            >
              {props.dayStatusTabs.map((s) => (
                <option key={s} value={s}>
                  {props.statusTranslations[s]} ({props.dayData.counts[s] || 0})
                </option>
              ))}
            </select>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
              <input
                ref={props.daySearchRef}
                type="text"
                placeholder={t(
                  "filters.search.placeholder",
                  "Rechercher nom, email, tel, code…",
                )}
                value={props.searchTerm}
                onChange={props.handleSearchChangeDay}
                className={`h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${props.searchTerm ? "pr-10" : "pr-4"} pl-8 text-base`}
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
          </div>
        </div>
      </div>
    </div>
  );
}
