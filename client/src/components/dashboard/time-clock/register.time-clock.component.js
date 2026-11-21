import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, History, List, Tablet, Users } from "lucide-react";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import calendarStyles from "./register-calendar.module.scss";
import { ClockCorrectionForm, ClockDialog, ClockPlanningHeading, ClockServiceFilter, control, primary, secondary } from "./register-controls.time-clock.component";
import ClockManagement from "./register-management.time-clock.component";
import ClockExport from "./register-export.time-clock.component";
import ClockSessionEvents from "./register-events.time-clock.component";
import ClockEmployees, { PlannedAbsencesTable } from "./register-employees.time-clock.component";
import ClockServices from "./register-services.time-clock.component";
import { shiftDate as shifted, summarizeServiceReviews } from "./register-employees.utils.mjs";
import {
  dateLabel, hours, name, statusLabel, tableCell, tableFrame, tableHead, tableHeading, tableRow,
} from "./register-presentation.time-clock";
import {
  formatMinutes, getAuthConfig, getTimeClockAnomalyLabel, normalizeSearchText, toLocalDateKey,
  TIME_CLOCK_REFRESH_EVENT, TIME_CLOCK_STORAGE_KEY,
} from "./time-clock.utils";

const tabs = [
  { id: "day", label: "Journée", Icon: List },
  { id: "employees", label: "Employés", Icon: Users },
  { id: "history", label: "Historique", Icon: History },
];
const types = {
  clock_in: "Arrivée", clock_out: "Départ", break_start: "Début de pause", break_end: "Fin de pause",
  adjustment: "Correction", validated: "Validation", reopened: "Réouverture",
  payroll_adjustment: "Correction des heures rémunérées", payroll_reset: "Retour au calcul automatique",
  absence_marked: "Absence constatée", absence_removed: "Absence retirée",
  meal_adjustment: "Correction du nombre de repas",
  note_added: "Note ajoutée",
};
const localDateTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });
const weekDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const weekDay = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" });

function ClockWeek({ date, onChange, showDays = true }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarId = useId();
  const trigger = useRef(null);
  const picker = useRef(null);
  const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
  const first = shifted(date, 1 - weekday);
  const days = Array.from({ length: 7 }, (_, index) => shifted(first, index));
  const today = toLocalDateKey();
  const weekLabel = weekDate.formatRange(new Date(first + "T12:00:00Z"), new Date(days[6] + "T12:00:00Z"));

  useEffect(() => {
    if (!calendarOpen) return;
    const active = picker.current?.querySelector(".react-calendar__tile--active");
    (active || picker.current)?.focus();
    function outside(event) {
      if (!picker.current?.contains(event.target) && !trigger.current?.contains(event.target)) setCalendarOpen(false);
    }
    function escape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setCalendarOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [calendarOpen]);

  function select(next) {
    onChange(next);
    setCalendarOpen(false);
    trigger.current?.focus();
  }

  return (
    <section aria-label={showDays ? "Jours de la semaine" : "Semaine consultée"} className="grid gap-2 rounded-2xl border border-darkBlue/10 bg-white p-2 sm:gap-3 sm:p-3">
      <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-items-center gap-2">
        <button type="button" className={secondary} aria-label="Semaine précédente" onClick={() => onChange(shifted(date, -7))}>
          <ChevronLeft size={18} />
        </button>
        <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={calendarOpen} aria-controls={calendarOpen ? calendarId : undefined}
          onClick={() => setCalendarOpen((open) => !open)}
          className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-xl px-2 text-center text-sm font-semibold text-darkBlue hover:bg-lightGrey focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:gap-2 sm:px-3">
          <CalendarDays size={16} className="hidden shrink-0 sm:block" aria-hidden="true" /> {weekLabel}
          <ChevronDown size={15} className={calendarOpen ? "shrink-0 rotate-180" : "shrink-0"} aria-hidden="true" />
        </button>
        <button type="button" className={secondary} aria-label="Semaine suivante" onClick={() => onChange(shifted(date, 7))}>
          <ChevronRight size={18} />
        </button>
        {calendarOpen && (
          <div ref={picker} id={calendarId} role="dialog" aria-label="Calendrier de la Pointeuse" tabIndex={-1}
            className="absolute left-1/2 top-full mt-2 w-[min(calc(100vw-3rem),23rem)] -translate-x-1/2 rounded-2xl border border-darkBlue/10 bg-white p-3 shadow-[0_16px_40px_rgba(19,30,54,0.18)] sm:p-4">
            <Calendar className={calendarStyles.month} calendarType="iso8601" locale="fr-FR" minDetail="month"
              value={new Date(date + "T12:00:00")} showWeekNumbers showFixedNumberOfWeeks
              prev2Label={null} next2Label={null}
              prevLabel={<ChevronLeft size={17} />} nextLabel={<ChevronRight size={17} />}
              prevAriaLabel="Mois précédent" nextAriaLabel="Mois suivant"
              onClickDay={(day) => select(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`)} />
            <button type="button" onClick={() => select(today)}
              className="mx-auto mt-2 block min-h-10 rounded-xl px-4 text-sm font-semibold text-blue hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
              Aujourd’hui
            </button>
          </div>
        )}
      </div>
      {showDays && <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const selected = day === date;
          return (
            <button type="button" key={day} aria-pressed={selected} aria-current={day === today ? "date" : undefined}
              aria-label={dateLabel(day)} onClick={() => onChange(day)}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${selected
                ? "bg-darkBlue font-bold text-white"
                : day === today ? "bg-blue/10 font-bold text-blue hover:bg-blue/15" : "bg-lightGrey/55 font-semibold hover:bg-lightGrey"}`}>
              <span className="text-[11px] capitalize sm:text-xs">{weekDay.format(new Date(day + "T12:00:00Z"))}</span>
              <span className="text-base tabular-nums">{Number(day.slice(-2))}</span>
            </button>
          );
        })}
      </div>}
    </section>
  );
}

function timestamp(value) {
  return value ? localDateTime.format(new Date(value)) : "—";
}

function ClockHistory({ entries, open }) {
  return <div className={tableFrame}>
    <table className="w-full min-w-[720px]">
      <thead className={tableHeading}><tr>
        {["Date et heure", "Salarié", "Événement", "Auteur", "Source / motif"].map((label) =>
          <th key={label} className={`${tableHead} text-left`} scope="col">{label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-darkBlue/10">{entries.map((entry) => (
        <tr key={`${entry.type}-${entry.id}`} className={`align-top ${tableRow}`}>
          <td className={`${tableCell} whitespace-nowrap`}>{timestamp(entry.at)}</td>
          <td className={tableCell}>{name(entry.employee)}</td>
          <td className={tableCell}><button className="font-semibold text-blue hover:underline" onClick={() => open(entry)}>{types[entry.type] || entry.type}</button></td>
          <td className={tableCell}>{entry.actorName || (entry.actorId === entry.employee.id ? name(entry.employee) : entry.actorRole === "owner" ? "Propriétaire" : entry.actorRole === "employee" ? "Salarié" : "—")}</td>
          <td className={tableCell}>{entry.reason || ({ kiosk: "Tablette", manager: "Dashboard", employee: "Espace salarié" }[entry.source]) || "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

export default function TimeClockRegister({ restaurantId, employees: restaurantEmployees }) {
  const router = useRouter();
  const [view, setView] = useState("day");
  const [dayCategory, setDayCategory] = useState("services");
  const [date, setDate] = useState(() => toLocalDateKey());
  const [from, setFrom] = useState(() => shifted(toLocalDateKey(), -6));
  const [to, setTo] = useState(() => toLocalDateKey());
  const [employee, setEmployee] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogDirty, setDialogDirty] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const root = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock`;
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const preselected = router.query.employeeId;

  useEffect(() => {
    if (typeof preselected === "string") {
      setView("employees");
    }
  }, [preselected]);

  useEffect(() => {
    if (view === "employees") return undefined;
    const controller = new AbortController();
    if (view !== "day" && (!from || !to || to < from || to > shifted(from, 30))) {
      setData(null);
      setError("Sélectionnez une période de 31 jours maximum.");
      return () => controller.abort();
    }
    const params = view === "day" ? { from: date, to: date }
      : { from, to, view: "history", ...(employee && { employeeId: employee }) };
    const requestKey = JSON.stringify(params);
    setError("");
    setData((current) => current?.requestKey === requestKey ? current : null);
    axios.get(`${root}/register`, getAuthConfig({ params, signal: controller.signal }))
      .then(({ data: result }) => {
        if (controller.signal.aborted) return;
        setData({ ...result, requestKey });
        setRoster(result.roster || []);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de charger les pointages.");
      });
    return () => controller.abort();
  }, [date, employee, from, root, to, version, view]);

  useEffect(() => {
    function onStorage(event) { if (event.key === TIME_CLOCK_STORAGE_KEY) refresh(); }
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 45_000);
    window.addEventListener(TIME_CLOCK_REFRESH_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(TIME_CLOCK_REFRESH_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const rows = useMemo(() => (data?.rows || []).flatMap(({ employee: person, days, former }) =>
    days.map((day) => ({ employee: person, day, former }))).filter(({ employee: person }) =>
      normalizeSearchText(`${name(person)} ${person.post}`).includes(normalizeSearchText(search)),
    ), [data?.rows, search]);
  const history = (data?.history || []).filter((entry) =>
    !filter || (filter === "anomalies" ? entry.anomalies?.length > 0 : entry.type === filter));
  const employees = [...new Map([...roster, ...(data?.rows || []).map((row) => row.employee),
    ...(data?.history || []).map((entry) => entry.employee)].map((person) => [person.id, person])).values()]
    .sort((a, b) => name(a).localeCompare(name(b), "fr"));
  const plannedAbsences = rows.flatMap(({ employee: person, day }) =>
    day.shifts.filter((shift) => shift.absence).map((shift) => ({ employee: person, date: day.date, shift })));
  const dayReviews = useMemo(() => summarizeServiceReviews(data?.rows?.flatMap((row) => row.days)), [data?.rows]);

  function changeView(next) {
    if (next === view) return;
    setData(null);
    setSearch("");
    setFilter("");
    if (next === "history") setEmployee("");
    setView(next);
  }

  function jumpToDay(next, person) {
    changeView("day");
    setDayCategory("services");
    setDate(next);
    if (person) setSearch(name(person));
    setDialog(null);
  }

  function canDismiss() {
    return !busy && (!dialogDirty || window.confirm("Abandonner la saisie en cours ?"));
  }
  function dismissEditor() {
    if (canDismiss()) setDialog(null);
  }

  function openDialog(next) {
    setDialogDirty(false);
    setDialogError("");
    setDialog(next);
  }

  function confirmPayroll(person, { label, session, shift, values }) {
    openDialog({ type: "confirm-payroll", label, person, session, shift, values });
  }

  function openSession(person, day, sessionId) {
    openDialog({ type: "day", person, day, sessionId });
  }

  function openNote(person, date, { note, session, paid, shift }) {
    openDialog({ type: "note", person, date, note, session, paid, shift });
  }

  function openAnomalies(person, date, anomalies) {
    openDialog({ type: "anomalies", person, date, anomalies });
  }

  function resetPayroll(person, session) {
    confirmPayroll(person, {
      label: "Revenir au calcul automatique", session,
      values: { reset: true, expectedUpdatedAt: session.updatedAt, expectedRevision: session.revision },
    });
  }

  async function save(path, method, values, message = "") {
    if (busy) return;
    setBusy(true);
    setDialogError("");
    setNotice("");
    try {
      const { data: saved } = await axios({ method, url: `${root}/${path}`, data: values, ...getAuthConfig() });
      setDialog(null);
      setNotice(typeof message === "function" ? message(saved) : message);
      refresh();
    } catch (failure) {
      setDialogError(failure.response?.data?.message || "Enregistrement impossible.");
      if (failure.response?.status === 409) refresh();
    } finally {
      setBusy(false);
    }
  }

  function savePayroll(values) {
    return save(`sessions/${dialog.session.id}/payroll`, "put", values, ({ changed, reopened }) => {
      const mealEdit = values.mealCount !== undefined;
      if (!changed) return "Le service est déjà à jour.";
      const message = mealEdit ? "Modification enregistrée."
        : values.reset ? "Calcul automatique rétabli." : "Horaires rémunérés enregistrés.";
      return reopened ? `${message} Le service est à valider de nouveau.` : message;
    });
  }

  function reviewService(person, date, { session, shift, validated }) {
    if (session) {
      return save(`sessions/${session.id}/review`, "put", {
        validated, expectedUpdatedAt: session.updatedAt ?? undefined, expectedRevision: session.revision,
      });
    }
    return save(`employees/${person.id}/shifts/${shift.id}/attendance`, "put", {
      validated, shiftDate: date, expectedRevision: shift.absenceRevision,
    });
  }

  function reviewPeriod(values) {
    return save("register/review", "post", values);
  }

  function saveNote(event) {
    event.preventDefault();
    const note = new FormData(event.currentTarget).get("note").trim();
    if (!note) {
      setDialogError("Saisissez une note.");
      return;
    }
    const { session, shift, person, date } = dialog;
    if (session) {
      return save(`sessions/${session.id}/notes`, "post", {
        note, expectedRevision: session.revision ?? 0, expectedUpdatedAt: session.updatedAt ?? null,
      });
    }
    return save(`employees/${person.id}/shifts/${shift.id}/attendance`, "put", {
      note, shiftDate: date, expectedRevision: shift.absenceRevision ?? 0,
    });
  }

  function saveInline(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason").trim();
    if (!reason) {
      setDialogError("Renseignez un motif.");
      return;
    }
    const values = { ...dialog.values, reason };
    if (dialog.shift) {
      const mealEdit = values.mealCount !== undefined;
      const action = mealEdit ? "attendance" : "absence";
      save(`employees/${dialog.person.id}/shifts/${dialog.shift.id}/${action}`, "put", values, ({ reopened }) => {
        const message = mealEdit ? "Modification enregistrée." : values.absent ? "Absence enregistrée." : "Absence retirée.";
        return reopened && values.absent !== false ? `${message} Le service est à valider de nouveau.` : message;
      });
    } else {
      savePayroll(values);
    }
  }

  const serviceActions = {
    busy, onSession: openSession, onEdit: confirmPayroll, onNote: openNote, onAnomalies: openAnomalies, onReview: reviewService,
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <CatalogHeaderDashboardComponent title="Pointeuse" onBack={() => router.push("/dashboard/employees")}
        backLabel="Retour à la gestion du personnel" actionsClassName="self-center gap-2" actions={<>
          <ClockExport restaurantId={restaurantId} root={root} employees={restaurantEmployees} />
          <button className={secondary} onClick={() => openDialog({ type: "management" })}><Tablet size={18} /> Tablettes</button>
        </>} />
      <nav aria-label="Vues de la Pointeuse" className="flex gap-1 border-b border-darkBlue/10">
        {tabs.map(({ id, label, Icon }) => <button key={id} onClick={() => changeView(id)} aria-current={id === view ? "page" : undefined}
          className={`-mb-px flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold sm:px-5 ${id === view ? "border-blue text-blue" : "border-transparent text-darkBlue/65 hover:text-darkBlue"}`}>
          <Icon size={17} /> {label}
        </button>)}
      </nav>
      {view === "day" && <ClockWeek date={date} onChange={setDate} />}
      {view !== "employees" && <div className="flex flex-wrap items-end gap-2">
        {view !== "day" && <>
          <label className="grid gap-1 text-xs font-semibold">Du<input className={control} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold">Au<input className={control} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold">Salarié<select className={control} value={employee} onChange={(event) => setEmployee(event.target.value)}>
            <option value="">Tous les salariés</option>
            {employees.map((person) => <option key={person.id} value={person.id}>{name(person)}</option>)}
          </select></label>
        </>}
        {view !== "history" && <input type="search" placeholder="Rechercher un salarié" aria-label="Rechercher un salarié" className={control} value={search}
          onChange={(event) => setSearch(event.target.value)} />}
        {view === "day" && dayCategory === "services" && <ClockServiceFilter value={filter} onChange={setFilter} />}
        {view === "day" && <button type="button" className={`${primary} ml-auto`}
          disabled={busy || !data || Boolean(error) || dayReviews.reviewableCount === dayReviews.reviewedCount}
          title="Valider tous les services éligibles de la journée"
          onClick={() => reviewPeriod({ from: date, to: date })}>Valider la journée</button>}
        {view === "history" && <select aria-label="Filtrer par événement" className={control} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Tous les événements</option><option value="anomalies">Services avec anomalie</option>
          {Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>}
      </div>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{notice}</p>}
      {!dialog && dialogError && <p role="alert" className="rounded-xl bg-red/5 p-4 text-sm text-red">{dialogError}</p>}
      <ClockEmployees active={view === "employees"} root={root} restaurantId={restaurantId} roster={restaurantEmployees}
        preselected={preselected} version={version} WeekControl={ClockWeek} onDay={jumpToDay}
        serviceActions={serviceActions} onReviewPeriod={reviewPeriod} />
      {view !== "employees" && error && <p role="alert" className="rounded-xl bg-red/5 p-4 text-sm text-red">{error}</p>}
      {view !== "employees" && !data && !error && <p role="status" className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">Chargement des pointages…</p>}
      {data && view === "day" && <>
        <ClockPlanningHeading title={<span className="capitalize">{dateLabel(date)}</span>} category={dayCategory}
          onChange={(value) => { setDayCategory(value); setFilter(""); }} />
        {dayCategory === "absences" ? (plannedAbsences.length
          ? <PlannedAbsencesTable absences={plannedAbsences} byEmployee />
          : <p className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">Aucune absence planifiée pour cette journée.</p>)
          : <ClockServices rows={rows} filter={filter} {...serviceActions} />}
      </>}
      {data && view === "history" && (history.length ? <ClockHistory entries={history} open={(entry) => openDialog({ type: "history", entry })} />
        : <p className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">Aucun événement pour cette période.</p>)}

      {dialog?.type === "management" && <ClockDialog title="Tablettes" onClose={() => { if (!busy) setDialog(null); }}>
        <ClockManagement restaurantId={restaurantId} root={root} onBusyChange={setBusy} />
      </ClockDialog>}
      {dialog?.type === "day" && <ClockDialog title={name(dialog.person)} onClose={() => { if (!busy) setDialog(null); }}>
        <p className="mb-4 capitalize text-sm text-darkBlue/70">{dateLabel(dialog.day.date)}</p>
        {dialog.day.sessions.filter((session) => !dialog.sessionId || dialog.sessionId === session.id).map((session) => {
          const paid = dialog.day.payroll?.find((item) => item.id === session.id);
          return <article key={session.id} className="mb-3 grid gap-3 rounded-2xl border border-darkBlue/10 p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{hours(session.clockInAt, session.clockOutAt)}</h3><span className="text-sm">{statusLabel(session)}</span></div>
            <p className="text-sm text-darkBlue/70">
              Service complet · Brut {formatMinutes(session.totals?.grossMinutes)} · Pauses {formatMinutes(session.totals?.breakMinutes)} · Net {formatMinutes(session.totals?.workedMinutes)}
            </p>
            {session.isPartialForDay && <p className="text-sm text-darkBlue/70">
              Part du jour · Brut {formatMinutes(session.timings?.grossMinutes)} · Pauses {formatMinutes(session.timings?.breakMinutes)} · Net {formatMinutes(session.timings?.workedMinutes)}
            </p>}
            {session.breaks.map((entry) => <p key={entry.id} className="text-sm">Pause {hours(entry.startAt, entry.endAt)} · {formatMinutes(entry.durationMinutes)}</p>)}
            {session.anomalies.length > 0 && <p className="text-sm text-amber-900">{session.anomalies.map(getTimeClockAnomalyLabel).join(" · ")}</p>}
            {session.review && <p className="text-xs text-darkBlue/65">Validé le {timestamp(session.review.at)}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} disabled={busy}
                onClick={() => openDialog({ type: "events", sessionId: session.id, previous: dialog })}>Événements et signatures</button>
              <button className={secondary} disabled={busy} onClick={() => openDialog({ type: "edit", session, day: dialog.day, person: dialog.person })}>Corriger</button>
              {paid?.manual && <button type="button" className={secondary} disabled={busy}
                onClick={() => resetPayroll(dialog.person, paid)}>Revenir au calcul automatique</button>}
            </div>
          </article>;
        })}
        {!dialog.day.sessions.length && <p className="mb-3 text-sm">Aucun pointage pour cette journée.</p>}
        {dialogError && <p role="alert" className="mt-3 text-sm text-red">{dialogError}</p>}
      </ClockDialog>}
      {dialog?.type === "events" && <ClockDialog title="Événements et signatures" onClose={() => setDialog(null)}>
        <ClockSessionEvents key={dialog.sessionId} root={root} sessionId={dialog.sessionId} />
        <button type="button" className={`${secondary} mt-4`} onClick={() => openDialog(dialog.previous)}>
          <ArrowLeft size={16} aria-hidden="true" /> Retour au service
        </button>
      </ClockDialog>}
      {dialog?.type === "edit" && <ClockDialog title={`Corriger le pointage · ${name(dialog.person)}`} onClose={dismissEditor}>
        <ClockCorrectionForm session={dialog.session} busy={busy} onDirty={setDialogDirty} onCancel={dismissEditor}
          onSave={(values) => save(`sessions/${dialog.session.id}`, "patch", { ...values, anchorDate: dialog.day.date }, "Correction enregistrée.")} />
        {dialogError && <p role="alert" className="mt-3 text-sm text-red">{dialogError}</p>}
      </ClockDialog>}
      {dialog?.type === "note" && <ClockDialog title={`Note · ${name(dialog.person)}`} onClose={dismissEditor}>
        {dialog.note && <>
          <p className="text-sm text-darkBlue/70">
            {{ planning: "Note du Planning", correction: "Motif de correction", note: "Note" }[dialog.note.source]}
            {" · "}{dialog.note.at ? timestamp(dialog.note.at) : dateLabel(dialog.date)}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{dialog.note.text}</p>
        </>}
        <form onSubmit={saveNote} className={`grid gap-3 ${dialog.note ? "mt-5 border-t border-darkBlue/10 pt-4" : ""}`}>
          <label className="grid gap-1 text-sm font-semibold">Ajouter une note
            <textarea name="note" onChange={event => setDialogDirty(Boolean(event.target.value))} rows="3" required maxLength={2000} className={control} />
          </label>
          {dialogError && <p role="alert" className="text-sm text-red">{dialogError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {dialog.paid?.manual && <button type="button" className={`${secondary} mr-auto`} disabled={busy}
              onClick={() => { if (canDismiss()) resetPayroll(dialog.person, dialog.paid); }}>Revenir au calcul automatique</button>}
            <button type="submit" className={primary} disabled={busy}>Enregistrer la note</button>
          </div>
        </form>
      </ClockDialog>}
      {dialog?.type === "anomalies" && <ClockDialog title={`Anomalies · ${name(dialog.person)}`} onClose={() => setDialog(null)}>
        <p className="mb-3 text-sm text-darkBlue/70">{dateLabel(dialog.date)}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {dialog.anomalies.map((label, index) => <li key={index}>{label}</li>)}
        </ul>
      </ClockDialog>}
      {dialog?.type === "confirm-payroll" && <ClockDialog title={`${dialog.label} · ${name(dialog.person)}`} onClose={dismissEditor}>
        <form onSubmit={saveInline} className="grid gap-4">
          {(dialog.session?.validated || dialog.session?.review || dialog.shift?.absenceValidated) &&
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ce service est validé. La correction le remettra à valider.</p>}
          <label className="grid gap-1 text-sm font-semibold">Motif
            <textarea name="reason" onChange={event => setDialogDirty(Boolean(event.target.value))} rows="3" required maxLength={2000} className={control} />
          </label>
          {dialogError && <p role="alert" className="text-sm text-red">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={dismissEditor}>Annuler</button>
            <button type="submit" className={primary} disabled={busy}>Confirmer</button>
          </div>
        </form>
      </ClockDialog>}
      {dialog?.type === "history" && <ClockDialog title={types[dialog.entry.type] || "Événement"} onClose={() => setDialog(null)}>
        <div className="grid gap-3 text-sm">
          <p className="font-bold">{name(dialog.entry.employee)} · {timestamp(dialog.entry.at)}</p>
          {(dialog.entry.actorName || dialog.entry.actorId) && <p>Auteur enregistré · {dialog.entry.actorName || dialog.entry.actorId}</p>}
          {dialog.entry.reason && <p>Motif · {dialog.entry.reason}</p>}
          {dialog.entry.receivedAt && <p>Reçu par Gusto le {timestamp(dialog.entry.receivedAt)}</p>}
          {dialog.entry.anomalies?.length > 0 && (
            <p className="text-amber-900">Anomalies du service · {dialog.entry.anomalies.map(getTimeClockAnomalyLabel).join(" · ")}</p>
          )}
          {dialog.entry.before && <div className="grid gap-3 sm:grid-cols-2">
            {["before", "after"].map((stage) => <div key={stage} className="rounded-xl bg-lightGrey p-3">
              <h3 className="mb-2 font-bold">{stage === "before" ? "Avant" : "Après"}</h3>
              {dialog.entry.type === "meal_adjustment" ? <p>Repas · {dialog.entry[stage].mealCount}</p> : <>
                <p>Arrivée {timestamp(dialog.entry[stage].in)}</p>
                <p>Départ {timestamp(dialog.entry[stage].out)}</p>
              </>}
              {(dialog.entry[stage].breaks || []).map((entry, index) => <p key={index}>Pause {timestamp(entry.startAt)} – {timestamp(entry.endAt)}</p>)}
              {dialog.entry[stage].pauseMinutesByDay?.map(({ date, minutes }) => <p key={date}>Pause rémunérée le {dateLabel(date)} · {formatMinutes(minutes)}</p>)}
              {dialog.entry[stage].absent && <p>Absence constatée</p>}
            </div>)}
          </div>}
          <button className={`${secondary} justify-self-start`} onClick={() => jumpToDay(dialog.entry.sessionDate || toLocalDateKey(dialog.entry.at), dialog.entry.employee)}>Voir la journée</button>
        </div>
      </ClockDialog>}
    </section>
  );
}
