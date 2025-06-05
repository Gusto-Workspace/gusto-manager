import { useState, useMemo, useContext, useEffect } from "react";
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

// COMPONENTS
import CardEmployeesComponent from "./card.employees.component";

// AXIOS
import axios from "axios";

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [events, setEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { locale: frLocale }), // début de semaine = lundi
    getDay,
    locales,
  });

  const allEmployees = useMemo(() => {
    return (
      restaurantContext.restaurantData?.employees.map((e) => ({
        _id: e._id,
        firstname: e.firstname,
        lastname: e.lastname,
        name: `${e.firstname} ${e.lastname}`,
        post: e.post,
        profilePicture: e.profilePicture,
        shifts: e.shifts || [],
      })) || []
    );
  }, [restaurantContext.restaurantData?.employees]);

  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const employees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees;

    const normalizedSearch = normalize(searchTerm);

    return allEmployees.filter((e) => {
      // Concaténer prénom + nom, puis normaliser
      const fullName = `${e.firstname} ${e.lastname}`;
      const normalizedName = normalize(fullName);
      return normalizedName.includes(normalizedSearch);
    });
  }, [allEmployees, searchTerm]);

  useEffect(() => {
    const newRaw = allEmployees.flatMap((emp) =>
      emp.shifts.map((s, idx) => ({
        id: `${emp._id}-${idx}`,
        title: `${emp.name} : ${s.title}`,
        start: new Date(s.start),
        end: new Date(s.end),
        resourceId: emp._id,
      }))
    );
    setEvents(newRaw);
  }, [allEmployees]);

  const colorPalette = [
    "#4E79A7", // bleu foncé
    "#F28E2B", // orange
    "#E15759", // rouge
    "#76B7B2", // turquoise
    "#59A14F", // vert
    "#EDC948", // jaune
    "#B07AA1", // violet
    "#FF9DA7", // rose pâle
    "#9C755F", // brun clair
    "#BAB0AC", // gris
    "#2F4B7C", // indigo
    "#FF6361", // corail
    "#58508D", // violet foncé
    "#FFA600", // or
    "#003F5C", // bleu nuit
    "#00A9E0", // ciel
  ];

  const employeeColorMap = useMemo(() => {
    const map = {};
    allEmployees.forEach((e, idx) => {
      map[e._id] = colorPalette[idx % colorPalette.length];
    });
    return map;
  }, [allEmployees]);

  const visibleEvents = useMemo(
    () =>
      selectedEmployeeId
        ? events.filter((ev) => ev.resourceId === selectedEmployeeId)
        : events,
    [events, selectedEmployeeId]
  );

  async function handleSelectSlot({ start, end, resourceId }) {
    const ownerId = selectedEmployeeId || resourceId;
    if (!ownerId) return;

    const promptText = t(
      "planning:prompts.newShift",
      "Nom du shift (ex : “Matin”) ?"
    );
    const title = window.prompt(promptText);
    if (!title) return;

    const shiftPayload = {
      title,
      start: start.toISOString(),
      end: end.toISOString(),
    };

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${ownerId}/shifts`,
        shiftPayload
      );
      const updatedShifts = response.data.shifts;

      const updatedEvents = updatedShifts.map((s, idx) => ({
        id: `${ownerId}-${idx}`,
        title: `${allEmployees.find((e) => e._id === ownerId)?.name} : ${s.title}`,
        start: new Date(s.start),
        end: new Date(s.end),
        resourceId: ownerId,
      }));

      const otherEvents = events.filter((ev) => ev.resourceId !== ownerId);
      setEvents([...otherEvents, ...updatedEvents]);
    } catch (err) {
      console.error("Erreur lors de l’ajout du shift :", err);
      window.alert(
        "Impossible d’ajouter le shift pour le moment. Veuillez réessayer."
      );
    }
  }

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
    <section className="flex flex-col gap-4">
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

      {/* ─── Barre de recherche ───────────────────────────────────────────────── */}
      <div className="relative midTablet:w-[350px]">
        <input
          type="text"
          placeholder="Rechercher un employé"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 pr-10 border border-[#131E3690] rounded-lg"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
          >
            &times;
          </button>
        )}
      </div>

      {/* ─── Liste d’employés filtrée en « cartes » ──────────────────────────── */}
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
                } rounded-lg transition-colors py-4`}
              >
                <CardEmployeesComponent employee={emp} planning={true} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ─── Calendrier React Big Calendar ─────────────────────────────────── */}
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
                    resourceTitle: allEmployees.find(
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
                style: {
                  backgroundColor:
                    employeeColorMap[event.resourceId] || "#4ead7a",
                  borderRadius: "4px",
                },
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

            dayHeaderFormat: (date) =>
              format(date, "EEEE dd MMMM", { locale: frLocale }),
          }}
        />
      </div>
    </section>
  );
}
