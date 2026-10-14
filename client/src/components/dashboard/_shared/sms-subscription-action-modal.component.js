import { Loader2, X } from "lucide-react";

export default function SmsSubscriptionActionModal({ pending, loading, preparing, error, onClose, onConfirm }) {
  if (!pending) return null;
  const { action, commercial = {} } = pending;
  const date = commercial.periodEnd || commercial.effectiveAt;
  const periodEnd = date ? new Intl.DateTimeFormat("fr-FR").format(new Date(date)) : "la fin de la période en cours";
  return (
    <div className="fixed inset-0 z-[230] flex items-end justify-center tablet:items-center" role="dialog" aria-modal="true" aria-labelledby="sms-subscription-confirm-title">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-darkBlue/35" disabled={loading} onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-white p-5 shadow-xl tablet:max-w-lg tablet:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="sms-subscription-confirm-title" className="font-semibold text-darkBlue">
              {pending.applied ? "Finaliser la confirmation" : action === "schedule_deactivation" ? "Résilier Rappels SMS" : action === "cancel_deactivation" ? "Annuler la résiliation" : "Réactiver Rappels SMS"}
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-darkBlue/70">
              {pending.applied ? (
                <p>La modification de votre abonnement a été enregistrée. Sa confirmation doit encore être finalisée.</p>
              ) : action === "schedule_deactivation" ? (
                <p>Les notifications SMS seront arrêtées immédiatement. L’abonnement restera actif jusqu’au {periodEnd} puis prendra fin. Aucun nouveau renouvellement n’aura lieu après cette date et vous pourrez annuler avant l’échéance.</p>
              ) : action === "cancel_deactivation" ? (
                <p>Le module restera actif et aucune nouvelle facturation immédiate ne sera déclenchée.</p>
              ) : (
                <p>Le module sera réactivé immédiatement pour {Number(commercial.fixedMonthlyAmount || 9.9).toFixed(2).replace(".", ",")} € / mois, avec 100 crédits inclus puis 0,10 € par crédit. Le prorata Stripe de la période en cours s’appliquera.</p>
              )}
              {!pending.applied ? <p className="font-medium text-darkBlue">En confirmant, vous acceptez la modification de votre abonnement et l’avenant correspondant.</p> : null}
            </div>
          </div>
          <button type="button" aria-label="Fermer" disabled={loading} onClick={onClose}><X className="size-5" /></button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-red">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={loading} onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold">{pending.applied ? "Fermer" : "Annuler"}</button>
          <button type="button" disabled={loading || preparing} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-darkBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {loading || preparing ? <Loader2 className="size-4 animate-spin" /> : null}
            {preparing ? "Vérification…" : loading ? "Enregistrement…" : pending.applied || pending.ready === false ? "Réessayer" : action === "schedule_deactivation" ? "Confirmer la résiliation" : action === "cancel_deactivation" ? "Annuler la résiliation" : "Confirmer la réactivation"}
          </button>
        </div>
      </div>
    </div>
  );
}
