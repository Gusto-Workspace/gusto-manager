import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, Columns3, ContactRound, History, List, MapPin, MessageSquarePlus, Plus, Store, X } from "lucide-react";
import { useRouter } from "next/router";
import { getParisPlanningInstant, parisPlanningDateKey } from "@/components/dashboard/employees/planning-grid.utils.mjs";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { adminCommercialApi as adminApi, commercialAdminPath, commercialApi, sellerPath } from "./commercial-api";
import { calendarApiPath, calendarDateLabel, calendarEventState, calendarTypes, CommercialEventEditor } from "./commercial-calendar";
import { AdminProspectDraft } from "./sales-documents";
import IntegrationFiles from "./integration-files";
import { CommercialAvatar, CommercialBadge, CommercialEmpty, CommercialHeader, CommercialSearch, CommercialSubheading, commercialPanel, commercialSecondary } from "./commercial-ui";

export const stageLabels = {
  TO_CONTACT: "À contacter", CONTACTED: "Contacté", INTERESTED: "Intéressé", NEGOTIATION: "En négociation",
  QUOTE_SENT: "Devis envoyé", CONTRACT_SENT: "Contrat envoyé",
  ACQUIRED: "Client acquis", NOT_INTERESTED: "Non intéressé", LOST: "Perdu", OPPOSED: "Opposition",
};
const automaticStages = ["QUOTE_SENT", "CONTRACT_SENT", "ACQUIRED"];
const stageColors = {
  TO_CONTACT: "bg-[#fef3c7] text-[#78350f]", CONTACTED: "bg-[#eaf0fc] text-[#244b95]", INTERESTED: "bg-[#cffafe] text-[#164e63]",
  NEGOTIATION: "bg-[#e0e7ff] text-[#312e81]", QUOTE_SENT: "bg-[#ede9fe] text-[#4c1d95]", CONTRACT_SENT: "bg-[#f3e8ff] text-[#581c87]",
  ACQUIRED: "bg-[#dcfce7] text-[#14532d]", NOT_INTERESTED: "bg-[#f1f5f9] text-[#334155]",
  LOST: "bg-[#fee2e2] text-[#7f1d1d]", OPPOSED: "bg-[#fce7f3] text-[#831843]",
};
const eventLabels = {
  CALL: "Appel", EMAIL: "Email", APPOINTMENT: "Rendez-vous", DEMO: "Démonstration", NOTE: "Note", FOLLOW_UP: "Relance",
  OTHER: "Autre", ASSIGNMENT: "Réattribution", OPPOSITION: "Opposition", ARCHIVED: "Archivage", RESTORED: "Restauration",
  STAGE_CHANGED: "Changement de statut", PROFILE_UPDATED: "Coordonnées de l’établissement modifiées",
  QUOTE_SENT: "Devis envoyé", CONTRACT_SENT: "Contrat envoyé", CONTRACT_SIGNED: "Contrat signé",
  INVOICE_CREATED: "Facture créée", INVOICE_SENT: "Facture envoyée", INVOICE_PAID: "Facture payée", INVOICE_CANCELLED: "Facture annulée",
  LINK_REPLACED: "Lien de signature remplacé", LINK_REVOKED: "Lien de signature révoqué", LINK_EXPIRED: "Lien de signature expiré",
  ACQUIRED: "Client acquis",
};
const moduleLabels = { reservations: "Réservations", gift_cards: "Cartes cadeaux", take_away: "Vente à emporter", employees: "Gestion du personnel" };
const manualStages = Object.keys(stageLabels).filter((value) => !automaticStages.includes(value) && value !== "OPPOSED");
const eligibleAccounts = (accounts) => accounts.filter(({ status }) => ["ACTIVE", "INVITED"].includes(status));
const fields = [
  ["restaurantName", "Nom du restaurant", "text", 160], ["contactName", "Responsable", "text", 160],
  ["address", "Adresse", "text", 250], ["postalCode", "Code postal", "text", 12], ["city", "Ville", "text", 120],
  ["siret", "SIRET", "text", 14], ["phone", "Téléphone professionnel", "tel", 40], ["email", "Email professionnel", "email", 254],
  ["website", "Site internet", "text", 500], ["source", "Source du prospect", "text", 160],
];
const dateLabel = (value) => value ? calendarDateLabel(value) : "—";
const outline = commercialSecondary;

function StageBadge({ stage }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${stageColors[stage] || "bg-lightGrey"}`}>{stageLabels[stage] || stage}</span>;
}

function FollowUp({ value, acquired }) {
  if (acquired) return <span className="text-darkBlue/60" title="Prospection terminée">—</span>;
  if (!value) return <span className="text-darkBlue/60">Aucune relance</span>;
  const date = parisPlanningDateKey(new Date(value));
  const today = parisPlanningDateKey(new Date());
  const tone = date < today ? "text-[#991b1b]" : date === today ? "text-[#9a3412]" : "text-darkBlue/80";
  return <span className={tone}><span className="font-medium">{date < today ? "En retard" : date === today ? "Aujourd’hui" : "À venir"}</span>
    <span className="block">{calendarDateLabel(value, true)}</span>
  </span>;
}

function AccountSelect({ accounts, name = "salesOwnerId", defaultValue, value, onChange, all }) {
  return <select name={name} defaultValue={value === undefined ? defaultValue || "" : undefined} value={value} onChange={onChange} className="input-commercial" required={!all}>
    <option value="">{all ? "Tous les commerciaux" : "Sélectionner un commercial"}</option>
    {accounts.map((account) => <option key={account._id} value={account._id}>{account.firstName} {account.lastName}</option>)}
  </select>;
}

function Pager({ page, total, limit, onChange }) {
  if (total <= limit) return null;
  return <div className="flex items-center justify-between gap-2 pt-3 text-sm">
    <button type="button" disabled={page <= 1} className="p-2 text-blue disabled:opacity-40" onClick={() => onChange(page - 1)}>Précédent</button>
    <span>Page {page}</span>
    <button type="button" disabled={page * limit >= total} className="p-2 text-blue disabled:opacity-40" onClick={() => onChange(page + 1)}>Suivant</button>
  </div>;
}

function ProspectEditor({ initial, accounts, path, request, isAdmin, fixedAccountId, accountPath, onSaved, onClose }) {
  const [item, setItem] = useState(initial);
  const [history, setHistory] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(!initial);
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [scheduled, setScheduled] = useState(null);
  const [eventEditor, setEventEditor] = useState(null);
  const [draftType, setDraftType] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const id = item?._id;
  const locked = Boolean(item?.archivedAt || item?.opposedAt);

  const loadHistory = useCallback(async (signal) => {
    if (!id) return;
    const data = await request(`${path}/${id}/interactions?page=${historyPage}&timeline=true`, { signal });
    setHistory(data);
  }, [id, historyPage, path, request]);

  const loadSchedule = useCallback(async (signal) => {
    if (!id) return;
    setScheduled(await request(`${calendarApiPath(isAdmin)}?prospectId=${id}&upcoming=true`, { signal }));
  }, [id, isAdmin, request]);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [loadHistory]);

  useEffect(() => {
    const controller = new AbortController();
    loadSchedule(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [loadSchedule]);

  async function run(work) {
    setBusy(true);
    setError("");
    try {
      await work();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const { prospect } = await request(`${path}/${id}`);
    setItem(prospect);
    await Promise.all([loadHistory(), loadSchedule()]);
  }

  function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { ...Object.fromEntries(form), modules: form.getAll("module") };
    if (!id && fixedAccountId) body.salesOwnerId = fixedAccountId;
    delete body.module;
    run(async () => {
      const data = await request(id ? `${path}/${id}` : path, { method: id ? "PATCH" : "POST", body });
      setItem(data.prospect);
      setEditing(false);
      if (id) await loadHistory();
    });
  }

  function addInteraction(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (body.occurredAt) {
      const [date, time] = body.occurredAt.split("T");
      const instant = getParisPlanningInstant(date, time);
      if (!instant) { setError("Cette heure n’existe pas à Paris à la date choisie."); return; }
      body.occurredAt = instant.toISOString();
    }
    run(async () => {
      await request(`${path}/${id}/interactions`, { method: "POST", body });
      setAddingInteraction(false);
      await refresh();
      if (historyPage !== 1) setHistoryPage(1);
    });
  }

  function reassign(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => {
      await request(`${path}/${id}/reassign`, { method: "POST", body });
      if (fixedAccountId && body.salesOwnerId !== fixedAccountId) onClose();
      else await refresh();
    });
  }

  return <section id="prospect-details" className={`${commercialPanel} grid scroll-mt-20 gap-4 p-4 midTablet:p-6 tablet:scroll-mt-5`}>
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-[#f6f3ff] p-4">
      <div className="flex min-w-0 items-center gap-3">
        {item ? <CommercialAvatar name={item.restaurantName} /> : <Store size={25} className="shrink-0 text-violet" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold tracking-tight">{item?.restaurantName || "Nouveau prospect"}</h2>
          {item && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <StageBadge stage={item.effectiveStage} />
            {item.archivedAt && <CommercialBadge>Archivé</CommercialBadge>}
            {isAdmin && <span className="text-darkBlue/75">{item.salesOwnerName || "Commercial non renseigné"}</span>}
          </div>}
        </div>
      </div>
      <button type="button" onClick={onClose} className={outline}><X size={16} aria-hidden="true" />Fermer la fiche</button>
    </div>
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {id && !locked && <div className="flex flex-wrap gap-2">
      <button type="button" className="button-commercial inline-flex items-center gap-2" onClick={() => setAddingInteraction((value) => !value)} aria-expanded={addingInteraction}><MessageSquarePlus size={17} aria-hidden="true" />Ajouter une interaction</button>
      {[[ "FOLLOW_UP", "Programmer une relance"], ["APPOINTMENT", "Programmer un rendez-vous"], ["DEMO", "Programmer une démonstration"]]
        .filter(([type]) => type !== "FOLLOW_UP" || item.effectiveStage !== "ACQUIRED").map(([type, label]) => (
        <button type="button" key={type} className={outline} onClick={() => setEventEditor({ type })}>{label}</button>
      ))}
      {!isAdmin && [["quotes", "Créer un devis"], ["contracts", "Créer un contrat"]].map(([view, label]) => (
        <Link key={view} href={`${sellerPath}/${view}?prospect=${id}&create=1`} className={`${outline} text-blue`}>{label}</Link>
      ))}
      {isAdmin && [["QUOTE", "Créer un devis"], ["CONTRACT", "Créer un contrat"],
        ...(item.milestones?.contractSignedAt ? [["INVOICE", "Créer une facture"]] : [])].map(([type, label]) => (
        <button type="button" key={type} onClick={() => { setDraftSaved(false); setDraftType(type); }} className={`${outline} text-blue`}>{label}</button>
      ))}
    </div>}
    {draftType && item && !locked && <AdminProspectDraft key={draftType} type={draftType} prospect={item}
      onClose={() => setDraftType("")} onSaved={() => { setDraftType(""); setDraftSaved(true); onSaved(); }} />}
    {draftSaved && <p role="status" className="text-sm text-green">Brouillon enregistré dans les documents du prospect.</p>}
    {addingInteraction && !locked && <form onSubmit={addInteraction} className="grid gap-3 rounded-xl bg-lightGrey p-3 tablet:grid-cols-2">
      <label className="grid gap-1 text-sm">Type d’interaction<select name="type" className="input-commercial">
        {Object.keys(eventLabels).slice(0, 7).map((key) => <option key={key} value={key}>{eventLabels[key]}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Date de l’interaction (heure de Paris)<input type="datetime-local" name="occurredAt" className="input-commercial" /></label>
      <label className="grid gap-1 text-sm tablet:col-span-2">Compte rendu<textarea name="message" maxLength={4000} className="input-commercial" /></label>
      <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer l’interaction</button>
    </form>}
    {item && !editing && <div className="grid gap-3 midTablet:grid-cols-2">
      <div className="grid content-start gap-1.5 rounded-2xl border border-darkBlue/10 p-4 text-sm">
        <h3 className="mb-1 flex items-center gap-2 font-bold"><ContactRound size={17} className="text-violet" aria-hidden="true" />Restaurant et coordonnées</h3>
        <p>{[item.address, [item.postalCode, item.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse non renseignée"}</p>
        <p>{item.contactName || "Responsable non renseigné"}</p>
        <div className="flex flex-wrap gap-x-3 break-all text-blue">
          {item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}
          {item.email && <a href={`mailto:${item.email}`}>{item.email}</a>}
          {item.website && <a href={item.website} target="_blank" rel="noreferrer">Site internet</a>}
        </div>
        {item.siret && <p>SIRET {item.siret}</p>}
        <p>Dernier contact {dateLabel(item.lastContactAt)}</p>
      </div>
      <div className="grid content-start gap-1.5 rounded-2xl border border-darkBlue/10 bg-[#faf9fd] p-4 text-sm">
        <h3 className="mb-1 font-bold">Notes</h3>
        {item.needs && <p className="whitespace-pre-wrap break-words">{item.needs}</p>}
        {item.modules?.length > 0 && <p>{item.modules.map((key) => moduleLabels[key]).filter(Boolean).join(" · ")}</p>}
        {item.notes && <p className="whitespace-pre-wrap break-words">{item.notes}</p>}
        {item.source && <p className="text-darkBlue/70">Source · {item.source}</p>}
        {!item.needs && !item.modules?.length && !item.notes && !item.source && <p className="text-darkBlue/65">Aucun besoin ou note renseigné.</p>}
        {item.archivePurgeAt && <p>Archivé après intégration. Conservation opérationnelle jusqu’au {dateLabel(item.archivePurgeAt)}.</p>}
        {id && item.milestones?.contractSignedAt && (isAdmin || !locked || item.archivePurgeAt) &&
          (!item.archivePurgeAt || new Date(item.archivePurgeAt) > new Date()) &&
          <IntegrationFiles path={`${path}/${id}/integration`} request={request} isAdmin={isAdmin} />}
      </div>
      {!locked && <button type="button" className={`${outline} w-fit text-blue`} onClick={() => setEditing(true)}>Modifier la fiche et le statut</button>}
    </div>}
    {editing && <form onSubmit={save} className="grid gap-3">
      <fieldset disabled={locked || busy} className="grid min-w-0 gap-3 tablet:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Restaurant et contact</legend>
        {fields.filter(([name]) => name !== "source").map(([name, label, type, maxLength]) => <label key={name} className="grid min-w-0 gap-1 text-sm">
          {label}<input name={name} type={type} defaultValue={item?.[name] || ""} maxLength={maxLength} required={name === "restaurantName"} className="input-commercial" />
        </label>)}
      </fieldset>
      <fieldset disabled={locked || busy} className="grid min-w-0 gap-3 border-t border-darkBlue/10 pt-3 tablet:grid-cols-2">
        <legend className="pr-2 text-sm font-semibold">Suivi commercial</legend>
        {item?.effectiveStage !== "ACQUIRED" && <label className="grid gap-1 text-sm">Statut du suivi<select name="stage" defaultValue={item?.stage || "TO_CONTACT"} className="input-commercial">
          {manualStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
        </select></label>}
        {automaticStages.includes(item?.effectiveStage) && <p className="self-end text-sm text-darkBlue/70">Le suivi tient compte des documents envoyés et de la signature du contrat.</p>}
        {isAdmin && !id && !fixedAccountId && <label className="grid gap-1 text-sm">Commercial attribué<AccountSelect accounts={eligibleAccounts(accounts)} /></label>}
      </fieldset>
      <details className="rounded-xl border border-darkBlue/10 bg-lightGrey/50 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Besoins, notes et source</summary>
        <fieldset disabled={locked || busy} className="mt-3 grid gap-3 tablet:grid-cols-2">
        <label className="grid gap-1 text-sm tablet:col-span-2">Source du prospect<input name="source" defaultValue={item?.source} maxLength={160} className="input-commercial" /></label>
        <fieldset className="flex flex-wrap gap-3 tablet:col-span-2"><legend className="mb-2 text-sm">Modules d’intérêt</legend>
          {Object.entries(moduleLabels).map(([key, label]) => <label key={key} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="module" value={key} defaultChecked={item?.modules?.includes(key)} />{label}
          </label>)}
        </fieldset>
        {["needs", "notes"].map((name) => <label key={name} className="grid gap-1 text-sm">
          {name === "needs" ? "Besoins identifiés" : "Notes"}<textarea name={name} maxLength={4000} defaultValue={item?.[name]} className="input-commercial min-h-20" />
        </label>)}
        <p className="text-xs text-darkBlue/70 tablet:col-span-2">Les notes concernent le suivi commercial. Après signature, le RIB et les accès confidentiels disposent de champs protégés dans cette section.</p>
      </fieldset>
      </details>
      {!locked && <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="button-commercial">Enregistrer</button>
        {id && <button type="button" onClick={() => setEditing(false)} className={outline}>Annuler la modification</button>}
      </div>}
    </form>}
    {id && <>
      <section className="grid gap-2 border-t border-darkBlue/10 pt-4">
        <h3 className="flex items-center gap-2 font-bold"><CalendarClock size={18} className="text-violet" aria-hidden="true" />Prochaines actions et événements</h3>
        {scheduled && !scheduled.events.length && <p className="text-sm text-darkBlue/70">Aucun événement planifié.</p>}
        {scheduled?.truncated && <p className="text-sm">Les 50 premiers événements sont affichés. Consultez le calendrier pour les autres dates.</p>}
        {scheduled?.events.length > 0 && <ul className="divide-y divide-darkBlue/10">
          {scheduled.events.map((event) => <li key={event._id}><button type="button" onClick={() => setEventEditor(event)} className="grid w-full gap-1 rounded-lg p-2 text-left text-sm hover:bg-lightGrey tablet:grid-cols-[minmax(0,1fr)_auto]">
            <span className="break-words font-medium">{calendarTypes[event.type]}{event.title && ` · ${event.title}`}</span>
            <span className={calendarEventState(event) === "En retard" ? "text-red" : "text-darkBlue/70"}>{calendarDateLabel(event.startsAt, event.allDay)} · {calendarEventState(event)}</span>
          </button></li>)}
        </ul>}
      </section>
      {!isAdmin && <div className="flex flex-wrap gap-2">
        <Link href={`${sellerPath}/quotes?prospect=${id}`} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Devis du prospect</Link>
        <Link href={`${sellerPath}/invoices?prospect=${id}`} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Factures du prospect</Link>
        <Link href={`${sellerPath}/contracts?prospect=${id}`} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Contrats du prospect</Link>
      </div>}
      {isAdmin && (accountPath ? <div className="flex flex-wrap gap-2">
        {[["quotes", "Devis"], ["invoices", "Factures"], ["contracts", "Contrats"]].map(([tab, label]) => <Link key={tab} href={`${accountPath}/${tab}?prospectId=${id}`} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">{label} du prospect</Link>)}
      </div> : <Link href={`${commercialAdminPath}/documents?prospectId=${id}`} className="justify-self-start rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Documents du prospect</Link>)}
      {isAdmin && <details className="rounded-xl border border-darkBlue/10 p-3"><summary className="cursor-pointer text-sm font-medium">Réattribuer le prospect</summary>
      <form onSubmit={reassign} className="mt-3 grid gap-3 tablet:grid-cols-2">
        <label className="grid gap-1 text-sm">Réattribuer<AccountSelect key={item.salesOwnerId} accounts={eligibleAccounts(accounts)} defaultValue={item.salesOwnerId} /></label>
        <label className="grid gap-1 text-sm">Motif<input name="reason" className="input-commercial" required maxLength={500} /></label>
        <button type="submit" disabled={busy} className="button-commercial justify-self-start">Réattribuer le dossier</button>
      </form></details>}
      <div className="flex flex-wrap gap-2 border-t border-darkBlue/10 pt-4">
        {!item.archivePurgeAt && <button type="button" disabled={busy} onClick={() => setConfirm(item.archivedAt ? "restore" : "archive")} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm">{item.archivedAt ? "Restaurer" : "Archiver"}</button>}
        {!item.opposedAt && <button type="button" disabled={busy} onClick={() => setConfirm("oppose")} className="rounded-xl border border-red/20 px-3 py-2 text-sm text-red">Enregistrer une opposition</button>}
      </div>
      {confirm && <form onSubmit={(event) => {
        event.preventDefault();
        const reason = new FormData(event.currentTarget).get("reason");
        run(async () => { await request(`${path}/${id}/status`, { method: "POST", body: { action: confirm, reason } }); setConfirm(null); await refresh(); });
      }} className="grid gap-2 rounded-xl bg-lightGrey p-3">
        <p className="text-sm">{confirm === "oppose" ? "Confirmer l’opposition à la prospection ?" : confirm === "archive" ? "Archiver le dossier ?" : "Restaurer le dossier ?"}</p>
        <label className="grid gap-1 text-sm">Motif<input name="reason" maxLength={500} className="input-commercial" /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirm(null)} className="rounded-xl px-3 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={busy} className="button-commercial">Confirmer</button>
        </div>
      </form>}
      <section className="grid gap-3 rounded-2xl border border-darkBlue/10 bg-[#faf9fd] p-4">
        <h3 className="flex items-center gap-2 font-bold"><History size={18} className="text-violet" aria-hidden="true" />Historique du prospect</h3>
        {history && <><ul className="commercial-timeline">
          {!history.interactions.length && <li className="py-2 text-sm text-darkBlue/65">Aucune interaction.</li>}
          {history.interactions.map((entry) => <li key={entry._id} className="commercial-timeline-item py-2 text-sm">
            <p className="font-medium">{eventLabels[entry.type]}{entry.state && (entry.state === "CANCELLED" ? " · Annulé" : " · Réalisé")} · {dateLabel(entry.occurredAt)}</p>
            <p className="whitespace-pre-wrap break-words text-darkBlue/75">{entry.type === "STAGE_CHANGED" ?
              `${stageLabels[entry.previousStage] || "—"} → ${stageLabels[entry.nextStage]}` : [entry.title, entry.message].filter(Boolean).join(" · ")}</p>
          </li>)}
        </ul><Pager {...history} onChange={setHistoryPage} /></>}
      </section>
    </>}
    {eventEditor && <CommercialEventEditor event={eventEditor} prospect={item} isAdmin={isAdmin} fixedAccountId={fixedAccountId} accountPath={accountPath}
      onClose={() => setEventEditor(null)} onSaved={() => { setEventEditor(null); run(refresh); }} />}
  </section>;
}

function ConflictList({ accounts }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal) => {
    setData(await adminApi(`/crm/conflicts?page=${page}`, { signal }));
  }, [page]);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [refresh]);

  async function resolve(event, id) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await adminApi(`/crm/conflicts/${id}/resolve`, { method: "POST", body });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section id="conflicts" className="grid gap-3 rounded-[22px] border border-darkBlue/10 bg-white p-4">
    <h2 className="font-semibold">Dossiers à arbitrer</h2>
    {error && <p role="alert" className="text-red">{error}</p>}
    {data?.conflicts.length === 0 && <p className="text-sm text-darkBlue/70">Aucun conflit à traiter.</p>}
    {data?.conflicts.map((conflict) => <details key={conflict._id} className="rounded-xl border border-darkBlue/10 p-3">
      <summary className="cursor-pointer">{conflict.proposed.restaurantName} · {({ CERTAIN: "Identité déjà enregistrée", AMBIGUOUS: "Rapprochement à vérifier", OPPOSITION: "Opposition" })[conflict.conflictKind]}</summary>
      <p className="mt-2 text-sm">{conflict.proposed.address} {conflict.proposed.postalCode} {conflict.proposed.city}</p>
      <form onSubmit={(event) => resolve(event, conflict._id)} className="mt-3 grid gap-2 tablet:grid-cols-2">
        <label className="grid gap-1 text-sm">Décision<select name="decision" className="input-commercial">
          <option value="REJECTED">Rejeter</option>
          {conflict.conflictKind === "AMBIGUOUS" && <option value="DISTINCT">Créer un établissement distinct</option>}
        </select></label>
        <label className="grid gap-1 text-sm">Commercial si création<select name="salesOwnerId" className="input-commercial">
          <option value="">Choisir un commercial</option>
          {accounts.map((account) => <option key={account._id} value={account._id}>{account.firstName} {account.lastName}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm tablet:col-span-2">Motif<input name="reason" maxLength={500} required className="input-commercial" /></label>
        <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer la décision</button>
      </form>
    </details>)}
    {data && <Pager {...data} onChange={setPage} />}
  </section>;
}

function ProspectTable({ data, showOwner, onOpen, onPage, filtered }) {
  return <section aria-label="Liste des prospects" className={`${commercialPanel} overflow-hidden`}>
    <div className="px-4 py-3 midTablet:px-5"><CommercialSubheading title="Portefeuille" description={`${data.total} prospect${data.total === 1 ? "" : "s"}`} /></div>
    {data.prospects.length ? <table className="commercial-table w-full table-fixed text-left text-sm">
      <thead className="border-b border-darkBlue/10 text-xs font-medium text-darkBlue/70">
        <tr>
          <th scope="col" className="w-[40%] p-2 tablet:w-[23%]">Restaurant</th>
          <th scope="col" className="hidden p-2 desktop:table-cell">Contact</th>
          {showOwner && <th scope="col" className="hidden p-2 desktop:table-cell">Commercial</th>}
          <th scope="col" className="p-2">Statut</th>
          <th scope="col" className="hidden p-2 tablet:table-cell">Dernier contact</th>
          <th scope="col" className="p-2">Prochaine relance</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-darkBlue/10">
        {data.prospects.map((prospect) => <tr key={prospect._id} className="align-top hover:bg-lightGrey/60">
          <td className="break-words p-2">
            <button type="button" onClick={() => onOpen(prospect._id)} className="text-left font-semibold text-blue hover:underline">{prospect.restaurantName}</button>
            {prospect.city && <span className="block text-xs text-darkBlue/65">{prospect.city}</span>}
            <div className="text-xs text-darkBlue/75 desktop:hidden">
              {prospect.contactName && <span className="block">{prospect.contactName}</span>}
              {showOwner && prospect.salesOwnerName && <span className="block">{prospect.salesOwnerName}</span>}
            </div>
          </td>
          <td className="hidden break-words p-2 desktop:table-cell">{prospect.contactName || "—"}</td>
          {showOwner && <td className="hidden break-words p-2 desktop:table-cell">{prospect.salesOwnerName || "—"}</td>}
          <td className="break-words p-2"><StageBadge stage={prospect.effectiveStage} /></td>
          <td className="hidden p-2 text-darkBlue/70 tablet:table-cell">{dateLabel(prospect.lastContactAt)}</td>
          <td className="p-2 text-xs tablet:text-sm"><FollowUp value={prospect.nextFollowUpAt} acquired={prospect.effectiveStage === "ACQUIRED"} /></td>
        </tr>)}
      </tbody>
    </table> : <CommercialEmpty icon={ContactRound} title={filtered ? "Aucun prospect pour ces filtres" : "Votre portefeuille est vide"} description={filtered ? undefined : "Ajoutez un prospect pour démarrer le suivi."} />}
    {data.total > data.limit && <div className="px-4 pb-3"><Pager {...data} onChange={onPage} /></div>}
  </section>;
}

function PipelineColumn({ column, loadPage, limit, showOwner, onOpen }) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(column.prospects);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function nextPage(next) {
    setBusy(true);
    setError("");
    try {
      const result = await loadPage(column.stage, next);
      setItems(result.prospects);
      setPage(result.page);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }
  return <section aria-label={stageLabels[column.stage]} className="w-[min(78vw,280px)] shrink-0 snap-start rounded-2xl border border-darkBlue/10 bg-[#eeedf5] p-3 midTablet:w-[280px]">
    <div className="flex items-center justify-between gap-1 border-b border-darkBlue/10 pb-2.5">
      <h2 className="min-w-0"><StageBadge stage={column.stage} /></h2>
      <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold tabular-nums" aria-label={`${column.total} prospects`}>{column.total}</span>
    </div>
    <ul className="mt-3 grid gap-2">
      {!items.length && <li className="rounded-xl border border-dashed border-darkBlue/15 p-3 text-center text-xs text-darkBlue/65">Aucun prospect</li>}
      {items.map((item) => {
        const appointment = item.nextAppointmentAt && parisPlanningDateKey(new Date(item.nextAppointmentAt)) >= parisPlanningDateKey(new Date());
        return <li key={item._id}><button type="button" onClick={() => onOpen(item._id)} className="grid w-full gap-1.5 rounded-xl border border-darkBlue/10 bg-white p-3 text-left text-xs shadow-sm transition hover:border-violet/45 focus-visible:outline-violet">
          <span className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words text-sm text-darkBlue">{item.restaurantName}</strong><ChevronRight size={16} className="shrink-0 text-violet" aria-hidden="true" /></span>
          {(item.city || item.contactName) && <span className="flex items-start gap-1 break-words text-darkBlue/70"><MapPin size={13} className="shrink-0 text-violet" aria-hidden="true" />{[item.city, item.contactName].filter(Boolean).join(" · ")}</span>}
          {showOwner && item.salesOwnerName && <span className="break-words text-darkBlue/70">{item.salesOwnerName}</span>}
          {item.effectiveStage !== "ACQUIRED" && <span className="mt-1"><FollowUp value={item.nextFollowUpAt} /></span>}
          {appointment && <span className="flex items-center gap-1 text-blue"><CalendarClock size={14} />RDV le {calendarDateLabel(item.nextAppointmentAt, true)}</span>}
        </button></li>;
      })}
    </ul>
    {error && <p role="alert" className="text-xs text-red">{error}</p>}
    <fieldset disabled={busy} className="min-w-0"><Pager page={page} total={column.total} limit={limit} onChange={nextPage} /></fieldset>
  </section>;
}

export default function ProspectsBoard({ header, isAdmin = false, canInitialize = false, fixedAccountId = "", accountPath = "", initialProspectId = "" }) {
  const { query } = useRouter();
  const request = useCallback((path, options) => {
    if (!isAdmin) return commercialApi(path, options);
    if (!fixedAccountId) return adminApi(path, options);
    const [route, query] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("salesOwnerId", fixedAccountId);
    return adminApi(`${route}?${params}`, options);
  }, [isAdmin, fixedAccountId]);
  const path = isAdmin ? "/crm/prospects" : "/prospects";
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [ready, setReady] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [accountId, setAccountId] = useState(fixedAccountId);
  const [stage, setStage] = useState("");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const requestedStage = typeof query.stage === "string" && Object.hasOwn(stageLabels, query.stage) ? query.stage : "";
  const requestedOwner = isAdmin && !fixedAccountId && typeof query.salesOwnerId === "string" && /^[0-9a-f]{24}$/i.test(query.salesOwnerId) ? query.salesOwnerId : "";

  useEffect(() => {
    setStage(requestedStage);
    setPage(1);
  }, [requestedStage]);
  useEffect(() => { setAccountId(fixedAccountId || requestedOwner); setPage(1); }, [fixedAccountId, requestedOwner]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    async function load() {
      const loaded = [];
      let page = 1;
      for (;;) {
        const data = await adminApi(`?page=${page}&view=selection`, { signal: controller.signal });
        loaded.push(...data.accounts);
        if (loaded.length >= data.total || !data.accounts.length) break;
        page += 1;
      }
      setAccounts(loaded);
      setReady((await adminApi("/crm/registry", { signal: controller.signal })).ready);
    }
    load().catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [isAdmin]);

  const filters = new URLSearchParams({ q: search, archived, ...(accountId && { salesOwnerId: accountId }), ...(stage && { stage }) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const query = `${filters}&${view === "pipeline" ? "view=pipeline" : `page=${page}`}`;
    setData(null);
    const timeout = window.setTimeout(() => {
      request(`${path}?${query}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) { setData(result); setError(""); } })
        .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    }, 160);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [request, path, filters, page, view, revision]);

  const open = useCallback(async (id, signal) => {
    setError("");
    try {
      const { prospect } = await request(`${path}/${id}`, { signal });
      if (!signal?.aborted) {
        setSelected({ id, prospect });
        window.requestAnimationFrame(() => document.getElementById("prospect-details")?.scrollIntoView({ block: "start" }));
      }
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    }
  }, [path, request]);

  useEffect(() => {
    if (!initialProspectId) return;
    const controller = new AbortController();
    open(initialProspectId, controller.signal);
    return () => controller.abort();
  }, [initialProspectId, open]);

  async function initialize() {
    setInitializing(true);
    setError("");
    try {
      const result = await adminApi("/crm/registry/initialize", { method: "POST" });
      setReady(result.ready);
    } catch (err) {
      setError(err.message);
    } finally {
      setInitializing(false);
    }
  }

  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title={isAdmin ? "Prospects" : "Mes prospects"}
      action={<button type="button" aria-label="Nouveau prospect" disabled={isAdmin && ready !== true}
        onClick={() => setSelected({ id: "new", prospect: null })} className="button-commercial inline-flex items-center gap-2">
        <Plus size={17} aria-hidden="true" /><span className="commercial-header-action-label">Nouveau prospect</span>
      </button>}
      {...header} />
    {isAdmin && ready === false && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm">
      <p>Le registre d’établissements attend son initialisation.</p>
      {canInitialize && <button type="button" disabled={initializing} onClick={initialize} className="button-commercial">Initialiser le registre</button>}
    </div>}
    <div className={`${commercialPanel} flex flex-wrap items-end gap-3 p-3 midTablet:p-4`}>
      <CommercialSearch label="Rechercher un prospect" value={search} onChange={(value) => { setSearch(value); setPage(1); }}
        className="basis-full tablet:min-w-[210px] tablet:flex-1" />
      <label className="grid gap-1 text-sm">Suivi<select value={stage} onChange={(event) => { setStage(event.target.value); setPage(1); }} className="input-commercial">
        <option value="">Tous les statuts</option>{Object.entries(stageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {isAdmin && !fixedAccountId && <label className="grid gap-1 text-sm">Commercial<AccountSelect accounts={accounts} all value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(1); }} /></label>}
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={archived} onChange={(event) => { setArchived(event.target.checked); setPage(1); }} />Archives</label>
      <div role="group" aria-label="Affichage des prospects" className="flex rounded-xl bg-lightGrey p-1">
        {[[ "list", "Liste", List], ["pipeline", "Pipeline", Columns3]].map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={view === key}
          onClick={() => { setView(key); setPage(1); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${view === key ? "bg-white text-[#4d399e] shadow-sm" : "text-darkBlue/75"}`}>
          <Icon size={16} />{label}
        </button>)}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {selected && <ProspectEditor key={selected.id} initial={selected.prospect} accounts={accounts} path={path} request={request} isAdmin={isAdmin} fixedAccountId={fixedAccountId} accountPath={accountPath}
      onClose={() => setSelected(null)} onSaved={() => setRevision((value) => value + 1)} />}
    {!data && !error && <SimpleSkeleton />}
    {view === "list" && data?.prospects && <ProspectTable data={data} showOwner={isAdmin && !fixedAccountId} filtered={Boolean(search || stage || archived || accountId)}
      onOpen={open} onPage={setPage} />}
    {view === "pipeline" && data?.columns && <div aria-label="Pipeline des prospects" role="region" tabIndex={0} className="flex min-w-0 snap-x snap-proximity items-start gap-3 overflow-x-auto pb-3">
      {data.columns.map((column) => <PipelineColumn key={`${filters}:${column.stage}:${revision}`} column={column} limit={data.limit}
        showOwner={isAdmin && !fixedAccountId} onOpen={open} loadPage={(stage, page) => {
          const params = new URLSearchParams(filters);
          params.set("stage", stage);
          params.set("page", page);
          params.set("column", "true");
          return request(`${path}?${params}`);
        }} />)}
    </div>}
    {isAdmin && !fixedAccountId && <ConflictList accounts={eligibleAccounts(accounts)} />}
  </div>;
}
