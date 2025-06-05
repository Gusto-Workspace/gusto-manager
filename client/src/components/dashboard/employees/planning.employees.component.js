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

// Component pour afficher une carte d’employé
import CardEmployeesComponent from "./card.employees.component";
import axios from "axios";

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
 

  // 1) Liste initiale des employés (depuis le contexte)
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
  }, [restaurantContext.restaurantData]); 

  // 1a) State pour le terme de recherche
  const [searchTerm, setSearchTerm] = useState("");

  // 1b) Fonction pour normaliser et supprimer les accents
  const normalize = (str) =>
    str
      .normalize("NFD") // décompose les caractères accentués
      .replace(/[\u0300-\u036f]/g, "") // supprime les diacritiques
      .toLowerCase()
      .trim();

  // 1c) Filtrer les employés en fonction du searchTerm (sans tenir compte des accents)
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

  // 3) Configuration date-fns pour React Big Calendar (locale FR uniquement)
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { locale: frLocale }), // début de semaine = lundi
    getDay,
    locales, // injection de frLocale
  });

  // 4) States pour la liste d’événements et l’employé sélectionné
  const [events, setEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // 5) Palette de couleurs pour chaque employé
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
    allEmployees.forEach((e, idx) => {
      map[e._id] = colorPalette[idx % colorPalette.length];
    });
    return map;
  }, [allEmployees]);

  // 6) Filtrage des événements selon l’employé sélectionné (ou tous sinon)
  const visibleEvents = useMemo(
    () =>
      selectedEmployeeId
        ? events.filter((ev) => ev.resourceId === selectedEmployeeId)
        : events,
    [events, selectedEmployeeId]
  );

  // 7) Création d’un shift (clic-glisse sur le calendrier)
  async function handleSelectSlot({ start, end, resourceId }) {
  // 1) déterminer l’employé cible
  const ownerId = selectedEmployeeId || resourceId;
  if (!ownerId) return;

  // 2) demander le titre au user
  const promptText = t(
    "planning:prompts.newShift",
    "Nom du shift (ex : “Matin”) ?"
  );
  const title = window.prompt(promptText);
  if (!title) return;

  // 3) composer le payload
  // on envoie des dates en ISO pour être sûr
  const shiftPayload = {
    title,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  try {
    // 4) appeler l’API pour créer le shift en base
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/employees/${ownerId}/shifts`,
      shiftPayload
    );
    // 5) la route renvoie { shifts: [...] } mis à jour
    const updatedShifts = response.data.shifts;

    // 6) transformer ces shifts en “events” React Big Calendar
    const updatedEvents = updatedShifts.map((s, idx) => ({
      id: `${ownerId}-${idx}`,
      title: `${allEmployees.find((e) => e._id === ownerId)?.name} : ${s.title}`,
      start: new Date(s.start),
      end: new Date(s.end),
      resourceId: ownerId,
    }));

    // 7) Si vous souhaitez garder les shifts des autres employés,
    //    vous pouvez filtrer `events` pour ne garder que ceux qui ne viennent pas de ownerId, puis concaténer :
    const otherEvents = events.filter((ev) => ev.resourceId !== ownerId);
    setEvents([...otherEvents, ...updatedEvents]);
    //   → ou bien remplacer complètement : setEvents(allEventsFromAllEmployees) 
    //   après un re-fetch global, selon votre logique.

  } catch (err) {
    console.error("Erreur lors de l’ajout du shift :", err);
    // Vous pouvez afficher un toast ou un alert pour informer l’utilisateur
    window.alert(
      "Impossible d’ajouter le shift pour le moment. Veuillez réessayer."
    );
  }
}


  // 8) Suppression d’un shift (clic sur l’événement)
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
          localizer={localizer} // date-fns localizer (frLocale)
          culture="fr" // culture française
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

            dayHeaderFormat: (date) =>
              format(date, "EEEE dd MMMM", { locale: frLocale }),
          }}
        />
      </div>
    </section>
  );
}
