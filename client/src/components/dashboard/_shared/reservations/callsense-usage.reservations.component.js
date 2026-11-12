import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Phone, RefreshCw } from "lucide-react";

const date = (value) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
const currentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
};
const messages = {
  offre_non_associee: "Offre CallSense non encore associée.",
  offre_non_configuree: "Offre CallSense non configurée : contactez Gusto.",
  stripe_indisponible: "Informations de consommation indisponibles : réessayez plus tard.",
  offre_incompatible: "Offre CallSense incompatible : contactez Gusto.",
  abonnement_incomplet: "Abonnement ou période incomplets : contactez Gusto.",
  abonnement_inactif: "Abonnement CallSense inactif : contactez Gusto pour vérifier son état.",
};

export default function CallSenseUsageReservationsComponent({ restaurantData, revision, reconnect }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [refresh, setRefresh] = useState(0);
  const loaded = useRef(null);
  const restaurantId = restaurantData?._id;

  useEffect(() => {
    if (!restaurantId) return undefined;
    let active = true;
    const telephoneOnly = loaded.current?.restaurantId === String(restaurantId) && loaded.current?.reconnect === reconnect;
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/callsense/usage`, { params: { month, ...(telephoneOnly ? { telephoneOnly: "1" } : {}) } })
      .then(({ data }) => {
        if (!active) return;
        setState((previous) => ({ ...data, usage: telephoneOnly ? previous?.usage : data.usage, restaurantId }));
        loaded.current = { restaurantId: String(restaurantId), reconnect };
        setError(false);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [restaurantId, month, revision, reconnect, refresh]);

  if (!state?.configured || String(state.restaurantId) !== String(restaurantId)) return error ? <p className="text-sm text-red">Suivi CallSense indisponible.</p> : null;
  const { usage, telephone } = state;
  const cards = telephone && [
    ["Reçus", telephone.received], ["Répondus", telephone.answered], ["Manqués", telephone.missed],
    ["Occupés", telephone.busy], ["Refusés identifiés", telephone.refused],
    ["Conversation", `${Math.floor(telephone.conversationSeconds / 60)} min ${telephone.conversationSeconds % 60} s`],
  ];
  return <section className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm">
    <div className="px-2 py-4 mobile:p-4 midTablet:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-base font-semibold text-darkBlue"><Phone className="size-4 shrink-0 opacity-60" />Gusto CallSense</h2></div>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/15 px-3 py-2 text-xs font-semibold text-darkBlue/70" onClick={() => { loaded.current = null; setRefresh((value) => value + 1); }}><RefreshCw className="size-4" />Actualiser</button>
      </div>
      {error && <p role="status" className="mt-3 text-sm text-red">Actualisation indisponible, réessayez.</p>}
      <div className="my-4 h-px bg-darkBlue/10" />
      {usage?.available ? <div className="space-y-3"><div><p className="font-semibold text-darkBlue">Consommation commerciale</p><p className="text-sm text-darkBlue/60">Période du {date(usage.periodStart)} au {date(usage.periodEnd)}</p></div>
        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-medium text-darkBlue/65">Minutes utilisées</p><p className="mt-1 text-xl font-semibold text-darkBlue">{usage.verifiedMinutes} / {usage.includedMinutes} min</p></div><p className="text-sm font-semibold text-darkBlue/60">{usage.percent} %</p></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-darkBlue/10" role="progressbar" aria-label="Minutes incluses utilisées" aria-valuemin={0} aria-valuemax={usage.includedMinutes} aria-valuenow={Math.min(usage.verifiedMinutes, usage.includedMinutes)}><div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.min(100, usage.percent)}%` }} /></div>
          <p className="mt-2 text-xs text-darkBlue/55">{usage.remainingMinutes} min restantes</p>
          {(usage.usageIncomplete || usage.unverifiedCalls > 0) && <p className="mt-2 text-xs text-darkBlue/60">La consommation affichée peut être incomplète ; certains appels restent à prendre en compte.</p>}
          {usage.percent >= 80 && <p className="mt-2 text-sm text-orange">{usage.percent >= 100 ? "Forfait atteint ; les appels restent disponibles." : "80 % du forfait atteint."}</p>}
          {usage.overageMinutes > 0 && <p className="mt-2 text-sm text-darkBlue/70">Dépassement : {usage.overageMinutes} min · estimation {(usage.overageMinutes * 0.05).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>}
        </div>
        {usage.history?.length > 0 && <details className="text-sm text-darkBlue/70"><summary className="cursor-pointer font-semibold">Historique des périodes</summary>{usage.history.map((period, index) => <p className="mt-2" key={`${period.periodStart}-${period.periodEnd}-${index}`}>{date(period.periodStart)} – {date(period.periodEnd)} : {period.verifiedMinutes} min utilisées{period.pending ? " · mise à jour en cours" : ""}</p>)}</details>}
      </div> : usage?.reason === "offre_non_associee" ? <div><p className="font-semibold text-darkBlue">Offre CallSense</p><div className="mt-3 rounded-2xl border border-darkBlue/10 bg-white/60 p-4"><p className="text-sm font-semibold text-darkBlue">Offre non encore souscrite</p><p className="mt-1 text-sm text-darkBlue/65">1 000 minutes incluses par période de facturation, puis 0,05 € par minute supplémentaire.</p><p className="mt-2 text-xs text-darkBlue/55">Le suivi du quota et la date de renouvellement seront disponibles après association de l’offre.</p></div></div> : <p className="text-sm text-darkBlue/60">{messages[usage?.reason] || "Informations commerciales indisponibles : contactez Gusto."}</p>}
      <div className="my-4 h-px bg-darkBlue/10" />
      <div className="flex flex-wrap items-end justify-between gap-3"><p className="font-semibold text-darkBlue">Activité téléphonique</p><label className="flex items-center gap-2 text-sm text-darkBlue/70">Mois <input aria-label="Mois des appels" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} className="w-auto max-w-full rounded-xl border border-darkBlue/15 bg-white px-3 py-2" /></label></div>
      {cards && telephone.month === month ? <div className="mt-3 grid grid-cols-2 gap-3 midTablet:grid-cols-3 desktop:grid-cols-6">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3"><p className="text-xs text-darkBlue/60">{label}</p><p className="mt-1 text-lg font-semibold text-darkBlue">{value}</p></div>)}</div> : <p className="mt-3 text-sm text-darkBlue/60">Chargement de la période…</p>}
    </div>
  </section>;
}
