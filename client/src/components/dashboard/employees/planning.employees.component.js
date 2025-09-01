import { useState, useMemo, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
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
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";
import axios from "axios";

const DnDCalendar = withDragAndDrop(Calendar);

// Helper: "Prénom N."
const shortName = (emp) =>
  `${emp?.firstname ?? ""} ${emp?.lastname ? emp.lastname[0] + "." : ""}`.trim();

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // ─── États ─────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState(Views.WEEK);

  // Modale d’ajout
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    employeeId: null,
    start: null,
    end: null,
    title: "",
  });
  // Recherche employé dans la modale quand aucun n’est pré-sélectionné
  const [modalEmployeeQuery, setModalEmployeeQuery] = useState("");

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

  const calendarContainerRef = useRef(null);

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

  // Normalisation pour recherche
  const normalize = (str) =>
    str
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? "";

  const employees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees;
    const norm = normalize(searchTerm);
    return allEmployees.filter((e) =>
      normalize(`${e.firstname} ${e.lastname}`).includes(norm)
    );
  }, [allEmployees, searchTerm]);

  // Liste filtrée pour la recherche dans la modale (quand aucun employé sélectionné)
  const modalEmployeeOptions = useMemo(() => {
    if (!modalEmployeeQuery.trim()) return [];
    const norm = normalize(modalEmployeeQuery);
    return allEmployees
      .filter((e) => normalize(`${e.firstname} ${e.lastname}`).includes(norm))
      .slice(0, 10);
  }, [allEmployees, modalEmployeeQuery]);

  // ─── Recompose les events à partir des shifts ──────────────────────────────
  useEffect(() => {
    const newEvents = allEmployees.flatMap((emp) =>
      emp.shifts.flatMap((s, idx) => {
        const startDate = new Date(s.start);
        const endDate = new Date(s.end);
        const durationMs = endDate - startDate;

        // Congés multi-jours : un seul event couvrant toute la période
        if (s.title === "Congés" && durationMs >= 1000 * 60 * 60 * 24) {
          return [
            {
              id: `${emp._id}-leave-${idx}`,
              title: `${shortName(emp)} - Congés`,
              start: startDate,
              end: endDate,
              resourceId: emp._id,
              allDay: false,
            },
          ];
        }

        // Shifts normaux
        return [
          {
            id: `${emp._id}-${idx}`,
            title: `${shortName(emp)} - ${s.title}`,
            start: startDate,
            end: endDate,
            resourceId: emp._id,
          },
        ];
      })
    );
    setEvents(newEvents);
  }, [allEmployees]);

  // ─── Couleurs par employé ──────────────────────────────────────────────────
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

  // ─── Sélection d’un créneau ────────────────────────────────────────────────
  function handleSelectSlot(slotInfo) {
    // Si un employé est sélectionné, on pré-remplit l’employé
    if (selectedEmployeeId) {
      setModalData({
        employeeId: selectedEmployeeId,
        start: slotInfo.start,
        end: slotInfo.end,
        title: "",
      });
      setModalOpen(true);
      return;
    }
    // Sinon : on ouvre la modale avec recherche d’employé
    setModalData({
      employeeId: null,
      start: slotInfo.start,
      end: slotInfo.end,
      title: "",
    });
    setModalEmployeeQuery("");
    setModalOpen(true);
  }

  // ─── Valider l’ajout de shift ──────────────────────────────────────────────
  async function handleConfirmShift() {
    const { employeeId, start, end, title } = modalData;

    if (!title.trim()) {
      window.alert(t("planning:errors.titleRequired", "Le titre est requis"));
      return;
    }
    if (!employeeId) {
      window.alert(
        t("planning:errors.employeeRequired", "Sélectionnez un employé")
      );
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

      const employee = allEmployees.find((e) => e._id === employeeId);
      const updatedEvents = updatedShifts.map((s, idx) => ({
        id: `${employeeId}-${idx}`,
        title: `${shortName(employee)} - ${s.title}`,
        start: new Date(s.start),
        end: new Date(s.end),
        resourceId: employeeId,
      }));

      // Mettre à jour le contexte
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      // Mettre à jour les events locaux
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

  function handleCancelShift() {
    setModalOpen(false);
    setModalData({ employeeId: null, start: null, end: null, title: "" });
    setModalEmployeeQuery("");
  }

  // ─── Drag & Drop : mise à jour du shift ───────────────────────────────────
  async function handleEventDrop({ event, start, end }) {
    // Empêcher le DnD des congés
    if (event.title.split(" - ")[1] === "Congés") return;

    const [employeeId, idxStr] = event.id.split("-");
    const index = parseInt(idxStr, 10);

    // Optimiste
    const movedEvents = events.map((ev) =>
      ev.id === event.id
        ? { ...ev, start: new Date(start), end: new Date(end) }
        : ev
    );
    setEvents(movedEvents);

    try {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${index}`,
        {
          title: event.title.split(" - ")[1],
          start: start.toISOString(),
          end: end.toISOString(),
        }
      );
      const updatedShifts = response.data.shifts;

      // Contexte
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      // Recharger events
      const reloadedEvents = allEmployees.flatMap((emp) =>
        emp._id === employeeId
          ? updatedShifts.map((s, idx) => ({
              id: `${employeeId}-${idx}`,
              title: `${shortName(emp)} - ${s.title}`,
              start: new Date(s.start),
              end: new Date(s.end),
              resourceId: employeeId,
            }))
          : emp.shifts.map((s, idx) => ({
              id: `${emp._id}-${idx}`,
              title: `${shortName(emp)} - ${s.title}`,
              start: new Date(s.start),
              end: new Date(s.end),
              resourceId: emp._id,
            }))
      );
      setEvents(reloadedEvents);
    } catch (err) {
      console.error("Erreur maj shift par drag:", err);
      // rollback
      const rollbackEvents = events.map((ev) =>
        ev.id === event.id ? event : ev
      );
      setEvents(rollbackEvents);
      window.alert(
        t("planning:errors.updateFailed", "Impossible de déplacer le shift")
      );
    }
  }

  // ─── Clic = modale suppression ─────────────────────────────────────────────
  function handleSelectEvent(event) {
    const parts = event.id.split("-");
    const employeeId = parts[0];
    const index =
      parts[1] === "leave" ? parseInt(parts[2], 10) : parseInt(parts[1], 10);

    setDeleteModalData({
      eventId: event.id,
      employeeId,
      title: event.title.split(" - ")[1],
      start: event.start,
      end: event.end,
      shiftIndex: index,
    });
    setDeleteModalOpen(true);
  }

  // ─── Confirmer suppression ───────────────────────────────────────────────────
  async function handleConfirmDelete() {
    const { employeeId, shiftIndex, eventId, start, end, title } =
      deleteModalData;
    const isLeave = title === "Congés";

    try {
      // 1) Si c'est un congé : on annule la demande associée (ce qui supprime aussi le shift côté backend)
      if (isLeave) {
        const emp = restaurantContext.restaurantData?.employees?.find(
          (e) => e._id === employeeId
        );

        if (emp?.leaveRequests?.length) {
          const startTs = new Date(start).getTime();
          const endTs = new Date(end).getTime();

          const matchingReq = emp.leaveRequests.find((r) => {
            return (
              new Date(r.start).getTime() === startTs &&
              new Date(r.end).getTime() === endTs &&
              r.status !== "cancelled"
            );
          });

          if (matchingReq?._id) {
            // Annuler la demande => le backend retire aussi le shift "Congés"
            await axios.put(
              `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/leave-requests/${matchingReq._id}`,
              { status: "cancelled" }
            );

            // Maj du contexte: statut de la demande
            const updatedRestaurantLR = { ...restaurantContext.restaurantData };
            updatedRestaurantLR.employees = updatedRestaurantLR.employees.map(
              (e) =>
                e._id === employeeId
                  ? {
                      ...e,
                      leaveRequests: e.leaveRequests.map((req) =>
                        req._id === matchingReq._id
                          ? { ...req, status: "cancelled" }
                          : req
                      ),
                    }
                  : e
            );
            restaurantContext.setRestaurantData(updatedRestaurantLR);
          }
        }

        const startTs = new Date(start).getTime();
        const endTs = new Date(end).getTime();
        const updatedRestaurant = { ...restaurantContext.restaurantData };
        updatedRestaurant.employees = updatedRestaurant.employees.map((emp) => {
          if (emp._id !== employeeId) return emp;
          const newShifts = (emp.shifts || []).filter(
            (s, i) =>
              !(
                s.title === "Congés" &&
                new Date(s.start).getTime() === startTs &&
                new Date(s.end).getTime() === endTs
              )
          );
          return { ...emp, shifts: newShifts };
        });
        restaurantContext.setRestaurantData(updatedRestaurant);
      } else {
        // 2) Shift normal : on supprime via l'API comme avant
        await axios.delete(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${shiftIndex}`
        );

        // Mettre à jour le contexte (côté shifts)
        const updatedRestaurant = { ...restaurantContext.restaurantData };
        updatedRestaurant.employees = updatedRestaurant.employees.map((emp) => {
          if (emp._id === employeeId) {
            const newShifts = emp.shifts.filter((_, i) => i !== shiftIndex);
            return { ...emp, shifts: newShifts };
          }
          return emp;
        });
        restaurantContext.setRestaurantData(updatedRestaurant);
      }

      // 3) Retirer l'event du calendrier
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    } catch (err) {
      console.error("Erreur suppression shift / annulation congé :", err);
      window.alert(
        t(
          "planning:errors.deleteFailed",
          "Impossible de supprimer le shift / annuler le congé"
        )
      );
    }

    setDeleteModalOpen(false);
  }

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

  const CustomEvent = ({ event }) => {
    const isCompressedLeave =
      event.title.endsWith("- Congés") &&
      event.end - event.start === 1000 * 60 * 60;
    if (isCompressedLeave) return <div>{event.title}</div>;
    return (
      <div className="flex flex-col gap-1">
        <span>{event.title}</span>
      </div>
    );
  };

  // Responsive (même logique que l'autre composant)
  const minTableWidth = view === Views.DAY ? "auto" : `${7 * 100}px`;

  return (
    <section className="flex flex-col gap-4 min-w-0" ref={calendarContainerRef}>
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
                {t("titles.main")}
              </span>
              <span>/</span>
              <span>{t("titles.planning")}</span>
            </h1>
          </div>
          {selectedEmployeeId && (
            <div className="text-sm opacity-70">
              {t("planning:selected", "Employé affiché")} :{" "}
              <strong>
                {shortName(
                  allEmployees.find((e) => e._id === selectedEmployeeId)
                )}
              </strong>
            </div>
          )}
        </div>

        <button
          onClick={() => router.push("/dashboard/employees/planning/days-off")}
          className="bg-violet px-6 py-2 rounded-lg text-white cursor-pointer hover:opacity-80 transition-all ease-in-out"
        >
          {t("titles.daysOff")}
        </button>
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

      {/* ─── Liste d’employés ─────────────────────────────────────────────────── */}
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

      {/* ─── Calendrier Drag & Drop (responsive, sans colonne resources) ─────── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: minTableWidth }} className="h-[75vh]">
          <DnDCalendar
            view={view}
            onView={(v) => setView(v)}
            components={{ event: CustomEvent }}
            showMultiDayTimes
            localizer={localizer}
            culture="fr"
            events={visibleEvents}
            defaultView={Views.WEEK}
            views={[Views.WEEK, Views.DAY, Views.MONTH]}
            step={30}
            timeslots={2}
            defaultDate={new Date()}
            selectable="ignoreEvents"
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
            onSelectEvent={handleSelectEvent}
            draggableAccessor={(event) =>
              event.title.split(" - ")[1] !== "Congés"
            }
            eventPropGetter={(event) => {
              const shiftTitle = event.title.split(" - ")[1];
              const isLeave = shiftTitle === "Congés";
              return {
                className: "",
                style: {
                  backgroundColor: isLeave
                    ? "#FFD19C"
                    : employeeColorMap[event.resourceId],
                  border: `2px solid ${isLeave ? "#FDBA74" : "#FFFFFF"}`, // bordure blanche sur shifts
                  borderRadius: "4px",
                  outline: "none",
                },
              };
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
                  {
                    locale: frLocale,
                  }
                )}`,
            }}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </div>

      {/* ─── Modale Ajout Shift ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-black bg-opacity-40"
          />
          <div className="bg-white mx-4 p-6 rounded-lg shadow-lg z-10 w-[420px]">
            {/* Titre / sélecteur employé */}
            {modalData.employeeId ? (
              <h2 className="text-xl font-semibold mb-4 text-center">
                {(() => {
                  const emp = allEmployees.find(
                    (e) => e._id === modalData.employeeId
                  );
                  return emp ? `${emp.firstname} ${emp.lastname}` : "";
                })()}
              </h2>
            ) : (
              <div className="mb-4">
                <label className="block text-xl text-center mb-2">
                  {t("planning:labels.chooseEmployee", "Choisir un employé")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={modalEmployeeQuery}
                    onChange={(e) => setModalEmployeeQuery(e.target.value)}
                    placeholder={t(
                      "planning:placeholders.searchEmployee",
                      "Rechercher un employé"
                    )}
                    className="w-full p-2 border rounded"
                  />
                  {modalEmployeeQuery.trim() && (
                    <ul className="-mt-1 max-h-24 drop-shadow-xl overflow-y-auto border-b border-x rounded-b absolute bg-white left-0 right-0">
                      {modalEmployeeOptions.length === 0 && (
                        <li className="px-3 py-2 text-sm opacity-70 italic">
                          {t("planning:labels.noResult", "Aucun résultat")}
                        </li>
                      )}
                      {modalEmployeeOptions.map((emp) => (
                        <li
                          key={emp._id}
                          className={`px-3 py-[6px] cursor-pointer hover:bg-gray-100 ${
                            modalData.employeeId === emp._id
                              ? "bg-gray-100"
                              : ""
                          }`}
                          onClick={() =>
                            setModalData((prev) => ({
                              ...prev,
                              employeeId: emp._id,
                            }))
                          }
                        >
                          {emp.firstname} {emp.lastname}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Créneau */}
            <p className="mb-4 text-center">
              {t("planning:labels.slot", "Créneau :")}&nbsp;
              <strong>
                {format(modalData.start, "EEEE dd MMM yyyy HH:mm", {
                  locale: frLocale,
                })}{" "}
                – {format(modalData.end, "HH:mm", { locale: frLocale })}
              </strong>
            </p>

            {/* Titre shift */}
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
                disabled={
                  !modalData.title.trim() ||
                  (!modalData.employeeId && !selectedEmployeeId)
                }
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
              {(() => {
                const emp = allEmployees.find(
                  (e) => e._id === deleteModalData.employeeId
                );
                return emp ? `${emp.firstname} ${emp.lastname}` : "";
              })()}
            </h2>
            <p className="mb-4 text-center flex flex-col gap-2">
              <span>
                {t("planning:labels.deleteShift", "Supprimer ce shift")} :{" "}
                {deleteModalData?.title}
              </span>
              <strong>
                {format(deleteModalData.start, "EEEE dd MMM yyyy HH:mm", {
                  locale: frLocale,
                })}{" "}
                – {format(deleteModalData.end, "HH:mm", { locale: frLocale })}
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
