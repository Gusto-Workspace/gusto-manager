import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { addDays, addMinutes, endOfMonth, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, MapPin, X } from "lucide-react";
import {
  getParisPlanningInstant, getPlanningPeriod, movePlanningDate, parisPlanningDateKey, parisPlanningDateTime,
  parsePlanningDate, planningDateKey,
} from "@/components/dashboard/employees/planning-grid.utils.mjs";
import { adminCommercialApi, commercialAdminPath, commercialApi, sellerPath } from "./commercial-api";
import { CommercialBadge, CommercialEmpty, CommercialHeader, commercialPanel, commercialSecondary } from "./commercial-ui";

export const calendarTypes = { APPOINTMENT: "Rendez-vous", DEMO: "Démonstration", FOLLOW_UP: "Relance", OTHER: "Autre événement" };
export const calendarApiPath = (isAdmin) => isAdmin ? "/crm/calendar" : "/calendar";
const stateLabels = { CANCELLED: "Annulé", COMPLETED: "Réalisé" };
const palette = {
  APPOINTMENT: ["#eaf0fc", "#244b95"], DEMO: ["#ede9fe", "#4c1d95"],
  FOLLOW_UP: ["#ffedd5", "#7c2d12"], OTHER: ["#f1f5f9", "#334155"],
};
function eventColor(type) {
  const [backgroundColor, color] = palette[type];
  return { backgroundColor, color };
}
const views = { month: "Mois", week: "Semaine", day: "Jour" };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { fr } });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Europe/Paris" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" });
const browserDate = (value) => new Date(parisPlanningDateTime(new Date(value)));
const parisToday = () => parsePlanningDate(parisPlanningDateKey(new Date()));
export const calendarDateLabel = (date, allDay) => allDay ? dateFormat.format(new Date(date)) :
  `${dateFormat.format(new Date(date))} à ${timeFormat.format(new Date(date))}`;
export const calendarEventState = (event) => stateLabels[event.state] || (
  (event.allDay ? parisPlanningDateKey(new Date(event.startsAt)) < parisPlanningDateKey(new Date()) :
    new Date(event.endsAt || event.startsAt) < new Date()) ? "En retard" : "Planifié"
);

function AgendaDay({ date, events, today, global, onSelect }) {
  return <li className={`min-w-0 rounded-2xl border p-3.5 ${today ? "border-violet/35 bg-violet/5" : "border-darkBlue/10 bg-lightGrey/45"}`}>
    <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
      <span className="capitalize">{format(date, "EEEE d MMMM", { locale: fr })}</span>
      {today && <span className="shrink-0 rounded-md bg-violet px-2 py-1 text-[10px] text-white">Aujourd’hui</span>}
    </h3>
    {events.length ? <ul className="grid gap-2">{events.map((event) => {
      const state = calendarEventState(event);
      const spansDays = planningDateKey(event.start) !== planningDateKey(event.end);
      const time = event.allDay ? "Sans horaire" : [
        spansDays ? calendarDateLabel(event.startsAt, false) : timeFormat.format(new Date(event.startsAt)),
        event.endsAt && (spansDays ? calendarDateLabel(event.endsAt, false) : timeFormat.format(new Date(event.endsAt))),
      ].filter(Boolean).join(" – ");
      const title = event.title || event.prospectName;
      const details = [global && event.salesOwnerName, event.prospectName !== title && event.prospectName, event.location].filter(Boolean);
      return <li key={event._id}>
        <button type="button" onClick={() => onSelect(event)} style={{ borderLeftColor: eventColor(event.type).color }}
          className="grid w-full min-w-0 gap-1.5 rounded-xl border border-l-4 border-darkBlue/10 bg-white px-3 py-2.5 text-left shadow-sm hover:border-violet/50 focus-visible:outline-violet">
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <strong className="text-sm tabular-nums">{time}</strong>
            <span style={eventColor(event.type)} className="rounded-md px-2 py-0.5 text-xs font-semibold">{calendarTypes[event.type]}</span>
          </span>
          {title && <span className="break-words text-sm font-semibold">{title}</span>}
          {(details.length > 0 || state !== "Planifié") && <span className="break-words text-xs text-darkBlue/75">
            {[...details, state !== "Planifié" && state].filter(Boolean).join(" · ")}
          </span>}
        </button>
      </li>;
    })}</ul> : <p className="text-sm text-darkBlue/70">Aucun événement ce jour.</p>}
  </li>;
}

function CompactCalendar({ days, selected, today, onSelect }) {
  return <div className="grid grid-cols-7 gap-0.5 rounded-2xl border border-darkBlue/10 p-1" aria-label="Sélection du jour" role="group">
    {days.slice(0, 7).map(({ key, date }) => <span key={key} aria-hidden="true"
      className="py-1 text-center text-[11px] font-semibold capitalize text-darkBlue/70">{format(date, "EEE", { locale: fr })}</span>)}
    {days.map(({ key, date, events }) => <button key={key} type="button" onClick={() => onSelect(date)}
      aria-pressed={key === selected} aria-current={key === today ? "date" : undefined}
      aria-label={`${format(date, "EEEE d MMMM yyyy", { locale: fr })}, ${events.length} événement${events.length === 1 ? "" : "s"}`}
      className={`grid min-h-11 min-w-0 grid-rows-2 place-items-center rounded-lg px-0.5 py-0.5 text-sm font-semibold focus-visible:outline-violet ${
        key === selected ? "bg-violet text-white" : key === today ? "bg-violet/10 text-violet" :
          key.slice(0, 7) === selected.slice(0, 7) ? "text-darkBlue hover:bg-lightGrey" : "text-darkBlue/50 hover:bg-lightGrey"}`}>
      {date.getDate()}
      <span className={`min-w-4 rounded-md px-0.5 text-[10px] leading-4 ${key === selected ? "bg-white/20" : "bg-violet/10 text-[#4d399e]"} ${events.length ? "" : "invisible"}`}>
        {events.length}
      </span>
    </button>)}
  </div>;
}

function eventQuery(fields) {
  return new URLSearchParams(Object.entries(fields).filter(([, value]) => value)).toString();
}

export function CommercialEventEditor({ event, isAdmin, fixedAccountId = "", accountPath, accounts = [], prospect, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const editing = Boolean(event._id);
  const readOnly = editing && event.state !== "SCHEDULED";
  const [type, setType] = useState(event.type || "APPOINTMENT");
  const [owner, setOwner] = useState(event.salesOwnerId || fixedAccountId || prospect?.salesOwnerId || "");
  const [allDay, setAllDay] = useState(event.allDay ?? type === "FOLLOW_UP");
  const [prospectId, setProspectId] = useState(prospect?._id || event.prospectId || "");
  const [prospects, setProspects] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const request = isAdmin ? adminCommercialApi : commercialApi;
  const date = event.startsAt ? browserDate(event.startsAt) : event.date || parisToday();
  const startKey = planningDateKey(date);
  const startTime = event.startsAt || event.hasTime ? format(date, "HH:mm") : "09:00";
  const root = isAdmin ? accountPath || commercialAdminPath : sellerPath;
  const selectedProspect = prospect || prospects.find((item) => item._id === prospectId);

  useEffect(() => {
    dialogRef.current.showModal();
  }, []);

  useEffect(() => {
    if (prospect || readOnly || (isAdmin && !owner)) return;
    const controller = new AbortController();
    const path = isAdmin ? "/crm/prospects" : "/prospects";
    const query = eventQuery({ salesOwnerId: owner, q: search });
    const timeout = window.setTimeout(() => request(`${path}?${query}`, { signal: controller.signal })
      .then(({ prospects }) => setProspects(prospects.filter((item) => !item.opposedAt)))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); }), 150);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [isAdmin, owner, prospect, readOnly, request, search]);

  async function update(action, body = {}) {
    setBusy(true);
    setError("");
    try {
      const path = `${calendarApiPath(isAdmin)}${editing ? `/${event._id}` : ""}`;
      const scope = fixedAccountId ? `?salesOwnerId=${fixedAccountId}` : "";
      await request(`${path}${scope}`, { method: editing ? "PATCH" : "POST", body: editing ? { ...body, action } : body });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const date = form.get("date");
    const start = !allDay && getParisPlanningInstant(date, form.get("startTime"), event.startsAt && new Date(event.startsAt));
    const endDate = form.get("endDate") || date;
    const end = !allDay && form.get("endTime") && getParisPlanningInstant(endDate, form.get("endTime"), event.endsAt && new Date(event.endsAt));
    if (!allDay && (!start || (form.get("endTime") && !end))) {
      setError("Cette heure n’existe pas à Paris à la date choisie.");
      return;
    }
    if (end && end <= start) {
      setError("La fin doit suivre le début de l’événement.");
      return;
    }
    update("edit", {
      type, title: form.get("title"), allDay, startsAt: allDay ? date : start.toISOString(),
      endsAt: end ? end.toISOString() : null, prospectId: prospectId || null,
      message: form.get("message"), location: form.get("location"),
      ...(!editing && isAdmin && { salesOwnerId: owner }),
    });
  }

  return <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
    className="commercial-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-[24px] border border-darkBlue/10 bg-white p-4 text-darkBlue shadow-xl backdrop:bg-darkBlue/45 midTablet:p-6"
    aria-labelledby="commercial-event-title">
    <header className="mb-3 flex items-start justify-between gap-2 rounded-2xl bg-[#f5f1ff] p-3 midTablet:p-4">
      <div className="min-w-0">
        <h3 id="commercial-event-title" className="break-words text-lg font-bold">{editing ? event.title || calendarTypes[event.type] : "Nouvel événement"}</h3>
        {editing && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-darkBlue/75">
          <span className="rounded-full px-2 py-1 text-xs font-semibold" style={eventColor(event.type)}>{calendarTypes[event.type]}</span>
          <CommercialBadge tone={event.state === "COMPLETED" ? "success" : calendarEventState(event) === "En retard" ? "danger" : "neutral"}>{calendarEventState(event)}</CommercialBadge>
          <time dateTime={event.startsAt}>{calendarDateLabel(event.startsAt, event.allDay)}</time>
        </div>}
        {isAdmin && (event.salesOwnerName || prospect?.salesOwnerName) && <p className="text-sm">{event.salesOwnerName || prospect.salesOwnerName}</p>}
      </div>
      <button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-white p-2 text-violet hover:bg-lightGrey" aria-label="Fermer"><X size={18} /></button>
    </header>
    {!prospect && event.prospectId && <Link href={`${root}/prospects?prospectId=${event.prospectId}`} className="text-sm font-medium text-blue hover:underline" onClick={onClose}>
      Voir le prospect{event.prospectName ? ` · ${event.prospectName}` : ""}
    </Link>}
    {isAdmin && editing && !fixedAccountId && event.salesOwnerId && <Link href={`${commercialAdminPath}/accounts/${event.salesOwnerId}/calendar`}
      className="ml-3 text-sm font-medium text-blue hover:underline" onClick={onClose}>Fiche du commercial</Link>}
    {error && <p role="alert" className="mt-3 text-sm text-red">{error}</p>}
    {readOnly ? <div className="mt-3 grid gap-2 text-sm">
      {event.location && <p className="flex gap-2 break-words"><MapPin size={16} className="shrink-0 text-violet" aria-hidden="true" />{event.location}</p>}
      {event.message && <p className="whitespace-pre-wrap break-words">{event.message}</p>}
      {event.occurredAt && <p>Réalisé le {calendarDateLabel(event.occurredAt)}</p>}
      {event.cancelledAt && <p>Annulé le {calendarDateLabel(event.cancelledAt)}</p>}
    </div> : <form onSubmit={save} className="mt-3 grid gap-3">
      <fieldset disabled={busy} className="grid min-w-0 gap-3 tablet:grid-cols-2">
        <label className="grid gap-1 text-sm tablet:col-span-2">Intitulé<input name="title" required maxLength={160}
          defaultValue={event.title || (event.type ? calendarTypes[event.type] : "")} className="input-commercial" /></label>
        {isAdmin && !fixedAccountId && !prospect && !editing && <label className="grid gap-1 text-sm">Commercial<select value={owner}
          required onChange={(e) => { setOwner(e.target.value); setProspectId(""); setProspects([]); }} className="input-commercial">
          <option value="">Sélectionner un commercial</option>
          {accounts.filter(({ status }) => ["ACTIVE", "INVITED"].includes(status)).map((account) => <option key={account._id} value={account._id}>{account.firstName} {account.lastName}</option>)}
        </select></label>}
        <label className="grid gap-1 text-sm">Type<select value={type} onChange={(e) => setType(e.target.value)} className="input-commercial">
          {Object.entries(calendarTypes).map(([key, label]) => <option key={key} value={key}
            disabled={key === "FOLLOW_UP" && selectedProspect?.effectiveStage === "ACQUIRED"}>{label}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Date<input name="date" type="date" required defaultValue={startKey} className="input-commercial" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />Sans horaire précis</label>
        {!allDay && <>
          <label className="grid gap-1 text-sm">Heure de début<input name="startTime" type="time" defaultValue={startTime} required className="input-commercial" /></label>
          <label className="grid gap-1 text-sm">Heure de fin<input name="endTime" type="time"
            defaultValue={event.endsAt ? format(browserDate(event.endsAt), "HH:mm") : ""} className="input-commercial" /></label>
          <label className="grid gap-1 text-sm">Date de fin (si différente)<input name="endDate" type="date"
            defaultValue={event.endsAt && planningDateKey(browserDate(event.endsAt)) !== startKey ? planningDateKey(browserDate(event.endsAt)) : ""} className="input-commercial" /></label>
        </>}
        {prospect ? <p className="self-center text-sm font-medium">{prospect.restaurantName}</p> : (!isAdmin || owner) && <>
          <label className="grid gap-1 text-sm">Rechercher un prospect<input value={search} onChange={(e) => setSearch(e.target.value)} className="input-commercial" /></label>
          <label className="grid gap-1 text-sm">Prospect associé<select value={prospectId} onChange={(e) => setProspectId(e.target.value)} className="input-commercial">
            <option value="">Aucun prospect</option>
            {prospectId === event.prospectId && !prospects.some((item) => item._id === prospectId) && <option value={prospectId}>{event.prospectName || "Prospect associé"}</option>}
            {prospects.map((item) => <option key={item._id} value={item._id}
              disabled={type === "FOLLOW_UP" && item.effectiveStage === "ACQUIRED"}>
              {item.restaurantName} · {type === "FOLLOW_UP" && item.effectiveStage === "ACQUIRED" ? "Client acquis" : item.city}
            </option>)}
          </select></label>
        </>}
        <label className="grid gap-1 text-sm tablet:col-span-2">Lieu ou modalité<input name="location" defaultValue={event.location} maxLength={250} className="input-commercial" /></label>
        <label className="grid gap-1 text-sm tablet:col-span-2">Note<textarea name="message" defaultValue={event.message} maxLength={4000} className="input-commercial" /></label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="button-commercial" disabled={busy}>{editing ? "Enregistrer" : "Planifier"}</button>
        {editing && new Date(event.startsAt) <= new Date() && <button type="button" disabled={busy}
          onClick={() => update("complete")} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Marquer comme réalisé</button>}
        {editing && <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="rounded-xl px-3 py-2 text-sm text-red">Annuler l’événement</button>}
      </div>
      {confirmCancel && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-lightGrey p-3 text-sm">
        <p>Conserver cet événement comme annulé ?</p>
        <button type="button" disabled={busy} onClick={() => update("cancel")} className="button-commercial">Confirmer l’annulation</button>
        <button type="button" onClick={() => setConfirmCancel(false)} className="px-2">Retour</button>
      </div>}
    </form>}
  </dialog>;
}

export default function CommercialCalendar({ header, isAdmin = false, fixedAccountId = "", accountPath, accounts = [] }) {
  const router = useRouter();
  const global = isAdmin && !fixedAccountId;
  const [date, setDate] = useState(parisToday);
  const [display, setDisplay] = useState(isAdmin ? "calendar" : "list");
  const [view, setView] = useState(isAdmin ? "month" : "week");
  const [compact, setCompact] = useState(false);
  const [owner, setOwner] = useState("");
  const [type, setType] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [revision, setRevision] = useState(0);
  const period = getPlanningPeriod(date, view);
  const calendarMonth = display === "calendar" && view === "month";
  const gridStart = calendarMonth ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 }) : period.start;
  const gridEnd = calendarMonth ? addDays(startOfWeek(endOfMonth(date), { weekStartsOn: 1 }), 7) : period.endExclusive;
  const from = planningDateKey(gridStart);
  const to = planningDateKey(gridEnd);
  const query = eventQuery({ from, to, type, salesOwnerId: fixedAccountId || owner });
  const request = isAdmin ? adminCommercialApi : commercialApi;
  const dateParam = typeof router.query.date === "string" ? router.query.date : "";
  const eventParam = typeof router.query.event === "string" ? router.query.event : "";
  const create = router.query.create === "1";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const selected = parsePlanningDate(dateParam);
    if (selected) setDate(selected);
    if (create) setEditor({ date: selected || parisToday(), salesOwnerId: fixedAccountId });
  }, [router.isReady, dateParam, create, fixedAccountId]);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError("");
    request(`${calendarApiPath(isAdmin)}?${query}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setRows(result);
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [isAdmin, query, request, revision]);

  const linked = rows?.events.find((row) => row._id === eventParam);
  useEffect(() => {
    if (linked) setEditor(linked);
  }, [linked]);
  const closeEditor = () => {
    setEditor(null);
    if (create || eventParam) {
      const route = { ...router.query };
      for (const key of ["date", "event", "create"]) delete route[key];
      router.replace({ pathname: router.pathname, query: route }, undefined, { shallow: true });
    }
  };
  const events = (rows?.events || []).map((row) => {
    const start = browserDate(row.startsAt);
    const projectedEnd = row.endsAt && browserDate(row.endsAt);
    const minutes = row.endsAt ? (new Date(row.endsAt) - new Date(row.startsAt)) / 60000 : 30;
    return { ...row, start, end: row.allDay ? addDays(parsePlanningDate(planningDateKey(start)), 1) : projectedEnd > start ? projectedEnd : addMinutes(start, minutes) };
  });
  const compactGrid = display === "calendar" && compact && view !== "day";
  const today = planningDateKey(parisToday());
  const selected = planningDateKey(date);
  const days = [];
  if (display === "list" || compactGrid) {
    for (let day = gridStart; day < gridEnd; day = addDays(day, 1)) {
      const nextDay = addDays(day, 1);
      days.push({ date: day, key: planningDateKey(day), events: events.filter((event) => event.start < nextDay && event.end > day) });
    }
  }
  const agenda = display === "list" ? days.filter((day) => view === "day" || day.events.length) :
    compactGrid ? days.filter((day) => day.key === selected) : [];
  const periodLabel = view === "month" ? format(date, "MMMM yyyy", { locale: fr }) :
    view === "week" ? `${format(period.start, "d MMM", { locale: fr })} – ${format(period.days.at(-1), "d MMM yyyy", { locale: fr })}` : format(date, "EEEE d MMMM yyyy", { locale: fr });
  const eventTitle = (row) => [
    calendarTypes[row.type], row.title, row.prospectName, global && row.salesOwnerName,
    row.allDay ? "Sans horaire" : timeFormat.format(new Date(row.startsAt)),
  ].filter(Boolean).join(" · ");
  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title="Calendrier"
      action={<button type="button" aria-label="Nouvel événement" onClick={() => setEditor({ date, type: type || undefined, salesOwnerId: fixedAccountId || owner })} className="button-commercial inline-flex items-center gap-2">
        <CalendarPlus size={17} aria-hidden="true" /><span className={`commercial-header-action-label ${fixedAccountId ? "hidden mobile:inline" : ""}`}>Nouvel événement</span>
        {fixedAccountId && <span className="commercial-header-action-label mobile:hidden">Planifier</span>}
      </button>} {...header} />
    <div className={`${commercialPanel} grid gap-3 p-3 midTablet:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-lightGrey p-1" role="group" aria-label="Mode d’affichage">
          {[["list", "Liste", List], ["calendar", "Calendrier", CalendarDays]].map(([mode, label, Icon]) =>
            <button key={mode} type="button" aria-pressed={display === mode} onClick={() => setDisplay(mode)}
              className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold ${display === mode ? "bg-darkBlue text-white" : "text-darkBlue/75"}`}>
              <Icon size={15} aria-hidden="true" />{label}
            </button>)}
        </div>
        {compact ? <select aria-label="Période affichée" value={view} onChange={(event) => setView(event.target.value)}
          className="input-commercial max-w-full !min-h-10 !py-1.5 !text-sm">
          {Object.entries(views).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select> : <div className="flex gap-0.5 rounded-xl bg-lightGrey p-1" role="group" aria-label="Période affichée">
          {Object.entries(views).map(([key, text]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}
            className={`min-h-10 rounded-lg px-2.5 text-sm font-semibold ${view === key ? "bg-white text-[#4d399e] shadow-sm" : "text-darkBlue/75"}`}>{text}</button>)}
        </div>}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button type="button" aria-label="Période précédente" onClick={() => setDate(movePlanningDate(date, view, -1))} className={`${commercialSecondary} !px-2.5`}><ChevronLeft size={18} aria-hidden="true" /></button>
        <h2 className="text-center text-base font-bold capitalize midTablet:text-lg" aria-live="polite">{periodLabel}</h2>
        <button type="button" aria-label="Période suivante" onClick={() => setDate(movePlanningDate(date, view, 1))} className={`${commercialSecondary} !px-2.5`}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-darkBlue/10 pt-3">
        <label className="grid min-w-0 gap-1 text-sm">Aller à la date<input type="date" value={selected} className="input-commercial"
          onChange={(e) => { const value = parsePlanningDate(e.target.value); if (value) setDate(value); }} /></label>
        <button type="button" onClick={() => setDate(parisToday())} className={commercialSecondary}>Aujourd’hui</button>
        {global && <label className="grid gap-1 text-sm">Commercial<select value={owner} onChange={(e) => setOwner(e.target.value)} className="input-commercial">
          <option value="">Tous les commerciaux</option>
          {accounts.map((account) => <option key={account._id} value={account._id}>{account.firstName} {account.lastName}</option>)}
        </select></label>}
        <label className="grid gap-1 text-sm">Type d’événement<select value={type} onChange={(e) => setType(e.target.value)} className="input-commercial">
          <option value="">Tous les types</option>
          {Object.entries(calendarTypes).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select></label>
      </div>
      {display === "calendar" && !compactGrid && <ul className="flex flex-wrap items-center gap-2 text-xs" aria-label="Légende">
        {Object.entries(calendarTypes).map(([key, text]) => <li key={key} style={eventColor(key)} className="rounded-full px-2.5 py-1 font-medium">{text}</li>)}
        <li className="text-darkBlue/65">Heure de Paris</li>
      </ul>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      {rows?.truncated && <p role="status" className="text-sm">Cette période contient plus de 1 000 événements. Affinez les filtres.</p>}
      {compactGrid && <CompactCalendar days={days} selected={selected} today={today} onSelect={setDate} />}
      {display === "calendar" && !compactGrid && <div className="commercial-calendar min-w-0 overflow-hidden rounded-2xl border border-darkBlue/10">
        <Calendar localizer={localizer} culture="fr" date={date} view={view} views={Object.keys(views)} onNavigate={setDate} onView={setView}
          getNow={() => browserDate(new Date())} toolbar={false} events={events}
          className={view === "month" ? "h-[530px]" : "h-[min(65dvh,580px)] min-h-[400px]"}
          allDayAccessor="allDay" selectable popup showMultiDayTimes
          scrollToTime={new Date(2000, 0, 1, 8)} messages={{
            allDay: "Sans horaire", showMore: (n) => `+${n}`, noEventsInRange: "Aucun événement sur cette période",
          }}
          onSelectSlot={({ start, end }) => setEditor({
            date: start, type: type || undefined, salesOwnerId: fixedAccountId || owner,
            hasTime: view !== "month",
            allDay: view === "month" || (format(start, "HH:mm") === "00:00" && end - start >= 24 * 60 * 60 * 1000),
          })}
          onSelectEvent={setEditor} onKeyPressEvent={(event, keyboard) => { if (["Enter", " "].includes(keyboard.key)) setEditor(event); }}
          onDrillDown={(value) => { setDate(value); setView("day"); }}
          titleAccessor={eventTitle} eventPropGetter={(event) => ({
            style: eventColor(event.type), className: event.state === "CANCELLED" ? "line-through" : "",
          })}
          components={{ event: ({ event }) => {
            const state = calendarEventState(event);
            return <span title={`${eventTitle(event)} · ${state}`}>
              {view === "month" && !event.allDay && <span className="mr-1 whitespace-nowrap tabular-nums">{timeFormat.format(new Date(event.startsAt))}</span>}
              <strong>{calendarTypes[event.type]}</strong>
              {(event.title || event.prospectName) && <span className="hidden midTablet:inline"> · {event.title || event.prospectName}</span>}
              {state !== "Planifié" && <span className="ml-1 font-medium">· {state}</span>}
              {global && <span className="block truncate">{[event.salesOwnerName, event.title && event.prospectName].filter(Boolean).join(" · ")}</span>}
            </span>;
          } }} />
      </div>}
      {!rows && !error && <p role="status" className="text-sm text-darkBlue/70">Chargement des événements…</p>}
      {rows && agenda.length > 0 && <ol aria-label="Événements par jour"
        className={`grid min-w-0 items-start gap-3 ${display === "list" && view !== "day" ? "midTablet:grid-cols-2 desktop:grid-cols-3" : ""}`}>
        {agenda.map(({ key, date: day, events: entries }) => <AgendaDay key={key} date={day} events={entries}
          today={key === today} global={global} onSelect={setEditor} />)}
      </ol>}
      {rows && !events.length && !agenda.length && <CommercialEmpty icon={CalendarDays} title="Aucun événement sur cette période" description="Sélectionnez une autre date ou planifiez un événement." />}
    </div>
    {editor && <CommercialEventEditor event={editor} isAdmin={isAdmin} fixedAccountId={fixedAccountId} accountPath={accountPath} accounts={accounts}
      onClose={closeEditor} onSaved={() => { closeEditor(); setRevision((value) => value + 1); }} />}
  </div>;
}
