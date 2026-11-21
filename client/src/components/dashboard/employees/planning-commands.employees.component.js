import { useEffect, useRef, useState } from "react";
import { useTranslation } from "next-i18next";
import axios from "axios";
import { Trash2, X } from "lucide-react";
import english from "../../../../public/locales/en/planning.json";
import french from "../../../../public/locales/fr/planning.json";
import {
  cellShiftEntries, copyDestinations, deletePlanningShift, MAX_PLANNING_ACTION_SHIFTS, reconcilePlanningShift, shiftSource, stepDate,
} from "./planning-actions.utils.mjs";
import { updatePlanningEmployee } from "./shift-editor.utils.mjs";
import { parisPlanningDateKey } from "./planning-grid.utils.mjs";
import styles from "./planning-grid.module.scss";

export function usePlanningCommands({ enabled, restaurantId, employees, setRestaurantData, onShiftDeleted }) {
  const { t, i18n } = useTranslation("planning");
  const actions = i18n.language?.startsWith("en") ? english.actions : french.actions;
  const label = (key, options) => t(`actions.${key}`, { defaultValue: actions[key], ...options });
  const [selection, setSelection] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(null);
  const pending = useRef(false);
  const hiddenIds = useRef(new Set());
  const [hiddenShifts, setHiddenShifts] = useState(() => new Set());
  const [deleteErrors, setDeleteErrors] = useState([]);
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/planning`;

  useEffect(() => {
    if (!selection) return;

    function handleClick(event) {
      if (!event.target.closest?.("[data-planning-selection-control]")) setSelection(null);
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !event.defaultPrevented) setSelection(null);
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selection]);

  function open(next) {
    setError("");
    setRetry(null);
    setDialog(next);
  }

  function selectCell(cell) {
    setSelection(cell.selected ? null : { key: cell.key, events: cell.events });
  }

  async function request(run, onSuccess, onFailure) {
    if (!enabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await run();
      onSuccess(result);
    } catch (err) {
      const response = err.response?.data;
      const employee = employees.find(({ _id }) => String(_id) === response?.employeeId);
      const message = response?.message || label("failed");
      setError(employee ? `${employee.name} · ${message}` : message);
      onFailure?.();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function execute(payload) {
    if (payload.entries && (!payload.entries.length || payload.entries.length > MAX_PLANNING_ACTION_SHIFTS)) {
      setError(label("limit"));
      return;
    }
    const body = { ...payload, requestId: payload.requestId || globalThis.crypto.randomUUID() };
    setRetry(null);
    request(() => axios.post(`${endpoint}/actions`, body), ({ data }) => {
      const byEmployee = new Map(data.updates.map(({ employeeId, shifts }) => [employeeId, shifts]));
      setRestaurantData((old) => String(old?._id) === String(restaurantId) ? {
        ...old,
        employees: old.employees.map((employee) => byEmployee.has(String(employee._id))
          ? { ...employee, shifts: byEmployee.get(String(employee._id)) }
          : employee),
      } : old);
      setSelection(null);
      setDialog(null);
    }, () => setRetry(body));
  }

  function duplicate(events, origin, cells) {
    if (events.length * cells.length > MAX_PLANNING_ACTION_SHIFTS) setError(label("limit"));
    else if (cells.length) execute({ operation: "copy", entries: cellShiftEntries(events, origin, cells) });
  }

  function removeShift(event) {
    if (!enabled || pending.current || event.isLeave) return;
    const employeeId = String(event.resourceId);
    const previousShift = employees.find(({ _id }) => String(_id) === employeeId)?.shifts
      .find(({ _id }) => String(_id) === String(event.id));
    setSelection((current) => current?.events.some(({ id }) => id === event.id) ? null : current);
    void deletePlanningShift(event, hiddenIds.current, {
      onChange: setHiddenShifts,
      send: (entry) => axios.post(`${endpoint}/actions`, {
        operation: "delete", requestId: globalThis.crypto.randomUUID(), entries: [entry],
      }),
      onDeleted: ({ employeeId, shiftId }) => {
        setRestaurantData((previous) => updatePlanningEmployee(previous, restaurantId, employeeId, (employee) =>
          Array.isArray(employee.shifts) ? { ...employee, shifts: employee.shifts.filter(({ _id }) => String(_id) !== String(shiftId)) } : employee,
        ));
        onShiftDeleted();
      },
      onError: (failure) => {
        setDeleteErrors((previous) => [...previous, {
          id: event.id,
          message: [event.title, failure.response?.data?.message || label("failed")].filter(Boolean).join(" · "),
        }]);
        if (failure.response?.status === 409 && previousShift) {
          const shiftsUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/shifts`;
          axios.get(shiftsUrl).then(({ data }) => {
            if (!Array.isArray(data?.shifts)) return;
            setRestaurantData((previous) => updatePlanningEmployee(previous, restaurantId, employeeId, (employee) =>
              reconcilePlanningShift(employee, event.id, previousShift, data.shifts),
            ));
          }).catch(() => {}); // Keep the local rollback and its error when the refresh is unavailable.
        }
      },
    });
  }

  return {
    enabled, label, selection, selectCell, busy, dialog, open, error, retry,
    execute, duplicate, removeShift, hiddenShifts, deleteErrors,
    dismissDeleteErrors: () => setDeleteErrors([]),
  };
}

function DuplicateForm({ commands, employees, events, origin }) {
  const { label, duplicate, open, busy } = commands;
  const [from, setFrom] = useState(stepDate(origin.date, 1));
  const [to, setTo] = useState(from);
  const [ids, setIds] = useState([origin.employeeId]);
  const cells = copyDestinations(origin, ids, from, to, events.length);
  const hasLinkedLeave = events.some(({ leaveRequestId }) => Boolean(leaveRequestId));

  function changeStartDate(event) {
    const date = event.target.value;
    setFrom(date);
    setTo(date);
  }

  return <>
    <div className={styles.commandDates}>
      <label className={styles.commandField}>{label("from")}<input type="date" value={from} onChange={changeStartDate} /></label>
      <label className={styles.commandField}>{label("to")}<input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
    <fieldset className={styles.commandRoster}>
      <legend>{label("targetEmployees")}</legend>
      {employees.map(({ _id, name }) => <label key={_id}>
        <input type="checkbox" checked={ids.includes(String(_id))} onChange={(e) => {
          const id = String(_id);
          setIds(e.target.checked ? [...ids, id] : ids.filter((item) => item !== id));
        }} /> {name}
      </label>)}
    </fieldset>
    <p className={styles.commandHelp}>{cells.length ? label("copyCount", { count: cells.length * events.length }) : label("limit")}</p>
    {hasLinkedLeave && <p className={styles.commandHelp}>{label("linkedLeaveDeletion")}</p>}
    <div className={styles.commandButtons}>
      <button type="button" className={styles.commandDanger} disabled={busy || hasLinkedLeave}
        onClick={() => open({ type: "delete", events })}>
        <Trash2 size={14} aria-hidden="true" />{label("deleteSelection")}
      </button>
      <button disabled={!cells.length || busy} type="button" onClick={() => duplicate(events, origin, cells)}>
        {label("copy")}
      </button>
    </div>
  </>;
}

export function PlanningCommands({ commands, employees, Dialog }) {
  const { enabled, label, busy, dialog, error, retry } = commands;
  if (!enabled) return null;
  const labels = { duplicate: "duplicate", delete: "deleteConfirm" };
  const close = () => commands.open(null);
  const retryButton = retry && <button type="button" disabled={busy} onClick={() => commands.execute(retry)}>{label("retry")}</button>;
  return <>
    {commands.deleteErrors.length > 0 && <div className={styles.commandError} role="alert">
      <div><strong>{label("deleteFailed")}</strong>
        {commands.deleteErrors.map(({ id, message }, index) => <p key={`${id}:${index}`}>{message}</p>)}
      </div>
      <button type="button" onClick={commands.dismissDeleteErrors} aria-label={label("close")}><X size={16} aria-hidden="true" /></button>
    </div>}
    {!dialog && error && <div className={styles.commandError} role="alert">{error}{retryButton}</div>}
    {dialog && <Dialog key={dialog.type} label={label(labels[dialog.type])} onClose={busy ? undefined : close}>
      <header className={styles.commandHeading}>
        <h2>{label(labels[dialog.type])}</h2>
        <button type="button" onClick={close} disabled={busy} aria-label={label("close")}><X size={16} aria-hidden="true" /></button>
      </header>
      {dialog.type === "duplicate" && <DuplicateForm {...{ commands, employees, events: dialog.events, origin: dialog.origin }} />}
      {dialog.type === "delete" && <>
        <p>{label("deleteCount", { count: dialog.events.length })}</p>
        {dialog.events.some(({ isLeave, start, end }) =>
          isLeave && parisPlanningDateKey(start) !== parisPlanningDateKey(new Date(+end - 1)),
        ) && <p className={styles.commandHelp}>{label("multiDayLeaveDeletion")}</p>}
        <div className={styles.commandButtons}>
          <button type="button" disabled={busy} onClick={close}>{label("cancel")}</button>
          <button type="button" disabled={busy} className={styles.commandDanger}
            onClick={() => commands.execute({ operation: "delete", entries: dialog.events.map(shiftSource) })}>{label("delete")}</button>
        </div>
      </>}
      {error && <div className={styles.commandError} role="alert">{error}{retryButton}</div>}
    </Dialog>}
  </>;
}
