import { useState, useMemo, useContext, useEffect } from "react";
import { useRouter } from "next/router";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";
import axios from "axios";

const DnDCalendar = withDragAndDrop(Calendar);

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // ─── États ─────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Modale d’ajout
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    employeeId: null,
    start: null,
    end: null,
    title: "",
  });

  // Modale de suppression
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState({
    eventId: null,
    employeeId: null,
    title: "",
    start: null,
    end: null,
    shiftIndex: null,
  });

  // date‐fns localizer (FR)
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { locale: frLocale }),
    getDay,
    locales,
  });

  // ─── Chargement des employés depuis le contexte ─────────────────────────────
  const allEmployees = useMemo(
    () =>
      restaurantContext.restaurantData?.employees.map((e) => ({
        _id: e._id,
        firstname: e.firstname,
        lastname: e.lastname,
        name: `${e.firstname} ${e.lastname}`,
        post: e.post,
        profilePicture: e.profilePicture,
        shifts: e.shifts || [],
      })) || [],
    [restaurantContext.restaurantData?.employees]
  );

  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const employees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees;
    const norm = normalize(searchTerm);
    return allEmployees.filter((e) => {
      const fullName = `${e.firstname} ${e.lastname}`;
      return normalize(fullName).includes(norm);
    });
  }, [allEmployees, searchTerm]);

  // ─── À chaque changement de “allEmployees”, on reconstruit “events” ──────────
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

  // ─── Palette de couleurs ────────────────────────────────────────────────────
  const colorPalette = [
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
    "#2F4B7C",
    "#FF6361",
    "#58508D",
    "#FFA600",
    "#003F5C",
    "#00A9E0",
  ];
  const employeeColorMap = useMemo(() => {
    const map = {};
    allEmployees.forEach((e, idx) => {
      map[e._id] = colorPalette[idx % colorPalette.length];
    });
    return map;
  }, [allEmployees]);

  // ─── Filtrage des événements selon la sélection ─────────────────────────────
  const visibleEvents = useMemo(
    () =>
      selectedEmployeeId
        ? events.filter((ev) => ev.resourceId === selectedEmployeeId)
        : events,
    [events, selectedEmployeeId]
  );

  // ─── Sélection d’un créneau (clic ou tap, dès que l’on relâche) ───────────────
  function handleSelectSlot(slotInfo) {
    // slotInfo = { start: Date, end: Date, resourceId: string | undefined }
    const ownerId = selectedEmployeeId || slotInfo.resourceId;
    if (!ownerId) {
      // Si aucun employé n’est sélectionné (pas de resourceId), on ne fait rien
      return;
    }
    setModalData({
      employeeId: ownerId,
      start: slotInfo.start,
      end: slotInfo.end,
      title: "",
    });
    setModalOpen(true);
  }

  // ─── Valider le nouvel ajout de shift ──────────────────────────────────────
  async function handleConfirmShift() {
    const { employeeId, start, end, title } = modalData;
    if (!title.trim()) {
      window.alert(t("planning:errors.titleRequired", "Le titre est requis"));
      return;
    }
    try {
      const payload = {
        title,
        start: start.toISOString(),
        end: end.toISOString(),
      };
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts`,
        payload
      );
      const updatedShifts = response.data.shifts;

      // Recomposer les events de cet employé
      const updatedEvents = updatedShifts.map((s, idx) => ({
        id: `${employeeId}-${idx}`,
        title: `${allEmployees.find((e) => e._id === employeeId)?.name} : ${s.title}`,
        start: new Date(s.start),
        end: new Date(s.end),
        resourceId: employeeId,
      }));

      // Mettre à jour le contexte pour “allEmployees”
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      // Mettre à jour “events” locaux
      const otherEvents = events.filter((ev) => ev.resourceId !== employeeId);
      setEvents([...otherEvents, ...updatedEvents]);
    } catch (err) {
      console.error("Erreur ajout shift :", err);
      window.alert(
        t("planning:errors.addFailed", "Impossible d’ajouter le shift")
      );
    }
    setModalOpen(false);
  }

  // ─── Annuler la modale d’ajout ──────────────────────────────────────────────
  function handleCancelShift() {
    setModalOpen(false);
    setModalData({ employeeId: null, start: null, end: null, title: "" });
  }

  // ─── Drag & Drop : mise à jour du shift ───────────────────────────────────
  async function handleEventDrop({ event, start, end }) {
    const [employeeId, idxStr] = event.id.split("-");
    const index = parseInt(idxStr, 10);

    // 1) Mise à jour optimiste de “events”
    const movedEvents = events.map((ev) =>
      ev.id === event.id
        ? { ...ev, start: new Date(start), end: new Date(end) }
        : ev
    );
    setEvents(movedEvents);

    try {
      // 2) Appel API PUT pour enregistrer en base
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${index}`,
        {
          title: event.title.split(" : ")[1],
          start: start.toISOString(),
          end: end.toISOString(),
        }
      );
      const updatedShifts = response.data.shifts;

      // 3) Mettre à jour le contexte pour que “allEmployees” contienne cette nouvelle date
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      // 4) Recomposer “events” depuis le contexte pour s’assurer d’être 100% synchro
      const reloadedEvents = allEmployees.flatMap((emp) =>
        emp._id === employeeId
          ? updatedShifts.map((s, idx) => ({
              id: `${employeeId}-${idx}`,
              title: `${emp.name} : ${s.title}`,
              start: new Date(s.start),
              end: new Date(s.end),
              resourceId: employeeId,
            }))
          : emp.shifts.map((s, idx) => ({
              id: `${emp._id}-${idx}`,
              title: `${emp.name} : ${s.title}`,
              start: new Date(s.start),
              end: new Date(s.end),
              resourceId: emp._id,
            }))
      );
      setEvents(reloadedEvents);
    } catch (err) {
      console.error("Erreur maj shift par drag:", err);
      // 5) En cas d’échec, rollback à l’état précédent
      const rollbackEvents = events.map((ev) =>
        ev.id === event.id ? event : ev
      );
      setEvents(rollbackEvents);
      window.alert(
        t("planning:errors.updateFailed", "Impossible de déplacer le shift")
      );
    }
  }

  // ─── Clic sur un événement = ouverture modale de suppression ───────────────
  function handleSelectEvent(event) {
    // On extrait employeeId et index du shift depuis l’ID “empId-index”
    const [employeeId, idxStr] = event.id.split("-");
    const index = parseInt(idxStr, 10);

    setDeleteModalData({
      eventId: event.id,
      employeeId,
      title: event.title.split(" : ")[1],
      start: event.start,
      end: event.end,
      shiftIndex: index,
    });
    setDeleteModalOpen(true);
  }

  // ─── Confirmer suppression via modale ─────────────────────────────────────
  async function handleConfirmDelete() {
    const { employeeId, shiftIndex, eventId } = deleteModalData;
    try {
      // 1) Appel API DELETE pour supprimer le shift en base
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${shiftIndex}`
      );

      // 2) Mettre à jour le contexte : retirer le shift dans restaurantContext
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) => {
        if (emp._id === employeeId) {
          const newShifts = emp.shifts.filter((_, i) => i !== shiftIndex);
          return { ...emp, shifts: newShifts };
        }
        return emp;
      });
      restaurantContext.setRestaurantData(updatedRestaurant);

      // 3) Mettre à jour “events” : on enlève simplement l’événement supprimé
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    } catch (err) {
      console.error("Erreur suppression shift :", err);
      window.alert(
        t("planning:errors.deleteFailed", "Impossible de supprimer le shift")
      );
    }
    setDeleteModalOpen(false);
  }

  // ─── Annuler suppression (fermeture modale) ────────────────────────────────
  function handleCancelDelete() {
    setDeleteModalOpen(false);
    setDeleteModalData({
      eventId: null,
      employeeId: null,
      title: "",
      start: null,
      end: null,
      shiftIndex: null,
    });
  }

  return (
    <section className="flex flex-col gap-4 p-4">
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
          placeholder={t(
            "planning:placeholders.searchEmployee",
            "Rechercher un employé"
          )}
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

      {/* ─── Liste d’employés en “cartes” ───────────────────────────────────── */}
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

      {/* ─── Calendrier Drag & Drop ───────────────────────────────────────────── */}
      <div className="h-[75vh]">
        <DnDCalendar
          showMultiDayTimes={true}
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
          /** ─── Ici on se contente de selectable + onSelectSlot ────────────────── **/
          selectable="ignoreEvents"
          onSelectSlot={handleSelectSlot}
          /** On conserve le drag&drop sur desktop, et le click sur événement pour supprimer **/
          onEventDrop={handleEventDrop}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={(event) => {
            const color = employeeColorMap[event.resourceId] || "#4ead7a";
            return { style: { backgroundColor: color, borderRadius: "4px" } };
          }}
          messages={{
            today: "Aujourd’hui",
            previous: "<",
            next: ">",
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
                "dd MMM yyyy",
                { locale: frLocale }
              )}`,
            dayHeaderFormat: (date) =>
              format(date, "EEEE dd MMMM yyyy", { locale: frLocale }),
            eventTimeRangeFormat: ({ start, end }) =>
              `${format(start, "HH:mm", { locale: frLocale })} – ${format(
                end,
                "HH:mm",
                { locale: frLocale }
              )}`,
            eventTimeRangeStartFormat: ({ start }) =>
              format(start, "HH:mm", { locale: frLocale }),
            eventTimeRangeEndFormat: ({ end }) =>
              format(end, "HH:mm", { locale: frLocale }),
          }}
        />
      </div>

      {/* ─── Modale Ajout Shift ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-black bg-opacity-40"
          />
          <div className="bg-white mx-4 p-6 rounded-lg shadow-lg z-10 w-[400px]">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {allEmployees.find((e) => e._id === modalData.employeeId)?.name}
            </h2>
            <p className="mb-4 text-center">
              {t("planning:labels.slot", "Créneau :")}&nbsp;
              <strong>
                {format(modalData.start, "EEEE dd MMM yyyy HH:mm", {
                  locale: frLocale,
                })}
                &nbsp;– {format(modalData.end, "HH:mm", { locale: frLocale })}
              </strong>
            </p>
            <input
              type="text"
              placeholder={t(
                "planning:placeholders.shiftTitle",
                "Titre du shift"
              )}
              value={modalData.title}
              onChange={(e) =>
                setModalData((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full p-2 border border-gray-300 rounded-lg mb-6"
            />
            <div className="flex justify-center gap-4">
              <button
                onClick={handleConfirmShift}
                className="px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
              >
                {t("buttons.confirm", "Valider")}
              </button>
              <button
                onClick={handleCancelShift}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modale Suppression Shift ──────────────────────────────────────────── */}
      {deleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={handleCancelDelete}
            className="absolute inset-0 bg-black bg-opacity-40"
          />
          <div className="bg-white mx-4 p-6 rounded-lg shadow-lg z-10 w-[400px]">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {
                allEmployees.find((e) => e._id === deleteModalData.employeeId)
                  ?.name
              }
            </h2>
            <p className="mb-4 text-center flex flex-col gap-2">
              <span>
                {t("planning:labels.deleteShift", "Supprimer ce créneau")} :
              </span>
              <strong>
                {format(deleteModalData.start, "EEEE dd MMM yyyy HH:mm", {
                  locale: frLocale,
                })}
                &nbsp;–{" "}
                {format(deleteModalData.end, "HH:mm", { locale: frLocale })}
              </strong>
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-blue text-white rounded-lg"
              >
                {t("buttons.delete", "Supprimer")}
              </button>
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
