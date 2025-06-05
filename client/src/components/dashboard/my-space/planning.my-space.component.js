import { useState, useEffect } from "react";
import { useRouter } from "next/router";

// React Big Calendar
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { CalendarSvg } from "@/components/_shared/_svgs/calendar.svg";

export default function PlanningMySpaceComponent({ employeeId }) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  // 1) States pour les shifts récupérés et la localizer FR
  const [events, setEvents] = useState([]);
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { locale: frLocale }), // début de semaine = lundi
    getDay,
    locales,
  });

  // 2) Récupérer les shifts de l’employé au montage
  useEffect(() => {
    if (!employeeId) return;

    async function fetchShifts() {
      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts`
        );
        // Transformer en “events” pour React Big Calendar
        const fetchedEvents = data.shifts.map((s, idx) => ({
          id: `${employeeId}-${idx}`,
          title: s.title,
          start: new Date(s.start),
          end: new Date(s.end),
        }));
        setEvents(fetchedEvents);
      } catch (err) {
        console.error("Erreur fetch shifts :", err);
        // Message utilisateur facultatif
      }
    }

    fetchShifts();
  }, [employeeId]);

  return (
    <section className="flex flex-col gap-6 p-4">
      {/* ─── En-tête ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <CalendarSvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />
          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("documents:titles.main")}
          </h1>
        </div>
      </div>

      {/* ─── Calendrier React Big Calendar ─────────────────────────────────── */}
      <div className="h-[75vh]">
        <Calendar
          localizer={localizer} // date-fns localizer (frLocale)
          culture="fr" // culture française
          events={events}
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY, Views.MONTH]}
          step={30}
          timeslots={2}
          defaultDate={new Date()}
          style={{ height: "100%" }}
          messages={{
            today: "Aujourd’hui",
            previous: "Précédent",
            next: "Suivant",
            month: "Mois",
            week: "Semaine",
            day: "Jour",
            date: "Date",
            time: "Heure",
          }}
          formats={{
            timeGutterFormat: (date) =>
              format(date, "HH:mm", { locale: frLocale }),
            weekdayFormat: (date) =>
              format(date, "EEE dd/MM", { locale: frLocale }),
            dayRangeHeaderFormat: ({ start, end }) =>
              `${format(start, "dd MMM", { locale: frLocale })} – ${format(
                end,
                "dd MMM",
                { locale: frLocale }
              )}`,
            dayHeaderFormat: (date) =>
              format(date, "EEEE dd MMMM", { locale: frLocale }),
          }}
        />
      </div>
    </section>
  );
}
