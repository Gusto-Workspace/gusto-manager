import { useEffect, useState } from "react";
import axios from "axios";
import { Download, ExternalLink, FileText, Library, Link2, Plus } from "lucide-react";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { getAdminAuthConfig } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";
import { commercialApi } from "./commercial-api";
import { CommercialBadge, CommercialEmpty, CommercialHeader, CommercialSubheading, commercialPanel, commercialSecondary } from "./commercial-ui";

const adminUrl = `${process.env.NEXT_PUBLIC_API_URL}/admin/commerciaux/library/resources`;
const states = { DRAFT: "Brouillon", PUBLISHED: "Publiée", WITHDRAWN: "Dépubliée", ARCHIVED: "Archivée" };
const tones = { DRAFT: "warning", PUBLISHED: "success", WITHDRAWN: "neutral", ARCHIVED: "neutral" };
const formats = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

function localEnd(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function downloadFile(item, isAdmin) {
  const file = isAdmin ? (await axios.get(`${adminUrl}/${item._id}/download`, getAdminAuthConfig({ responseType: "blob" }))).data :
    await commercialApi(`/resources/${item._id}/download`, { responseType: "blob" });
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = item.filename || item.title;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function ResourceEditor({ initial, onSaved, onClose }) {
  const [item, setItem] = useState(initial);
  const [kind, setKind] = useState(initial?.kind || "FILE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function update(request, feedback) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await request();
      setItem(data.resource);
      setMessage(feedback);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "L’opération a échoué.");
    } finally {
      setBusy(false);
      setConfirmation("");
    }
  }
  function save(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    body.order = Number(body.order);
    body.endsAt = body.endsAt ? new Date(body.endsAt).toISOString() : null;
    const config = getAdminAuthConfig();
    update(() => item ? axios.patch(`${adminUrl}/${item._id}`, body, config) :
      axios.post(adminUrl, { ...body, kind }, config), "Ressource enregistrée.");
  }
  function file(event) {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    update(() => axios.post(`${adminUrl}/${item._id}/file`, body, getAdminAuthConfig()), "Fichier enregistré.");
  }
  const archived = item?.status === "ARCHIVED";
  return <section className={`${commercialPanel} grid gap-4 p-4 midTablet:p-6`}>
    <CommercialSubheading title={item?.title || "Nouvelle ressource"} icon={item?.kind === "LINK" ? Link2 : FileText}
      description={item?.fileVersion ? `Version du fichier ${item.fileVersion}` : undefined}
      action={<button type="button" onClick={onClose} className={commercialSecondary}>Fermer</button>} />
    {item && <div><CommercialBadge tone={tones[item.status]}>{states[item.status]}</CommercialBadge></div>}
    {error && <p role="alert" className="text-red">{error}</p>}
    {message && <p role="status">{message}</p>}
    <form onSubmit={save} className="grid gap-3">
      <fieldset disabled={archived || busy} className="grid gap-3 tablet:grid-cols-2">
        <label className="grid gap-1 text-sm">Titre<input name="title" defaultValue={item?.title} required maxLength={150} className="input-commercial" /></label>
        <label className="grid gap-1 text-sm">Catégorie<input name="category" defaultValue={item?.category} required maxLength={60} className="input-commercial" /></label>
        <label className="grid gap-1 text-sm">Description<textarea name="description" defaultValue={item?.description} maxLength={700} className="input-commercial" /></label>
        <label className="grid gap-1 text-sm">Type<select value={kind} disabled={Boolean(item)} onChange={(event) => setKind(event.target.value)} className="input-commercial">
          <option value="FILE">Fichier privé</option><option value="LINK">Lien externe</option>
        </select></label>
        {kind === "LINK" && <label className="grid gap-1 text-sm tablet:col-span-2">Adresse HTTPS autorisée<input type="url" name="link" required maxLength={1000} defaultValue={item?.link} className="input-commercial" /></label>}
        <label className="grid gap-1 text-sm">Ordre<input type="number" name="order" defaultValue={item?.order || 0} min={0} max={10000} required className="input-commercial" /></label>
        <label className="grid gap-1 text-sm">Date de retrait facultative<input name="endsAt" type="datetime-local" defaultValue={localEnd(item?.endsAt)} className="input-commercial" /></label>
      </fieldset>
      {!archived && <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer</button>}
    </form>
    {item?.kind === "FILE" && !archived && <form onSubmit={file} className="grid gap-2 border-t border-darkBlue/10 pt-3 text-sm">
      <label className="grid gap-1">{item.filename ? "Remplacer le fichier courant" : "Ajouter un fichier privé"}<input type="file" name="file" accept={formats} required className="input-commercial" /></label>
      <button type="submit" disabled={busy} className="button-commercial justify-self-start">{item.filename ? "Remplacer" : "Joindre le fichier"}</button>
    </form>}
    {item && <div className="flex flex-wrap gap-2">
      {item.filename && <button type="button" onClick={() => downloadFile(item, true).catch(() => setError("Le téléchargement a échoué."))}
        className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm">Télécharger le fichier</button>}
      {!archived && <>
        {item.status !== "PUBLISHED" && <button type="button" disabled={busy || item.kind === "FILE" && !item.filename} onClick={() => setConfirmation("publish")}
          className="button-commercial">Publier</button>}
        {item.status === "PUBLISHED" && <button type="button" disabled={busy} onClick={() => setConfirmation("withdraw")}
          className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm">Dépublier</button>}
        <button type="button" disabled={busy} onClick={() => setConfirmation("archive")}
          className="rounded-xl border border-red/20 px-3 py-2 text-sm text-red">Archiver</button>
      </>}
    </div>}
    {confirmation && <div className="flex flex-wrap gap-2 rounded-xl bg-lightGrey p-3 text-sm">
      <p className="basis-full">{({ publish: "Confirmer que cette ressource est autorisée pour tous les commerciaux ?", withdraw: "Retirer cette ressource de l’espace commercial ?", archive: "Archiver cette ressource ?" })[confirmation]}</p>
      <button type="button" onClick={() => setConfirmation("")} className="rounded-xl px-3 py-2">Annuler</button>
      <button type="button" disabled={busy} onClick={() => update(() => axios.post(`${adminUrl}/${item._id}/status`, { action: confirmation }, getAdminAuthConfig()), "Statut mis à jour.")}
        className="button-commercial">Confirmer</button>
    </div>}
  </section>;
}

export default function SalesResources({ header, isAdmin = false }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({ page, ...(status && { status }) });
    const request = isAdmin ? axios.get(`${adminUrl}?${search}`, getAdminAuthConfig({ signal: controller.signal })).then(({ data }) => data) :
      commercialApi(`/resources?${search}`, { signal: controller.signal });
    request.then((result) => { setData(result); setError(""); }).catch((err) => {
      if (!controller.signal.aborted) setError(err?.response?.data?.message || err.message);
    });
    return () => controller.abort();
  }, [isAdmin, page, revision, status]);
  const groups = new Map();
  for (const item of data?.resources || []) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title="Ressources"
      action={isAdmin && <button type="button" onClick={() => setSelected({ key: "new" })} className="button-commercial inline-flex items-center gap-2"><Plus size={17} aria-hidden="true" />Ajouter une ressource</button>}
      {...header} />
    {isAdmin && <div className={`${commercialPanel} p-3 midTablet:p-4`}><label className="grid max-w-sm gap-1 text-sm">Statut<select value={status}
      onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="input-commercial">
      <option value="">Tous les statuts</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label></div>}
    {selected && <ResourceEditor key={selected.key} initial={selected.item}
      onSaved={() => setRevision((value) => value + 1)} onClose={() => setSelected(null)} />}
    {error && <p role="alert" className="text-red">{error}</p>}
    {!data && !error && <SimpleSkeleton />}
    {data?.total === 0 && <div className={commercialPanel}><CommercialEmpty icon={Library} title="Aucune ressource disponible"
      description={isAdmin ? "Changez le filtre de statut ou ajoutez une ressource." : "Les ressources publiées par l’administration apparaîtront ici."} /></div>}
    {[...groups.entries()].map(([category, items]) => <section key={category} className="grid gap-2">
      <h2 className="font-bold">{category}</h2>
      <ul className="grid gap-3 midTablet:grid-cols-2 ultraWild:grid-cols-3">{items.map((item) => {
        const Icon = item.kind === "LINK" ? Link2 : FileText;
        return <li key={item._id} className={`${commercialPanel} grid content-start gap-3 p-4 midTablet:p-5`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><Icon size={20} aria-hidden="true" /></span>
          <h3 className="min-w-0 break-words font-bold">{item.title}</h3>
        </div>
        {item.description && <p className="whitespace-pre-wrap break-words text-sm text-darkBlue/70">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <><CommercialBadge tone={tones[item.status]}>{states[item.status]}</CommercialBadge>
            <button type="button" onClick={() => setSelected({ key: item._id, item })} className={commercialSecondary}>Ouvrir</button></>}
          {!isAdmin && item.kind === "LINK" && <a href={item.link} target="_blank" rel="noopener noreferrer" className={commercialSecondary}><ExternalLink size={17} />Ouvrir le lien</a>}
          {!isAdmin && item.kind === "FILE" && <button type="button" onClick={() => downloadFile(item, false).catch((err) => setError(err.message))} className={commercialSecondary}>
            <Download size={17} />Télécharger
          </button>}
        </div>
      </li>;
      })}</ul>
    </section>)}
    {data?.total > data?.limit && <div className="flex justify-between gap-2 text-sm">
      <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="text-blue disabled:opacity-40">Précédent</button>
      <span>Page {page}</span><button type="button" onClick={() => setPage(page + 1)} disabled={page * data.limit >= data.total} className="text-blue disabled:opacity-40">Suivant</button>
    </div>}
  </div>;
}
