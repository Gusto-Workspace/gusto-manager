import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export const control = "min-h-10 min-w-0 rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm text-darkBlue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
export const secondary = `${control} inline-flex items-center justify-center gap-2 font-semibold hover:bg-lightGrey disabled:opacity-50`;
export const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-darkBlue px-4 py-2 text-sm font-semibold text-white hover:bg-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50";

const serviceStates = [
  ["", "Tous les états"],
  ["active", "En cours"],
  ["unreviewed", "À valider"],
  ["anomalies", "Avec anomalie"],
  ["missing", "Planifiés sans pointage"],
  ["absent", "Absences constatées"],
];

export function ClockServiceFilter({ value, onChange }) {
  return <select className={control} aria-label="Filtrer par état" value={value} onChange={(event) => onChange(event.target.value)}>
    {serviceStates.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>;
}

export function ClockPlanningHeading({ title, category, onChange }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-darkBlue/10">
    <h2 className="min-w-0 break-words text-lg font-semibold">{title}</h2>
    <div role="group" aria-label="Type de planning" className="ml-auto flex gap-1">
      {[["services", "Services"], ["absences", "Absences planifiées"]].map(([id, label]) => (
        <button type="button" key={id} aria-pressed={category === id} onClick={() => onChange(id)}
          className={`-mb-px min-h-11 border-b-2 px-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${category === id
            ? "border-blue text-blue" : "border-transparent text-darkBlue/65 hover:text-darkBlue"}`}>{label}</button>
      ))}
    </div>
  </div>;
}

export function ClockDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  const pointerStartedOutside = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function isOutside(event) {
    if (event.target !== event.currentTarget) return false;
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }

  return (
    <dialog ref={dialog} aria-label={title}
      onPointerDown={(event) => { pointerStartedOutside.current = isOutside(event); }}
      onClick={(event) => {
        const dismiss = pointerStartedOutside.current && isOutside(event);
        pointerStartedOutside.current = false;
        if (dismiss) onClose();
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="max-h-[90dvh] w-[min(94vw,44rem)] overflow-y-auto rounded-3xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-darkBlue/45">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-darkBlue/10 bg-white px-5 py-4 sm:px-6">
        <h2 className="text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className={secondary}><X size={18} /></button>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </dialog>
  );
}

const parisClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function wallValue(value) {
  return value ? parisClock.format(new Date(value)).replace(" ", "T") : "";
}

function editValue(value, original) {
  return original && value === wallValue(original) ? original : value;
}

export function ClockCorrectionForm({ session, onSave, onCancel, busy }) {
  const [start, setStart] = useState(wallValue(session.clockInAt));
  const [end, setEnd] = useState(wallValue(session.clockOutAt || new Date()));
  const [reason, setReason] = useState("");
  const [breaks, setBreaks] = useState(() => session.breaks.map((item) => ({
    id: item.id, original: item, start: wallValue(item.startAt), end: wallValue(item.endAt),
  })));

  function submit(event) {
    event.preventDefault();
    const editedBreaks = breaks.map((item) => ({
      id: item.original?.id, startAt: editValue(item.start, item.original?.startAt), endAt: editValue(item.end, item.original?.endAt),
    }));
    onSave({
      clockInAt: editValue(start, session.clockInAt),
      clockOutAt: editValue(end, session.clockOutAt),
      breaks: editedBreaks,
      reason: reason.trim(),
      wallTimeZone: "Europe/Paris",
      expectedUpdatedAt: session.updatedAt,
    });
  }

  function updateBreak(id, field, value) {
    setBreaks((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-sm text-darkBlue/70">Horaires de Paris. La correction sera inscrite dans l’historique.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Arrivée
          <input type="datetime-local" step="1" value={start} onChange={(event) => setStart(event.target.value)} required className={control} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Départ
          <input type="datetime-local" step="1" value={end} onChange={(event) => setEnd(event.target.value)} required className={control} />
        </label>
      </div>
      {breaks.map((item, index) => (
        <fieldset key={item.id} className="grid gap-3 rounded-xl border border-darkBlue/10 p-3 sm:grid-cols-2">
          <legend className="px-2 text-sm font-semibold">Pause {index + 1}</legend>
          <label className="grid gap-1 text-sm">Début
            <input type="datetime-local" step="1" value={item.start} onChange={(event) => updateBreak(item.id, "start", event.target.value)} required className={control} />
          </label>
          <label className="grid gap-1 text-sm">Fin
            <input type="datetime-local" step="1" value={item.end} onChange={(event) => updateBreak(item.id, "end", event.target.value)} required className={control} />
          </label>
          <button type="button" className={`${secondary} justify-self-start`} onClick={() => setBreaks((items) => items.filter((entry) => entry.id !== item.id))}>Retirer la pause {index + 1}</button>
        </fieldset>
      ))}
      <button type="button" className={`${secondary} justify-self-start`} onClick={() => setBreaks((items) => [...items, { id: crypto.randomUUID(), start: "", end: "" }])}>Ajouter une pause</button>
      <label className="grid gap-1 text-sm font-semibold">Motif de correction
        <textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={2000} className={control} />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} onClick={onCancel} disabled={busy}>Annuler</button>
        <button className={primary} disabled={busy || !reason.trim()}>{busy ? "Enregistrement…" : "Enregistrer la correction"}</button>
      </div>
    </form>
  );
}
