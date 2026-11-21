import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { CalendarDays, ChevronRight, Search } from "lucide-react";
import { useTranslation } from "next-i18next";
import frenchPlanning from "../../../../public/locales/fr/planning.json";
import { GlobalContext } from "@/contexts/global.context";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import { ClockDialog } from "../time-clock/register-controls.time-clock.component";
import { getAuthConfig } from "../time-clock/time-clock.utils";
import { employeeDirectoryEntry, employeeProfile, directoryPath } from "./employee-directory.utils.mjs";
import { EmployeeAvatar } from "./list.employees.component";
import { isLeaveShiftRecord, parisPlanningTime } from "./planning-grid.utils.mjs";
import {
  conflictKey, filterLeaveRequests, leaveDateKey, leaveDateLabel, leaveDuration,
  leaveDurations, leaveFormInterval, leavePeriod, leaveStatuses, plannedLeaveDuration, requestCreationTime,
} from "./leave-requests.utils.mjs";

const planningPath = `${directoryPath}/planning`;
const leavePath = `${planningPath}/days-off`;
const blankFilters = { search: "", status: "", category: "", from: "", to: "" };
const control = "min-h-10 min-w-0 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey disabled:opacity-50";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-darkBlue px-3 text-sm font-semibold text-white hover:bg-darkBlue/90 disabled:opacity-50";
const colors = {
  pending: "bg-[#fff5df] text-[#804d12]", approved: "bg-[#e1f3e9] text-[#146144]",
  rejected: "bg-[#fff0ed] text-[#943d34]", canceled: "bg-lightGrey text-darkBlue/65",
};

function StatusBadge({ status, administrative }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${colors[administrative ? "approved" : status] || colors.canceled}`}>
    {administrative ? "Enregistrée" : leaveStatuses[status] || "—"}
  </span>;
}

export function LeaveForm({ entry, people, categoryLabel, categories, selectedEmployeeId, endpoint, onSaved, onClose, personal = false }) {
  const [form, setForm] = useState(() => {
    const request = entry.request;
    const today = leaveDateKey(new Date());
    return {
      employeeId: entry.person?.id || selectedEmployeeId || "",
      absenceType: request?.absenceType || "",
      type: request?.type || "full",
      startDate: leaveDateKey(request?.start) || today,
      endDate: leaveDateKey(request?.end) || today,
      startTime: request?.start ? parisPlanningTime(new Date(request.start)) : "09:00",
      endTime: request?.end ? parisPlanningTime(new Date(request.end)) : "17:00",
      note: request?.note || "",
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const absence = entry.mode === "absence";
  const edit = Boolean(entry.request);
  const person = people.find(({ id }) => id === form.employeeId);
  const interval = leaveFormInterval(form);
  const shifts = person?.shifts || [];
  const collisions = interval ? shifts.filter((shift) => String(shift._id) !== String(entry.request?._id)
    && +new Date(shift.start) < +interval.end && +new Date(shift.end) > +interval.start) : [];
  const half = ["morning", "afternoon"].includes(form.type);

  function change(key, value) {
    setError("");
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (["morning", "afternoon"].includes(next.type) || next.endDate < next.startDate) next.endDate = next.startDate;
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!person || !interval || busy) return;
    setBusy(true);
    setError("");
    const baseUrl = endpoint(person.id, absence ? "shifts" : "leave-requests");
    const payload = absence ? {
      start: interval.start.toISOString(), end: interval.end.toISOString(),
      isLeave: true, absenceType: form.absenceType || null, absenceDuration: form.type,
    } : form;
    try {
      const { data } = await axios[edit ? "put" : "post"](
        edit ? `${baseUrl}/${entry.request._id}` : baseUrl, payload, getAuthConfig(),
      );
      onSaved(person.id, data, absence ? "Absence enregistrée dans le planning." : edit ? "Demande modifiée." : "Demande enregistrée.");
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’enregistrer. Réessayez.");
      setBusy(false);
    }
  }

  return (
    <ClockDialog title={edit ? absence ? "Modifier l’absence" : "Modifier la demande" : absence ? "Enregistrer une absence" : "Nouvelle demande de congé"} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="grid gap-4">
        {!edit && !absence && <p className="rounded-lg bg-lightGrey px-3 py-2 text-sm text-darkBlue/80">
          La demande est créée avec le statut En attente. Elle sera ajoutée au planning après approbation.
        </p>}
        <fieldset disabled={busy} className="grid gap-3 midTablet:grid-cols-2">
          {!personal && <label className="grid gap-1 text-sm font-semibold">
            Salarié
            <select className={control} required disabled={edit} value={form.employeeId} onChange={(event) => change("employeeId", event.target.value)}>
              <option value="">Sélectionner</option>
              {people.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <label className="grid gap-1 text-sm font-semibold">
            Type d’absence
            <select className={control} value={form.absenceType} onChange={(event) => change("absenceType", event.target.value)}>
              <option value="">Non précisé</option>
              {categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold midTablet:col-span-2">
            Durée
            <select className={control} value={form.type} onChange={(event) => change("type", event.target.value)}>
              {Object.entries(leaveDurations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">Date de début
            <input className={control} type="date" required value={form.startDate} onChange={(event) => change("startDate", event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Date de fin
            <input className={control} type="date" required min={form.startDate} disabled={half} value={form.endDate} onChange={(event) => change("endDate", event.target.value)} />
          </label>
          {form.type === "custom" && <>
            <label className="grid gap-1 text-sm font-semibold">Heure de début
              <input className={control} type="time" required value={form.startTime} onChange={(event) => change("startTime", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Heure de fin
              <input className={control} type="time" required value={form.endTime} onChange={(event) => change("endTime", event.target.value)} />
            </label>
          </>}
          {!absence && <label className="grid gap-1 text-sm font-semibold midTablet:col-span-2">
            Commentaire facultatif
            <textarea className={`${control} py-2`} maxLength={1000} value={form.note} onChange={(event) => change("note", event.target.value)} />
          </label>}
        </fieldset>
        {interval ? <p className="text-sm text-darkBlue/75">Durée calculée · <strong>{leaveDuration(interval)}</strong></p>
          : <p role="status" className="text-sm text-[#943d34]">Vérifiez la période et les heures choisies.</p>}
        {collisions.length > 0 && <ConflictList shifts={collisions} />}
        {error && <p role="alert" className="rounded-lg bg-[#fff0ed] p-3 text-sm text-[#943d34]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={button} disabled={busy} onClick={onClose}>Fermer</button>
          <button type="submit" disabled={!person || !interval || busy || (absence && collisions.length > 0)} className={primary}>
            {busy ? "Enregistrement…" : absence ? "Enregistrer l’absence" : edit ? "Enregistrer les changements" : "Créer la demande"}
          </button>
        </div>
      </form>
    </ClockDialog>
  );
}

function ConflictList({ shifts }) {
  return (
    <section className="grid gap-2 rounded-lg border border-[#ead4aa] bg-[#fff8e9] p-3 text-sm text-[#704715]">
      <h3 className="font-semibold">Conflits dans le planning</h3>
      <ul className="grid gap-1">
        {shifts.map((shift) => <li key={shift._id}>{shift.title || (isLeaveShiftRecord(shift) ? "Absence" : "Shift")} · {leavePeriod(shift, true)}</li>)}
      </ul>
    </section>
  );
}

function LeaveDetail({ item, restaurantName, categoryLabel, endpoint, onSaved, onEdit, onClose }) {
  const { request, person, administrative } = item;
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = request.status === "pending" && !administrative;
  const root = `${endpoint(person.id, administrative ? "shifts" : "leave-requests")}/${request._id}`;
  const conflicts = preview?.conflictShifts || [];
  const blocked = Boolean(preview?.locked) || conflicts.some((shift) => shift.canDelete !== true);

  useEffect(() => {
    if (!pending) return undefined;
    const controller = new AbortController();
    axios.get(`${root}/conflicts`, getAuthConfig({ signal: controller.signal }))
      .then(({ data }) => { if (!controller.signal.aborted) setPreview(data); })
      .catch((failure) => {
        if (!controller.signal.aborted) setPreviewError(failure.response?.data?.message || "Impossible de vérifier le planning.");
      });
    return () => controller.abort();
  }, [pending, root, revision]);

  async function confirm() {
    if (busy || !decision) return;
    setBusy(true);
    setError("");
    try {
      const { data } = administrative
        ? await axios.delete(root, getAuthConfig())
        : await axios.put(root, {
          status: decision, decisionNote: note,
          ...(decision === "approved" && conflicts.length && {
            resolveConflict: "delete_conflicting_shifts", confirmedConflicts: conflicts.map(conflictKey),
          }),
        }, getAuthConfig());
      onSaved(person.id, data, administrative ? "Absence retirée du planning." : "Décision enregistrée.");
    } catch (failure) {
      const data = failure.response?.data;
      setError(data?.message || "Impossible d’enregistrer la décision.");
      if (data?.conflictShifts) {
        setPreview({ conflictShifts: data.conflictShifts, locked: null });
        setDecision("");
      }
      setBusy(false);
    }
  }

  return (
    <ClockDialog title={administrative ? "Absence au planning" : "Détail de la demande"} onClose={() => { if (!busy) onClose(); }}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3"><EmployeeAvatar entry={person} /><div><p className="font-semibold">{person.name}</p><p className="text-sm text-darkBlue/65">{restaurantName}</p></div></div>
          <StatusBadge status={request.status} administrative={administrative} />
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-lightGrey/65 p-3 text-sm">
          <div><dt className="text-xs text-darkBlue/65">Type d’absence</dt><dd className="mt-1 font-semibold">{categoryLabel(request.absenceType)}</dd></div>
          <div><dt className="text-xs text-darkBlue/65">Durée</dt><dd className="mt-1 font-semibold">{leaveDuration(request)} · {leaveDurations[request.type]}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-darkBlue/65">Période</dt><dd className="mt-1 font-semibold">{leavePeriod(request)}</dd></div>
          {!administrative && <div><dt className="text-xs text-darkBlue/65">Demande effectuée le</dt><dd className="mt-1 font-semibold">{leaveDateLabel(requestCreationTime(request))}</dd></div>}
        </dl>
        {request.note && <div><h3 className="text-sm font-semibold">Commentaire</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-darkBlue/75">{request.note}</p></div>}
        {request.history?.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Historique</h3>
            <ol className="grid gap-2">
              {[...request.history].reverse().map((event, index) => <li key={index} className="border-l-2 border-darkBlue/10 pl-3 text-sm">
                <p className="font-medium">{event.action === "edited" ? "Demande modifiée" : `${leaveStatuses[event.from]} → ${leaveStatuses[event.to]}`}</p>
                <p className="text-xs text-darkBlue/65">{[event.actor?.name, leaveDateLabel(event.at)].filter(Boolean).join(" · ")}</p>
                {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
              </li>)}
            </ol>
          </section>
        )}
        {pending && !preview && !previewError && <p role="status" className="text-sm text-darkBlue/65">Vérification du planning…</p>}
        {previewError && <div className="flex flex-wrap items-center gap-2 text-sm text-[#943d34]">
          <p role="alert">{previewError}</p>
          <button type="button" className={button} onClick={() => { setPreviewError(""); setRevision((value) => value + 1); }}>Réessayer</button>
        </div>}
        {conflicts.length > 0 && <ConflictList shifts={conflicts} />}
        {preview?.locked && <p role="alert" className="rounded-lg bg-[#fff0ed] p-3 text-sm text-[#943d34]">{preview.locked.date} · {preview.locked.message}</p>}
        {error && <p role="alert" className="rounded-lg bg-[#fff0ed] p-3 text-sm text-[#943d34]">{error}</p>}
        {decision ? (
          <div className="grid gap-3 rounded-lg border border-darkBlue/15 p-3 text-sm">
            <p>{administrative ? "Retirer cette absence du planning ?" : decision === "approved" ?
              conflicts.length ? `L’approbation supprimera les ${conflicts.length} créneaux listés et ajoutera l’absence au planning. Confirmer ?`
                : "L’approbation ajoutera l’absence au planning. Confirmer ?" :
              decision === "rejected" ? "Refuser cette demande de congé ?" : "Annuler cette demande de congé ?"}</p>
            {!administrative && <label className="grid gap-1 font-semibold">
              Note de décision facultative
              <textarea className={`${control} py-2`} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
            </label>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={button} disabled={busy} onClick={() => { setDecision(""); setError(""); }}>Retour</button>
              <button type="button" className={primary} disabled={busy} onClick={confirm}>{busy ? "Enregistrement…" : "Confirmer"}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {(pending || administrative) && <button type="button" className={button} onClick={onEdit}>Modifier</button>}
            {(pending || administrative || request.status === "approved") && <button type="button" className={button} onClick={() => setDecision("canceled")}>{administrative ? "Retirer l’absence" : "Annuler la demande"}</button>}
            {pending && <>
              <button type="button" className={button} onClick={() => setDecision("rejected")}>Refuser</button>
              <button type="button" className={primary} disabled={!preview || blocked} onClick={() => setDecision("approved")}>Approuver</button>
            </>}
          </div>
        )}
      </div>
    </ClockDialog>
  );
}

export default function DaysOffEmployeesComponent() {
  const { t } = useTranslation("planning");
  const { restaurantContext } = useContext(GlobalContext);
  const { restaurantData: restaurant, setRestaurantData } = restaurantContext;
  const restaurantId = String(restaurant._id);
  const router = useRouter();
  const [filters, setFilters] = useState(blankFilters);
  const [mode, setMode] = useState("requests");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const storageKey = `gusto:leave-requests:${restaurantContext.userConnected.id}:${restaurantId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved) setFilters({ ...blankFilters, ...saved });
    } catch { /* The views still work without session storage. */ }
  }, [storageKey]);

  function filter(patch) {
    const next = { ...filters, ...patch };
    setFilters(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Filters stay active in memory. */ }
  }

  const categoryLabels = frenchPlanning.absenceTypes;
  const categories = Object.keys(categoryLabels);
  const categoryLabel = (value) => value && value !== "unspecified" ? t(`absenceTypes.${value}`, { defaultValue: categoryLabels[value] || "Autre absence" }) : "Non précisé";
  const people = (restaurant.employees || []).filter((employee) => employee.accountType !== "accountant").map((employee) => {
    const profile = employeeProfile(employee, restaurantId);
    return {
      ...employeeDirectoryEntry(employee, restaurantId),
      shifts: employee.shifts ?? profile?.shifts ?? [],
      requests: employee.leaveRequests ?? profile?.leaveRequests ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const employeeId = (!router.query.restaurantId || router.query.restaurantId === restaurantId) && typeof router.query.employeeId === "string"
    ? router.query.employeeId : "";
  const selectedPerson = people.find(({ id }) => id === employeeId);
  const requested = people.flatMap((person) => person.requests.map((request) => ({ person, request })))
    .sort((a, b) => requestCreationTime(b.request) - requestCreationTime(a.request));
  const planned = people.flatMap((person) => person.shifts.filter(isLeaveShiftRecord).map((shift) => ({
    person, planned: true, administrative: !shift.leaveRequestId,
    request: { ...shift, status: "approved", type: plannedLeaveDuration(shift) },
  }))).sort((a, b) => +new Date(b.request.start) - +new Date(a.request.start));
  const invalidPeriod = Boolean(filters.from && filters.to && filters.to < filters.from);
  const filterValues = { ...filters, employeeId };
  const filteredRequests = invalidPeriod ? [] : filterLeaveRequests(requested, filterValues);
  const records = mode === "planned" ? (invalidPeriod ? [] : filterLeaveRequests(planned, filterValues))
    : filteredRequests.filter(({ request }) => !filters.status || request.status === filters.status);
  const endpoint = (id, resource) => `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${id}/${resource}`;
  const dialogItem = dialog?.kind === "detail" && (dialog.planned ? planned : requested).find(({ request }) => String(request._id) === dialog.id);
  const deepLink = typeof router.query.requestId === "string" && (!router.query.restaurantId || router.query.restaurantId === restaurantId) ? router.query.requestId : "";
  const deepLinkExists = requested.some(({ request }) => String(request._id) === deepLink);

  useEffect(() => {
    if (deepLink && deepLinkExists) setDialog({ kind: "detail", id: deepLink, planned: false });
  }, [deepLink, deepLinkExists]);

  function closeDialog() {
    setDialog(null);
    if (deepLink) {
      const query = { ...router.query };
      delete query.requestId;
      router.replace({ pathname: leavePath, query }, undefined, { shallow: true, scroll: false });
    }
  }

  function save(personId, data, message) {
    setRestaurantData((previous) => {
      if (String(previous?._id) !== restaurantId) return previous;
      const replace = (requests) => Array.isArray(data) ? data : data.leaveRequest
        ? requests.map((request) => String(request._id) === String(data.leaveRequest._id) ? data.leaveRequest : request) : requests;
      return {
        ...previous, employees: (previous.employees || []).map((employee) => {
          if (String(employee._id) !== personId) return employee;
          const profile = employeeProfile(employee, restaurantId);
          const leaveRequests = replace(employee.leaveRequests ?? profile?.leaveRequests ?? []);
          const shifts = data.shifts ?? employee.shifts ?? profile?.shifts ?? [];
          return {
            ...employee, leaveRequests, shifts,
            restaurantProfiles: employee.restaurantProfiles?.map((profile) =>
              String(profile.restaurant) === restaurantId ? { ...profile, leaveRequests, shifts } : profile),
          };
        }),
      };
    });
    closeDialog();
    setNotice(message);
  }

  function openRecord(item) {
    const linked = item.request.leaveRequestId && requested.find(({ request }) => String(request._id) === String(item.request.leaveRequestId));
    if (item.planned && !item.administrative && !linked) {
      router.push({ pathname: planningPath, query: { employeeId: item.person.id, restaurantId } });
      return;
    }
    setDialog({ kind: "detail", id: String((linked || item).request._id), planned: Boolean(item.planned && !linked) });
  }

  return (
    <section className="grid min-w-0 gap-4">
      <CatalogHeaderDashboardComponent title="Congés et absences" backLabel="Retour au planning"
        onBack={() => router.push(planningPath)} actionsClassName="self-center"
        actions={<button type="button" className={primary} onClick={() => setDialog({ kind: "form", mode: "absence" })}>
          <CalendarDays size={16} aria-hidden="true" /> Enregistrer une absence
        </button>}
      />
      {notice && <p role="status" className="rounded-lg bg-[#e1f3e9] px-3 py-2 text-sm text-[#146144]">{notice}</p>}
      <nav aria-label="Vues des congés" className="flex gap-3 border-b border-darkBlue/10">
        {[["requests", "Demandes de congés"], ["planned", "Absences au planning"]].map(([key, label]) =>
          <button key={key} type="button" aria-current={mode === key ? "page" : undefined} onClick={() => setMode(key)}
            className={`-mb-px min-h-11 border-b-2 px-2 text-sm font-semibold ${mode === key ? "border-blue text-blue" : "border-[transparent] text-darkBlue/70"}`}>{label}</button>)}
      </nav>
      <div className="min-w-0 rounded-xl border border-darkBlue/10 bg-white">
        {mode === "requests" && <div className="flex flex-wrap gap-1 border-b border-darkBlue/10 p-3" aria-label="Filtrer par statut">
          {[["", "Toutes"], ...Object.entries(leaveStatuses)].map(([value, label]) => {
            const total = value ? filteredRequests.filter(({ request }) => request.status === value).length : filteredRequests.length;
            return <button key={value} type="button" aria-pressed={filters.status === value} onClick={() => filter({ status: value })}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold ${filters.status === value ? "bg-darkBlue text-white" : "text-darkBlue/75 hover:bg-lightGrey"}`}>
              {label}<span className="text-xs tabular-nums opacity-75">{total}</span>
            </button>;
          })}
        </div>}
        <div className="flex flex-wrap items-end gap-2 p-3">
          {employeeId ? <div className="flex min-h-10 flex-1 items-center gap-3 text-sm">
            <strong>{selectedPerson?.name || "Salarié indisponible"}</strong>
            <Link href={leavePath} shallow className="font-semibold text-blue underline">Voir tous les salariés</Link>
          </div> : <label className="relative min-w-[min(100%,13rem)] flex-1">
            <Search size={16} className="pointer-events-none absolute bottom-3 left-3 text-darkBlue/55" aria-hidden="true" />
            <input className={`${control} w-full pl-9`} type="search" aria-label="Rechercher un salarié" placeholder="Rechercher un salarié"
              value={filters.search} onChange={(event) => filter({ search: event.target.value })} />
          </label>}
          <select className={control} aria-label="Filtrer par type d’absence" value={filters.category} onChange={(event) => filter({ category: event.target.value })}>
            <option value="">Tous les types</option><option value="unspecified">Non précisé</option>
            {categories.map((key) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
          </select>
          <label className="grid gap-0.5 text-xs font-semibold">Du<input type="date" className={control} value={filters.from} onChange={(event) => filter({ from: event.target.value })} /></label>
          <label className="grid gap-0.5 text-xs font-semibold">Au<input type="date" className={control} value={filters.to} onChange={(event) => filter({ to: event.target.value })} /></label>
          {Object.values(filters).some(Boolean) && <button type="button" className={button} onClick={() => filter(blankFilters)}>Effacer les filtres</button>}
        </div>
        {invalidPeriod ? <p role="alert" className="p-4 text-sm text-[#943d34]">La fin de période doit suivre le début.</p> : records.length ? (
          <div role="region" aria-label={mode === "requests" ? "Tableau des demandes de congés" : "Tableau des absences"} tabIndex={0} className="overflow-x-auto rounded-b-xl">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#f4f6fb] text-xs text-darkBlue/75"><tr>
                {["Salarié", "Type d’absence", "Dates", "Durée", ...(mode === "requests" ? ["Demande du", "Validateur"] : []), "Statut", "Détail"].map((label) =>
                  <th scope="col" className="whitespace-nowrap px-3 py-3" key={label}>{label}</th>)}
              </tr></thead>
              <tbody>
                {records.map((item) => {
                  const { person, request } = item;
                  const decision = [...(request.history || [])].reverse().find(({ action }) => action === "decision");
                  return <tr className="border-t border-darkBlue/10 hover:bg-lightGrey/50" key={`${person.id}:${request._id}`}>
                    <td className="px-3 py-2"><div className="flex min-w-36 items-center gap-2 font-semibold"><EmployeeAvatar entry={person} />{person.name}</div></td>
                    <td className="px-3 py-2">{categoryLabel(request.absenceType)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{leavePeriod(request)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{leaveDuration(request)}</td>
                    {mode === "requests" && <><td className="whitespace-nowrap px-3 py-2">{leaveDateLabel(requestCreationTime(request))}</td><td className="px-3 py-2">{decision?.actor?.name || "—"}</td></>}
                    <td className="px-3 py-2"><StatusBadge status={request.status} administrative={item.administrative} /></td>
                    <td className="w-px px-3 py-2"><button type="button" className={button} aria-label={`Voir le détail pour ${person.name}`} onClick={() => openRecord(item)}><ChevronRight size={16} aria-hidden="true" /></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="border-t border-darkBlue/10 px-4 py-9 text-center text-sm text-darkBlue/70">
          {mode === "requests" ? "Aucune demande de congé pour cette sélection." : "Aucune absence au planning pour cette sélection."}
        </p>}
      </div>
      {dialog?.kind === "form" && <LeaveForm entry={dialog} people={people} categoryLabel={categoryLabel} categories={categories}
        selectedEmployeeId={selectedPerson?.id} endpoint={endpoint} onSaved={save} onClose={closeDialog} />}
      {dialogItem && <LeaveDetail key={dialog.id} item={dialogItem} restaurantName={restaurant.name} categoryLabel={categoryLabel}
        endpoint={endpoint} onSaved={save} onClose={closeDialog} onEdit={() => setDialog({
          kind: "form", mode: dialogItem.administrative ? "absence" : "request", person: dialogItem.person, request: dialogItem.request,
        })} />}
    </section>
  );
}
