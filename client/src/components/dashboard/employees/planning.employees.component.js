import { useState, useMemo, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, addDays, getDay } from "date-fns";
import frLocale from "date-fns/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";
import ExportRangeModalComponent from "./export-range-modal.component";
import axios from "axios";
import { getAuthConfig } from "../time-clock/time-clock.utils";

import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Download,
} from "lucide-react";

const DnDCalendar = withDragAndDrop(Calendar);

// Helper: "Prénom N."
const shortName = (emp) =>
  `${emp?.firstname ?? ""} ${emp?.lastname ? emp.lastname[0] + "." : ""}`.trim();

// Normalise un texte (enlève accents / espaces / casse)
const normalizeTitle = (str) =>
  (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// Force un libellé "propre" pour l'affichage
const canonicalizeShiftTitle = (title) => {
  const n = normalizeTitle(title);
  if (n === "conges" || n === "conge") return "Congés";
  return (title || "").trim();
};

const isLeaveShiftRecord = (shift) =>
  Boolean(
    shift?.isLeave ||
      shift?.leaveRequestId ||
      ["conges", "conge"].includes(normalizeTitle(shift?.title)),
  );

const getShiftDisplayTitle = (shift) => {
  if (isLeaveShiftRecord(shift)) return "Congés";
  return canonicalizeShiftTitle(shift?.title);
};

const getManagerEventTitle = (employee, shift) => {
  const shiftLabel = getShiftDisplayTitle(shift);
  return shiftLabel
    ? `${shortName(employee)} - ${shiftLabel}`
    : shortName(employee);
};

const formatEventTimeRange = (start, end) =>
  `${format(start, "HH:mm", { locale: frLocale })}-${format(end, "HH:mm", {
    locale: frLocale,
  })}`;

const pad2 = (value) => String(value).padStart(2, "0");

function toInputDate(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toStartOfDay(value) {
  if (!value) return null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function toEndOfDay(value) {
  if (!value) return null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 0, 0);
  return date;
}

function isStartOfDay(value) {
  return (
    value instanceof Date && value.getHours() === 0 && value.getMinutes() === 0
  );
}

function isEndOfDay(value) {
  return (
    value instanceof Date &&
    value.getHours() === 23 &&
    value.getMinutes() === 59
  );
}

function getInclusiveDaySpan(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return 1;

  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  return (
    Math.max(
      0,
      Math.round((endDay.getTime() - startDay.getTime()) / 86400000),
    ) + 1
  );
}

function getFullDayLeaveLabel(start, end, isLeave) {
  if (!isLeave || !isStartOfDay(start) || !isEndOfDay(end)) return "";
  const days = getInclusiveDaySpan(start, end);
  return days > 1 ? `${days} jours` : "1 jour";
}

function getCalendarRangeBounds(currentDate, currentView) {
  if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
    return null;
  }

  if (currentView === Views.DAY) {
    const start = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
    );
    const endExclusive = new Date(start.getTime());
    endExclusive.setDate(endExclusive.getDate() + 1);
    return { start, endExclusive };
  }

  if (currentView === Views.MONTH) {
    const start = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const endExclusive = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
    return { start, endExclusive };
  }

  const start = startOfWeek(currentDate, {
    locale: frLocale,
    weekStartsOn: 1,
  });
  const endExclusive = new Date(start.getTime());
  endExclusive.setDate(endExclusive.getDate() + 7);
  return { start, endExclusive };
}

function eventIntersectsRange(event, bounds) {
  if (!bounds) return false;

  const start =
    event?.start instanceof Date ? event.start : new Date(event?.start);
  const end = event?.end instanceof Date ? event.end : new Date(event?.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return start < bounds.endExclusive && end >= bounds.start;
}

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // 🔥 FIX iOS : désactive le hack global uniquement sur cette page
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.classList.add("gm-disable-ios-scroll-hack");
    return () => html.classList.remove("gm-disable-ios-scroll-hack");
  }, []);

  const restaurantId = restaurantContext.restaurantData?._id;

  // ─── États ─────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPlanningExportOpen, setIsPlanningExportOpen] = useState(false);
  const [isPlanningExportLoading, setIsPlanningExportLoading] = useState(false);
  const [planningExportError, setPlanningExportError] = useState("");

  // Modale d’ajout
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    employeeId: null,
    start: null,
    end: null,
    title: "",
    isLeave: false,
    isFullDayLeave: false,
  });
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

  // ✅ détecter mobile (avant midTablet)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)"); // adapte si besoin
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ✅ Sur mobile: par défaut Jour (sinon week view illisible)

  // date‐fns localizer (FR)
  const locales = { fr: frLocale };
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (d) => startOfWeek(d, { locale: frLocale }),
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
    [restaurantContext.restaurantData?.employees],
  );

  const exportEmployees = useMemo(
    () =>
      allEmployees.map((employee) => ({
        id: employee._id,
        label: `${employee.firstname || ""} ${employee.lastname || ""}`.trim(),
        subtitle: employee.post || "Poste non renseigné",
      })),
    [allEmployees],
  );

  // ─── HYDRATATION DES SHIFTS AU MONTAGE ─────────────────────────────────────
  useEffect(() => {
    if (!restaurantId) return;
    const employees = restaurantContext.restaurantData?.employees || [];
    if (!employees.length) return;

    const alreadyHaveShifts = employees.some(
      (e) => Array.isArray(e.shifts) && e.shifts.length > 0,
    );
    if (alreadyHaveShifts) return;

    let canceled = false;

    (async () => {
      try {
        const results = await Promise.all(
          employees.map((emp) =>
            axios
              .get(
                `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${emp._id}/shifts`,
              )
              .then((res) => ({
                employeeId: emp._id,
                shifts: res.data?.shifts || [],
              }))
              .catch((err) => {
                console.error("Erreur fetch shifts pour", emp._id, err);
                return { employeeId: emp._id, shifts: [] };
              }),
          ),
        );

        if (canceled) return;

        restaurantContext.setRestaurantData((prev) => {
          if (!prev) return prev;
          const prevEmployees = prev.employees || [];
          return {
            ...prev,
            employees: prevEmployees.map((emp) => {
              const match = results.find(
                (r) => String(r.employeeId) === String(emp._id),
              );
              return match ? { ...emp, shifts: match.shifts } : emp;
            }),
          };
        });
      } catch (e) {
        console.error("Erreur hydratation shifts:", e);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [restaurantId, restaurantContext.restaurantData?.employees?.length]);

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
      normalize(`${e.firstname} ${e.lastname}`).includes(norm),
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
      (emp.shifts || []).map((s) => {
        const startDate = new Date(s.start);
        const endDate = new Date(s.end);
        const isLeave = isLeaveShiftRecord(s);
        const shiftLabel = getShiftDisplayTitle(s);
        const leaveDurationLabel = getFullDayLeaveLabel(
          startDate,
          endDate,
          isLeave,
        );

        return {
          id: String(s._id),
          title: getManagerEventTitle(emp, s),
          shiftLabel,
          employeeShortName: shortName(emp),
          start: startDate,
          end: endDate,
          allDay: Boolean(leaveDurationLabel),
          leaveDurationLabel,
          resourceId: emp._id,
          leaveRequestId: s.leaveRequestId || null,
          isLeave,
        };
      }),
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
    [events, selectedEmployeeId],
  );

  const hasVisibleAllDayEvents = useMemo(() => {
    if (view === Views.MONTH) return false;

    const bounds = getCalendarRangeBounds(date, view);
    return visibleEvents.some(
      (event) => event.allDay && eventIntersectsRange(event, bounds),
    );
  }, [date, view, visibleEvents]);

  // ─── Sélection d’un créneau ────────────────────────────────────────────────
  function handleSelectSlot(slotInfo) {
    if (selectedEmployeeId) {
      setModalData({
        employeeId: selectedEmployeeId,
        start: slotInfo.start,
        end: slotInfo.end,
        title: "",
        isLeave: false,
        isFullDayLeave: false,
      });
      setModalOpen(true);
      return;
    }

    setModalData({
      employeeId: null,
      start: slotInfo.start,
      end: slotInfo.end,
      title: "",
      isLeave: false,
      isFullDayLeave: false,
    });
    setModalEmployeeQuery("");
    setModalOpen(true);
  }

  // ✅ AJOUT MANUEL via bouton "+"
  function openManualAdd() {
    setModalData({
      employeeId: selectedEmployeeId || null,
      start: null,
      end: null,
      title: "",
      isLeave: false,
      isFullDayLeave: false,
    });
    setModalEmployeeQuery("");
    setModalOpen(true);
  }

  // ─── Valider l’ajout de shift ──────────────────────────────────────────────
  async function handleConfirmShift() {
    const { employeeId, start, end, title, isLeave, isFullDayLeave } =
      modalData;
    if (!employeeId) {
      window.alert(
        t("planning:errors.employeeRequired", "Sélectionnez un employé"),
      );
      return;
    }
    if (!restaurantId) {
      window.alert("Restaurant introuvable");
      return;
    }

    if (!start || !end || end <= start) {
      window.alert(
        t(
          "planning:errors.invalidRange",
          "La période sélectionnée est invalide",
        ),
      );
      return;
    }

    const normalizedStart =
      isLeave && isFullDayLeave ? toStartOfDay(start) : new Date(start);
    const normalizedEnd =
      isLeave && isFullDayLeave ? toEndOfDay(end) : new Date(end);
    const safeTitle = isLeave ? "" : canonicalizeShiftTitle(title);

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/shifts`,
        {
          isLeave,
          title: safeTitle,
          start: normalizedStart.toISOString(),
          end: normalizedEnd.toISOString(),
        },
      );

      const updatedShifts = response.data.shifts; // contient les _id
      const updatedRestaurant = { ...restaurantContext.restaurantData };
      updatedRestaurant.employees = updatedRestaurant.employees.map((emp) =>
        emp._id === employeeId ? { ...emp, shifts: updatedShifts } : emp,
      );
      restaurantContext.setRestaurantData(updatedRestaurant);

      const employee = allEmployees.find((e) => e._id === employeeId) || {};
      const updatedEvents = updatedShifts.map((s) => ({
        ...(() => {
          const start = new Date(s.start);
          const end = new Date(s.end);
          const isLeave = isLeaveShiftRecord(s);
          const leaveDurationLabel = getFullDayLeaveLabel(start, end, isLeave);

          return {
            start,
            end,
            allDay: Boolean(leaveDurationLabel),
            leaveDurationLabel,
            isLeave,
          };
        })(),
        id: String(s._id),
        title: getManagerEventTitle(employee, s),
        shiftLabel: getShiftDisplayTitle(s),
        employeeShortName: shortName(employee),
        resourceId: employeeId,
        leaveRequestId: s.leaveRequestId || null,
      }));
      const other = events.filter((ev) => ev.resourceId !== employeeId);
      setEvents([...other, ...updatedEvents]);
    } catch (err) {
      console.error("Erreur ajout shift :", err);
      window.alert(
        t("planning:errors.addFailed", "Impossible d’ajouter le shift"),
      );
    }
    setModalOpen(false);
  }

  function handleCancelShift() {
    setModalOpen(false);
    setModalData({
      employeeId: null,
      start: null,
      end: null,
      title: "",
      isLeave: false,
      isFullDayLeave: false,
    });
    setModalEmployeeQuery("");
  }

  // ─── Clic = modale suppression ─────────────────────────────────────────────
  function handleSelectEvent(event) {
    setDeleteModalData({
      eventId: event.id,
      employeeId: event.resourceId,
      title: event.shiftLabel || event.title.split(" - ")[1],
      start: event.start,
      end: event.end,
      leaveRequestId: event.leaveRequestId || null,
      isLeave: !!event.isLeave,
    });
    setDeleteModalOpen(true);
  }

  // ─── Confirmer suppression ─────────────────────────────────────────────────
  async function handleConfirmDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    const {
      employeeId,
      eventId: shiftId,
      leaveRequestId,
      isLeave,
    } = deleteModalData;

    try {
      if (isLeave && leaveRequestId) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests/${leaveRequestId}`,
          { status: "canceled" },
        );

        const updated = { ...restaurantContext.restaurantData };
        updated.employees = updated.employees.map((e) => {
          if (e._id !== employeeId) return e;
          return {
            ...e,
            leaveRequests: (e.leaveRequests || []).map((r) =>
              String(r._id) === String(leaveRequestId)
                ? { ...r, status: "canceled" }
                : r,
            ),
            shifts: (e.shifts || []).filter(
              (s) => String(s.leaveRequestId) !== String(leaveRequestId),
            ),
          };
        });
        restaurantContext.setRestaurantData(updated);
      } else {
        await axios.delete(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/shifts/${shiftId}`,
        );

        const updated = { ...restaurantContext.restaurantData };
        updated.employees = updated.employees.map((e) => {
          if (e._id !== employeeId) return e;
          return {
            ...e,
            shifts: (e.shifts || []).filter(
              (s) => String(s._id) !== String(shiftId),
            ),
          };
        });
        restaurantContext.setRestaurantData(updated);
      }

      setEvents((prev) =>
        prev.filter((ev) => String(ev.id) !== String(shiftId)),
      );
    } catch (err) {
      console.error("Erreur suppression shift / annulation congé :", err);
      window.alert(
        t(
          "planning:errors.deleteFailed",
          "Impossible de supprimer le shift / annuler le congé",
        ),
      );
    } finally {
      setIsDeleting(false);
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

  async function handlePlanningExport(payload) {
    if (!restaurantId) return;

    setIsPlanningExportLoading(true);
    setPlanningExportError("");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/planning/export/pdf`,
        payload,
        {
          ...getAuthConfig(),
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `planning-salaries-${payload.from}-au-${payload.to}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setIsPlanningExportOpen(false);
    } catch (error) {
      console.error("Erreur export planning salariés :", error);
      setPlanningExportError(
        error?.response?.data?.message ||
          "Impossible de générer l'export planning pour le moment.",
      );
    } finally {
      setIsPlanningExportLoading(false);
    }
  }

  const CustomEvent = ({ event }) => {
    const timeLabel = formatEventTimeRange(event.start, event.end);
    const compactLabel = selectedEmployeeId
      ? event.shiftLabel || event.employeeShortName || ""
      : [event.employeeShortName, event.shiftLabel].filter(Boolean).join(" · ");
    const tooltip = event.allDay
      ? event.title
      : event.title
        ? `${event.title} : ${timeLabel}`
        : timeLabel;

    if (event.allDay) {
      return (
        <div
          className="truncate text-[11px] font-medium leading-tight"
          title={tooltip}
        >
          {event.title}
        </div>
      );
    }

    const useCompactLayout = isMobile || view === Views.DAY;

    if (useCompactLayout) {
      return (
        <div
          className="flex h-full flex-col justify-start overflow-hidden whitespace-normal leading-[1.05]"
          title={tooltip}
        >
          {compactLabel ? (
            <span className="truncate text-[11px] font-medium opacity-95">
              {compactLabel}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className="flex h-full flex-col justify-start overflow-hidden whitespace-normal leading-tight"
        title={tooltip}
      >
        {event.title ? (
          <span className="truncate text-[11px] font-medium opacity-95">
            {event.title}
          </span>
        ) : null}
      </div>
    );
  };

  // ─── Toolbar mobile compacte ────────────────────────────────────────────────
  const today = new Date();
  const isToday =
    date && today.toDateString && date.toDateString() === today.toDateString();

  const rangeLabel = useMemo(() => {
    if (!date) return "";
    if (view === Views.DAY)
      return format(date, "EEE dd MMM yyyy", { locale: frLocale });
    if (view === Views.MONTH)
      return format(date, "MMMM yyyy", { locale: frLocale });

    const start = startOfWeek(date, { locale: frLocale, weekStartsOn: 1 });
    const end = addDays(start, 6);
    const left = format(start, "dd MMM", { locale: frLocale });
    const right = format(end, "dd MMM yyyy", { locale: frLocale });
    return `${left} – ${right}`;
  }, [date, view]);

  const exportDateRange = useMemo(() => {
    if (!date) {
      const now = new Date();
      return {
        from: toInputDate(now),
        to: toInputDate(now),
      };
    }

    if (view === Views.DAY) {
      return {
        from: toInputDate(date),
        to: toInputDate(date),
      };
    }

    if (view === Views.MONTH) {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      return {
        from: toInputDate(start),
        to: toInputDate(end),
      };
    }

    const start = startOfWeek(date, { locale: frLocale, weekStartsOn: 1 });
    const end = addDays(start, 6);

    return {
      from: toInputDate(start),
      to: toInputDate(end),
    };
  }, [date, view]);

  const goToday = () => setDate(new Date());

  const goPrev = () => {
    if (view === Views.MONTH)
      setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (view === Views.DAY)
      setDate((d) => new Date(d.getTime() - 24 * 60 * 60 * 1000));
    else setDate((d) => new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000));
  };

  const goNext = () => {
    if (view === Views.MONTH)
      setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (view === Views.DAY)
      setDate((d) => new Date(d.getTime() + 24 * 60 * 60 * 1000));
    else setDate((d) => new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000));
  };

  // ─── Search UI ─────────────────────────────────────────────────────────────
  const searchRef = useRef(null);
  const clearSearch = () => {
    setSearchTerm("");
    searchRef.current?.focus?.();
  };

  function dateToLocalInputValue(d) {
    if (!d) return "";
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  function dateToLocalDateInputValue(d) {
    if (!d) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function localInputValueToDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function localDateInputValueToDate(v, boundary = "start") {
    if (!v) return null;
    const [year, month, day] = String(v)
      .split("-")
      .map((value) => Number(value));
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    if (boundary === "end") {
      date.setHours(23, 59, 0, 0);
    }
    return date;
  }

  // ─── Hauteur calendrier : évite le “gros blanc” ─────────────────────────────
  const calendarHeight = isMobile ? "calc(100vh - 160px)" : "75vh";

  return (
    <section
      className={`${isMobile ? "gm-mobile-planning " : ""}gm-show-allday-calendar ${
        hasVisibleAllDayEvents ? "gm-has-allday-events" : ""
      } flex flex-col gap-4 min-w-0`}
    >
      {/* ================= Header ================= */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-2">
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

        {/* ✅ Actions desktop/tablette */}
        <div className="hidden midTablet:flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPlanningExportError("");
              setIsPlanningExportOpen(true);
            }}
            className="
      inline-flex items-center gap-2
      rounded-2xl border border-darkBlue/10 bg-white/70
      px-4 py-2 text-sm font-semibold text-darkBlue
      hover:bg-darkBlue/5 transition
    "
          >
            <span className="inline-flex items-center justify-center size-9 rounded-full bg-blue/15 text-blue">
              <Download className="size-4" />
            </span>
            <span className="whitespace-nowrap">Exporter le planning</span>
          </button>

          {/* + Ajouter un créneau (ouvre ta modale) */}
          <button
            type="button"
            onClick={openManualAdd}
            className="
      inline-flex items-center gap-2
      rounded-2xl bg-white text-blue
      px-4 py-2 text-sm font-semibold border border-blue
      shadow-sm hover:bg-darkBlue/5 active:scale-[0.98] transition
    "
            aria-label={t("planning:buttons.addShift", "Ajouter un créneau")}
            title={t("planning:buttons.addShift", "Ajouter un créneau")}
          >
            <span className="inline-flex items-center justify-center size-9 rounded-full bg-blue/15">
              <Plus className="size-4" />
            </span>
            <span className="whitespace-nowrap">
              {t("planning:buttons.addShift", "Ajouter un créneau")}
            </span>
          </button>

          {/* Demandes de congés */}
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/employees/planning/days-off")
            }
            className="
      inline-flex items-center gap-2
      rounded-2xl border border-darkBlue/10 bg-white/70
      px-4 py-2 text-sm font-semibold text-darkBlue
      hover:bg-darkBlue/5 transition
    "
          >
            <span className="inline-flex items-center justify-center size-9 rounded-full bg-violet text-white">
              <CalendarDays className="size-4" />
            </span>
            <span className="whitespace-nowrap">{t("titles.daysOff")}</span>
          </button>
        </div>

        <div className="flex w-full items-stretch gap-2 midTablet:hidden">
          <button
            type="button"
            onClick={() => {
              setPlanningExportError("");
              setIsPlanningExportOpen(true);
            }}
            className="
      inline-flex flex-1 min-w-0 items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70
      px-3 py-3 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5
    "
            aria-label="Exporter le planning"
            title="Exporter le planning"
          >
            <span className="inline-flex items-center justify-center size-9 rounded-full bg-blue/15 text-blue shrink-0">
              <Download className="size-4" />
            </span>
            <span className="truncate">Exporter</span>
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/employees/planning/days-off")
            }
            className="
      inline-flex flex-1 min-w-0 items-center gap-2
      rounded-2xl border border-darkBlue/10 bg-white/70
      px-3 py-3 text-sm font-semibold text-darkBlue
      hover:bg-darkBlue/5 transition
    "
          >
            <span className="inline-flex items-center justify-center size-9 rounded-full bg-violet text-white shrink-0">
              <CalendarDays className="size-4" />
            </span>
            <span className="truncate">{t("titles.daysOff")}</span>
          </button>
        </div>
      </div>

      {/* ================= Search ================= */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
        <input
          ref={searchRef}
          type="text"
          inputMode="search"
          placeholder={t(
            "planning:placeholders.searchEmployee",
            "Rechercher un employé",
          )}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${
            searchTerm ? "pr-12" : "pr-4"
          } pl-9 text-base`}
        />
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-9 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
            aria-label={t("buttons.clear", "Effacer")}
            title={t("buttons.clear", "Effacer")}
          >
            <X className="size-4 text-darkBlue/60" />
          </button>
        )}
      </div>

      {/* ================= Employees selector ================= */}
      <div className="midTablet:hidden">
        <div className="flex items-center gap-2">
          {/* Liste scrollable */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex gap-2 py-1 px-px">
              {employees.map((emp) => {
                const active = selectedEmployeeId === emp._id;

                return (
                  <button
                    key={emp._id}
                    type="button"
                    onClick={() =>
                      setSelectedEmployeeId((prev) =>
                        prev === emp._id ? null : emp._id,
                      )
                    }
                    className={`
        shrink-0 p-0 bg-transparent
        rounded-xl transition
        ${active ? "ring-2 ring-blue" : "ring-1 ring-darkBlue/10"}
      `}
                    aria-pressed={active}
                  >
                    <CardEmployeesComponent
                      employee={emp}
                      planning={true}
                      restaurantId={restaurantId}
                      planningCompact={true}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bouton + fixe (ne scrolle pas) */}
          <button
            type="button"
            onClick={openManualAdd}
            className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-2xl bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
            aria-label={t("planning:buttons.addShift", "Ajouter un créneau")}
            title={t("planning:buttons.addShift", "Ajouter un créneau")}
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>

      {/* Desktop : cards */}
      <div className="hidden midTablet:block overflow-x-auto">
        <ul className="flex gap-4 pt-2">
          {employees.map((emp) => (
            <li key={emp._id} className="min-w-[200px]">
              <div
                onClick={() =>
                  setSelectedEmployeeId((prev) =>
                    prev === emp._id ? null : emp._id,
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

      {/* ================= Calendar toolbar compact ================= */}
      <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
        {/* Ligne 1 : prev + date (tap=goToday) + plus + next */}
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
            aria-label={t("calendar.today", "Aller à aujourd’hui")}
            title={t("calendar.today", "Aller à aujourd’hui")}
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

        {/* Ligne 2 : Segmented control */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView(Views.WEEK)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              view === Views.WEEK
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.week", "Semaine")}
          </button>
          <button
            type="button"
            onClick={() => setView(Views.DAY)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              view === Views.DAY
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.day", "Jour")}
          </button>
          <button
            type="button"
            onClick={() => setView(Views.MONTH)}
            className={`flex-1 h-11 rounded-2xl border border-darkBlue/10 font-semibold text-sm transition ${
              view === Views.MONTH
                ? "bg-blue text-white"
                : "bg-white/70 text-darkBlue hover:bg-darkBlue/5"
            }`}
          >
            {t("calendar.month", "Mois")}
          </button>
        </div>
      </div>

      {/* ================= Calendar ================= */}
      <div className="rounded-3xl border border-darkBlue/10 bg-white/70 overflow-hidden">
        <div className="overflow-x-auto">
          <div
            style={{ height: calendarHeight, minHeight: isMobile ? 420 : 520 }}
          >
            <DnDCalendar
              date={date}
              onNavigate={(d) => setDate(d)}
              view={view}
              onView={(v) => setView(v)}
              components={{ event: CustomEvent, toolbar: () => null }}
              showMultiDayTimes
              localizer={localizer}
              culture="fr"
              events={visibleEvents}
              defaultView={Views.MONTH}
              views={[Views.WEEK, Views.DAY, Views.MONTH]}
              step={30}
              timeslots={2}
              defaultDate={new Date()}
              selectable="ignoreEvents"
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              draggableAccessor={() => false}
              eventPropGetter={(event) => {
                const isLeave = event.isLeave;
                const compactEvent = isMobile || view === Views.DAY;
                return {
                  style: {
                    backgroundColor: isLeave
                      ? "#FFD19C"
                      : employeeColorMap[event.resourceId],
                    border: `1px solid ${
                      isLeave ? "#FDBA74" : "rgba(255,255,255,0.9)"
                    }`,
                    borderRadius: compactEvent ? 10 : 12,
                    outline: "none",
                    fontSize: compactEvent ? 11 : 12,
                    padding: compactEvent ? "3px 5px" : "2px 6px",
                    lineHeight: 1.05,
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
                timeGutterFormat: (d) =>
                  format(d, "HH:mm", { locale: frLocale }),
                weekdayFormat: (d) =>
                  format(d, "EEE dd/MM", { locale: frLocale }),
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${format(start, "dd MMM", { locale: frLocale })} – ${format(
                    end,
                    "dd MMM yyyy",
                    { locale: frLocale },
                  )}`,
                dayHeaderFormat: (d) =>
                  format(d, "EEEE dd MMMM yyyy", { locale: frLocale }),
                eventTimeRangeFormat: ({ start, end }) =>
                  `${format(start, "HH:mm", { locale: frLocale })} – ${format(
                    end,
                    "HH:mm",
                    { locale: frLocale },
                  )}`,
              }}
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        </div>
      </div>

      {/* ─── Modale Ajout Shift (inchangée) ───────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
          />

          <div
            className="
              relative w-full max-w-[460px]
              rounded-2xl border border-darkBlue/10 bg-white/95
              px-5 py-6 tablet:px-7 tablet:py-7
              shadow-[0_22px_55px_rgba(19,30,54,0.20)]
              flex flex-col gap-5
            "
          >
            {modalData.employeeId ? (
              <h2 className="text-lg tablet:text-xl font-semibold text-center text-darkBlue">
                {(() => {
                  const emp = allEmployees.find(
                    (e) => e._id === modalData.employeeId,
                  );
                  return emp ? `${emp.firstname} ${emp.lastname}` : "";
                })()}
              </h2>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="block text-md font-medium text-center text-darkBlue">
                  {t("planning:labels.chooseEmployee", "Choisir un employé")}
                </label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={modalEmployeeQuery}
                    onChange={(e) => setModalEmployeeQuery(e.target.value)}
                    placeholder={t(
                      "planning:placeholders.searchEmployee",
                      "Rechercher un employé",
                    )}
                    className="
                      w-full h-10 rounded-lg border border-darkBlue/20 bg-white/90
                      px-3 text-base outline-none
                      placeholder:text-darkBlue/40
                      focus:border-darkBlue/50 focus:ring-1 focus:ring-darkBlue/20
                      transition
                    "
                  />
                  {modalEmployeeQuery.trim() && (
                    <ul
                      className="
                        absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto
                        rounded-xl border border-darkBlue/10 bg-white
                        shadow-[0_14px_35px_rgba(15,23,42,0.18)]
                        text-sm z-20
                      "
                    >
                      {modalEmployeeOptions.length === 0 && (
                        <li className="px-3 py-2 text-xs text-darkBlue/60 italic">
                          {t("planning:labels.noResult", "Aucun résultat")}
                        </li>
                      )}
                      {modalEmployeeOptions.map((emp) => (
                        <li
                          key={emp._id}
                          className={`
                            px-3 py-[6px] cursor-pointer
                            hover:bg-lightGrey/80
                            ${
                              modalData.employeeId === emp._id
                                ? "bg-lightGrey"
                                : ""
                            }
                          `}
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

            <div className="flex flex-col gap-3 rounded-2xl border border-darkBlue/10 bg-lightGrey/55 px-4 py-3">
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalData.isLeave}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setModalData((prev) => ({
                      ...prev,
                      isLeave: checked,
                      isFullDayLeave: checked ? prev.isFullDayLeave : false,
                      title: checked ? "" : prev.title,
                    }));
                  }}
                  className="h-4 w-4 rounded border-darkBlue/20 text-blue focus:ring-blue/30"
                />
                <span className="text-sm font-medium text-darkBlue">
                  {t("planning:labels.leave", "Congés")}
                </span>
              </label>

              {modalData.isLeave && (
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalData.isFullDayLeave}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setModalData((prev) => {
                        const next = {
                          ...prev,
                          isFullDayLeave: checked,
                        };

                        if (checked) {
                          next.start = prev.start
                            ? toStartOfDay(prev.start)
                            : prev.start;
                          if (prev.end) {
                            next.end = toEndOfDay(prev.end);
                          } else if (prev.start) {
                            next.end = toEndOfDay(prev.start);
                          }
                        }

                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-darkBlue/20 text-blue focus:ring-blue/30"
                  />
                  <span className="text-sm text-darkBlue/80">
                    {t("planning:labels.fullDayLeave", "Journée entière")}
                  </span>
                </label>
              )}
            </div>

            <div className="grid gap-2">
              <p className="text-sm text-center text-darkBlue/80">
                {modalData.isLeave
                  ? t("planning:labels.leavePeriod", "Période :")
                  : t("planning:labels.slot", "Créneau :")}
              </p>

              <div className="grid grid-cols-1 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-darkBlue/60">
                    {t("planning:labels.start", "Début")}
                  </label>
                  <input
                    type={
                      modalData.isLeave && modalData.isFullDayLeave
                        ? "date"
                        : "datetime-local"
                    }
                    value={
                      modalData.isLeave && modalData.isFullDayLeave
                        ? dateToLocalDateInputValue(modalData.start)
                        : dateToLocalInputValue(modalData.start)
                    }
                    onChange={(e) => {
                      const nextStart =
                        modalData.isLeave && modalData.isFullDayLeave
                          ? localDateInputValueToDate(e.target.value, "start")
                          : localInputValueToDate(e.target.value);
                      setModalData((prev) => {
                        const next = { ...prev, start: nextStart };
                        if (nextStart && (!next.end || next.end <= nextStart)) {
                          next.end =
                            prev.isLeave && prev.isFullDayLeave
                              ? toEndOfDay(nextStart)
                              : new Date(nextStart.getTime() + 60 * 60 * 1000);
                        }
                        return next;
                      });
                    }}
                    className="
          w-full h-11 rounded-lg border border-darkBlue/20 bg-white/95
          px-3 text-base outline-none
          focus:border-darkBlue/50 focus:ring-1 focus:ring-darkBlue/20
          transition
        "
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-darkBlue/60">
                    {t("planning:labels.end", "Fin")}
                  </label>
                  <input
                    type={
                      modalData.isLeave && modalData.isFullDayLeave
                        ? "date"
                        : "datetime-local"
                    }
                    value={
                      modalData.isLeave && modalData.isFullDayLeave
                        ? dateToLocalDateInputValue(modalData.end)
                        : dateToLocalInputValue(modalData.end)
                    }
                    min={
                      modalData.isLeave && modalData.isFullDayLeave
                        ? dateToLocalDateInputValue(modalData.start)
                        : dateToLocalInputValue(modalData.start)
                    }
                    onChange={(e) => {
                      const nextEnd =
                        modalData.isLeave && modalData.isFullDayLeave
                          ? localDateInputValueToDate(e.target.value, "end")
                          : localInputValueToDate(e.target.value);
                      setModalData((prev) => ({ ...prev, end: nextEnd }));
                    }}
                    className="
          w-full h-11 rounded-lg border border-darkBlue/20 bg-white/95
          px-3 text-base outline-none
          focus:border-darkBlue/50 focus:ring-1 focus:ring-darkBlue/20
          transition
        "
                  />
                </div>
              </div>
            </div>

            {!modalData.isLeave && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder={t(
                    "planning:placeholders.shiftTitleOptional",
                    "Titre du shift (facultatif)",
                  )}
                  value={modalData.title}
                  onChange={(e) =>
                    setModalData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="
                    w-full h-10 rounded-lg border border-darkBlue/20 bg-white/95
                    px-3 text-base outline-none
                    placeholder:text-darkBlue/40
                    focus:border-darkBlue/50 focus:ring-1 focus:ring-darkBlue/20
                    transition
                  "
                />
              </div>
            )}

            <div className="mt-2 flex justify-center gap-3">
              <button
                onClick={handleConfirmShift}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-blue px-4 py-2.5
                  text-sm font-medium text-white shadow
                  hover:bg-blue/90 transition
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                disabled={
                  !modalData.start ||
                  !modalData.end ||
                  (modalData.end &&
                    modalData.start &&
                    modalData.end <= modalData.start) ||
                  (!modalData.employeeId && !selectedEmployeeId)
                }
              >
                {t("buttons.confirm", "Valider")}
              </button>
              <button
                onClick={handleCancelShift}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-red px-4 py-2.5
                  text-sm font-medium text-white shadow
                  hover:bg-red/90 transition
                "
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modale Suppression Shift (inchangée) ─────────────────────────────── */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div
            onClick={() => {
              if (isDeleting) return;
              handleCancelDelete();
            }}
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
          />

          <div
            className="
              relative w-full max-w-[420px]
              rounded-2xl border border-darkBlue/10 bg-white/95
              px-5 py-6 tablet:px-7 tablet:py-7
              shadow-[0_22px_55px_rgba(19,30,54,0.20)]
              flex flex-col gap-5
            "
          >
            <h2 className="text-lg tablet:text-xl font-semibold text-center text-darkBlue">
              {(() => {
                const emp = allEmployees.find(
                  (e) => e._id === deleteModalData.employeeId,
                );
                return emp ? `${emp.firstname} ${emp.lastname}` : "";
              })()}
            </h2>

            <div className="text-sm text-center text-darkBlue/80 flex flex-col gap-2">
              <p>
                {t("planning:labels.deleteShift", "Supprimer ce shift")} :{" "}
                <span className="font-medium text-darkBlue">
                  {deleteModalData?.title}
                </span>
              </p>

              <p className="mt-1">
                <strong className="text-darkBlue">
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
                      return format(deleteModalData.start, "EEEE dd MMM yyyy", {
                        locale: frLocale,
                      });
                    } else if (!sameDay) {
                      return `${format(
                        deleteModalData.start,
                        "EEEE dd MMM yyyy",
                        { locale: frLocale },
                      )} – ${format(deleteModalData.end, "EEEE dd MMM yyyy", {
                        locale: frLocale,
                      })}`;
                    } else {
                      return `${format(
                        deleteModalData.start,
                        "EEEE dd MMM yyyy HH:mm",
                        { locale: frLocale },
                      )} – ${format(deleteModalData.end, "HH:mm", {
                        locale: frLocale,
                      })}`;
                    }
                  })()}
                </strong>
              </p>
            </div>

            <div className="mt-2 flex justify-center gap-3">
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-red px-4 py-2.5
                  text-sm font-medium text-white shadow
                  hover:bg-red/90 transition
                "
              >
                {t("buttons.delete", "Supprimer")}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-darkBlue/10 px-4 py-2.5
                  text-sm font-medium text-darkBlue shadow-sm
                  hover:bg-darkBlue/15 transition
                "
              >
                {t("buttons.cancel", "Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportRangeModalComponent
        open={isPlanningExportOpen}
        title="Exporter le planning salariés"
        description="Choisissez une période et les salariés à inclure dans le PDF planning."
        confirmLabel="Exporter le planning"
        employees={exportEmployees}
        initialFrom={exportDateRange.from}
        initialTo={exportDateRange.to}
        loading={isPlanningExportLoading}
        submitError={planningExportError}
        onClose={() => {
          if (isPlanningExportLoading) return;
          setIsPlanningExportOpen(false);
          setPlanningExportError("");
        }}
        onConfirm={handlePlanningExport}
      />
    </section>
  );
}
