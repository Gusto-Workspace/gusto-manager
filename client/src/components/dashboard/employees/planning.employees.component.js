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
    leaveRequestId: null,
    isLeave: false,
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
  // Quand tu reconstruis les events à partir des shifts :
  useEffect(() => {
    const newEvents = allEmployees.flatMap((emp) =>
      (emp.shifts || []).map((s) => {
        const startDate = new Date(s.start);
        const endDate = new Date(s.end);
        const isLeave = s.title === "Congés";
        return {
          id: String(s._id),
          title: `${shortName(emp)} - ${s.title}`,
          start: startDate,
          end: endDate,
          resourceId: emp._id,
          leaveRequestId: s.leaveRequestId || null,
          isLeave,
        };
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
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts`,
        { title, start: start.toISOString(), end: end.toISOString() }
      );

      const updatedShifts = response.data.shifts; // contient des _id
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      // rebuild events (ils auront les vrais _id)
      const employee = allEmployees.find((e) => e._id === employeeId) || {};
      const updatedEvents = updatedShifts.map((s) => ({
        id: String(s._id),
        title: `${shortName(employee)} - ${s.title}`,
        start: new Date(s.start),
        end: new Date(s.end),
        resourceId: employeeId,
        leaveRequestId: s.leaveRequestId || null,
        isLeave: s.title === "Congés",
      }));
      const other = events.filter((ev) => ev.resourceId !== employeeId);
      setEvents([...other, ...updatedEvents]);
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
    if (event.isLeave) return; // pas de DnD sur congés

    const employeeId = event.resourceId;
    const shiftId = event.id;

    // Optimiste
    setEvents((evts) =>
      evts.map((ev) => (ev.id === shiftId ? { ...ev, start, end } : ev))
    );

    try {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${shiftId}`,
        {
          title: event.title.split(" - ")[1],
          start: start.toISOString(),
          end: end.toISOString(),
        }
      );

      // Mets à jour le contexte (employé courant)
      const updatedShifts = response.data.shifts;
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp
      );
      restaurantContext.setRestaurantData(updatedRestaurant);
    } catch (err) {
      console.error("Erreur maj shift par drag:", err);
      // rollback
      setEvents((evts) => evts.map((ev) => (ev.id === shiftId ? event : ev)));
      window.alert(
        t("planning:errors.updateFailed", "Impossible de déplacer le shift")
      );
    }
  }

  // ─── Clic = modale suppression ─────────────────────────────────────────────
  function handleSelectEvent(event) {
    setDeleteModalData({
      eventId: event.id,
      employeeId: event.resourceId,
      title: event.title.split(" - ")[1],
      start: event.start,
      end: event.end,

      leaveRequestId: event.leaveRequestId || null,
      isLeave: !!event.isLeave,
    });
    setDeleteModalOpen(true);
  }

  // ─── Confirmer suppression ───────────────────────────────────────────────────
  async function handleConfirmDelete() {
    const {
      employeeId,
      eventId: shiftId,
      title,
      leaveRequestId,
      isLeave,
    } = deleteModalData;

    try {
      if (isLeave && leaveRequestId) {
        // Annuler la LR par ID (le backend supprime le shift lié)
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/leave-requests/${leaveRequestId}`,
          { status: "cancelled" }
        );

        // MAJ contexte: LR -> cancelled, et purge les shifts dont leaveRequestId = lrId
        const updated = { ...restaurantContext.restaurantData };
        updated.employees = updated.employees.map((e) => {
          if (e._id !== employeeId) return e;
          return {
            ...e,
            leaveRequests: (e.leaveRequests || []).map((r) =>
              String(r._id) === String(leaveRequestId)
                ? { ...r, status: "cancelled" }
                : r
            ),
            shifts: (e.shifts || []).filter(
              (s) => String(s.leaveRequestId) !== String(leaveRequestId)
            ),
          };
        });
        restaurantContext.setRestaurantData(updated);
      } else {
        // Shift normal -> suppression par shiftId
        await axios.delete(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/shifts/${shiftId}`
        );

        // MAJ contexte (en retirant le shift par _id)
        const updated = { ...restaurantContext.restaurantData };
        updated.employees = updated.employees.map((e) => {
          if (e._id !== employeeId) return e;
          return {
            ...e,
            shifts: (e.shifts || []).filter(
              (s) => String(s._id) !== String(shiftId)
            ),
          };
        });
        restaurantContext.setRestaurantData(updated);
      }

      // Retirer l'event du calendrier
      setEvents((prev) =>
        prev.filter((ev) => String(ev.id) !== String(shiftId))
      );
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
      leaveRequestId: null,
      isLeave: false,
    });
  }

  const CustomEvent = ({ event }) => {
    const isCompressedLeave =
      event.isLeave && event.end - event.start === 1000 * 60 * 60;
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
    <section className="flex flex-col gap-4 min-w-0">
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
        </div>

        <button
          onClick={() => router.push("/dashboard/employees/planning/days-off")}
          className="bg-violet h-fit px-6 py-2 rounded-lg text-white cursor-pointer hover:opacity-80 transition-all ease-in-out"
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
            draggableAccessor={(event) => !event.isLeave}
            eventPropGetter={(event) => {
              const isLeave = event.isLeave;
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
                          className={`px-3 py-[6px] cursor-pointer hover:bg-lightGrey ${
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
                {(() => {
                  const sameDay =
                    deleteModalData.start.toDateString() ===
                    deleteModalData.end.toDateString();

                  const isFullDay =
                    deleteModalData.start.getHours() === 0 &&
                    deleteModalData.start.getMinutes() === 0 &&
                    deleteModalData.end.getHours() === 23 &&
                    deleteModalData.end.getMinutes() >= 59;

                  if (sameDay && isFullDay) {
                    // 👉 Journée complète sur un seul jour
                    return format(deleteModalData.start, "EEEE dd MMM yyyy", {
                      locale: frLocale,
                    });
                  } else if (!sameDay) {
                    // 👉 Plusieurs jours
                    return `${format(
                      deleteModalData.start,
                      "EEEE dd MMM yyyy",
                      {
                        locale: frLocale,
                      }
                    )} – ${format(deleteModalData.end, "EEEE dd MMM yyyy", {
                      locale: frLocale,
                    })}`;
                  } else {
                    // 👉 Même jour mais avec heures
                    return `${format(
                      deleteModalData.start,
                      "EEEE dd MMM yyyy HH:mm",
                      {
                        locale: frLocale,
                      }
                    )} – ${format(deleteModalData.end, "HH:mm", { locale: frLocale })}`;
                  }
                })()}
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
