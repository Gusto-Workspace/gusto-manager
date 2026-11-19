import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ChevronRight, Search } from "lucide-react";
import { ClockPlanningHeading, ClockServiceFilter, control, primary, secondary } from "./register-controls.time-clock.component";
import ClockServices from "./register-services.time-clock.component";
import {
  dateLabel, hours, name, tableCell, tableFrame, tableHead, tableHeading, tableRow,
} from "./register-presentation.time-clock";
import { employeeWeek, searchStaff, validRange, weekRange } from "./register-employees.utils.mjs";
import { formatMinutes, getAuthConfig, toLocalDateKey } from "./time-clock.utils";

const cell = `${tableCell} align-middle tabular-nums`;
const rowHeading = `${cell} sticky left-0 z-[1] whitespace-nowrap bg-white text-left group-hover:bg-[#f8f8fb]`;
const body = "[&>tr>*]:border-b [&>tr>*]:border-darkBlue/10";
const inlineAction = "text-left font-semibold text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
const periodFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });
const compactDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const localStamp = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function formatRange(from, to) {
  return periodFormat.formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));
}

function sortStaff(list) {
  return [...list].sort((a, b) => name(a).localeCompare(name(b), "fr", { sensitivity: "base" }));
}

function TableHeading({ labels }) {
  return <thead className={tableHeading}>
    <tr>{labels.map((label, index) => (
      <th key={label} scope="col" className={`${tableHead} whitespace-nowrap ${index === 0 ? "sticky left-0 z-[2] bg-[#f4f4f8] text-left" : ""}`}>{label}</th>
    ))}</tr>
  </thead>;
}

function DayLink({ date, onDay }) {
  return <button type="button" className={`${inlineAction} capitalize`} aria-label={dateLabel(date)} onClick={() => onDay(date)}>
    {compactDate.format(new Date(`${date}T12:00:00Z`))}
  </button>;
}

export function PlannedAbsencesTable({ absences, onDay, byEmployee }) {
  return <div className={tableFrame} role="region" aria-label="Absences planifiées" tabIndex={0}>
    <table className="w-full min-w-[530px] border-separate border-spacing-0 text-center">
      <TableHeading labels={[byEmployee ? "Salarié" : "Jour", "Type d’absence", "Horaires prévus", "Durée"]} />
      <tbody className={body}>{absences.map(({ date, shift, employee }) => (
        <tr key={`${date}-${shift.id}`} className={`group ${tableRow}`}>
          <th scope="row" className={rowHeading}>{byEmployee ? name(employee) : <DayLink date={date} onDay={onDay} />}</th>
          <td className={`${cell} whitespace-nowrap`}>{shift.title || "Absence"}</td>
          <td className={`${cell} whitespace-nowrap`}>
            {toLocalDateKey(shift.start) === toLocalDateKey(shift.end)
              ? hours(shift.start, shift.end)
              : `${localStamp.format(new Date(shift.start))} – ${localStamp.format(new Date(shift.end))}`}
          </td>
          <td className={cell}>{shift.plannedMinutes ? formatMinutes(shift.plannedMinutes) : "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

function StaffList({ roster, selected, search, setSearch, onSelect }) {
  const filtered = searchStaff(roster, search);
  return <aside aria-label="Salariés du restaurant" className="min-w-0 rounded-2xl border border-darkBlue/10 bg-white">
    <div className="border-b border-darkBlue/10 p-3">
      <label className="relative block">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-darkBlue/55" />
        <input type="search" aria-label="Rechercher un salarié" placeholder="Rechercher un salarié" value={search}
          onChange={(event) => setSearch(event.target.value)} className={`${control} w-full !pl-9`} />
      </label>
    </div>
    <ul className="flex gap-1 overflow-x-auto p-2 tablet:block tablet:max-h-[min(64vh,36rem)] tablet:space-y-1 tablet:overflow-y-auto">
      {filtered.map((person) => (
        <li key={person.id} className="shrink-0 tablet:shrink">
          <button type="button" aria-pressed={selected === person.id} onClick={() => onSelect(person.id)}
            className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              selected === person.id ? "bg-darkBlue font-semibold text-white" : "hover:bg-lightGrey"
            }`}>
            <span><span className="block font-semibold">{name(person)}</span>
              {person.post && <span className="block text-xs opacity-75">{person.post}</span>}
            </span>
            <ChevronRight size={16} aria-hidden="true" className="hidden shrink-0 tablet:block" />
          </button>
        </li>
      ))}
    </ul>
    {!filtered.length && <p className="px-3 pb-3 text-sm text-darkBlue/70">{search ? "Aucun salarié trouvé." : "Aucun salarié dans ce restaurant."}</p>}
  </aside>;
}

export default function ClockEmployees({ active, root, restaurantId, roster: restaurantEmployees, preselected, version, WeekControl, onDay, serviceActions, onReviewPeriod }) {
  const initialRoster = useMemo(() => sortStaff((restaurantEmployees || [])
    .filter((person) => person?._id && person.accountType !== "accountant")
    .map((person) => {
      const snapshot = person.restaurantProfiles?.find((profile) => String(profile.restaurant) === String(restaurantId))?.snapshot;
      return {
        id: String(person._id), firstname: snapshot?.firstname ?? person.firstname,
        lastname: snapshot?.lastname ?? person.lastname, post: snapshot?.post ?? person.post,
      };
    })), [restaurantEmployees, restaurantId]);
  const preset = typeof preselected === "string" && /^[a-f\d]{24}$/i.test(preselected) ? preselected.toLowerCase() : "";
  const [selectedId, setSelectedId] = useState(preset);
  const [anchor, setAnchor] = useState(() => toLocalDateKey());
  const [custom, setCustom] = useState(null);
  const [draft, setDraft] = useState(null);
  const [rangeError, setRangeError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("services");
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const employeeId = selectedId || initialRoster[0]?.id || "";
  const { from, to } = custom || weekRange(anchor);
  const requestKey = `${employeeId}:${from}:${to}`;

  useEffect(() => {
    if (preset) {
      setSelectedId(preset);
      setSearch("");
    }
  }, [preset]);

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    setError("");
    // Le répertoire reste disponible même quand le contexte local arrive après la page.
    const params = { from, to: employeeId ? to : from, ...(employeeId && { employeeId }) };
    axios.get(`${root}/register`, getAuthConfig({ params, signal: controller.signal }))
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const roster = sortStaff(data.roster || []);
        setResult({ requestKey, roster, row: data.rows?.find((item) => item.employee.id === employeeId) });
        if (!employeeId && roster[0]) setSelectedId(roster[0].id);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de charger les pointages.");
      });
    return () => controller.abort();
  }, [active, employeeId, from, requestKey, root, to, version]);

  const current = result?.requestKey === requestKey ? result : null;
  const directory = result?.roster || initialRoster;
  const former = current?.row?.former ? current.row.employee : null;
  const roster = former ? sortStaff([...directory, former]) : directory;
  const person = roster.find((item) => item.id === employeeId);
  const week = useMemo(() => employeeWeek(current?.row?.days), [current]);

  function selectWeek(date) {
    setAnchor(date);
    setCustom(null);
    setDraft(null);
    setRangeError(false);
  }

  function applyRange(event) {
    event.preventDefault();
    if (!validRange(draft)) {
      setRangeError(true);
      return;
    }
    setAnchor(draft.from);
    setCustom(draft);
    setDraft(null);
    setRangeError(false);
  }

  return <div hidden={!active}>
    <div className="flex min-w-0 flex-col gap-4">
      <WeekControl date={anchor} onChange={selectWeek} showDays={false} />
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className={secondary} aria-expanded={Boolean(draft)} onClick={() => {
          setRangeError(false);
          setDraft(draft ? null : { from, to });
        }}>Période personnalisée</button>
        {category === "services" && <ClockServiceFilter value={filter} onChange={setFilter} />}
        {custom && <>
          <button type="button" className={secondary} onClick={() => selectWeek(anchor)}>Revenir à la semaine</button>
          <p className="self-center text-sm text-darkBlue/65">{formatRange(from, to)}</p>
        </>}
        <button type="button" className={`${primary} ml-auto`}
          disabled={serviceActions.busy || !current || !person || Boolean(error) || week.reviewableCount === week.reviewedCount}
          title={person ? `Valider les services éligibles de ${name(person)}` : undefined}
          onClick={() => onReviewPeriod({ from, to, employeeId })}>{custom ? "Valider la période" : "Valider la semaine"}</button>
      </div>
      {draft && <form onSubmit={applyRange} className="flex flex-wrap items-end gap-2 rounded-2xl border border-darkBlue/10 bg-white p-3">
        <label className="grid gap-1 text-xs font-semibold">Du<input type="date" required className={control} value={draft.from}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold">Au<input type="date" required className={control} value={draft.to}
          onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
        <button type="submit" className={secondary}>Appliquer</button>
        {rangeError && <p role="alert" className="basis-full text-sm text-red">Sélectionnez une période de 31 jours maximum.</p>}
      </form>}
      <div className="grid min-w-0 items-start gap-4 tablet:grid-cols-[12rem_minmax(0,1fr)]">
        <StaffList roster={roster} selected={employeeId} search={search} setSearch={setSearch} onSelect={setSelectedId} />
        <div className="grid min-w-0 gap-4">
          {person && <ClockPlanningHeading title={name(person)} category={category} onChange={setCategory} />}
          {error ? <p role="alert" className="rounded-xl bg-red/5 p-4 text-sm text-red">{error}</p>
            : !current ? <p role="status" className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">Chargement des pointages…</p>
              : !person ? <p className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">{employeeId ? "Ce salarié ne figure pas dans cette période." : "Sélectionnez un salarié."}</p>
              : category === "absences" ? (week.absences.length
                ? <PlannedAbsencesTable absences={week.absences} onDay={(date) => onDay(date, person)} />
                : <p className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">Aucune absence planifiée sur cette période.</p>)
              : <>
                {week.reviewableCount > 0 && <p className="text-sm font-medium text-darkBlue/70">{week.reviewedCount} sur {week.reviewableCount} {week.reviewableCount === 1 ? "service validé" : "services validés"}</p>}
                <ClockServices rows={week.services.map((day) => ({ employee: person, day }))} employeeView filter={filter}
                  onDay={onDay} {...serviceActions} />
              </>}
        </div>
      </div>
    </div>
  </div>;
}
