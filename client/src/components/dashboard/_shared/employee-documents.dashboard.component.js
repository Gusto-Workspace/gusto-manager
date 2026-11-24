import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Download, Eye, Files, FileText, Folder, Pencil, Search, Trash2 } from "lucide-react";
import { categories, documentCategory, documentPageSize, getEmployeeDocumentsPage, visibilities } from "./employee-documents.utils.mjs";

export const documentButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey disabled:opacity-50";
export const documentField = "min-h-10 min-w-0 w-full rounded-lg border border-darkBlue/15 bg-white px-3 text-sm";
const previewTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const sizeFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function DocumentDialog({ title, onClose, busy, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  return (
    <dialog ref={dialog} aria-label={title} onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-darkBlue/45">
      <div className="border-b border-darkBlue/10 px-4 py-3 midTablet:px-5">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="grid gap-4 p-4 midTablet:p-5">{children}</div>
    </dialog>
  );
}

function DocumentAction({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={`${documentButton} size-10 px-0 ${danger ? "text-red" : ""}`}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function displayDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : "—";
}

export default function EmployeeDocumentsList({ documents, endpoint, personal = false,
  showVisibility = false, loading, error, onRetry, onEdit, onDelete, category, onCategoryChange }) {
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(documentPageSize);
  const [preview, setPreview] = useState(null);
  const [transfer, setTransfer] = useState("");
  const [transferError, setTransferError] = useState("");
  const activeRequest = useRef(null);
  const objectUrl = useRef(null);

  useEffect(() => () => {
    activeRequest.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function closePreview() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setPreview(null);
  }

  async function readDocument(document, previewRequested) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setTransfer(document.public_id);
    setTransferError("");
    try {
      const { data } = await axios.get(`${endpoint}/${encodeURIComponent(document.public_id)}/download`, {
        responseType: "blob",
        signal: controller.signal,
        params: personal ? { scope: "personal" } : undefined,
      });
      if (controller.signal.aborted) return;
      if (previewRequested && !previewTypes.has(data.type)) throw new Error("Unsupported preview");
      const url = URL.createObjectURL(data);
      if (previewRequested) {
        objectUrl.current = url;
        setPreview({ url, title: document.title });
      } else {
        const link = window.document.createElement("a");
        link.href = url;
        link.download = document.filename || document.title || "document";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (!controller.signal.aborted) setTransferError("Impossible d’ouvrir ce document. Vérifiez votre accès ou réessayez.");
    } finally {
      if (!controller.signal.aborted) {
        activeRequest.current = null;
        setTransfer("");
      }
    }
  }

  const { visibleDocuments, total } = getEmployeeDocumentsPage(documents, { search, category, visibility }, visibleLimit);
  const counts = new Map();
  for (const document of documents) {
    const key = documentCategory(document);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const folders = Object.entries(categories).filter(([key]) => key !== "uncategorized" || counts.has(key) || category === key);
  const columns = showVisibility
    ? "midTablet:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_auto]"
    : "midTablet:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_auto]";

  return (
    <div className="min-w-0">
      <div role="group" aria-label="Dossiers des documents" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.25rem),1fr))] gap-2 border-b border-darkBlue/10 p-4 midTablet:px-5">
        {[["", "Tous les documents"], ...folders].map(([key, label]) => {
          const Icon = key ? Folder : Files;
          return (
            <button key={key} type="button" aria-pressed={(category || "") === key}
              onClick={() => {
                if ((category || "") === key) return;
                onCategoryChange(key);
                setVisibleLimit(documentPageSize);
              }}
              className={`flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg border px-2 py-2 text-left text-xs font-semibold hover:border-blue/60 ${(category || "") === key ? "border-blue/40 bg-blue/5 text-blue" : "border-darkBlue/10 text-darkBlue"}`}>
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{label}</span>
              <span className="shrink-0 tabular-nums text-darkBlue/60">{key ? counts.get(key) || 0 : documents.length}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 p-4 midTablet:grid-cols-[minmax(0,1fr)_auto] midTablet:px-5">
        <label className="relative min-w-0">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-darkBlue/55" aria-hidden="true" />
          <input type="search" aria-label="Rechercher un document" placeholder="Rechercher un document"
            value={search} onChange={(event) => {
              setSearch(event.target.value);
              setVisibleLimit(documentPageSize);
            }} className={`${documentField} pl-9`} />
        </label>
        {showVisibility && (
          <select aria-label="Filtrer par visibilité" value={visibility} onChange={(event) => {
            setVisibility(event.target.value);
            setVisibleLimit(documentPageSize);
          }} className={documentField}>
            <option value="">Toutes les visibilités</option>
            {Object.entries(visibilities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 text-sm text-red midTablet:px-5">
          <p role="alert">{error}</p>
          {onRetry && <button type="button" onClick={onRetry} className={documentButton}>Réessayer</button>}
        </div>
      )}
      {transferError && <p role="alert" className="px-4 pb-4 text-sm text-red midTablet:px-5">{transferError}</p>}
      {loading ? <p role="status" className="px-4 pb-5 text-sm text-darkBlue/70 midTablet:px-5">Chargement des documents…</p> :
        total > 0 ? (
          <table className={`grid w-full text-sm ${columns}`}>
            <thead className="sr-only midTablet:not-sr-only midTablet:col-span-full midTablet:grid midTablet:grid-cols-subgrid">
              <tr className="grid grid-cols-subgrid gap-3 border-t border-darkBlue/10 bg-lightGrey/60 px-5 py-2 text-left text-xs text-darkBlue/70 midTablet:col-span-full">
                <th scope="col">Document</th><th scope="col">Dossier</th>
                {showVisibility && <th scope="col">Visibilité</th>}<th scope="col">Date de dépôt</th><th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="grid divide-y divide-darkBlue/10 border-t border-darkBlue/10 midTablet:col-span-full midTablet:grid-cols-subgrid">
              {visibleDocuments.map((document) => (
                <tr key={document.public_id} className="grid min-w-0 gap-x-3 gap-y-2 px-4 py-3 midTablet:col-span-full midTablet:grid-cols-subgrid midTablet:items-center midTablet:px-5">
                  <td className="flex min-w-0 items-center gap-2">
                    <FileText size={18} className="shrink-0 text-blue" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold" title={document.title}>{document.title || "Document"}</div>
                      <div className="truncate text-xs text-darkBlue/65" title={document.filename}>
                        {document.filename}{document.size > 0 && ` · ${sizeFormat.format(document.size / 1024)} Ko`}
                      </div>
                    </div>
                  </td>
                  <td>{categories[documentCategory(document)]}</td>
                  {showVisibility && <td><span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${document.visibility === "employee" ? "bg-blue/10 text-blue" : "bg-lightGrey text-darkBlue/75"}`}>
                    {visibilities[document.visibility] || visibilities.internal}
                  </span></td>}
                  <td className="text-darkBlue/70">{displayDate(document.uploadedAt)}</td>
                  <td className="flex flex-wrap gap-1.5 midTablet:justify-end">
                    {previewTypes.has(document.mimeType) && <DocumentAction icon={Eye} label={`Aperçu de ${document.title}`} onClick={() => readDocument(document, true)} disabled={Boolean(transfer)} />}
                    <DocumentAction icon={Download} label={`Télécharger ${document.title}`} onClick={() => readDocument(document, false)} disabled={Boolean(transfer)} />
                    {onEdit && <DocumentAction icon={Pencil} label={`Modifier ${document.title}`} onClick={() => onEdit(document)} />}
                    {onDelete && <DocumentAction icon={Trash2} label={`Supprimer ${document.title}`} onClick={() => onDelete(document)} danger />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !error && <p className="border-t border-darkBlue/10 px-4 py-8 text-center text-sm text-darkBlue/70">
          {search || visibility ? "Aucun document ne correspond aux filtres." :
            category ? "Ce dossier ne contient aucun document." :
            personal ? "Aucun document n’est disponible pour ce restaurant." : "Aucun document enregistré."}
        </p>}
      {!loading && total > documentPageSize && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-darkBlue/10 p-4">
          <p role="status" className="text-sm text-darkBlue/70">{visibleDocuments.length} sur {total} documents</p>
          {visibleDocuments.length < total && (
            <button type="button" onClick={() => setVisibleLimit((limit) => limit + documentPageSize)} className={documentButton}>
              Voir plus
            </button>
          )}
        </div>
      )}
      {preview && (
        <DocumentDialog title={preview.title || "Aperçu du document"} onClose={closePreview}>
          {/* The object URL is built from the authorized image response. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="" className="mx-auto max-h-[60dvh] max-w-full object-contain" />
          <button type="button" onClick={closePreview} className={`${documentButton} justify-self-end`}>Fermer</button>
        </DocumentDialog>
      )}
    </div>
  );
}
