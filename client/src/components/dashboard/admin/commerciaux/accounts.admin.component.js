import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronRight, Plus, UserRound, UsersRound } from "lucide-react";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { CommercialAvatar, CommercialBadge, CommercialEmpty, CommercialHeader, CommercialSearch, CommercialSubheading, commercialPanel, commercialSecondary } from "@/components/commercial/commercial-ui";

const base = `${process.env.NEXT_PUBLIC_API_URL}/admin/commerciaux`;
export const commercialAdminRoot = "/dashboard/admin/seller";
export const commercialAdminAccountPath = (id) => `${commercialAdminRoot}/accounts/${id}`;
const labels = { INVITED: "À inviter / en attente", ACTIVE: "Actif", DISABLED: "Désactivé", ARCHIVED: "Archivé" };
const colors = { INVITED: "warning", ACTIVE: "success", DISABLED: "danger", ARCHIVED: "neutral" };
const fields = [
  ["firstName", "Prénom", "text", 100, true], ["lastName", "Nom", "text", 100, true],
  ["email", "Email", "email", 254, true], ["phone", "Téléphone", "tel", 40],
  ["companyName", "Entreprise", "text", 160], ["siret", "SIRET", "text", 14],
  ["businessAddress", "Adresse professionnelle", "text", 400], ["startedAt", "Début de collaboration", "date"],
];
const errorMessage = (error) => error.response?.data?.message || "L’opération a échoué.";

export function CommercialAccountStatus({ status }) {
  return <CommercialBadge tone={colors[status]}>{labels[status]}</CommercialBadge>;
}

export function AccountEditor({ selected, invitationReady, onSaved, onClose }) {
  const [account, setAccount] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  async function save(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const path = account?._id ? `${base}/${account._id}` : base;
      const { data } = await axios({ ...getAdminAuthConfig(), url: path, method: account?._id ? "PATCH" : "POST", data: values });
      setAccount(data.account);
      onSaved(data.account);
      setFeedback("Compte enregistré.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function action(path, body) {
    setBusy(true);
    setError("");
    setConfirmation(null);
    try {
      const { data } = await axios.post(`${base}/${account._id}/${path}`, body, getAdminAuthConfig());
      const updated = data?.account || (await axios.get(`${base}/${account._id}`, getAdminAuthConfig())).data.account;
      setAccount(updated);
      setFeedback(path === "status" ? "Statut mis à jour." : "Email envoyé.");
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Informations du commercial" className={`${commercialPanel} grid gap-5 p-4 midTablet:p-6`}>
      <CommercialSubheading title={selected ? "Informations du compte" : "Ajouter un commercial"} icon={UserRound}
        action={onClose && <button type="button" onClick={onClose} className={commercialSecondary}>Fermer</button>} />
      <form onSubmit={save} className="grid gap-4">
        <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-darkBlue/10 p-3 midTablet:grid-cols-2 midTablet:p-4">
        <legend className="px-2 text-sm font-bold">Identité et coordonnées</legend>
        {fields.map(([name, label, type, maxLength, required]) => <label key={name} className="grid min-w-0 gap-1 text-sm">
          {label}<input name={name} type={type} required={required} maxLength={maxLength} className="input-commercial"
            disabled={account?.status === "ARCHIVED"} defaultValue={type === "date" ? account?.[name]?.slice(0, 10) : account?.[name]} />
        </label>)}
        </fieldset>
        <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-darkBlue/10 bg-[#faf9fd] p-3 midTablet:grid-cols-2 midTablet:p-4">
        <legend className="px-2 text-sm font-bold">Collaboration</legend>
        <label className="grid gap-1 text-sm">Commission par restaurant acquis (€)
          <span>400 € au total par nouvelle acquisition éligible, TVA éventuelle comprise</span>
        </label>
        <label className="grid gap-1 text-sm midTablet:col-span-2">Notes internes
          <textarea name="internalNotes" maxLength={4000} defaultValue={account?.internalNotes} disabled={account?.status === "ARCHIVED"} className="input-commercial min-h-20" />
        </label>
        </fieldset>
        {account?.status !== "ARCHIVED" && <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer</button>}
      </form>
      {account && account.status !== "ARCHIVED" && <div className="flex flex-wrap gap-2 border-t border-darkBlue/10 pt-4">
        {account.status === "INVITED" && <button type="button" disabled={busy || !invitationReady} onClick={() => action("invite", {})} className="button-commercial">Envoyer l’invitation</button>}
        {account.status === "ACTIVE" && <button type="button" disabled={busy || !invitationReady} onClick={() => setConfirmation({ path: "reset-access", text: "Réinitialiser l’accès et fermer les sessions ouvertes ?" })} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm">Réinitialiser l’accès</button>}
        {account.status === "DISABLED" ? <button type="button" disabled={busy || !invitationReady} onClick={() => action("status", { action: "activate" })} className="button-commercial">Réactiver</button> :
          <button type="button" disabled={busy} onClick={() => setConfirmation({ path: "status", body: { action: "disable" }, text: "Désactiver ce compte et fermer ses sessions ?" })} className="rounded-xl border border-darkBlue/15 px-3 py-2 text-sm">Désactiver</button>}
        <button type="button" disabled={busy} onClick={() => setConfirmation({ path: "status", body: { action: "archive" }, text: "Archiver définitivement cet accès ?" })} className="rounded-xl border border-red/20 px-3 py-2 text-sm text-red">Archiver</button>
      </div>}
      {confirmation && <div role="group" aria-label="Confirmation" className="flex flex-wrap items-center gap-2 rounded-xl bg-lightGrey p-3">
        <p className="basis-full text-sm">{confirmation.text}</p>
        <button type="button" onClick={() => setConfirmation(null)} className="rounded-xl px-3 py-2 text-sm">Annuler</button>
        <button type="button" onClick={() => action(confirmation.path, confirmation.body || {})} className="button-commercial">Confirmer</button>
      </div>}
      {feedback && <p role="status">{feedback}</p>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      {Boolean(account?.activity?.length) && <details className="border-t border-darkBlue/10 pt-4 text-sm">
        <summary className="cursor-pointer font-semibold">Activité récente</summary>
        <ul className="mt-3 grid gap-1">{[...account.activity].reverse().map(({ action, at }, index) => <li key={`${at}-${index}`}>{new Date(at).toLocaleString("fr-FR")} · {({
          CREATED: "Compte créé", INVITATION_ISSUED: "Invitation émise", RESET_ISSUED: "Lien de récupération émis",
          ACTIVATED: "Compte activé", PASSWORD_RESET: "Mot de passe réinitialisé", EMAIL_CHANGED: "Email modifié",
          PROFILE_UPDATED: "Informations modifiées", ACTIVE: "Compte réactivé", INVITED: "Compte en attente d’invitation",
          DISABLED: "Compte désactivé", ARCHIVED: "Compte archivé",
        })[action] || action}</li>)}</ul>
      </details>}
    </section>
  );
}

export default function CommercialAccountsAdmin({ header, onAccountCreated }) {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const result = await axios.get(base, getAdminAuthConfig({ params: { q: search, page, performance: "month" }, signal: controller.signal }));
        setState(result.data);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      }
    }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [search, page]);

  return (
    <>
      <CommercialHeader title="Commerciaux"
        action={<button type="button" onClick={() => setCreating(true)} className="button-commercial inline-flex items-center gap-2"><Plus size={17} aria-hidden="true" />Ajouter un commercial</button>} {...header} />
      <div className={`${commercialPanel} p-3 midTablet:p-4`}>
        <CommercialSearch label="Rechercher un commercial" value={search} onChange={(value) => { setSearch(value); setPage(1); }} className="max-w-lg" />
      </div>
      {error && <p role="alert" className="text-red">{error}</p>}
      {creating && <AccountEditor invitationReady={state?.invitationReady}
        onSaved={(account) => { onAccountCreated(); router.push(`${commercialAdminAccountPath(account._id)}/information`); }} onClose={() => setCreating(false)} />}
      {!state && !error && <SimpleSkeleton />}
      {state && <section aria-label="Liste des commerciaux" className={`${commercialPanel} overflow-hidden`}>
        <div className="border-b border-darkBlue/10 bg-[#f7f6fb] px-4 py-3">
          <CommercialSubheading title="Équipe commerciale" description={`${state.total} ${state.total === 1 ? "commercial" : "commerciaux"} · Résultats du mois`} />
        </div>
        {!state.accounts.length && <CommercialEmpty icon={UsersRound} title="Aucun commercial trouvé" />}
        <ul className="divide-y divide-darkBlue/10">
          {state.accounts.map((account) => <li key={account._id}>
            <Link href={commercialAdminAccountPath(account._id)} className="grid w-full min-w-0 gap-3 px-4 py-3.5 text-left hover:bg-[#f9f7ff] tablet:grid-cols-[1.3fr,2fr,minmax(130px,auto),auto] tablet:items-center">
              <span className="flex min-w-0 items-center gap-3"><CommercialAvatar name={`${account.firstName} ${account.lastName}`} />
                <span className="min-w-0"><strong className="break-words">{account.firstName} {account.lastName}</strong><span className="block break-all text-sm text-darkBlue/65">{account.email}</span></span>
              </span>
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-[#f5f3fb] p-2.5 text-xs text-darkBlue/70">
                {[["Prospects ajoutés", "prospects"], ["Devis envoyés", "quotesSent"], ["Restaurants acquis", "acquired"]].map(([label, key]) => <div key={key}>
                  <dt>{label}</dt><dd className="mt-1 text-sm font-semibold text-darkBlue">{account.performance?.[key] ?? "—"}</dd>
                </div>)}
              </dl>
              <span className="justify-self-start"><CommercialAccountStatus status={account.status} /></span>
              <ChevronRight size={18} className="hidden text-violet tablet:block" aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
        {state.total > state.limit && <div className="flex justify-between gap-2 border-t border-darkBlue/10 pt-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-xl px-2 py-1 text-sm text-blue disabled:opacity-40">Précédent</button>
          <span className="text-sm">Page {page}</span>
          <button type="button" disabled={page * state.limit >= state.total} onClick={() => setPage(page + 1)} className="rounded-xl px-2 py-1 text-sm text-blue disabled:opacity-40">Suivant</button>
        </div>}
      </section>}
    </>
  );
}
