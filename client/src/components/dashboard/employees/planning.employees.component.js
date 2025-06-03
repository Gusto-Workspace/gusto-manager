import { useState, useMemo, useContext } from "react";
import { useRouter } from "next/router";

// React Big Calendar
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg } from "../../_shared/_svgs/_index";

// Component pour afficher une carte d’employé
import CardEmployeesComponent from "./card.employees.component";

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // 1. Liste des employés (depuis le context)
  const employees =
    restaurantContext.restaurantData?.employees.map((e) => ({
      _id: e._id,
      firstname: e.firstname,
      lastname: e.lastname,
      name: `${e.firstname} ${e.lastname}`,
      post: e.post,
      profilePicture: e.profilePicture,
    })) || [];

  // 2. Exemples de shifts statiques (à remplacer plus tard par un appel API)
  const rawEvents = [
    {
      id: 1,
      title: "Alice : Shift matinal",
      start: new Date(2025, 5, 3, 8, 0),
      end: new Date(2025, 5, 3, 12, 0),
      resourceId: employees[0]?._id,
    },
    {
      id: 2,
      title: "Bertrand : Service midi",
      start: new Date(2025, 5, 3, 11, 0),
      end: new Date(2025, 5, 3, 15, 0),
      resourceId: employees[1]?._id,
    },
    {
      id: 3,
      title: "Caroline : Soirée",
      start: new Date(2025, 5, 3, 11, 0),
      end: new Date(2025, 5, 3, 21, 0),
      resourceId: employees[2]?._id,
    },
  ];

  // 3. Configuration date-fns pour React Big Calendar (locale FR uniquement) :contentReference[oaicite:3]{index=3}
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { locale: frLocale }), // début de semaine = lundi :contentReference[oaicite:4]{index=4}
    getDay,
    locales, // injection de frLocale :contentReference[oaicite:5]{index=5}
  });

  // 4. États pour la liste d’événements et l’employé sélectionné
  const [events, setEvents] = useState(rawEvents);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // 5. Palette de couleurs pour chaque employé
  const colorPalette = [
    "#4ead7a",
    "#634FD2",
    "#FF7664",
    "#F5A623",
    "#50E3C2",
    "#B8E986",
    "#F8E71C",
    "#BD10E0",
  ];
  const employeeColorMap = useMemo(() => {
    const map = {};
    employees.forEach((e, idx) => {
      map[e._id] = colorPalette[idx % colorPalette.length];
    });
    return map;
  }, [employees]);

  // 6. Filtrage des événements selon l’employé sélectionné (ou tous sinon)
  const visibleEvents = useMemo(
    () =>
      selectedEmployeeId
        ? events.filter((ev) => ev.resourceId === selectedEmployeeId)
        : events,
    [events, selectedEmployeeId]
  );

  // 7. Création d’un shift (clic-glisse sur le calendrier) :contentReference[oaicite:6]{index=6}
  function handleSelectSlot({ start, end, resourceId }) {
    // Si aucun employé n’est sélectionné, resourceId est undefined → on empêche la création
    const ownerId = selectedEmployeeId || resourceId;
    if (!ownerId) return;

    const promptText = t(
      "planning:prompts.newShift",
      "Nom du shift (ex : “Matin”) ?"
    );
    const title = window.prompt(promptText);
    if (!title) return;

    const employeeName = employees.find((e) => e._id === ownerId)?.name;
    const newEvent = {
      id: Math.random(),
      title: `${employeeName} : ${title}`,
      start,
      end,
      resourceId: ownerId,
    };
    setEvents((prev) => [...prev, newEvent]);
  }

  // 8. Suppression d’un shift (clic sur l’événement) :contentReference[oaicite:7]{index=7}
  function handleSelectEvent(event) {
    const confirmText = t(
      "planning:prompts.deleteShift",
      "Supprimer ce shift (« {{title}} » du {{start}} au {{end}}) ?",
      {
        title: event.title,
        start: event.start.toLocaleString("fr-FR"),
        end: event.end.toLocaleString("fr-FR"),
      }
    );
    if (window.confirm(confirmText)) {
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    }
  }

  return (
    <section className="flex flex-col gap-6 p-4">
      <hr className="opacity-20" />

      {/* ─── En-tête ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees")}
              >
                {t("employees:titles.main", "Gestion des employés")}
              </span>
              <span>/</span>
              <span>{t("planning:titles.planning", "Planning")}</span>
            </h1>
          </div>
        </div>
      </div>

      {/* ─── Liste d’employés en « cartes » ─────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <ul className="flex gap-4 py-4">
          {employees.map((emp) => (
            <li key={emp._id} className="min-w-[200px]">
              <div
                onClick={() =>
                  setSelectedEmployeeId((prev) =>
                    prev === emp._id ? null : emp._id
                  )
                }
                className={`cursor-pointer ${
                  selectedEmployeeId === emp._id
                    ? "border-2 border-blue"
                    : "border-2 border-lightGrey"
                } rounded-lg transition-colors p-2`}
              >
                <CardEmployeesComponent employee={emp} planning={true} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-[75vh]">
        <Calendar
          localizer={localizer}
          culture="fr"
          events={visibleEvents}
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY, Views.MONTH]}
          step={30}
          timeslots={2}
          defaultDate={new Date()}
          resources={
            selectedEmployeeId
              ? [
                  {
                    resourceId: selectedEmployeeId,
                    resourceTitle: employees.find(
                      (e) => e._id === selectedEmployeeId
                    )?.name,
                  },
                ]
              : undefined
          }
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          style={{ height: "100%" }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={(event) => {
            if (selectedEmployeeId) {
              return {
                style: { backgroundColor: "#4ead7a", borderRadius: "4px" },
              };
            }
            const color = employeeColorMap[event.resourceId] || "#4ead7a";
            return { style: { backgroundColor: color, borderRadius: "4px" } };
          }}
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

            dayHeaderFormat: (date, culture, localizer) =>
              format(date, "EEEE dd MMMM", { locale: frLocale }),
          }}
        />
      </div>
    </section>
  );
}

