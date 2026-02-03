import { useState, useEffect, useRef, useMemo } from "react";

// REACT BIG CALENDAR
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, addDays, getDay } from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";


// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { CalendarSvg } from "@/components/_shared/_svgs/calendar.svg";

// ICONS
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PlanningMySpaceComponent({ employeeId, restaurantId }) {
  const { t } = useTranslation("myspace");

  const [events, setEvents] = useState([]);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveModalData, setLeaveModalData] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    type: "full",
  });

  // ✅ webapp mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)"); // adapte si besoin
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ✅ date + view contrôlés (toolbar custom)
  const [date, setDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(Views.WEEK);

  useEffect(() => {
    if (isMobile) setCurrentView(Views.DAY);
    else setCurrentView(Views.WEEK);
  }, [isMobile]);

  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [alreadyExisting, setAlreadyExisting] = useState(false);

  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (d) => startOfWeek(d, { locale: frLocale }),
    getDay,
    locales,
  });

  const calendarRef = useRef(null);

  // bloque le scroll du body quand la modale ou le tooltip sont ouverts
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle(
      "overflow-hidden",
      leaveModalOpen || !!tooltipInfo,
    );
    return () => document.body.classList.remove("overflow-hidden");
  }, [leaveModalOpen, tooltipInfo]);

  // chargement des shifts (par restaurant)
  useEffect(() => {
    if (!employeeId || !restaurantId) return;

    (async () => {
      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/shifts`,
        );

        setEvents(
          (data.shifts || []).flatMap((s, i) => {
            const startDate = new Date(s.start);
            const endDate = new Date(s.end);
            const durationMs = endDate - startDate;

            if (s.title === "Congés" && durationMs >= 1000 * 60 * 60 * 24) {
              return [
                {
                  id: `${employeeId}-leave-${i}`,
                  title: s.title,
                  start: startDate,
                  end: endDate,
                  allDay: false,
                },
              ];
            }

            return [
              {
                id: `${employeeId}-shift-${i}`,
                title: s.title,
                start: startDate,
                end: endDate,
                allDay: false,
              },
            ];
          }),
        );
      } catch (err) {
        console.error("Erreur fetch shifts :", err);
      }
    })();
  }, [employeeId, restaurantId]);

  const CustomEvent = ({ event }) => {
    const start = format(event.start, "HH:mm");
    const end = format(event.end, "HH:mm");
    const tooltip = `${event.title}${!event.allDay ? ` : ${start} – ${end}` : ""}`;
    return (
      <div className="text-xs" title={tooltip}>
        {event.title}
      </div>
    );
  };

  function openLeaveModal() {
    const today = new Date().toISOString().slice(0, 10);
    setLeaveModalData({ startDate: today, endDate: today, type: "full" });
    setLeaveModalOpen(true);
  }

  async function submitLeave() {
    if (!employeeId || !restaurantId) return;

    const { startDate, endDate, type } = leaveModalData;
    const candidate = { ...buildInterval({ startDate, endDate, type }), type };

    try {
      const { data: existing } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests`,
      );

      if (hasExactDuplicate(existing, candidate)) {
        setAlreadyExisting(true);
        return;
      }
    } catch (e) {
      console.error("Erreur lecture demandes existantes :", e);
    }

    if (new Date(candidate.end) <= new Date(candidate.start)) {
      return window.alert(
        t(
          "leaveModal.errorDates",
          "La date de fin doit être après la date de début",
        ),
      );
    }

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests`,
        { start: candidate.start, end: candidate.end, type },
      );
      window.dispatchEvent(new Event("leaveRequestAdded"));
      setLeaveModalOpen(false);
    } catch (err) {
      console.error(err);
      window.alert(t("leaveModal.errorSubmit", "Erreur lors de la demande"));
    }
  }

  function buildInterval({ startDate, endDate, type }) {
    if (startDate === endDate && type !== "full") {
      if (type === "morning") {
        return {
          start: new Date(`${startDate}T00:00:00`).toISOString(),
          end: new Date(`${startDate}T12:00:00`).toISOString(),
        };
      }
      return {
        start: new Date(`${startDate}T12:00:00`).toISOString(),
        end: new Date(`${startDate}T23:59:59`).toISOString(),
      };
    }
    return {
      start: new Date(`${startDate}T00:00:00`).toISOString(),
      end: new Date(`${endDate}T23:59:59`).toISOString(),
    };
  }

  function sameRequest(a, b) {
    const aType = a.type || "full";
    const bType = b.type || "full";
    return a.start === b.start && a.end === b.end && aType === bType;
  }

  function hasExactDuplicate(existing, candidate) {
    return (existing || []).some(
      (r) =>
        (r.status === "pending" || r.status === "approved") &&
        sameRequest(
          {
            start: new Date(r.start).toISOString(),
            end: new Date(r.end).toISOString(),
            type: r.type,
          },
          candidate,
        ),
    );
  }

  // ✅ toolbar webapp (label + prev/next + segmented)
  const rangeLabel = useMemo(() => {
    if (!date) return "";
    if (currentView === Views.DAY)
      return format(date, "EEE dd MMM yyyy", { locale: frLocale });

    if (currentView === Views.MONTH)
      return format(date, "MMMM yyyy", { locale: frLocale });

    const start = startOfWeek(date, { locale: frLocale, weekStartsOn: 1 });
    const end = addDays(start, 6);
    const left = format(start, "dd MMM", { locale: frLocale });
    const right = format(end, "dd MMM yyyy", { locale: frLocale });
    return `${left} – ${right}`;
  }, [date, currentView]);

  const goToday = () => setDate(new Date());

  const goPrev = () => {
    if (currentView === Views.MONTH)
      setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (currentView === Views.DAY)
      setDate((d) => new Date(d.getTime() - 24 * 60 * 60 * 1000));
    else setDate((d) => new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000));
  };

  const goNext = () => {
    if (currentView === Views.MONTH)
      setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (currentView === Views.DAY)
      setDate((d) => new Date(d.getTime() + 24 * 60 * 60 * 1000));
    else setDate((d) => new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000));
  };

  // hauteur webapp
  const calendarHeight = isMobile ? "calc(100vh - 160px)" : "75vh";
  // ✅ largeur mini (week/month) + plus large sur mobile pour éviter la compression
  const minTableWidth = useMemo(() => {
    if (currentView === Views.DAY) return "auto";

    // week/month : 7 colonnes
    if (isMobile) {
      // un peu plus large pour que ça reste lisible en scroll horizontal
      return `${7 * 120}px`; // ajuste 110/130 si tu veux
    }

    return `${7 * 100}px`;
  }, [currentView, isMobile]);

  return (
    <section className="flex flex-col gap-4 min-w-0" ref={calendarRef}>
      {/* Header */}
      <div className="flex gap-3 flex-wrap justify-between items-center">
        <div className="flex gap-2 items-center">
          <CalendarSvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />
          <h1 className="text-lg sm:text-xl tablet:text-2xl">
            {t("titles.main")}
          </h1>
        </div>

        <button
          type="button"
          onClick={openLeaveModal}
          className="
            rounded-2xl bg-violet text-white
            px-4 py-3 text-sm font-semibold
            hover:opacity-90 active:scale-[0.98] transition
          "
        >
          {t("buttons.ask")}
        </button>
      </div>

      {/* ✅ Toolbar webapp (mobile + desktop) */}
      <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
            aria-label={t("calendar.prev", "Précédent")}
          >
            <ChevronLeft className="size-5 text-darkBlue/70" />
          </button>

          <button
            type="button"
            onClick={goToday}
            className="h-11 flex-1 min-w-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 px-3 bg-white/70 hover:bg-darkBlue/5"
            aria-label={t("calendar.today", "Aujourd’hui")}
            title={t("calendar.today", "Aujourd’hui")}
          >
            <span className="truncate text-sm font-semibold">{rangeLabel}</span>
          </button>

          <button
            type="button"
            onClick={goNext}
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
            aria-label={t("calendar.next", "Suivant")}
          >
            <ChevronRight className="size-5 text-darkBlue/70" />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentView(Views.WEEK)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              currentView === Views.WEEK
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.week", "Semaine")}
          </button>
          <button
            type="button"
            onClick={() => setCurrentView(Views.DAY)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              currentView === Views.DAY
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.day", "Jour")}
          </button>
          <button
            type="button"
            onClick={() => setCurrentView(Views.MONTH)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              currentView === Views.MONTH
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.month", "Mois")}
          </button>
        </div>
      </div>

      {/* Modale demande de congé */}
      {leaveModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setLeaveModalOpen(false);
              setAlreadyExisting(false);
            }}
          />

          <div className="relative bg-white/95 w-full max-w-[420px] rounded-2xl border border-darkBlue/10 shadow-[0_22px_55px_rgba(19,30,54,0.20)] p-6 z-10">
            <h2 className="text-lg tablet:text-xl font-semibold mb-4 text-center text-darkBlue">
              {t("leaveModal.title", "Demande de congé")}
            </h2>

            <div className="space-y-4 mb-4">
              <label className="block text-sm text-darkBlue">
                {t("leaveModal.startDate", "Date de début")} :
                <input
                  type="date"
                  className="mt-1 w-full h-11 px-3 rounded-xl border border-darkBlue/20 bg-white/95"
                  value={leaveModalData.startDate}
                  onChange={(e) =>
                    setLeaveModalData((d) => ({
                      ...d,
                      startDate: e.target.value,
                      endDate:
                        e.target.value > d.endDate ? e.target.value : d.endDate,
                      type: e.target.value === d.endDate ? d.type : "full",
                    }))
                  }
                />
              </label>

              <label className="block text-sm text-darkBlue">
                {t("leaveModal.endDate", "Date de fin")} :
                <input
                  type="date"
                  className="mt-1 w-full h-11 px-3 rounded-xl border border-darkBlue/20 bg-white/95"
                  value={leaveModalData.endDate}
                  min={leaveModalData.startDate}
                  onChange={(e) =>
                    setLeaveModalData((d) => ({
                      ...d,
                      endDate: e.target.value,
                      type: d.startDate === e.target.value ? d.type : "full",
                    }))
                  }
                />
              </label>

              {leaveModalData.startDate === leaveModalData.endDate && (
                <div className="flex flex-wrap gap-4">
                  {["full", "morning", "afternoon"].map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 text-sm text-darkBlue"
                    >
                      <input
                        type="radio"
                        name="leaveType"
                        value={opt}
                        checked={leaveModalData.type === opt}
                        onChange={() =>
                          setLeaveModalData((d) => ({ ...d, type: opt }))
                        }
                      />
                      {
                        {
                          full: t("leaveModal.full", "Journée"),
                          morning: t("leaveModal.morning", "Matin"),
                          afternoon: t("leaveModal.afternoon", "Après-midi"),
                        }[opt]
                      }
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={submitLeave}
                className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue/90 transition"
              >
                {t("buttons.submit", "Envoyer")}
              </button>
              <button
                onClick={() => {
                  setLeaveModalOpen(false);
                  setAlreadyExisting(false);
                }}
                className="rounded-xl bg-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-red/90 transition"
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>

            {alreadyExisting && (
              <p className="text-xs text-red italic mt-3 text-center">
                Une demande est déjà existante pour cette date
              </p>
            )}
          </div>
        </div>
      )}

      {/* Calendrier (webapp) */}
      <div className="rounded-3xl border border-darkBlue/10 bg-white/70 overflow-hidden">
        <div className="-mx-3 px-3 overflow-x-auto">
                   <div
            style={{ height: calendarHeight, minHeight: isMobile ? 420 : 520 }}
          >

            <Calendar
              components={{ event: CustomEvent, toolbar: () => null }}
              localizer={localizer}
              culture="fr"
              events={events}
              date={date}
              onNavigate={(d) => setDate(d)}
              defaultView={Views.MONTH}
              view={currentView}
              onView={setCurrentView}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              step={30}
              timeslots={2}
              defaultDate={new Date()}
              showMultiDayTimes
              toolbar={false}
              style={{ height: "100%", width: "100%" }}
              onSelectEvent={(event, e) => {
                const start = format(event.start, "HH:mm");
                const end = format(event.end, "HH:mm");
                const { clientX: x, clientY: y } = e;
                setTooltipInfo({
                  event,
                  x,
                  y,
                  text: `${event.title} : ${start} – ${end}`,
                });
              }}
              messages={{
                today: "Aujourd’hui",
                previous: "<",
                next: ">",
                month: "Mois",
                week: "Semaine",
                day: "Jour",
              }}
              formats={{
                timeGutterFormat: (d) =>
                  format(d, "HH:mm", { locale: frLocale }),
                weekdayFormat: (d) =>
                  format(d, "EEE dd/MM", { locale: frLocale }),
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${format(start, "dd MMM", { locale: frLocale })} – ${format(
                    end,
                    "dd MMM yyyy",
                    {
                      locale: frLocale,
                    },
                  )}`,
                dayHeaderFormat: (d) =>
                  format(d, "EEEE dd MMMM yyyy", { locale: frLocale }),
              }}
              eventPropGetter={(event) => {
                const isLeave = event.title === "Congés";
                return {
                  style: {
                    backgroundColor: isLeave ? "#FFD19C" : "#5779A3",
                    border: `1px solid ${isLeave ? "#FDBA74" : "#335982"}`,
                    borderRadius: 12,
                    outline: "none",
                    fontSize: 12,
                    padding: "2px 6px",
                  },
                };
              }}
            />
          </div>
        </div>
      </div>

      {/* Tooltip (modal) */}
      {tooltipInfo && (
        <div className="fixed inset-0 flex items-center justify-center z-[110] px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setTooltipInfo(null)}
          />
          <div className="bg-white/95 p-6 rounded-2xl border border-darkBlue/10 shadow-[0_22px_55px_rgba(19,30,54,0.20)] z-10 w-full max-w-sm">
            <p className="text-center text-sm text-darkBlue">
              {tooltipInfo.text}
            </p>

            <div className="flex justify-center mt-6">
              <button
                className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue/90 transition"
                onClick={() => setTooltipInfo(null)}
              >
                {t("buttons.close", "Fermer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
