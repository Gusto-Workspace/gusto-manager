import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";
import HrConfigurationAdminComponent from "./hr-configuration.admin.component";
import HrQuestionnaire from "../../employees/hr-questionnaire.employees.component";

const outline = "rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-50";
const primary = "rounded-xl bg-blue px-3 py-2 text-sm font-semibold text-white hover:bg-blue/90 disabled:opacity-50";
const importAction = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue bg-white px-3 py-2 text-sm font-semibold text-blue hover:bg-blue/5 disabled:opacity-50";
const countLabels = [
  ["created", "Dossiers créés"],
  ["linked", "Dossiers rapprochés"],
  ["skipped", "Lignes ignorées"],
];
const historyLabels = [
  ["shifts", "Services historiques ajoutés ou complétés"], ["absences", "Absences historiques ajoutées"],
  ["duplicateHistory", "Lignes déjà importées"], ["leaveBalances", "Soldes de congés datés"],
  ["monthlySummaries", "Synthèses source ajoutées"], ["ignoredHistory", "Éléments protégés ou en conflit"],
];

function periodLabel(period) {
  const format = (value) => value.split("-").reverse().join("/");
  return `Du ${format(period.from)} au ${format(period.to)}`;
}

function Counts({ counts, labels = countLabels }) {
  return <dl className="grid grid-cols-1 gap-2 text-sm mobile:grid-cols-2">
    {labels.map(([id, label]) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-darkBlue/5 px-3 py-2">
      <dt>{label}</dt><dd className="font-semibold tabular-nums">{counts[id] ?? 0}</dd>
    </div>)}
  </dl>;
}

export default function ImportSkelloAdminComponent({ restaurantId, disabled }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [scope, setScope] = useState("weeks");
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState({});
  const [protectedChoices, setProtectedChoices] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const base = `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}/skello-imports`;

  async function perform(action) {
    setLoading(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible de terminer l’opération.");
    } finally {
      setLoading(false);
    }
  }

  async function open() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setTarget(null);
    setBatches([]);
    setChoices({});
    setProtectedChoices({});
    setConfirmed(false);
    dialogRef.current.showModal();
    await perform(async () => {
      const { data } = await axios.get(base, getAdminAuthConfig());
      setBatches(data.batches);
      setTarget(data.target);
    });
  }

  function close() {
    if (loading) return;
    dialogRef.current.close();
    openerRef.current.focus();
  }

  function uploadData({ review = false, token } = {}) {
    const data = new FormData();
    data.append("file", file);
    data.append("scope", scope);
    if (review || token) data.append("choices", JSON.stringify(preview.rows.map(({ order }) => ({
      order, destination: choices[order], keepExisting: Boolean(protectedChoices[order]),
    }))));
    if (token) {
      data.append("token", token);
      data.append("confirmed", String(confirmed));
    }
    return data;
  }

  async function analyze() {
    if (!file) return;
    setResult(null);
    setPreview(null);
    setChoices({});
    setProtectedChoices({});
    setConfirmed(false);
    await perform(async () => {
      const { data } = await axios.post(`${base}/preview`, uploadData(), getAdminAuthConfig());
      setPreview(data);
    });
  }

  async function review() {
    setConfirmed(false);
    await perform(async () => {
      const { data } = await axios.post(`${base}/preview`, uploadData({ review: true }), getAdminAuthConfig());
      setPreview(data);
    });
  }

  async function confirm() {
    if (!preview?.token || !file || !confirmed) return;
    await perform(async () => {
      const { data } = await axios.post(base, uploadData({ token: preview.token }), getAdminAuthConfig());
      setResult(data);
      setPreview(null);
      setFile(null);
      setBatches((current) => [data.batch, ...current.filter((batch) => batch.id !== data.batch.id)]);
    });
  }

  function changeChoice(order, destination) {
    setChoices((current) => ({ ...current, [order]: destination }));
    setProtectedChoices((current) => ({ ...current, [order]: false }));
    setConfirmed(false);
    setPreview((current) => ({ ...current, token: null, rows: current.rows.map((row) =>
      row.order === order ? { ...row, history: null, error: "" } : row) }));
  }

  return (
    <>
    <section className="grid gap-3 rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
      <h3 className="text-sm font-semibold text-darkBlue">Configuration et migration RH</h3>
      <div className="grid gap-3 mobile:grid-cols-2">
        <div className="grid content-between gap-2">
          <p className="text-sm text-darkBlue/75">Le restaurant utilisait Skello ? Importez son fichier de configuration pour reprendre les règles RH disponibles dans Gusto.</p>
          <HrConfigurationAdminComponent restaurantId={restaurantId} disabled={disabled} className={importAction} label="Importer depuis Skello" />
        </div>
        <div className="grid content-between gap-2">
          <p className="text-sm text-darkBlue/75">Le restaurant n’utilisait pas Skello ? Renseignez progressivement ses paramètres RH à l’aide d’un questionnaire guidé.</p>
          <HrQuestionnaire key={restaurantId} restaurantId={restaurantId} admin disabled={disabled} className={importAction} />
        </div>
      </div>
    </section>
    <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-xl border border-darkBlue/10 bg-darkBlue/5">
          <FileSpreadsheet className="size-4 text-darkBlue/70" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-darkBlue">Rapports RH Skello</h3>
      </div>
      <div>
          <button ref={openerRef} type="button" onClick={open} disabled={disabled} className={importAction}>
            <Upload className="size-4 shrink-0" aria-hidden="true" /> Importer un rapport RH Skello
          </button>
      </div>
      {typeof document !== "undefined" && createPortal(
        <dialog ref={dialogRef} aria-labelledby="skello-import-title" onCancel={(event) => { event.preventDefault(); close(); }}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}
          className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-black/40">
          <div>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-darkBlue/10 bg-white px-5 py-4">
              <div>
                <h2 id="skello-import-title" className="text-lg font-semibold">Importer un rapport RH Skello</h2>
                {target && <p className="text-xs text-darkBlue/65">Établissement de destination · {target.name}</p>}
              </div>
              <button type="button" className={outline} aria-label="Fermer l’import Skello" onClick={close} disabled={loading}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="space-y-4 p-5" aria-busy={loading}>
              {error && <p role="alert" className="rounded-xl bg-red/10 px-3 py-2 text-sm text-red">{error}</p>}
              {target && <>
                <p className="text-sm text-darkBlue/75">Utilisez un classeur par établissement. Les données reconnues rejoignent le Rapport RH avec la mention Skello. Les horaires, contrats et soldes Gusto existants sont protégés.</p>
                <div className="grid gap-3 mobile:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span>Rapport RH Skello (.xlsx)</span>
                    <input key={result?.batch.id || "file"} type="file" accept=".xlsx" disabled={loading} className="min-w-0 rounded-lg border border-darkBlue/15 p-2"
                      onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); setError(""); }} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Périmètre du rapport source</span>
                    <select value={scope} disabled={loading} className="rounded-lg border border-darkBlue/15 bg-white p-2"
                      onChange={(event) => { setScope(event.target.value); setPreview(null); setError(""); }}>
                      <option value="weeks">Semaines ISO complètes</option>
                      <option value="month">Période de la synthèse Skello</option>
                    </select>
                  </label>
                </div>
                <button type="button" onClick={analyze} disabled={!file || loading} className={outline}>Analyser le fichier</button>
              </>}

              {preview && <section className="space-y-3 border-t border-darkBlue/10 pt-4" aria-label="Aperçu de l’import">
                <h3 className="font-semibold">Aperçu avant import</h3>
                <p className="text-sm">{periodLabel(preview.period)}</p>
                {preview.unsupported?.length > 0 && <details className="rounded-lg border border-darkBlue/10 p-3 text-sm">
                  <summary>Périmètre et limites du classeur</summary>
                  <ul className="mt-2 list-disc pl-5">{preview.unsupported.map((message) => <li key={message}>{message}</li>)}</ul>
                </details>}
                {preview.issues.length > 0 && <details className="rounded-lg border border-darkBlue/10 p-3 text-sm">
                  <summary>Observations sur le classeur source</summary>
                  <ul className="mt-2 list-disc pl-5">{preview.issues.map(({ reason, count }) => <li key={reason}>{reason} ({count})</li>)}</ul>
                </details>}
                {preview.alreadyImported && <p role="status" className="text-sm">Ce fichier a déjà été importé dans ce restaurant.</p>}
                {!preview.alreadyImported && <>
                  {preview.rows.map((row) => <div key={row.order} className="grid gap-2 rounded-xl border border-darkBlue/10 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{row.firstname} {row.lastname}{row.payrollCode && ` · ${row.payrollCode}`}</p>
                      <p className="text-darkBlue/70">{[row.post, row.type, `${row.volume} h/semaine`, row.start && `du ${row.start}`, row.end && `au ${row.end}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    <label className="grid gap-1">
                      Action pour {row.firstname} {row.lastname}
                      <select value={choices[row.order] || ""} disabled={loading} className="min-w-0 rounded-lg border border-darkBlue/15 bg-white p-2"
                        onChange={(event) => changeChoice(row.order, event.target.value)}>
                        <option value="">Choisir une action</option>
                        {row.candidates.map((member) => <option key={member.id} value={member.id}>
                          Rapprocher avec {member.firstname} {member.lastname}{member.payrollCode && ` · ${member.payrollCode}`}{member.archived && " (archivé)"}
                        </option>)}
                        {row.canCreate && <option value="create">Créer un dossier salarié</option>}
                        <option value="skip">Ignorer cette ligne</option>
                      </select>
                    </label>
                    {!row.canCreate && !row.candidates.length && <p className="text-darkBlue/65">Vérifiez le matricule ou préparez le dossier dans l’annuaire avant le rapprochement.</p>}
                    {row.error && <p role="alert" className="text-red">{row.error}</p>}
                    {row.history && <Counts counts={row.history.counts} labels={historyLabels} />}
                    {row.history?.conflicts.length > 0 && <>
                      <ul className="list-disc space-y-1 pl-5">{row.history.conflicts.map(({ date, message }, index) =>
                        <li key={`${date}:${index}`}>{date.split("-").reverse().join("/")} · {message}</li>)}</ul>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={Boolean(protectedChoices[row.order])} disabled={loading}
                          onChange={(event) => {
                            setProtectedChoices((current) => ({ ...current, [row.order]: event.target.checked }));
                            setPreview((current) => ({ ...current, token: null }));
                            setConfirmed(false);
                          }} />
                        Préserver les données existantes et ignorer les éléments en conflit de ce dossier.
                      </label>
                    </>}
                  </div>)}
                  <button type="button" className={outline} onClick={review}
                    disabled={loading || preview.rows.some(({ order }) => !choices[order]) || preview.rows.every(({ order }) => choices[order] === "skip")}>
                    Vérifier le rapprochement
                  </button>
                </>}
                {preview.token && <div className="grid gap-3 rounded-xl border border-darkBlue/10 p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={confirmed} disabled={loading} onChange={(event) => setConfirmed(event.target.checked)} />
                    Je confirme le rapprochement, les historiques retenus et le restaurant {target.name}.
                  </label>
                  <button type="button" className={primary} onClick={confirm} disabled={loading || !confirmed}>Appliquer l’import</button>
                </div>}
              </section>}

              {result && <section role="status" className="space-y-3 rounded-xl border border-green-700/20 bg-green-50 p-3">
                <h3 className="font-semibold">{result.alreadyImported ? "Lot déjà importé" : "Import terminé"}</h3>
                <p className="text-sm">{periodLabel(result.batch.period)} · Lot {result.batch.id}</p>
                <Counts counts={result.batch.summary.counts} />
                {result.batch.summary.history && <Counts counts={result.batch.summary.history} labels={historyLabels} />}
                {result.batch.summary.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">
                  {result.batch.summary.issues.map(({ reason, count }) => <li key={reason}>{reason} ({count})</li>)}
                </ul>}
                {result.batch.summary.historyConflicts?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">
                  {result.batch.summary.historyConflicts.map((message) => <li key={message}>{message}</li>)}
                </ul>}
                {result.batch.summary.unsupported?.length > 0 && <details className="text-sm">
                  <summary>Limites de ce lot</summary>
                  <ul className="list-disc pl-5">{result.batch.summary.unsupported.map((message) => <li key={message}>{message}</li>)}</ul>
                </details>}
              </section>}

              {batches.length > 0 && <section className="space-y-2 border-t border-darkBlue/10 pt-4">
                <h3 className="font-semibold">Historique des imports</h3>
                <ul className="space-y-2">
                  {batches.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-darkBlue/10 p-3 text-sm">
                    <div>
                      <p>{periodLabel(batch.period)} · {batch.summary.counts.created} créé(s), {batch.summary.counts.linked} rapproché(s), {batch.summary.counts.skipped} ignoré(s)</p>
                      <p className="text-xs text-darkBlue/60">Lot {batch.id}</p>
                    </div>
                  </li>)}
                </ul>
              </section>}
            </div>
          </div>
        </dialog>, document.body,
      )}
    </section>
    </>
  );
}
