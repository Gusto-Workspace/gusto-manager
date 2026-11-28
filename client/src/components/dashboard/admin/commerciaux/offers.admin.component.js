import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowLeft, ArrowUpRight, Check, Plus, Tags } from "lucide-react";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { CommercialBadge, CommercialEmpty, CommercialHeader, CommercialSubheading, commercialPanel, commercialSecondary } from "@/components/commercial/commercial-ui";

const url = `${process.env.NEXT_PUBLIC_API_URL}/admin/commerciaux/catalogue/offers`;
const priceFields = [
  ["monthlyCents", "Abonnement mensuel"], ["setupCents", "Mise en service"], ["extraModuleCents", "Module supplémentaire"],
  ["smsCents", "Rappels SMS mensuels"], ["tabletCents", "Location tablette mensuelle"], ["terminalCents", "Matériel de pointage mensuel"],
];
const states = { DRAFT: "Brouillon", PUBLISHED: "Publiée", WITHDRAWN: "Retirée" };
const statusColors = { DRAFT: "warning", PUBLISHED: "success", WITHDRAWN: "neutral" };
const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateLabel = (value) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

function localDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function OffersAdmin({ header }) {
  const [offers, setOffers] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(url, getAdminAuthConfig({ signal: controller.signal })).then(({ data }) => setOffers(data.offers))
      .catch(() => { if (!controller.signal.aborted) setError("Les offres n’ont pas pu être chargées."); });
    return () => controller.abort();
  }, []);

  function select(offer) {
    setActive(offer);
    setApproved(false);
    setConfirmWithdrawal(false);
    setMessage("");
    setError("");
  }

  async function update(work) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await work();
      const offer = data.offer;
      setOffers((items) => [offer, ...(items || []).filter((item) => item._id !== offer._id)]);
      select(offer);
      setMessage("Offre enregistrée.");
    } catch (error) {
      setError(error.response?.data?.message || "L’opération a échoué.");
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (body.signedCopyHours === "") delete body.signedCopyHours;
    else body.signedCopyHours = Number(body.signedCopyHours);
    for (const field of ["startsAt", "endsAt"]) {
      if (field in body) body[field] = body[field] ? new Date(body[field]).toISOString() : null;
    }
    update(() => axios.patch(`${url}/${active._id}`, body, getAdminAuthConfig()));
  }

  const draft = active?.status === "DRAFT";
  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title="Offres et tarifs"
      action={!active && <>
        <button type="button" disabled={busy} onClick={() => update(() => axios.post(url, { kind: "STANDARD" }, getAdminAuthConfig()))} className="button-commercial inline-flex items-center gap-2"><Plus size={16} aria-hidden="true" />Nouvelle offre standard</button>
        <button type="button" disabled={busy} onClick={() => update(() => axios.post(url, { kind: "FETES_2026" }, getAdminAuthConfig()))} className={commercialSecondary}>Nouvelle offre fêtes</button>
      </>} {...header} />
    {error && <p role="alert" className="text-red">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!active && <p className="text-sm text-darkBlue/70">Les offres définissent les tarifs et conditions que les commerciaux peuvent proposer aux restaurants.</p>}
    {active && <section className={`${commercialPanel} grid gap-4 p-4 midTablet:p-6`}>
      <button type="button" onClick={() => select(null)} disabled={busy} className="flex w-fit items-center gap-2 text-sm font-semibold text-blue hover:underline"><ArrowLeft size={16} />Retour aux offres</button>
      <CommercialSubheading icon={Tags} title={active.title} description={`Version ${active.version}`}
        action={<CommercialBadge tone={statusColors[active.status]}>{states[active.status]}</CommercialBadge>} />
      <form key={`${active._id}-${active.updatedAt}`} onSubmit={save} className="grid gap-3">
        <fieldset disabled={!draft || busy} className="grid min-w-0 gap-3 rounded-2xl border border-darkBlue/10 p-3 midTablet:grid-cols-2 midTablet:p-4">
          <legend className="px-2 text-sm font-bold">Tarifs</legend>
          <label className="grid gap-1 text-sm midTablet:col-span-2">Intitulé<input name="title" defaultValue={active.title} required maxLength={100} className="input-commercial" /></label>
          {priceFields.map(([key, label]) => <p key={key} className="text-sm">{label} · {euros.format(active[key] / 100)}</p>)}
        </fieldset>
        <fieldset disabled={!draft || busy} className="grid min-w-0 gap-3 rounded-2xl border border-darkBlue/10 bg-[#faf9fd] p-3 midTablet:grid-cols-2 midTablet:p-4">
          <legend className="px-2 text-sm font-bold">Conditions contractuelles et validité</legend>
          <p className="text-sm">Délai du site · {active.dayType === "WORKING" ? "7 jours ouvrés" : "7 jours calendaires"}</p>
          <label className="grid gap-1 text-sm">Accès à la copie signée (heures, 0 pour copie par email)<input type="number" name="signedCopyHours" min="0" max="720" step="1" defaultValue={active.signedCopyHours ?? ""} className="input-commercial" /></label>
          {["taxLabel", "smsLabel", "bankFeeScope"].map((field) => active[field] && <p className="text-sm" key={field}>{active[field]}</p>)}
          <label className="grid gap-1 text-sm">Début de validité<input type="datetime-local" name="startsAt" defaultValue={localDate(active.startsAt)} className="input-commercial" /></label>
          {active.kind !== "FETES_2026" && <label className="grid gap-1 text-sm">Fin de validité<input type="datetime-local" name="endsAt" defaultValue={localDate(active.endsAt)} className="input-commercial" /></label>}
          {active.kind === "FETES_2026" && <>
            <p className="text-sm">Signature jusqu’au 31 décembre 2026 inclus, heure de Paris. Cartes cadeaux est offert en supplément pendant 24 mois.</p>
            {active.postPromotionTerms && <p className="text-sm midTablet:col-span-2">{active.postPromotionTerms}</p>}
          </>}
        </fieldset>
        {draft && <p className="text-sm text-darkBlue/70">L’enregistrement applique les tarifs et conditions approuvés aux brouillons.</p>}
        {draft && <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer le brouillon</button>}
      </form>
      {draft && <div className="grid gap-2 border-t border-darkBlue/10 pt-4">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
          Je confirme les conditions enregistrées de cette version et les correspondances de facturation.
        </label>
        <button type="button" disabled={!approved || busy} onClick={() => update(() => axios.post(`${url}/${active._id}/status`, { action: "publish", approved }, getAdminAuthConfig()))} className="button-commercial justify-self-start">Publier cette version</button>
      </div>}
      {active.status === "PUBLISHED" && (confirmWithdrawal ? <div className="grid gap-2 rounded-xl bg-lightGrey p-3 text-sm">
        <p>Retirer cette version du catalogue des commerciaux ?</p><div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmWithdrawal(false)} className="rounded-xl border border-darkBlue/10 px-3 py-2">Annuler</button>
          <button type="button" disabled={busy} onClick={() => update(() => axios.post(`${url}/${active._id}/status`, { action: "withdraw" }, getAdminAuthConfig()))} className="button-commercial">Confirmer le retrait</button>
        </div></div> : <button type="button" disabled={busy} onClick={() => setConfirmWithdrawal(true)} className="justify-self-start rounded-xl border border-red/20 px-3 py-2 text-sm text-red">Retirer l’offre</button>)}
    </section>}
    {!offers && !error && <SimpleSkeleton />}
    {offers && !active && (offers.length ? <ul className="grid gap-4 midTablet:grid-cols-2 ultraWild:grid-cols-3">
      {offers.map((offer) => <li className={`${commercialPanel} grid grid-rows-[auto_auto_1fr_auto] gap-4 p-4 midTablet:p-5`} key={offer._id}>
        <CommercialSubheading title={offer.title} description={`Version ${offer.version}`} icon={Tags} />
        <div className="rounded-2xl bg-[#f4f0ff] p-3.5">
          <p className="flex flex-wrap items-baseline gap-x-2"><strong className="text-[1.65rem] font-bold tracking-tight tabular-nums">{euros.format(offer.monthlyCents / 100)}</strong><span className="text-sm font-medium">par mois</span></p>
          <p className="text-sm text-darkBlue/70">{euros.format(offer.setupCents / 100)} de mise en service</p>
        </div>
        <ul className="grid content-start gap-2 text-sm">
          {["1 module au choix et site internet", ...(offer.kind === "FETES_2026" ? ["Cartes cadeaux offertes pendant 24 mois"] : []),
            "Engagement de 24 mois"].map((benefit) => <li key={benefit} className="flex gap-2"><Check size={16} className="shrink-0 text-[#205d3d]" aria-hidden="true" />{benefit}</li>)}
        </ul>
        <div className="grid gap-2 border-t border-darkBlue/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <CommercialBadge tone={statusColors[offer.status]}>{states[offer.status]}</CommercialBadge>
            <span className="text-xs text-darkBlue/70">{offer.startsAt ? `Dès le ${dateLabel(offer.startsAt)}` : "Sans date de début"}
              {offer.endsAt ? offer.kind === "FETES_2026"
                ? ` · Signature jusqu’au ${dateLabel(new Date(offer.endsAt).getTime() - 1)} inclus`
                : ` · Jusqu’au ${dateLabel(offer.endsAt)}` : " · Sans date de fin"}
            </span>
          </div>
          <button type="button" onClick={() => select(offer)} aria-label={`${offer.status === "DRAFT" ? "Modifier" : "Consulter"} ${offer.title} version ${offer.version}`}
            className={`${commercialSecondary} justify-self-start`}>{offer.status === "DRAFT" ? "Modifier" : "Consulter"}<ArrowUpRight size={15} aria-hidden="true" /></button>
        </div>
      </li>)}
    </ul> : <div className={commercialPanel}><CommercialEmpty icon={Tags} title="Aucune offre" description="Créez une offre pour préparer les tarifs et les conditions de vente." /></div>)}
  </div>;
}
