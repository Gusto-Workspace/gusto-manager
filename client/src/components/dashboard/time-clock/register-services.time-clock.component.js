import { useState } from "react";
import { Check, Eye, Plus } from "lucide-react";
import { secondary } from "./register-controls.time-clock.component";
import { filterServices, groupClockServices, shiftDate } from "./register-employees.utils.mjs";
import {
  dateLabel, hours, name, tableFrame, tableHeading, tableRow,
} from "./register-presentation.time-clock";
import { formatMinutes, getTimeClockAnomalyLabel } from "./time-clock.utils";

const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const compactDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC", weekday: "short", day: "numeric", month: "short",
});
const validHour = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const input = "rounded-lg border border-darkBlue/15 bg-white px-1.5 py-1.5 text-center text-sm text-darkBlue tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:bg-lightGrey/50 disabled:text-darkBlue/55";
const action = "rounded-sm font-semibold text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
const rowButton = `${secondary} !min-h-8 !px-2 !py-1`;
const cell = "border-b border-darkBlue/10 px-2 py-2 align-middle text-sm";
const columns = ["Horaires prévus", "Pause prévue", "Horaires pointés", "Pause pointée",
  "Horaires rémunérés", "Pause rémunérée", "Absence", "Repas", "Durée rémunérée", "Anomalies", "Note", "Valider"];
const anomalyPreviewLength = 24;
const emptyValue = <span className="block w-full text-center">—</span>;

function localParts(value) {
  return clock.format(new Date(value)).split(" ");
}

function timeInput(value) {
  if (/^\d:\d\d$/.test(value)) return `0${value}`;
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function payrollChanges(day, paid, draft) {
  const [startDate, startTime] = localParts(paid.clockInAt);
  let [endDate, endTime] = localParts(paid.clockOutAt);
  if (startDate === endDate && draft.end < draft.start) endDate = shiftDate(endDate, 1);
  return {
    expectedUpdatedAt: paid.updatedAt,
    expectedRevision: paid.revision,
    wallTimeZone: "Europe/Paris",
    clockInAt: draft.start === startTime ? paid.clockInAt : `${startDate}T${draft.start}`,
    clockOutAt: draft.end === endTime && endDate === localParts(paid.clockOutAt)[0]
      ? paid.clockOutAt : `${endDate}T${draft.end}`,
    absent: draft.absent,
    ...(Number(draft.pause) !== paid.timings.breakMinutes && { pause: { date: day.date, minutes: Number(draft.pause) } }),
  };
}

function ServiceRow({ person, day, former, employeeView, service, busy, onDay, onSession, onEdit, onNote, onAnomalies, onReview }) {
  const { shift, session, paid } = service;
  const mealCount = session?.mealCount ?? (shift?.mealCount ?? (shift?.reportedAbsent ? 0 : undefined));
  const canEditMeals = session ? session.mealEditable !== false : Boolean(shift && !shift.absence);
  const initial = {
    start: paid ? localParts(paid.clockInAt)[1] : "",
    end: paid ? localParts(paid.clockOutAt)[1] : "",
    pause: paid ? String(paid.timings.breakMinutes) : "",
    absent: Boolean(paid?.absent || shift?.reportedAbsent),
    meals: mealCount == null ? "" : String(mealCount),
  };
  const [draft, setDraft] = useState(initial);
  const hoursChanged = ["start", "end", "pause"].some((key) => draft[key] !== initial[key]);
  const absenceChanged = draft.absent !== initial.absent;
  const mealsChanged = draft.meals !== initial.meals;
  const dirty = hoursChanged || absenceChanged || mealsChanged;
  const validMeals = /^\d+$/.test(draft.meals) && Number.isSafeInteger(Number(draft.meals));
  const valid = (!mealsChanged || validMeals) &&
    (!paid || (validHour.test(draft.start) && validHour.test(draft.end) && /^\d+$/.test(draft.pause)));
  const plannedOnly = !session && !paid && shift && !shift.absence;
  const now = Date.now();
  const showAbsence = Boolean(paid || plannedOnly);
  const canMarkAbsent = Boolean(paid || (plannedOnly && (initial.absent || Date.parse(shift.start) <= now)));
  const anomalies = (session?.anomalies || []).map(getTimeClockAnomalyLabel);
  if (paid?.payrollOverlap) anomalies.unshift("Horaires rémunérés chevauchants. Corrigez les services concernés.");
  const anomalyText = anomalies.join(" · ");
  const clippedAnomalies = anomalyText.length > anomalyPreviewLength;
  const sessionNote = session?.note ?? paid?.note;
  const shiftNote = shift?.note;
  const note = shiftNote?.at && (!sessionNote?.at || Date.parse(shiftNote.at) > Date.parse(sessionNote.at))
    ? shiftNote : sessionNote ?? shiftNote;
  const hasService = Boolean(session || paid || plannedOnly);
  const canReview = Boolean(session?.status === "closed" || paid || shift?.reportedAbsent);
  const reviewed = Boolean(session?.review || paid?.validated || shift?.absenceValidated);
  const recorded = session && hours(session.timings?.startAt || session.clockInAt, session.clockOutAt ? session.timings?.endAt || session.clockOutAt : null);
  const identifier = employeeView ? dateLabel(day.date) : name(person);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function save() {
    const meals = mealsChanged ? { mealCount: Number(draft.meals) } : {};
    const label = mealsChanged && !hoursChanged && !absenceChanged ? "Correction du nombre de repas"
      : absenceChanged ? "Absence" : "Correction des heures rémunérées";
    if (session || paid) onEdit(person, {
      label, session: paid || session,
      values: {
        expectedUpdatedAt: paid?.updatedAt ?? session?.updatedAt ?? null,
        expectedRevision: paid?.revision ?? session?.revision ?? 0,
        ...(paid && (hoursChanged || absenceChanged) && payrollChanges(day, paid, draft)),
        ...meals,
      },
    });
    else onEdit(person, {
      label, shift,
      values: {
        expectedRevision: shift.absenceRevision || 0, shiftDate: day.date,
        ...(absenceChanged && { absent: draft.absent }), ...meals,
      },
    });
  }

  return <tr className={`group ${tableRow}`}>
    <th scope="row" className={`${cell} sticky left-0 z-[1] whitespace-nowrap bg-white text-left group-hover:bg-[#f8f8fb]`}>
      {employeeView ? <button type="button" aria-label={identifier} className={`${action} capitalize`} onClick={() => onDay(day.date, person)}>
        {compactDate.format(new Date(day.date + "T12:00:00Z"))}
      </button> : <>
        <button type="button" className={`text-left ${action}`} onClick={() => onSession(person, day, session?.id)}>{identifier}</button>
        {former && <p className="mt-0.5 text-xs font-normal text-darkBlue/55">Ancien salarié</p>}
      </>}
    </th>
    <td className={`${cell} whitespace-nowrap tabular-nums`}>{shift ? (shift.absence ? shift.title || "Absence" : hours(shift.start, shift.end)) : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap`}>{shift && !shift.absence ? formatMinutes(shift.breakMinutes) : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap`}>{recorded ?
      <button type="button" className={action} onClick={() => onSession(person, day, session.id)}>{recorded}</button>
      : plannedOnly && !initial.absent && Date.parse(shift.end) <= now ? <span className="text-xs text-darkBlue/65">Sans pointage</span> : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap`}>{session ? formatMinutes(session.timings?.breakMinutes) : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap`}>{paid ? <div className="flex items-center justify-center gap-1">
      <input type="text" inputMode="numeric" maxLength={5} aria-label={`Début rémunéré · ${identifier}`}
        aria-invalid={dirty && !validHour.test(draft.start)} value={draft.start} disabled={draft.absent}
        onChange={(event) => update("start", timeInput(event.target.value))} className={`${input} w-[3.75rem]`} />
      <span aria-hidden="true">–</span>
      <input type="text" inputMode="numeric" maxLength={5} aria-label={`Fin rémunérée · ${identifier}`}
        aria-invalid={dirty && !validHour.test(draft.end)} value={draft.end} disabled={draft.absent}
        onChange={(event) => update("end", timeInput(event.target.value))} className={`${input} w-[3.75rem]`} />
    </div> : session?.status && session.status !== "closed" ? <span className="text-xs text-darkBlue/65">En attente</span> : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap`}>{paid ? <div className="flex items-center justify-center gap-1">
      <input type="text" inputMode="numeric" maxLength={4} aria-label={`Pause rémunérée en minutes · ${identifier}`}
        aria-invalid={dirty && !/^\d+$/.test(draft.pause)} value={draft.pause} disabled={draft.absent}
        onChange={(event) => update("pause", event.target.value)} className={`${input} w-[2.75rem]`} />
      <span className="text-xs text-darkBlue/65">min</span>
    </div> : emptyValue}</td>
    <td className={cell}>{showAbsence ? <input type="checkbox" checked={draft.absent} disabled={!canMarkAbsent}
      title={canMarkAbsent ? undefined : "Disponible à l’heure de début du service"}
      aria-label={`Absence constatée · ${identifier}`} className="size-4 rounded accent-blue"
      onChange={(event) => setDraft(event.target.checked ? { ...initial, meals: draft.meals, absent: true } : { ...draft, absent: false })} />
      : shift?.absence ? "Prévue" : emptyValue}</td>
    <td className={`${cell} whitespace-nowrap tabular-nums`}>
      {canEditMeals ? <input type="text" inputMode="numeric" maxLength={16} aria-label={`Nombre de repas · ${identifier}`}
        aria-invalid={mealsChanged && !validMeals} value={draft.meals}
        onChange={(event) => update("meals", event.target.value)} className={`${input} min-w-[2.75rem]`} size={Math.max(1, draft.meals.length)} />
        : mealCount ?? emptyValue}
    </td>
    <td className={`${cell} whitespace-nowrap`}>{paid ? <>
      <span className="font-semibold tabular-nums">{paid.payrollOverlap ? emptyValue : formatMinutes(paid.timings.workedMinutes)}</span>
      <p className="mt-0.5 text-xs text-darkBlue/65">{paid.requiresCorrection ? "À corriger avant validation" : paid.manual ? "Corrigée" : "Automatique"}</p>
    </> : initial.absent ? "0 min" : emptyValue}</td>
    <td className={cell}>{anomalyText ? <div className="flex items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-amber-900">
      <span>{clippedAnomalies ? `${anomalyText.slice(0, anomalyPreviewLength).trimEnd()}…` : anomalyText}</span>
      {clippedAnomalies && <button type="button" className={`rounded-md p-1 ${action}`}
        aria-label={`Voir toutes les anomalies · ${identifier}`} title="Voir toutes les anomalies"
        onClick={() => onAnomalies(person, day.date, anomalies)}><Eye size={16} aria-hidden="true" /></button>}
    </div> : emptyValue}</td>
    <td className={cell}>{hasService ? <button type="button" className={`inline-grid size-9 place-items-center rounded-lg hover:bg-lightGrey ${action}`} disabled={busy}
      aria-label={`${note ? "Voir la note" : "Ajouter une note"} · ${identifier}`} title={note ? "Voir la note" : "Ajouter une note"}
      onClick={() => onNote(person, day.date, { note, session: session || paid, paid, shift })}>
      {note ? <Eye size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
    </button> : emptyValue}</td>
    <td className={cell}>
      <div className="flex min-w-[4.5rem] items-center justify-center gap-1 whitespace-nowrap">
        {dirty ? <>
          <button type="button" className={rowButton} disabled={!valid || busy} onClick={save}>Enregistrer</button>
          <button type="button" className={rowButton} disabled={busy} onClick={() => setDraft(initial)}>Annuler</button>
        </> : canReview ? <button type="button" disabled={busy}
          className={`grid size-9 place-items-center rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 ${reviewed
            ? "border-blue/25 bg-blue/10 text-blue hover:bg-blue/20" : "border-darkBlue/10 bg-white text-gray-500 hover:bg-lightGrey"}`}
          aria-label={`Validation · ${identifier}`} aria-pressed={reviewed}
          title={reviewed ? "Retirer la validation" : "Valider"}
          onClick={() => onReview(person, day.date, { session: session || paid, shift, validated: !reviewed })}>
          <Check size={19} strokeWidth={2.75} aria-hidden="true" />
        </button> : emptyValue}
      </div>
    </td>
  </tr>;
}

export default function ClockServices({ rows, employeeView, filter, busy, onDay, onSession, onEdit, onNote, onAnomalies, onReview }) {
  const visible = rows.flatMap(({ employee, day, former }) => {
    const services = groupClockServices(day);
    const items = services.length || employeeView || filter ? filterServices(services, filter) : [{ key: "empty" }];
    return items.map((service) => ({ employee, day, former, service }));
  });
  if (!visible.length) return <p className="rounded-2xl bg-white p-6 text-sm text-darkBlue/70">
    {filter ? "Aucun service pour cet état." : "Aucun service ni pointage pour cette période."}
  </p>;

  return <div className={tableFrame} role="region" aria-label={employeeView ? "Services du salarié" : "Pointages de la journée"} tabIndex={0}>
    <table className="w-full min-w-[1240px] border-separate border-spacing-0 text-center">
      <thead className={tableHeading}><tr>
        {[employeeView ? "Jour" : "Salarié", ...columns].map((label, index) => (
          <th key={label} scope="col" className={`whitespace-nowrap border-b border-darkBlue/10 px-2 py-3 text-xs font-semibold text-darkBlue/75 ${index === 0 ? "sticky left-0 z-[2] bg-[#f4f4f8] text-left" : ""}`}>{label}</th>
        ))}
      </tr></thead>
      <tbody>{visible.map(({ employee, day, former, service }) =>
        <ServiceRow key={`${employee.id}:${day.date}:${service.key}:${service.session?.revision ?? service.paid?.revision ?? 0}:${service.shift?.absenceRevision ?? 0}:${service.session?.mealCount ?? service.shift?.mealCount ?? ""}`}
          person={employee} day={day} former={former} employeeView={employeeView} service={service} busy={busy}
          onDay={onDay} onSession={onSession} onEdit={onEdit} onNote={onNote} onAnomalies={onAnomalies} onReview={onReview} />,
      )}</tbody>
    </table>
  </div>;
}
