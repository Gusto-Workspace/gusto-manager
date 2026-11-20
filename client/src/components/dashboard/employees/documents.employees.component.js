import { useState } from "react";
import { Plus } from "lucide-react";
import EmployeeDocumentsList, {
  DocumentDialog, documentButton, documentField,
} from "../_shared/employee-documents.dashboard.component";
import {
  categories, documentAccept, documentMetadata, visibilities,
} from "../_shared/employee-documents.utils.mjs";

const primary = "min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-50";

function MetadataFields({ value, onChange, canShare, disabled }) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-3 midTablet:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium midTablet:col-span-2">
        Titre
        <input value={value.title} onChange={(event) => onChange({ title: event.target.value })}
          maxLength={30} required className={documentField} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Dossier
        <select value={value.category || "uncategorized"} onChange={(event) => onChange({ category: event.target.value })} className={documentField}>
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {canShare && (
        <label className="grid gap-1 text-sm font-medium">
          Visibilité
          <select value={value.visibility || "internal"} onChange={(event) => onChange({ visibility: event.target.value })} className={documentField}>
            {Object.entries(visibilities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      )}
    </fieldset>
  );
}

export default function DocumentsEmployeeComponent({
  docs, baseUrl, currentDocuments, isUploadingDocs, onDocsChange, onSaveDocs,
  onDocMetadataChange, removeSelectedDoc, onEditDoc, confirmDeleteDoc, canShare = false,
  loading, error, uploadError, onRetry, employeeName, onCancelUploads,
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [success, setSuccess] = useState("");

  function cancelUploads() {
    onCancelUploads();
    setUploadOpen(false);
  }

  async function submitUploads(event) {
    event.preventDefault();
    if (isUploadingDocs || !docs.length || docs.some(({ title }) => !title.trim())) return;
    if (await onSaveDocs()) {
      setUploadOpen(false);
      setSuccess(docs.length > 1 ? "Documents ajoutés." : "Document ajouté.");
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (saving || !editing.title.trim()) return;
    setSaving(true);
    setEditError("");
    try {
      await onEditDoc(editing.public_id, { ...documentMetadata(editing), revision: editing.revision ?? 0 });
      setEditing(null);
      setSuccess("Document modifié.");
    } catch (failure) {
      setEditError(failure.response?.data?.message || "Impossible de modifier ce document. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-darkBlue/10 bg-white">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-darkBlue/10 px-4 py-3 midTablet:px-5">
        <h2 className="text-lg font-semibold">Documents</h2>
        <button type="button" onClick={() => { setSuccess(""); setUploadOpen(true); }}
          disabled={loading || Boolean(error)}
          className={`${primary} inline-flex items-center gap-2`}>
          <Plus size={16} aria-hidden="true" /> Ajouter un document
        </button>
      </header>
      {success && <p role="status" className="px-4 pt-4 text-sm text-[#146144] midTablet:px-5">{success}</p>}
      <EmployeeDocumentsList documents={currentDocuments} endpoint={`${baseUrl}/documents`}
        category={category} onCategoryChange={setCategory}
        showVisibility={canShare} loading={loading} error={error} onRetry={onRetry}
        onDelete={confirmDeleteDoc && ((document) => { setSuccess(""); confirmDeleteDoc(document); })}
        onEdit={onEditDoc && ((document) => { setSuccess(""); setEditError(""); setEditing({ ...document }); })} />
      {uploadOpen && (
        <DocumentDialog title="Ajouter des documents" onClose={cancelUploads} busy={isUploadingDocs}>
          <form onSubmit={submitUploads} className="grid gap-4">
            {employeeName && <p className="text-sm text-darkBlue/70">Salarié concerné : <strong>{employeeName}</strong></p>}
            <label className="grid gap-1 text-sm font-medium">
              Fichiers
              <input type="file" multiple accept={documentAccept} onChange={(event) => onDocsChange(event, category)} disabled={isUploadingDocs}
                className="w-full min-w-0 rounded-lg border border-darkBlue/15 p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-blue/10 file:px-2 file:py-1.5 file:text-blue" />
              <span className="text-xs font-normal text-darkBlue/70">PDF, JPEG, PNG, WebP ou GIF. Jusqu’à 10 fichiers de 10 Mo chacun.</span>
            </label>
            {docs.map((item, index) => (
              <div key={`${item.file.name}-${index}`} className="grid min-w-0 gap-2 rounded-lg border border-darkBlue/10 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-all font-semibold">{item.file.name}</span>
                  <button type="button" disabled={isUploadingDocs} onClick={() => removeSelectedDoc(index)} className="text-red">Retirer</button>
                </div>
                <MetadataFields value={item} onChange={(change) => onDocMetadataChange(index, change)}
                  canShare={canShare} disabled={isUploadingDocs} />
              </div>
            ))}
            {uploadError && <p role="alert" className="text-sm text-red">{uploadError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={documentButton} disabled={isUploadingDocs} onClick={cancelUploads}>Annuler</button>
              <button type="submit" className={primary} disabled={isUploadingDocs || !docs.length || docs.some(({ title }) => !title.trim())}>
                {isUploadingDocs ? "Dépôt en cours…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </DocumentDialog>
      )}
      {editing && (
        <DocumentDialog title="Modifier le document" busy={saving} onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="grid gap-4">
            <p className="break-all text-sm text-darkBlue/70">{editing.filename}</p>
            <MetadataFields value={editing} onChange={(change) => setEditing((value) => ({ ...value, ...change }))}
              canShare={canShare} disabled={saving} />
            {editError && <p role="alert" className="text-sm text-red">{editError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={documentButton} disabled={saving} onClick={() => setEditing(null)}>Annuler</button>
              <button type="submit" className={primary} disabled={saving || !editing.title.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </DocumentDialog>
      )}
    </section>
  );
}
