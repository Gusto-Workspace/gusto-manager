import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

const outline = "rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-50";
const primary = "rounded-xl bg-blue px-3 py-2 text-sm font-semibold text-white hover:bg-blue/90 disabled:opacity-50";
const countLabels = [
  ["employees", "Salariés fictifs"],
  ["shifts", "Services planifiés"],
  ["pauses", "Services avec pause"],
  ["punches", "Pointages"],
  ["historicalLate", "Retards historiques"],
  ["absences", "Absences au planning"],
  ["contracts", "Fiches de paie et contrat"],
  ["mealDays", "Jours avec repas renseignés"],
  ["leaveBalances", "Soldes de congés"],
];

function periodLabel(period) {
  const format = (value) => value.split("-").reverse().join("/");
  return `Du ${format(period.from)} au ${format(period.to)}`;
}

function Counts({ counts }) {
  return <dl className="grid grid-cols-1 gap-2 text-sm mobile:grid-cols-2">
    {countLabels.map(([id, label]) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-darkBlue/5 px-3 py-2">
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
  const [remove, setRemove] = useState(null);
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
    setRemove(null);
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

  function uploadData(token) {
    const data = new FormData();
    data.append("file", file);
    data.append("scope", scope);
    if (token) data.append("token", token);
    return data;
  }

  async function analyze() {
    if (!file) return;
    setResult(null);
    setPreview(null);
    await perform(async () => {
      const { data } = await axios.post(`${base}/preview`, uploadData(), getAdminAuthConfig());
      setPreview(data);
    });
  }

  async function confirm() {
    if (!preview?.token || !file) return;
    await perform(async () => {
      const { data } = await axios.post(base, uploadData(preview.token), getAdminAuthConfig());
      setResult(data);
      setPreview(null);
      setFile(null);
      setBatches((current) => [data.batch, ...current.filter((batch) => batch.id !== data.batch.id)]);
    });
  }

  async function removeBatch() {
    await perform(async () => {
      const { data } = await axios.delete(`${base}/${remove.id}`, { ...getAdminAuthConfig(), data: { confirmed: true } });
      setBatches((current) => current.map((batch) => batch.id === data.id ? data : batch));
      setPreview(null);
      setResult(null);
      setRemove(null);
    });
  }

  return (
    <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-xl border border-darkBlue/10 bg-darkBlue/5">
          <FileSpreadsheet className="size-4 text-darkBlue/70" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-darkBlue">Import RH Skello</h3>
          <p className="text-xs text-darkBlue/60">Recette en développement avec des salariés fictifs.</p>
        </div>
      </div>
      <button ref={openerRef} type="button" onClick={open} disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue bg-white px-4 py-2.5 text-sm font-semibold text-blue hover:bg-blue/5 disabled:opacity-50">
        <Upload className="size-4" aria-hidden="true" /> Importer des données RH Skello
      </button>
      {typeof document !== "undefined" && createPortal(
        <dialog ref={dialogRef} aria-labelledby="skello-import-title" onCancel={(event) => { event.preventDefault(); close(); }}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}
          className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-black/40">
          <div>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-darkBlue/10 bg-white px-5 py-4">
              <div>
                <h2 id="skello-import-title" className="text-lg font-semibold">Importer des données RH Skello</h2>
                {target && <p className="text-xs text-darkBlue/65">{target.name} · {target.database}</p>}
              </div>
              <button type="button" className={outline} aria-label="Fermer l’import Skello" onClick={close} disabled={loading}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="space-y-4 p-5" aria-busy={loading}>
              {error && <p role="alert" className="rounded-xl bg-red/10 px-3 py-2 text-sm text-red">{error}</p>}
              {target && <>
                <div className="grid gap-3 mobile:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span>Rapport RH Skello (.xlsx)</span>
                    <input key={result?.batch.id || "file"} type="file" accept=".xlsx" disabled={loading} className="min-w-0 rounded-lg border border-darkBlue/15 p-2"
                      onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); setError(""); }} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Période à importer</span>
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
                <p className="text-sm">{periodLabel(preview.period)} · {preview.weeks.map(({ week }) => `S${week}`).join(", ")}</p>
                <p className="text-xs text-darkBlue/65">Synthèse Skello {periodLabel(preview.monthly).toLowerCase()}.</p>
                <Counts counts={preview.counts} />
                {preview.counts.historicalLate > 0 && <p className="text-sm text-darkBlue/65">
                  Les retards explicites du mois alimentent le rapport RH à titre historique.
                </p>}
                {preview.counts.punches === 0 && <p className="text-sm text-darkBlue/65">
                  Les arrivées et départs badgés nécessitent l’export dédié de la Badgeuse Skello.
                </p>}
                {(preview.issues.length > 0 || preview.counts.outside > 0) && <ul className="list-disc space-y-1 pl-5 text-sm">
                  {preview.counts.outside > 0 && <li>{preview.counts.outside} lignes hors période</li>}
                  {preview.issues.map(({ reason, count, rows }) => <li key={reason}>
                    {reason} ({count}){rows.length > 0 && ` · Lignes ${rows.join(", ")}`}
                  </li>)}
                </ul>}
                <details className="rounded-xl border border-darkBlue/10 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Feuilles détectées et données non importées</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{preview.sheets.map(({ name, rows }) => <li key={name}>{name} · {rows} lignes</li>)}</ul>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{preview.unsupported.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </details>
                {preview.alreadyImported && <p role="status" className="text-sm">Ce fichier a déjà été importé dans ce restaurant.</p>}
                {preview.conflict && <p role="alert" className="text-sm text-red">Un autre lot couvre déjà une partie de cette période ({periodLabel(preview.conflict.period).toLowerCase()}).</p>}
                {preview.token && <button type="button" className={primary} onClick={confirm} disabled={loading}>Confirmer l’import dans {target.name}</button>}
              </section>}

              {result && <section role="status" className="space-y-3 rounded-xl border border-green-700/20 bg-green-50 p-3">
                <h3 className="font-semibold">{result.alreadyImported ? "Lot déjà importé" : "Import terminé"}</h3>
                <p className="text-sm">{periodLabel(result.batch.period)} · Lot {result.batch.id}</p>
                <Counts counts={result.batch.summary.counts} />
                <p className="text-sm">
                  {result.batch.summary.counts.sourceShifts - result.batch.summary.counts.shifts} services et {result.batch.summary.counts.sourceAbsences - result.batch.summary.counts.absences} absences écartés dans la période.
                </p>
                {result.batch.summary.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">
                  {result.batch.summary.issues.map(({ reason, count }) => <li key={reason}>{reason} ({count})</li>)}
                </ul>}
              </section>}

              {batches.length > 0 && <section className="space-y-2 border-t border-darkBlue/10 pt-4">
                <h3 className="font-semibold">Historique des imports</h3>
                <ul className="space-y-2">
                  {batches.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-darkBlue/10 p-3 text-sm">
                    <div>
                      <p>{periodLabel(batch.period)} · {{ complete: "Importé", failed: "Échec", removed: "Retiré" }[batch.status]}</p>
                      <p className="text-xs text-darkBlue/60">Lot {batch.id}</p>
                    </div>
                    {batch.status === "complete" && <button type="button" className={outline} disabled={loading} onClick={() => setRemove(batch)}>Retirer ce lot</button>}
                  </li>)}
                </ul>
              </section>}
              {remove && <section className="space-y-3 rounded-xl border border-red/30 bg-red/5 p-3">
                <h3 className="font-semibold">Retirer le lot du {remove.period.from.split("-").reverse().join("/")} ?</h3>
                <p className="text-sm">Les salariés fictifs, le planning et les saisies RH créés par ce lot seront retirés.</p>
                <div className="flex gap-2">
                  <button type="button" className={outline} disabled={loading} onClick={() => setRemove(null)}>Annuler</button>
                  <button type="button" className="rounded-xl bg-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={removeBatch}>Confirmer le retrait</button>
                </div>
              </section>}
            </div>
          </div>
        </dialog>, document.body,
      )}
    </section>
  );
}
