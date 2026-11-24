import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Download, Settings2, X } from "lucide-react";
import useDialogBackdrop from "../../_shared/use-dialog-backdrop";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";
import { InputFields } from "../../employees/personnel-report-input.employees.component";
import { hrRuleHelp } from "../../employees/hr-rule-help.mjs";
import frenchPlanning from "../../../../../public/locales/fr/planning.json";

const outline = "rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold hover:bg-darkBlue/5 disabled:opacity-50";
const primary = "rounded-xl bg-blue px-3 py-2 text-sm font-semibold text-white hover:bg-blue/90 disabled:opacity-50";
const families = { clockRules: "Pointeuse", overtime: "Heures majorées", rules: "Repas", leaveRules: "Congés payés",
  absenceRules: "Absences", hoursRules: "Compteur d’heures" };
const statuses = { confirmed: "Confirmé", to_confirm: "À confirmer", unavailable: "Indisponible" };
const actions = { apply: "À appliquer", skipped: "Ignoré", unchanged: "Identique", blocked: "Bloqué" };
const actionColors = { apply: "bg-emerald-50 text-emerald-800", skipped: "bg-amber-50 text-amber-900",
  blocked: "bg-amber-50 text-amber-900", unchanged: "bg-slate-100 text-slate-700" };
const fields = { enabled: "Actif", earlyIn: "Arrivée en avance", lateIn: "Arrivée en retard", earlyOut: "Départ anticipé",
  lateOut: "Départ tardif", roundMinutes: "Arrondi (min)", pause: "Pause déduite", mode: "Mode", basis: "Base", quantity: "Quantité",
  amount: "Montant unitaire (€)", criteria: "Critères", nightStart: "Début de nuit", nightEnd: "Fin de nuit", nightRate: "Taux nuit (%)",
  sundayRate: "Taux dimanche (%)", holidayRate: "Taux fériés (%)", source: "Source des heures", ordinary: "Seuil temps plein (h)",
  firstEnd: "Fin de la première tranche (h)", secondEnd: "Fin de la deuxième tranche (h)", firstRate: "Premier taux (%)",
  secondRate: "Deuxième taux (%)", lastRate: "Dernier taux (%)", complementBand: "Première tranche complémentaire (%)",
  complementFirstRate: "Premier taux complémentaire (%)", complementLastRate: "Dernier taux complémentaire (%)",
  workdays: "Jours de travail de référence", weekdays: "Jours travaillés", creditedAbsences: "Absences assimilées", paidLeaveDays: "Base de valorisation CP",
  planningAttribution: "Rattachement au jour", plannedNightGross: "Nuit avant pause planifiée", countHolidays: "Compter les fériés",
  structuralMonthly: "Mensualiser les heures structurelles", startMonth: "Premier mois d’acquisition", referenceMonth: "Mois de début du cycle",
  unit: "Décompte", excludeHolidays: "Exclure les fériés", preserveCarry: "Reporter les reliquats", assimilated: "Absences assimilées",
  categories: "Règles par absence", start: "Date de début", enhanced: "Majorer le compteur" };
const names = { clocked: "Heure pointée", planned: "Heure prévue", plannedFallback: "Pause prévue si aucune pause pointée",
  plannedMinimum: "Au moins la pause prévue", planning: "Planning", hybrid: "Planning remplacé par les pointages validés",
  validated: "Pointages validés", shiftStart: "Début du service", days: "Jour travaillé", combined: "Avantages en nature et indemnités",
  indemnities: "Indemnités uniquement", tickets: "Titres-restaurant", basket: "Prime panier", service: "Par service",
  criteria: "Selon critères", monthly: "Par mois", businessDays: "Jours ouvrables", workdays: "Jours ouvrés" };
const payers = { employer: "Employeur", thirdParty: "Tiers", unpaid: "Non indemnisée" };
const weekdays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const absenceName = (id) => frenchPlanning.absenceTypes[id] || (id === "reported" ? "Absence de pointage validée" : "Motif non précisé");

function display(value, field) {
  if (value == null) return "—";
  if (field === "pause" && value === "clocked") return "Pause réellement pointée";
  if (value === 0 && field === "roundMinutes") return "Aucun";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (field === "categories") return Object.entries(value).map(([type, { payer, meal }]) =>
    `${absenceName(type)} · ${payers[payer] || "Payeur à compléter"} · ${meal == null ? "Repas à compléter" : `${meal} repas/jour`}`).join(" / ") || "Aucun";
  if (field === "weekdays") return value.map((index) => weekdays[index - 1]).join(", ") || "Aucun";
  if (field === "criteria") return value.map(({ start, end, minimum, maximum }) =>
    [start && `${start}–${end}`, minimum != null && `plus de ${minimum} min`, maximum != null && `moins de ${maximum} min`]
      .filter(Boolean).join(", ")).join(" / ");
  if (Array.isArray(value)) return value.map(absenceName).join(", ") || "Aucune";
  return Object.hasOwn(names, value) ? names[value] : String(value);
}

const ignore = () => {};
export function compatibleDate(kind, day) {
  const date = new Date(`${day}T12:00:00Z`);
  if (["overtime", "hoursRules"].includes(kind)) date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
  if (["rules", "leaveRules"].includes(kind) && date.getUTCDate() !== 1) date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

export function Comparison({ preview, minimum, busy, onDate, onReview }) {
  return <section aria-label="Comparaison des règles RH" className="min-w-0 space-y-3 max-midTablet:[overflow-wrap:anywhere]">
    <p className="text-sm"><strong>{preview.metadata.establishment}</strong> → <strong>{preview.target.name}</strong></p>
    {preview.rules.map(({ kind, effect, previous, previousDate, rule, action, reason, financialReview }) => {
      const keys = [...new Set([...Object.keys(previous || {}), ...Object.keys(rule.values || {})])];
      const source = preview.metadata.source === "skello" ? preview.sourceRules?.[kind] : null;
      const mobileKeys = [...new Set([...keys, ...Object.keys(source?.values || {})])];
      const currentLabel = previousDate && previousDate !== "-" ? `Gusto (${previousDate})` : "Gusto actuel";
      const changed = (field) => rule.values && JSON.stringify(previous?.[field]) !== JSON.stringify(rule.values[field]);
      const help = hrRuleHelp[kind];
      return <details open={action === "apply"} key={kind} className="rounded-xl border border-darkBlue/10 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{families[kind]} <span className={`ml-2 rounded-md px-2 py-0.5 text-xs ${actionColors[action]}`}>{actions[action]}</span></summary>
        <p className="mt-2 text-sm">{help.intro}</p>
        <p className="mt-2 text-xs text-darkBlue/75">{statuses[rule.status]} · {rule.origin.system === "skello" ? "Skello" : "Gusto"} · {rule.origin.path} · {rule.origin.consultedOn}</p>
        {rule.review && <p className="mt-1 text-sm">Validé pour Gusto le {rule.review.on} · {rule.review.reason}</p>}
        {rule.note && <p className="mt-1 text-sm">{rule.note}</p>}
        {reason && <p className="mt-1 text-sm">{reason}</p>}
        <label className="mt-2 grid gap-1 text-sm">Date d’effet · {families[kind]}
          <input type="date" min={minimum} disabled={busy} value={effect} className="w-fit rounded-lg border border-darkBlue/20 px-2 py-1"
            onChange={(event) => { if (event.target.value && event.target.validity.valid) onDate(kind, event.target.value); }} />
          <span className="text-xs text-darkBlue/70">{help.date}</span>
        </label>
        {mobileKeys.length > 0 && <dl className="mt-2 space-y-2 text-sm midTablet:hidden">
          {mobileKeys.map((field) => <div key={field} className={`rounded-lg border border-darkBlue/10 p-3 ${changed(field) ? "bg-blue/5" : ""}`}>
            <dt className="font-semibold">{fields[field]}</dt>
            <dd>
              {help[field] && <p className="mt-1 text-xs text-darkBlue/70">{help[field]}</p>}
              <dl className="mt-2 space-y-2">
                {source && <div>
                  <dt className="text-xs font-medium text-darkBlue/75">{source.origin.system === "skello" ? "Valeur Skello" : "Valeur du fichier (origine Gusto)"}</dt>
                  <dd>{display(source.values?.[field], field)}</dd>
                </div>}
                <div>
                  <dt className="text-xs font-medium text-darkBlue/75">{currentLabel}</dt>
                  <dd>{display(previous?.[field], field)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-darkBlue/75">Proposition Gusto</dt>
                  <dd>{display(rule.values?.[field], field)}</dd>
                </div>
              </dl>
            </dd>
          </div>)}
        </dl>}
        {keys.length > 0 && <div className="mt-2 hidden overflow-x-auto midTablet:block"><table className="w-full text-left text-sm">
          <thead><tr><th className="py-1 pr-3">Réglage</th><th className="pr-3">{currentLabel}</th><th>Proposition Gusto</th></tr></thead>
          <tbody>{keys.map((field) => <tr key={field} className={`border-t border-darkBlue/10 ${changed(field) ? "bg-blue/5" : ""}`}>
            <th scope="row" className="max-w-48 py-1 pr-3 font-medium">{fields[field]}
              {help[field] && <span className="block text-xs font-normal text-darkBlue/70">{help[field]}</span>}</th>
            <td className="min-w-24 break-words pr-3">{display(previous?.[field], field)}</td>
            <td className="min-w-24 break-words">{display(rule.values?.[field], field)}</td>
          </tr>)}</tbody>
        </table></div>}
        {onReview && (rule.status !== "confirmed" || financialReview) && <details className="mt-3 rounded-lg border border-darkBlue/15 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Renseigner et justifier la règle</summary>
          <div className="mt-3">
            <InputFields kind={kind} date={effect} proposal={rule.values} onBusy={ignore} onDirty={ignore} onSaved={ignore}
              onPropose={(values, justification) => onReview(kind, values, justification)} readOnly={busy} />
          </div>
        </details>}
      </details>;
    })}
    {preview.observations.length > 0 && <details className="rounded-xl border border-darkBlue/10 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Observations et correspondances ({preview.observations.length})</summary>
      <dl className="mt-2 divide-y divide-darkBlue/10">{preview.observations.map((item) => <div className="py-2" key={item.id}>
        <dt className="text-sm font-semibold">{item.label} · {statuses[item.status]}</dt>
        <dd className="text-sm">{display(item.value)}{item.gusto && ` · Gusto : ${item.gusto}`}</dd>
        {item.note && <dd className="text-sm">{item.note}</dd>}
        <dd className="text-xs text-darkBlue/65">{item.origin.system === "gusto" ? "Gusto" : "Skello"} · {item.origin.path} · {item.origin.consultedOn}</dd>
      </div>)}</dl>
    </details>}
    {preview.questions.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      <h3 className="font-semibold">À valider avec le restaurant ou le comptable</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">{preview.questions.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>}
  </section>;
}

export default function HrConfigurationAdminComponent({ restaurantId, disabled, className, label = "Importer une configuration RH" }) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const [overview, setOverview] = useState(null);
  const [file, setFile] = useState(null);
  const [effect, setEffect] = useState("");
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restore, setRestore] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}/hr-configuration`;
  const isCurrent = overview?.target.id === restaurantId;

  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
    setMessage("");
    setError("");
  }

  async function handle(action) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(failure.response?.data?.message || failure.message || "L’opération n’a pas pu être terminée."); }
    finally { setBusy(false); }
  }

  async function refresh() {
    const { data } = await axios.get(base, getAdminAuthConfig());
    setOverview(data);
    return data;
  }

  function open() {
    resetPreview();
    setOverview(null);
    setFile(null);
    setRestore(null);
    dialog.current.showModal();
    return handle(async () => setEffect((await refresh()).minimumDate));
  }

  function close() {
    if (busy) return;
    dialog.current.close();
    opener.current.focus();
  }

  const backdrop = useDialogBackdrop(close);

  async function compare(configuration, effects, sourceRules = configuration?.rules) {
    setConfirmed(false);
    const { data } = await axios.post(`${base}/preview`, { configuration, effects }, getAdminAuthConfig());
    setPreview({ ...data, configuration, sourceRules });
  }

  function analyze(event) {
    event.preventDefault();
    resetPreview();
    return handle(async () => {
      if (!file || !/\.json$/i.test(file.name) || file.size > 65536) throw new Error("Choisissez un fichier JSON de 64 Ko maximum.");
      let configuration;
      try { configuration = JSON.parse(await file.text()); }
      catch { throw new Error("Ce fichier ne contient pas un JSON valide."); }
      const chosen = Object.keys(configuration?.rules || {}).filter((kind) => Object.hasOwn(families, kind));
      await compare(configuration, Object.fromEntries(chosen.map((kind) => [kind, compatibleDate(kind, effect)])));
    });
  }

  function apply() {
    return handle(async () => {
      const { configuration, effects, token } = preview;
      const { data } = await axios.post(`${base}/apply`, { configuration, effects, token, confirmed }, getAdminAuthConfig());
      resetPreview();
      setMessage(`Import enregistré pour le ${data.batch.effect}. ${data.batch.kinds.map((kind) => families[kind]).join(", ")}. ${data.skipped.length} famille(s) sans modification.`);
      await refresh();
    });
  }

  async function review(kind, values, reason) {
    setBusy(true);
    try {
      const { data } = await axios.post(`${base}/review`, { configuration: preview.configuration,
        review: { kind, values, reason, confirmed: true } }, getAdminAuthConfig());
      await compare(data, preview.effects, preview.sourceRules);
    } finally { setBusy(false); }
  }

  function download() {
    return handle(async () => {
      const { data } = await axios.get(`${base}/export`, getAdminAuthConfig());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `configuration-rh-${data.metadata.collectedOn}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function restoreBatch() {
    return handle(async () => {
      await axios.post(`${base}/${restore.id}/restore`, { confirmed: true }, getAdminAuthConfig());
      setRestore(null);
      resetPreview();
      setMessage("Configuration précédente restaurée pour ce lot.");
      await refresh();
    });
  }

  function scheduleRestore(batch) {
    return handle(async () => {
      const { data } = await axios.get(`${base}/${batch.id}/backup`, getAdminAuthConfig());
      await compare(data, Object.fromEntries(Object.keys(data.rules).map((kind) => [kind, compatibleDate(kind, overview.minimumDate)])));
      setMessage("Configuration précédente chargée. Vérifiez les dates avant de programmer son rétablissement.");
    });
  }

  return <>
    <button ref={opener} type="button" className={className} onClick={open} disabled={disabled}>
      <Settings2 className="size-4 shrink-0" aria-hidden="true" /> {label}
    </button>
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} aria-labelledby="hr-config-title"
      {...backdrop}
      className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-2xl bg-white text-darkBlue shadow-xl backdrop:bg-black/35">
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-darkBlue/10 px-5 py-4">
          <div><h2 id="hr-config-title" className="text-lg font-semibold">Importer une configuration RH</h2>
            {isCurrent && <p className="text-sm">Destination · <strong>{overview.target.name}</strong></p>}
          </div>
          <button type="button" className={outline} aria-label="Fermer" disabled={busy} onClick={close}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-4" aria-busy={busy}>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
          <form className="flex flex-wrap items-end gap-3" onSubmit={analyze}>
            <label className="grid min-w-0 gap-1 text-sm font-semibold">Fichier JSON<input type="file" accept=".json,application/json"
              disabled={!isCurrent || busy} className="w-full max-w-72 text-sm" onChange={(event) => { setFile(event.target.files?.[0] || null); resetPreview(); }} /></label>
            <label className="grid gap-1 text-sm font-semibold">À partir du<input type="date" value={effect} required min={overview?.minimumDate}
              disabled={!isCurrent || busy} className="rounded-lg border border-darkBlue/20 px-2 py-1.5"
              onChange={(event) => { setEffect(event.target.value); resetPreview(); }} /></label>
            <button type="submit" className={primary} disabled={!isCurrent || busy || !file || !effect}>Comparer les règles</button>
          </form>
          <button type="button" onClick={download} disabled={!isCurrent || busy} className={`${outline} inline-flex items-center gap-2`}>
            <Download size={16} aria-hidden="true" /> Exporter la configuration actuelle
          </button>
          {preview?.target.id === restaurantId && <Comparison preview={preview} minimum={overview?.minimumDate} busy={busy}
            onDate={(kind, date) => handle(() => compare(preview.configuration, { ...preview.effects, [kind]: date }, preview.sourceRules))}
            onReview={review} />}
          {preview?.token && preview.target.id === restaurantId && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-darkBlue/5 p-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)} /> Je confirme les règles et les dates affichées pour {preview.target.name}.</label>
            <button type="button" className={primary} onClick={apply} disabled={!confirmed || busy}>Appliquer les règles confirmées</button>
          </div>}
          {isCurrent && overview.batches.length > 0 && <section className="border-t border-darkBlue/10 pt-3">
            <h3 className="font-semibold">Historique des imports</h3>
            <ul className="mt-2 space-y-2">{overview.batches.map((batch) => <li key={batch.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-darkBlue/5 p-3 text-sm">
              <span>{batch.source.establishment} · {batch.effect} · {batch.kinds.map((kind) => families[kind]).join(", ")}{batch.restoredAt && " · Restauré"}</span>
              {batch.canRestore && <button type="button" className={outline} disabled={busy} onClick={() => setRestore(batch)}>Restaurer</button>}
              {!batch.canRestore && !batch.restoredAt && <button type="button" className={outline} disabled={busy}
                onClick={() => scheduleRestore(batch)}>Préparer une restauration future</button>}
            </li>)}</ul>
          </section>}
          {restore && isCurrent && <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
            <p>Rétablir la configuration qui précédait le lot du {restore.effect} pour {overview.target.name} ?</p>
            <div className="flex flex-wrap gap-2"><button type="button" className={outline} disabled={busy} onClick={() => setRestore(null)}>Annuler</button>
              <button type="button" className={primary} disabled={busy} onClick={restoreBatch}>Confirmer la restauration</button></div>
          </div>}
        </div>
      </div>
    </dialog>, document.body)}
  </>;
}
