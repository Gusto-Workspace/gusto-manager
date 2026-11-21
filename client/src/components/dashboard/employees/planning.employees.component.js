import { useState, useMemo, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import ExportRangeModalComponent from "./export-range-modal.component";
import { PlanningGrid, PlanningToolbar } from "./planning-grid.employees.component";
import { PlanningCommands, usePlanningCommands } from "./planning-commands.employees.component";
import { visiblePlanningEmployees } from "./planning-actions.utils.mjs";
import {
  PlanningLockDialog, PlanningPublicationDialog, usePlanningPeriodState,
} from "./planning-publication.employees.component";
import axios from "axios";
import { getAuthConfig } from "../time-clock/time-clock.utils";
import { X } from "lucide-react";
import ShiftEditor, { shiftEditorTitle, useShiftEditorLabels } from "./shift-editor.employees.component";
import PlanningShiftTemplates from "./planning-shift-templates.employees.component";
import {
  findDraftConflict,
  defaultShiftRepeat,
  getShiftBatch,
  getShiftDraftRange,
  makeExtraShift,
  makeShiftDraft,
  planningShiftCollection,
  savePlanningShift,
  savePlanningShiftBatch,
  updatePlanningEmployee,
  validateShiftDraft,
} from "./shift-editor.utils.mjs";
import {
  buildPlanningGrid, getPlanningEmployees, getPlanningPeriod, isLeaveShiftRecord, publicationRanges,
  movePlanningDate, normalizePlanningText, parisPlanningDateKey, parsePlanningDate,
  plannedShiftMinutes, planningDateKey, restorePlanningConsultation, PLANNING_GROUPS, PLANNING_TIME_ZONE, PLANNING_VIEWS,
} from "./planning-grid.utils.mjs";
import styles from "./planning-grid.module.scss";

const CONSULTATION_KEY = "gusto:employees:planning";
const formatConflictDateTime = (value) => {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short", timeStyle: "short", timeZone: PLANNING_TIME_ZONE,
  }).format(date);
};

const formatConflictRange = (start, end) => {
  const parsedStart = start instanceof Date ? start : new Date(start);
  const parsedEnd = end instanceof Date ? end : new Date(end);

  if (
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    return "";
  }

  return `du ${formatConflictDateTime(parsedStart)} au ${formatConflictDateTime(
    parsedEnd,
  )}`;
};

function getShiftMinutesWithinPeriod(startValue, endValue, bounds, breakMinutes) {
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (
    !bounds ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return 0;
  }

  return start < bounds.endInstant && end > bounds.startInstant
    ? plannedShiftMinutes(start, end, breakMinutes)
    : 0;
}

function formatPlannedHours(minutes) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(Number(minutes || 0) / 60);
}

function PlanningDialog({ label, onClose, behind = false, wide = false, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!behind && !panel.current?.contains(document.activeElement)) {
      panel.current?.focus({ preventScroll: true });
    }
  }, [behind]);

  function handleKeyDown(event) {
    if (event.key === "Escape" && onClose) {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = [...panel.current.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")].filter(
      (node) => node.tabIndex >= 0 && node.getClientRects().length,
    );
    const [first] = controls;
    const last = controls.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    const focused = document.activeElement;
    if (focused === panel.current || !panel.current.contains(focused) || (event.shiftKey ? focused === first : focused === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center px-3 py-3" aria-hidden={behind || undefined}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal={behind ? undefined : true} aria-label={label} tabIndex={-1} onKeyDown={handleKeyDown}
        className={`relative flex max-h-full w-full flex-col rounded-2xl border border-darkBlue/10 bg-white shadow-[0_22px_55px_rgba(19,30,54,0.20)] outline-none ${
          wide
            ? "max-w-[620px] overflow-hidden"
            : "max-w-[460px] gap-5 overflow-y-auto px-5 py-6 tablet:px-7 tablet:py-7"
        }`}>
        {children}
      </div>
    </div>
  );
}

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { label: editorLabel } = useShiftEditorLabels();
  const { restaurantContext } = useContext(GlobalContext);
  const { restaurantData, setRestaurantData, userConnected, planningRevision, planningStateRevision } = restaurantContext;
  const router = useRouter();

  // 🔥 FIX iOS : désactive le hack global uniquement sur cette page
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.classList.add("gm-disable-ios-scroll-hack");
    return () => html.classList.remove("gm-disable-ios-scroll-hack");
  }, []);

  const restaurantId = restaurantData?._id;
  const roster = restaurantData?.employees;
  const openingHours = restaurantData?.opening_hours || [];

  const [consultation, setConsultation] = useState(() => restorePlanningConsultation(null, restaurantId));
  const [consultationReady, setConsultationReady] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState(null);
  const { date, view, group, query: searchTerm } = consultation;
  const updateConsultation = (patch) => setConsultation((previous) => ({ ...previous, ...patch }));

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(CONSULTATION_KEY));
      setConsultation(restorePlanningConsultation(saved, restaurantId));
    } catch {
      // The schedule also works when session storage is unavailable.
    }
    setConsultationReady(true);
  }, [restaurantId]);

  const { employeeId: requestedEmployeeId, restaurantId: requestedRestaurantId } = router.query;
  const linkedEmployeeId = requestedRestaurantId === String(restaurantId) &&
    typeof requestedEmployeeId === "string" &&
    roster?.some((employee) => String(employee._id) === requestedEmployeeId) ? requestedEmployeeId : null;
  useEffect(() => {
    setEmployeeFilter(linkedEmployeeId);
    if (linkedEmployeeId) setConsultation((previous) => ({ ...previous, query: "" }));
  }, [linkedEmployeeId]);

  useEffect(() => {
    if (!consultationReady || !restaurantId) return;
    try {
      window.sessionStorage.setItem(CONSULTATION_KEY, JSON.stringify({
        ...consultation, date: planningDateKey(consultation.date), restaurantId: String(restaurantId),
      }));
    } catch {
      // Navigation remains usable without persistence.
    }
  }, [consultation, consultationReady, restaurantId]);

  const period = useMemo(() => getPlanningPeriod(date, view), [date, view]);
  const [shiftOperation, setShiftOperation] = useState(null);
  const shiftOperationPending = useRef(false);
  const [isPlanningExportOpen, setIsPlanningExportOpen] = useState(false);
  const [isPlanningExportLoading, setIsPlanningExportLoading] = useState(false);
  const [planningExportError, setPlanningExportError] = useState("");
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [lockRange, setLockRange] = useState(null);
  const [periodRevision, setPeriodRevision] = useState(0);
  const refreshPeriod = () => setPeriodRevision((previous) => previous + 1);
  const [showCounters, setShowCounters] = useState(false);
  const [planningCounters, setPlanningCounters] = useState(null);
  const [planningTargets, setPlanningTargets] = useState(null);

  const initialDraft = useRef(null);
  const [editorDraft, setDraft] = useState(null);
  const draft = editorDraft?.restaurantId === restaurantId ? editorDraft : null;
  const [extra, setExtra] = useState([]);
  const [repeat, setRepeat] = useState(defaultShiftRepeat);
  const [fileBusy, setFileBusy] = useState(false);
  const batchRequests = useRef(new Map());
  const nextBlockKey = useRef(0);
  const [submitError, setSubmitError] = useState("");
  const [shiftConflict, setShiftConflict] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const allEmployees = useMemo(
    () => getPlanningEmployees(roster, restaurantId),
    [roster, restaurantId],
  );
  const selectedEmployeeId = allEmployees.some((employee) => String(employee._id) === employeeFilter)
    ? employeeFilter : null;
  const exportEmployees = useMemo(
    () =>
      allEmployees.map((employee) => ({
        id: employee._id,
        label: `${employee.firstname || ""} ${employee.lastname || ""}`.trim(),
        subtitle: employee.post || "Poste non renseigné",
      })),
    [allEmployees],
  );

  const editorEmployee = draft && allEmployees.find(
    (employee) => String(employee._id) === String(draft.employeeId),
  );
  const draftRange = useMemo(() => draft ? getShiftDraftRange(draft) : null, [draft]);
  const batch = useMemo(() => draft && !draft.isLeave && !draft.shiftId
    ? getShiftBatch(draft, extra, repeat) : null, [draft, extra, repeat]);
  const draftValidation = draft && (
    editorEmployee ? batch?.error || validateShiftDraft(draft, draftRange) : "employeeRequired"
  );
  const collection = draft && planningShiftCollection(process.env.NEXT_PUBLIC_API_URL, restaurantId, draft.employeeId);
  const draftConflict = useMemo(() => {
    if (!editorEmployee) return null;
    if (!batch?.occurrences) {
      if (draft.shiftId && +draftRange.start === +draft.originalStart && +draftRange.end === +draft.originalEnd) return null;
      return findDraftConflict(editorEmployee.shifts, draft.shiftId, draftRange);
    }
    for (const occurrence of batch.occurrences) {
      const conflict = findDraftConflict(editorEmployee.shifts, null, occurrence.range);
      if (conflict) return { ...conflict, date: occurrence.draft.date };
    }
    return null;
  }, [batch, draft, draftRange, editorEmployee]);
  const posts = useMemo(() => [...new Set(allEmployees.flatMap((employee) => [
    employee.post, ...employee.shifts.map((shift) => shift.position),
  ]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [allEmployees]);

  const contractualOvertimeWarning = useMemo(() => {
    if (!editorEmployee || draft.isLeave || draftRange.error || batch?.error) return null;
    const contractualHours = Number(editorEmployee.employment?.contractualValue || 0);
    const unit = editorEmployee.employment?.contractualUnit;
    if (!Number.isFinite(contractualHours) || contractualHours <= 0 || !["week", "month"].includes(unit)) {
      return null;
    }

    const bounds = getPlanningPeriod(parsePlanningDate(draft.date), unit);
    const existingMinutes = editorEmployee.shifts.reduce(
      (total, shift) =>
        isLeaveShiftRecord(shift) || String(shift._id) === String(draft.shiftId)
          ? total
          : total + getShiftMinutesWithinPeriod(shift.start, shift.end, bounds, shift.breakMinutes),
      0,
    );
    const proposedMinutes = (batch?.occurrences || [{ draft, range: draftRange }]).reduce(
      (total, { draft: block, range }) =>
        total + getShiftMinutesWithinPeriod(range.start, range.end, bounds, Number(block.breakMinutes)), 0,
    );
    const plannedMinutes = existingMinutes + proposedMinutes;
    const contractualMinutes = Math.round(contractualHours * 60);
    if (plannedMinutes <= contractualMinutes) return null;
    return {
      planned: formatPlannedHours(plannedMinutes),
      contractual: formatPlannedHours(contractualMinutes),
      overtime: formatPlannedHours(plannedMinutes - contractualMinutes),
      period: unit,
    };
  }, [batch, draft, draftRange, editorEmployee]);
  // ─── HYDRATATION DES SHIFTS AU MONTAGE ─────────────────────────────────────
  useEffect(() => {
    if (!restaurantId) return;
    const employees = (roster || []).filter((employee) => !Array.isArray(employee.shifts));
    if (!employees.length) return;

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
                return null;
              }),
          ),
        );

        if (canceled || !results.some(Boolean)) return;

        setRestaurantData((prev) => {
          if (!prev || String(prev._id) !== String(restaurantId)) return prev;
          const prevEmployees = prev.employees || [];
          return {
            ...prev,
            employees: prevEmployees.map((emp) => {
              const match = results.find(
                (r) => r && String(r.employeeId) === String(emp._id),
              );
              return match && !Array.isArray(emp.shifts) ? { ...emp, shifts: match.shifts } : emp;
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
  }, [restaurantId, roster, setRestaurantData]);

  const currentEmployee = roster?.find(({ _id }) => String(_id) === String(userConnected?.id));
  const currentProfile = currentEmployee?.restaurantProfiles?.find(
    ({ restaurant }) => String(restaurant?._id ?? restaurant) === String(restaurantId),
  );
  const commands = usePlanningCommands({
    enabled: Boolean(restaurantId && (userConnected?.role === "owner" ||
      (userConnected?.role === "employee" && currentProfile?.options?.employees === true))),
    restaurantId, employees: allEmployees, setRestaurantData, onShiftDeleted: refreshPeriod,
  });
  const filteredEmployees = useMemo(() => {
    const query = normalizePlanningText(searchTerm);
    return visiblePlanningEmployees(allEmployees, commands.hiddenShifts).filter((employee) =>
      (!selectedEmployeeId || String(employee._id) === selectedEmployeeId) &&
      [employee.name, employee.post, ...employee.shifts.map((shift) => shift.position)]
        .some((value) => normalizePlanningText(value ?? "").includes(query)),
    );
  }, [allEmployees, commands.hiddenShifts, searchTerm, selectedEmployeeId]);
  const employeeColors = useMemo(() => new Map(allEmployees.map((employee, index) => [String(employee._id), index])), [allEmployees]);
  const noPost = t("planning:grid.noPost");
  const grid = useMemo(() => buildPlanningGrid(filteredEmployees, period, group, noPost), [filteredEmployees, period, group, noPost]);
  const exportDateRange = {
    from: planningDateKey(period.start),
    to: planningDateKey(period.days.at(-1)),
  };
  const revision = `${periodRevision}:${planningStateRevision}`;
  const { data: publicationState } = usePlanningPeriodState(commands.enabled ? restaurantId : null, exportDateRange, revision);
  const lockedByDate = new Map((publicationState?.days || []).map(({ date, locked }) => [date, locked]));
  useEffect(() => {
    setPublicationOpen(false);
    setLockRange(null);
    setDraft(null);
    setExtra([]);
    setRepeat(defaultShiftRepeat);
    setFileBusy(false);
    setConfirmingDelete(false);
    setShiftConflict(null);
    batchRequests.current.clear();
  }, [restaurantId]);

  function openShiftForm(employeeId, slot, position) {
    if (commands.busy) return;
    setSubmitError("");
    const post = position ?? allEmployees.find((employee) => String(employee._id) === String(employeeId))?.post ?? "";
    initialDraft.current = { ...makeShiftDraft({ employeeId, slot, position: post }), restaurantId };
    setDraft(initialDraft.current);
  }

  function handleSelectEvent(event) {
    setSubmitError("");
    initialDraft.current = { ...makeShiftDraft({ event }), restaurantId };
    setDraft(initialDraft.current);
  }

  function changeShiftDraft(patch) {
    setSubmitError("");
    setDraft((previous) => previous && { ...previous, ...patch });
  }

  function dismissEditor() {
    if (fileBusy || shiftOperationPending.current) return;
    const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft.current) || extra.length > 0 ||
      JSON.stringify(repeat) !== JSON.stringify(defaultShiftRepeat);
    if (!dirty || window.confirm("Abandonner les modifications du créneau ?")) closeEditor();
  }

  function closeEditor() {
    setDraft(null);
    setExtra([]);
    setRepeat(defaultShiftRepeat);
    batchRequests.current.clear();
    setConfirmingDelete(false);
    setShiftConflict(null);
  }

  function applyShiftUpdate(employeeId, update) {
    setRestaurantData((previous) => updatePlanningEmployee(previous, restaurantId, employeeId, update));
  }

  async function handleSaveShift() {
    if (!restaurantId || draftValidation || draft.leaveRequestId || fileBusy || shiftOperationPending.current) return;
    shiftOperationPending.current = true;
    setShiftOperation("save");
    setSubmitError("");
    try {
      const shifts = batch
        ? await savePlanningShiftBatch(axios, collection, batch, batchRequests.current)
        : await savePlanningShift(axios, process.env.NEXT_PUBLIC_API_URL, restaurantId, draft, draftRange);
      applyShiftUpdate(draft.employeeId, (employee) => ({ ...employee, shifts }));
      closeEditor();
    } catch (error) {
      const apiError = error.response?.data;
      if (error.response?.status === 409) {
        setShiftConflict({
          message: apiError?.message || editorLabel("conflictDescription"),
          entry: apiError?.conflict,
          attempted: apiError?.attempted,
        });
      } else {
        setSubmitError(apiError?.message || editorLabel("saveError"));
      }
    } finally {
      shiftOperationPending.current = false;
      setShiftOperation(null);
    }
  }

  async function handleConfirmDelete() {
    if (!restaurantId || !editorEmployee || !draft.shiftId || shiftOperationPending.current) return;
    shiftOperationPending.current = true;
    setShiftOperation("delete");
    setDeleteError("");
    const { employeeId, shiftId, leaveRequestId } = draft;

    try {
      const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}`;
      if (leaveRequestId) {
        const { data } = await axios.put(`${baseUrl}/leave-requests/${leaveRequestId}`, { status: "canceled" });
        applyShiftUpdate(employeeId, (employee) => ({
          ...employee,
          leaveRequests: (employee.leaveRequests || []).map((request) =>
            String(request._id) === String(leaveRequestId) ? { ...request, status: "canceled" } : request,
          ),
          shifts: data.shifts || (employee.shifts || []).filter((shift) => String(shift.leaveRequestId) !== String(leaveRequestId)),
        }));
      } else {
        const { data } = await axios.delete(`${baseUrl}/shifts/${shiftId}`);
        applyShiftUpdate(employeeId, (employee) => ({ ...employee, shifts: data.shifts || [] }));
      }
      closeEditor();
    } catch (error) {
      setDeleteError(error.response?.data?.message || editorLabel("deleteError"));
    } finally {
      shiftOperationPending.current = false;
      setShiftOperation(null);
    }
  }

  async function handlePlanningExport(payload) {
    if (!restaurantId) return;

    setIsPlanningExportLoading(true);
    setPlanningExportError("");

    try {
      const isExcel = payload?.format === "excel";
      const endpoint = isExcel ? "excel" : "pdf";
      const mimeType = isExcel
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
      const extension = isExcel ? "xlsx" : "pdf";
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/planning/export/${endpoint}`,
        payload,
        {
          ...getAuthConfig(),
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `planning-salaries-${payload.from}-au-${payload.to}.${extension}`;
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

  const showCounterControl = commands.enabled && view === PLANNING_VIEWS.WEEK && group === PLANNING_GROUPS.EMPLOYEES;
  const counterRequestKey = `${restaurantId}:${exportDateRange.from}:${exportDateRange.to}`;
  const visibleCounters = planningCounters?.key === counterRequestKey ? planningCounters : null;
  useEffect(() => {
    if (!showCounterControl || !restaurantId) return undefined;
    const controller = new AbortController();
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/reports/planning-targets`, {
      ...getAuthConfig(), signal: controller.signal, params: { from: exportDateRange.from },
    }).then(({ data }) => {
      if (!controller.signal.aborted) setPlanningTargets({ key: counterRequestKey, targets: data.targets });
    }).catch(() => {
      if (!controller.signal.aborted) setPlanningTargets(null);
    });
    return () => controller.abort();
  }, [showCounterControl, restaurantId, exportDateRange.from, counterRequestKey, roster]);
  useEffect(() => {
    if (!showCounterControl || !showCounters || !restaurantId) return undefined;
    const controller = new AbortController();
    setPlanningCounters(null);
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/reports`, {
      ...getAuthConfig(), signal: controller.signal, params: { from: exportDateRange.from, to: exportDateRange.to },
    }).then(({ data }) => {
      if (!controller.signal.aborted) setPlanningCounters({ key: counterRequestKey, rows: Object.fromEntries(data.rows
        .map(({ employee, values }) => [employee.id, { balance: values.counterEnd, annualRemaining: values.annualRemaining }])) });
    }).catch(() => {
      if (!controller.signal.aborted) setPlanningCounters({ key: counterRequestKey, error: true });
    });
    return () => controller.abort();
  }, [showCounterControl, showCounters, restaurantId, exportDateRange.from, exportDateRange.to, counterRequestKey, periodRevision, planningRevision, planningStateRevision]);

  const counterRows = showCounterControl && showCounters ? visibleCounters?.rows : undefined;
  const hasVisibleCounter = counterRows && filteredEmployees.some(({ _id }) => {
    const counter = counterRows[String(_id)];
    return Number.isFinite(counter?.balance) || Number.isFinite(counter?.annualRemaining);
  });

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <PlanningToolbar
        {...{ date, period, view, group, employees: allEmployees }}
        query={searchTerm}
        employeeId={selectedEmployeeId}
        onDate={(selected) => updateConsultation({ date: selected })}
        onStep={(direction) => updateConsultation({ date: movePlanningDate(date, view, direction) })}
        onToday={() => updateConsultation({ date: parsePlanningDate(parisPlanningDateKey(new Date())) })}
        onView={(selected) => updateConsultation({ view: selected })}
        onGroup={(selected) => updateConsultation({ group: selected })}
        onQuery={(query) => updateConsultation({ query })}
        onEmployee={setEmployeeFilter}
        onClear={() => { setEmployeeFilter(null); updateConsultation({ query: "" }); }}
        onBack={() => router.push("/dashboard/employees")}
        onLeaves={() => router.push("/dashboard/employees/planning/days-off")}
        onExport={() => { setPlanningExportError(""); setIsPlanningExportOpen(true); }}
        onPublish={commands.enabled ? () => setPublicationOpen(true) : undefined}
        publicationStatus={publicationState?.status}
        onLockPeriod={publicationState ? () => setLockRange(exportDateRange) : undefined}
        hasPeriodLock={publicationState?.days.some(({ locked }) => locked)}
        counterControl={showCounterControl && <button type="button" aria-pressed={showCounters}
          onClick={() => setShowCounters((value) => !value)} className={styles.control}>{t("planning:counters.toggle")}</button>}
      />
      {showCounterControl && showCounters && !visibleCounters && <p className="px-2 text-sm text-darkBlue/75" role="status">{t("planning:counters.loading")}</p>}
      {showCounterControl && showCounters && visibleCounters?.error && <p className="px-2 text-sm text-red" role="alert">{t("planning:counters.error")}</p>}
      {counterRows && !hasVisibleCounter && <p className="rounded-lg border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/75" role="status">{t("planning:counters.empty")}</p>}
      <PlanningCommands {...{ commands }} employees={allEmployees} Dialog={PlanningDialog} />
      <PlanningGrid
        {...{ view, period, employeeColors, openingHours, commands, group }}
        data={grid}
        targets={planningTargets?.key === counterRequestKey ? planningTargets.targets : undefined}
        counters={counterRows}
        lockedByDate={lockedByDate}
        onLockDay={publicationState ? (date) => setLockRange({ from: date, to: date }) : undefined}
        onDay={(day) => updateConsultation({ date: day, view: PLANNING_VIEWS.DAY })}
        onAdd={openShiftForm}
        onOpen={handleSelectEvent}
      />

      {draft && (
        <PlanningDialog
          wide
          behind={Boolean(shiftConflict || confirmingDelete)}
          label={shiftEditorTitle(editorLabel, draft, editorEmployee, !draft.isLeave && extra.length > 0)}
          onClose={shiftOperation || fileBusy ? undefined : dismissEditor}
        >
          <ShiftEditor
            draft={draft}
            employee={editorEmployee}
            range={draftRange}
            conflict={draftConflict}
            overtime={contractualOvertimeWarning}
            openingHours={openingHours}
            templateTools={commands.enabled && !draft.isLeave && <PlanningShiftTemplates key={restaurantId}
              restaurantId={restaurantId} draft={draft} range={draftRange} onChange={changeShiftDraft} />}
            {...{ posts, collection, extra, repeat, batch, fileBusy }}
            onFileBusy={setFileBusy}
            onExtraChange={(key, patch) => {
              setSubmitError("");
              setExtra((blocks) => blocks.map((block) => block.key === key ? { ...block, ...patch } : block));
            }}
            onAddBlock={() => {
              const key = nextBlockKey.current++;
              setExtra((blocks) => [...blocks, {
                ...makeExtraShift(draft, { ...(blocks.at(-1) || draft), date: draft.date }),
                key,
              }]);
            }}
            onRemoveBlock={(key) => {
              setSubmitError("");
              setExtra((blocks) => blocks.filter((block) => block.key !== key));
            }}
            onRemoveFirstBlock={() => {
              changeShiftDraft({ ...extra[0], date: draft.date });
              setExtra((blocks) => blocks.slice(1));
            }}
            onRepeatChange={(patch) => {
              setSubmitError("");
              setRepeat((rule) => ({ ...rule, ...patch }));
            }}
            validation={draftValidation}
            submitError={submitError}
            saving={Boolean(shiftOperation)}
            onChange={changeShiftDraft}
            onClose={dismissEditor}
            onSave={handleSaveShift}
            onDelete={() => {
              setDeleteError("");
              setConfirmingDelete(true);
            }}
          />
        </PlanningDialog>
      )}

      {draft && shiftConflict && (
        <PlanningDialog label={editorLabel("conflict")} onClose={() => setShiftConflict(null)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-darkBlue">{editorLabel("conflict")}</h2>
              <p className="text-sm text-darkBlue/70">{shiftConflict.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setShiftConflict(null)}
              aria-label={editorLabel("close")}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-darkBlue/15 hover:bg-darkBlue/5"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="rounded-xl border border-darkBlue/10 bg-lightGrey/35 p-4 text-sm">
            <p className="font-semibold">{editorLabel("attempted")}</p>
            <p>{formatConflictRange(shiftConflict.attempted?.start ?? draftRange.start, shiftConflict.attempted?.end ?? draftRange.end)}</p>
          </div>
          {shiftConflict.entry && (
            <div className="rounded-xl border border-orange/20 bg-orange/5 p-4 text-sm">
              <p className="font-semibold">{editorLabel("blockedBy")}</p>
              <p>{shiftConflict.entry.title || editorLabel(shiftConflict.entry.isLeave ? "absence" : "shift")}</p>
              <p>{formatConflictRange(shiftConflict.entry.start, shiftConflict.entry.end)}</p>
            </div>
          )}
          <button
            type="button"
            className="self-end rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue/90"
            onClick={() => setShiftConflict(null)}
          >
            {editorLabel("backToEditor")}
          </button>
        </PlanningDialog>
      )}

      {draft && confirmingDelete && (
        <PlanningDialog
          label={editorLabel(draft.leaveRequestId ? "leaveConfirm" : "deleteConfirm")}
          onClose={shiftOperation ? undefined : () => setConfirmingDelete(false)}
        >
          <h2 className="text-lg font-semibold text-darkBlue">
            {editorLabel(draft.leaveRequestId ? "leaveConfirm" : "deleteConfirm")}
          </h2>
          <div className="text-sm text-darkBlue/80">
            <p className="font-semibold">{editorEmployee?.name}</p>
            <p>{formatConflictRange(draft.originalStart, draft.originalEnd)}</p>
          </div>
          {deleteError && <p className="rounded-lg bg-red/10 p-3 text-sm text-darkBlue" role="alert">{deleteError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-lg border border-darkBlue/15 px-4 py-2.5 text-sm font-semibold" disabled={Boolean(shiftOperation)} onClick={() => setConfirmingDelete(false)}>
              {editorLabel("backToEditor")}
            </button>
            <button type="button" className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={Boolean(shiftOperation) || !editorEmployee} onClick={handleConfirmDelete}>
              {editorLabel(draft.leaveRequestId
                ? shiftOperation ? "leaveCanceling" : "cancelLeave"
                : shiftOperation ? "deleting" : "delete")}
            </button>
          </div>
        </PlanningDialog>
      )}

      <ExportRangeModalComponent
        open={isPlanningExportOpen}
        title="Télécharger le planning des salariés"
        description="Choisissez une période, les salariés à inclure et le format de sortie."
        confirmLabel="Télécharger le planning"
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

      {publicationOpen && commands.enabled && <PlanningPublicationDialog Dialog={PlanningDialog}
        key={restaurantId} {...{ restaurantId, revision }} ranges={publicationRanges(period, view)}
        initialDate={planningDateKey(date)} onClose={() => setPublicationOpen(false)} onChanged={refreshPeriod} />}
      {lockRange && commands.enabled && <PlanningLockDialog Dialog={PlanningDialog} restaurantId={restaurantId}
        range={lockRange} lockedDays={(publicationState?.days || []).filter(({ date }) =>
          date >= lockRange.from && date <= lockRange.to).map(({ locked }) => locked)}
        onClose={() => setLockRange(null)} onChanged={refreshPeriod} />}
    </section>
  );
}
