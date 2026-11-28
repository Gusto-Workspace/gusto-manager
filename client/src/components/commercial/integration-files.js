import { useCallback, useEffect, useRef, useState } from "react";
import { commercialSecondary } from "./commercial-ui";

const categories = {
  SITE: "Coordonnées et éléments du site", RIB: "RIB (PDF)", DOMAIN: "Domaine",
  ZENChef: "Zenchef · transfert autorisé", SKELLO: "Skello · transfert autorisé",
};
const providers = { zenchef: "Zenchef", skello: "Skello" };

function MigrationAccess({ path, provider, stored, canEdit, isAdmin, request, run, busy }) {
  const [access, setAccess] = useState("");
  const revealRequest = useRef(null);
  const endpoint = `${path}/access/${provider}`;
  useEffect(() => {
    function hide() {
      revealRequest.current?.abort();
      setAccess("");
    }
    window.addEventListener("blur", hide);
    return () => {
      revealRequest.current?.abort();
      window.removeEventListener("blur", hide);
    };
  }, []);
  return <div className="grid gap-2 border-t border-darkBlue/10 pt-2">
    <p className="font-semibold">{providers[provider]} · {stored ? "Accès protégé enregistré" : "Aucun accès enregistré"}</p>
    {stored && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={commercialSecondary} onClick={() => {
        if (access) { setAccess(""); return; }
        const controller = new AbortController();
        revealRequest.current = controller;
        run(async () => {
          try {
            const result = await request(`${endpoint}/reveal`, { method: "POST", signal: controller.signal });
            if (!controller.signal.aborted) setAccess(result.access);
          } catch (error) {
            if (!controller.signal.aborted) throw error;
          }
        }, false);
      }}>{access ? "Masquer l’accès" : "Afficher l’accès"}</button>
      {isAdmin && <button type="button" className={commercialSecondary} disabled={busy} onClick={() => {
        setAccess("");
        run(() => request(`${endpoint}/remove`, { method: "POST" }));
      }}>Retirer l’accès</button>}
    </div>}
    {access && <p className="whitespace-pre-wrap break-all rounded-lg border p-2">{access}</p>}
    {canEdit && <form className="grid gap-2" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const value = new FormData(form).get("access");
      form.reset();
      setAccess("");
      run(() => request(`${endpoint}/save`, { method: "POST", body: { access: value } }));
    }}>
      <label className="grid gap-1">Accès autorisé {providers[provider]}
        <input type="password" name="access" autoComplete="new-password" maxLength={2048} required className="input-commercial" />
      </label>
      <button type="submit" className={commercialSecondary} disabled={busy}>{stored ? "Remplacer l’accès" : "Enregistrer l’accès"}</button>
    </form>}
  </div>;
}

export default function IntegrationFiles({ path, request, isAdmin }) {
  const [dossier, setDossier] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState(null);
  const load = useCallback(async (signal) => {
    setDossier(await request(path, { signal }));
  }, [request, path]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [load]);

  async function run(action, reload = true) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (reload) await load();
    } catch (failure) {
      if (reload) await load().catch(() => {});
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function download(file) {
    run(async () => {
      const blob = await request(`${path}/files/${file._id}`, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, false);
  }

  function upload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const category = data.get("category");
    data.delete("category");
    run(async () => {
      await request(`${path}/files/${category}`, { method: "POST", body: data });
      form.reset();
    });
  }

  return <section className="grid gap-3 rounded-xl border border-darkBlue/10 p-4">
    <h4 className="font-bold">Dossier d’intégration privé</h4>
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {!dossier && !error && <p role="status" className="text-sm">Chargement…</p>}
    {dossier && !dossier.available && <p className="text-sm">Aucune intégration active pour ce dossier.</p>}
    {dossier?.available && <>
      <p className="text-sm">{dossier.restaurantId ? "Restaurant associé" : dossier.reviewedAt ? "Réception confirmée" : "Dossier à compléter ou à vérifier"}</p>
      <p className="text-sm text-darkBlue/70">Déposez ici les pièces du site et le RIB. Pour Zenchef et Skello, privilégiez les accès délégués ou les exports autorisés. Utilisez le champ protégé pour les identifiants confidentiels.</p>
      <ul className="divide-y divide-darkBlue/10 text-sm">{dossier.files.map((file) =>
        <li key={file._id} className="flex flex-wrap items-center gap-2 py-2">
          <span className="min-w-0 break-all">{categories[file.category]} · {file.filename}</span>
          {!file.removalRequestedAt && <button type="button" disabled={busy} className={commercialSecondary} onClick={() => download(file)}>Télécharger</button>}
          {isAdmin && <button type="button" disabled={busy} className="text-red" onClick={() => setRemove(file)}>{file.removalRequestedAt ? "Reprendre le retrait" : "Retirer"}</button>}
        </li>)}</ul>
      {remove && <div className="flex flex-wrap items-center gap-2 text-sm">
        <p>Retirer cette pièce du stockage privé ?</p>
        <button type="button" className={commercialSecondary} onClick={() => setRemove(null)}>Annuler</button>
        <button type="button" disabled={busy} className="button-commercial" onClick={() => run(async () => {
          await request(`${path}/files/${remove._id}`, { method: "DELETE" });
          setRemove(null);
        })}>Confirmer</button>
      </div>}
      {!dossier.restaurantId && <form onSubmit={upload} className="grid gap-2">
        <label className="grid gap-1 text-sm">Catégorie<select name="category" className="input-commercial">
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Pièce jointe privée<input type="file" name="file" required className="input-commercial" /></label>
        <button type="submit" className="button-commercial justify-self-start" disabled={busy}>Déposer la pièce</button>
      </form>}
      {isAdmin && !dossier.reviewedAt && !dossier.restaurantId && !dossier.files.some((file) => file.removalRequestedAt) &&
        ["SITE", "RIB"].every((key) => dossier.files.some((file) => file.category === key)) &&
        <button type="button" className={commercialSecondary} disabled={busy}
          onClick={() => run(() => request(`${path}/review`, { method: "POST" }))}>Confirmer la réception des pièces nécessaires</button>}
      {dossier.migration?.map(({ provider, stored }) => <MigrationAccess key={provider}
        path={path} provider={provider} stored={stored} canEdit={!dossier.restaurantId} isAdmin={isAdmin} request={request} run={run} busy={busy} />)}
    </>}
  </section>;
}
