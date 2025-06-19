import { useState, useEffect, useRef } from "react";

// REACT BIG CALENDAR
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  differenceInCalendarDays,
  addDays,
} from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { CalendarSvg } from "@/components/_shared/_svgs/calendar.svg";

export default function PlanningMySpaceComponent({ employeeId }) {
  const { t } = useTranslation("myspace");
  const [events, setEvents] = useState([]);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveModalData, setLeaveModalData] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    type: "full",
  });
  const [currentView, setCurrentView] = useState(Views.WEEK);
  const [tooltipInfo, setTooltipInfo] = useState(null);

  // date-fns FR
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (d) => startOfWeek(d, { locale: frLocale }),
    getDay,
    locales,
  });

  const calendarRef = useRef(null);

  // bloque le scroll du body quand la modale est ouverte
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", leaveModalOpen || tooltipInfo);
    return () => document.body.classList.remove("overflow-hidden");
  }, [leaveModalOpen, tooltipInfo]);

  // chargement des shifts
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts`
        );
        setEvents(
          data.shifts.flatMap((s, i) => {
            const startDate = new Date(s.start);
            const endDate = new Date(s.end);
            const durationMs = endDate - startDate;
            // Congés : full-day events spanning entire period
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
            // Shifts normaux
            return [
              {
                id: `${employeeId}-shift-${i}`,
                title: s.title,
                start: startDate,
                end: endDate,
                allDay: false,
              },
            ];
          })
        );
      } catch (err) {
        console.error("Erreur fetch shifts :", err);
      }
    })();
  }, [employeeId]);

  // CustomEvent pour masquer l’heure des events compressés
  const CustomEvent = ({ event }) => {
    const start = format(event.start, "HH:mm");
    const end = format(event.end, "HH:mm");
    const tooltip = `${event.title}${!event.allDay ? ` : ${start} – ${end}` : ""}`;
    return (
      <div className="px-2" title={tooltip}>
        {event.title}
      </div>
    );
  };

  // modale
  function openLeaveModal() {
    const today = new Date().toISOString().slice(0, 10);
    setLeaveModalData({ startDate: today, endDate: today, type: "full" });
    setLeaveModalOpen(true);
  }

  async function submitLeave() {
    const { startDate, endDate, type } = leaveModalData;
    let start, end;

    if (startDate === endDate && type !== "full") {
      if (type === "morning") {
        start = new Date(`${startDate}T00:00:00`);
        end = new Date(`${startDate}T12:00:00`);
      } else {
        start = new Date(`${startDate}T12:00:00`);
        end = new Date(`${startDate}T23:59:59`);
      }
    } else {
      start = new Date(`${startDate}T00:00:00`);
      end = new Date(`${endDate}T23:59:59`);
    }

    if (end <= start) {
      return window.alert(
        t(
          "leaveModal.errorDates",
          "La date de fin doit être après la date de début"
        )
      );
    }

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/leave-requests`,
        { start: start.toISOString(), end: end.toISOString(), type }
      );
      window.dispatchEvent(new Event("leaveRequestAdded"));
      setLeaveModalOpen(false);
    } catch (err) {
      console.error(err);
      window.alert(t("leaveModal.errorSubmit", "Erreur lors de la demande"));
    }
  }

  // largeur minimale pour scroll (7 jours * 100px)
  const minTableWidth = currentView === Views.DAY ? "auto" : `${7 * 100}px`;

  return (
    <section className="flex flex-col gap-6 min-w-0" ref={calendarRef}>
      {/* En-tête */}
      <div className="flex gap-4 flex-wrap justify-between items-center">
        <div className="flex gap-2 items-center">
          <CalendarSvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />
          <h1 className="text-lg sm:text-xl md:text-2xl">{t("titles.main")}</h1>
        </div>
        <button
          onClick={openLeaveModal}
          className="bg-violet px-4 py-2 rounded-lg text-white hover:opacity-80 transition text-sm sm:text-base"
        >
          {t("buttons.ask")}
        </button>
      </div>

      {/* Modale */}
      {leaveModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setLeaveModalOpen(false)}
          />
          <div className="bg-white p-6 rounded-lg shadow-lg z-10 w-[400px]">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {t("leaveModal.title", "Demande de congé")}
            </h2>
            <div className="space-y-4 mb-6">
              <label className="block">
                {t("leaveModal.startDate", "Date de début")} :
                <input
                  type="date"
                  className="w-full p-2 border rounded"
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
              <label className="block">
                {t("leaveModal.endDate", "Date de fin")} :
                <input
                  type="date"
                  className="w-full p-2 border rounded"
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
                <div className="flex gap-4">
                  {["full", "morning", "afternoon"].map((opt) => (
                    <label key={opt} className="flex items-center gap-1">
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
            <div className="flex justify-center gap-4">
              <button
                onClick={submitLeave}
                className="px-4 py-2 bg-blue text-white rounded-lg"
              >
                {t("buttons.submit", "Envoyer")}
              </button>
              <button
                onClick={() => setLeaveModalOpen(false)}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendrier responsive */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: minTableWidth }} className="h-[75vh]">
          <Calendar
            components={{ event: CustomEvent }}
            localizer={localizer}
            culture="fr"
            events={events}
            view={currentView}
            onView={setCurrentView}
            views={[Views.MONTH, Views.WEEK, Views.DAY]}
            step={60}
            timeslots={1}
            defaultDate={new Date()}
            showMultiDayTimes
            style={{ height: "100%", width: "100%" }}
            toolbar
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
              timeGutterFormat: (date) =>
                format(date, "HH:mm", { locale: frLocale }),
              weekdayFormat: (date) =>
                format(date, "EEE dd/MM", { locale: frLocale }),
              dayRangeHeaderFormat: ({ start, end }) =>
                `${format(start, "dd MMM", {
                  locale: frLocale,
                })} – ${format(end, "dd MMM yyyy", {
                  locale: frLocale,
                })}`,
              dayHeaderFormat: (date) =>
                format(date, "EEEE dd MMMM yyyy", { locale: frLocale }),
            }}
            eventPropGetter={(event) => {
              const isLeave = event.title === "Congés";
              return {
                style: {
                  backgroundColor: isLeave ? "#FFD19C" : "#5779A3",
                  border: `2px solid ${isLeave ? "#FDBA74" : "#335982"}`,
                  outline: "none",
                },
              };
            }}
          />
        </div>
      </div>

      {tooltipInfo && (
        <div className="fixed inset-0 flex items-center justify-center z-[110]">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setTooltipInfo(null)}
          />
          <div className="bg-white p-6 rounded-lg shadow-lg z-10 w-full max-w-sm mx-4">
            

            <p className="text-center">{tooltipInfo.text}</p>

            <div className="flex justify-center mt-6">
              <button
                className="px-4 py-2 bg-blue text-white rounded-lg"
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
