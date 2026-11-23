import { useEffect, useState } from "react";
import axios from "axios";
import EmployeeDocumentsList, { DocumentDialog, documentButton } from "../_shared/employee-documents.dashboard.component";

function ErasureResult({ result }) {
  return <div role="status" className="grid gap-2 rounded-lg bg-lightGrey p-3 text-sm">
    <p className="font-semibold">Profil opérationnel supprimé.</p>
    <p>Les accès à cet établissement sont définitivement révoqués. Les historiques de paie restent consultables.</p>
    {result.retentionUntil && <p>Le nom et le prénom restent visibles dans les archives RH autorisées jusqu’au {result.retentionUntil.split("-").reverse().join("/")}.</p>}
    <p>{result.accountErased ? "Les identifiants et coordonnées du compte ont aussi été effacés." : "Le compte reste disponible pour les autres établissements."}</p>
    <p>{result.removedDocuments} pièce(s) retirée(s) · {result.retainedDocuments} pièce(s) conservée(s) en accès restreint</p>
    {result.assetCleanupPending && <p>Le retrait dans Gusto est enregistré. La suppression de fichiers chez le fournisseur est en attente de confirmation.</p>}
  </div>;
}

export function EmployeeErasure({ endpoint, member, onClose, onErased }) {
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirmation, setConfirmation] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [retentionUntil, setRetentionUntil] = useState("");
  const [retentionReason, setRetentionReason] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    axios.get(endpoint, { signal: controller.signal }).then(({ data }) => {
      setPreview(data);
      if (data.result) setResult(data.result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de vérifier ce dossier.");
    });
    return () => controller.abort();
  }, [endpoint]);

  async function erase(event) {
    event.preventDefault();
    if (busy || !preview || !reviewed || !retentionUntil || !retentionReason.trim() || confirmation !== "SUPPRIMER") return;
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(endpoint, {
        revision: preview.revision, confirmation, retentionReviewed: reviewed, documentIds: selected, retentionUntil, retentionReason,
      });
      setResult(data);
      onErased();
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible de supprimer le profil opérationnel.");
    } finally {
      setBusy(false);
    }
  }

  return <DocumentDialog title={result ? "Archives RH" : `Supprimer le profil de ${member.firstname} ${member.lastname}`} onClose={onClose} busy={busy}>
    {result ? <>
      <ErasureResult result={result} />
      <button type="button" className={documentButton} onClick={onClose}>Fermer</button>
    </> : <form className="grid gap-4" onSubmit={erase}>
      <p className="text-sm">Le profil est retiré de l’annuaire et des archives opérationnelles. Les accès à cet établissement sont révoqués définitivement. Les archives RH sécurisées conservent le nom, le prénom et les justificatifs nécessaires.</p>
      {preview && <>
        <p className="text-sm">{preview.shared ? "Les informations du compte partagé et les autres établissements sont préservés." : "Les identifiants, coordonnées et la photo du compte individuel seront également retirés."}</p>
        <label className="grid gap-1 text-sm">Motif de conservation de l’identité RH
          <textarea required maxLength={500} rows={2} value={retentionReason} disabled={busy} onChange={(event) => setRetentionReason(event.target.value)}
            className="rounded-lg border border-darkBlue/20 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">Dernier jour de conservation justifiée
          <input type="date" required value={retentionUntil} disabled={busy} onChange={(event) => setRetentionUntil(event.target.value)}
            className="rounded-lg border border-darkBlue/20 px-3 py-2" />
        </label>
        <p className="text-sm">Après cette date, les rapports affichent un pseudonyme. Une demande d’effacement intégral ou la purge des données à échéance se traite séparément.</p>
        {preview.documents.length > 0 && <fieldset disabled={busy} className="grid max-h-44 gap-2 overflow-auto rounded-lg border border-darkBlue/10 p-3 text-sm">
          <legend className="px-1 font-semibold">Pièces dont la conservation n’est plus requise</legend>
          <p>Les pièces restent conservées par défaut. Cochez uniquement celles dont l’effacement a été validé.</p>
          {preview.documents.map((document) => <label key={document.id} className="flex items-start gap-2">
            <input type="checkbox" disabled={!document.eligible} checked={selected.includes(document.id)} onChange={(event) => {
              setSelected((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id));
            }} />
            {document.title}{!document.eligible && " · retrait indisponible"}
          </label>)}
        </fieldset>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />
          J’ai vérifié les obligations de conservation applicables à ce dossier et aux pièces sélectionnées.
        </label>
        <label className="grid gap-1 text-sm">
          Saisissez SUPPRIMER pour confirmer
          <input autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)}
            className="rounded-lg border border-darkBlue/20 px-3 py-2" />
        </label>
      </>}
      {!preview && !error && <p role="status">Vérification du dossier…</p>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={documentButton} disabled={busy} onClick={onClose}>Annuler</button>
        <button type="submit" disabled={busy || !preview || !reviewed || !retentionUntil || !retentionReason.trim() || confirmation !== "SUPPRIMER"}
          className="min-h-10 rounded-lg bg-red px-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Suppression en cours…" : "Supprimer le profil opérationnel"}
        </button>
      </div>
    </form>}
  </DocumentDialog>;
}

export function RetainedEmployeeDocuments({ endpoint, onClose }) {
  const [documents, setDocuments] = useState(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    axios.get(endpoint, { signal: controller.signal }).then(({ data }) => setDocuments(data.documents))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de charger les pièces.");
      });
    return () => controller.abort();
  }, [endpoint]);
  return <DocumentDialog title="Justificatifs conservés" onClose={onClose}>
    <EmployeeDocumentsList documents={documents || []} endpoint={endpoint} category={category} onCategoryChange={setCategory}
      loading={!documents && !error} error={error} />
    <button type="button" className={documentButton} onClick={onClose}>Fermer</button>
  </DocumentDialog>;
}
