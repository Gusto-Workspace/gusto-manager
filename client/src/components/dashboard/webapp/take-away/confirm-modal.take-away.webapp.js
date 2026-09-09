import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

import { STATUS_LABELS } from "../../take-away/take-away.utils";

const CLOSE_MS = 220;

const ACTION_CONTENT = {
  retry_refund: {
    title: "Relancer le remboursement",
    text: "Voulez-vous relancer le remboursement ?",
    label: "Relancer",
    destructive: true,
    icon: AlertTriangle,
  },
  confirmed: {
    title: "Confirmer la commande",
    text: "Voulez-vous confirmer cette commande ?",
    label: "Confirmer",
    icon: CheckCircle2,
  },
  preparing: {
    title: "Lancer la préparation",
    text: "Voulez-vous passer cette commande en préparation ?",
    label: "Préparer",
    icon: CheckCircle2,
  },
  ready: {
    title: "Marquer la commande prête",
    text: "Voulez-vous marquer cette commande comme prête ?",
    label: "Commande prête",
    icon: CheckCircle2,
  },
  out_for_delivery: {
    title: "Démarrer la livraison",
    text: "Voulez-vous passer cette commande en livraison ?",
    label: "En livraison",
    icon: CheckCircle2,
  },
  completed: {
    title: "Terminer la commande",
    text: "Voulez-vous terminer cette commande ?",
    label: "Terminer",
    icon: CheckCircle2,
  },
  canceled: {
    title: "Annuler la commande",
    text: "Voulez-vous annuler cette commande ?",
    label: "Annuler",
    destructive: true,
    icon: AlertTriangle,
  },
  rejected: {
    title: "Refuser la commande",
    text: "Voulez-vous refuser cette commande ?",
    label: "Refuser",
    destructive: true,
    icon: AlertTriangle,
  },
};

export default function ConfirmModalTakeAwayWebapp({
  open,
  order,
  status,
  processing,
  error,
  onClose,
  onConfirm,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open || !order || !status) return null;

  const fallback = {
    title: "Confirmer l’action",
    text: `La commande passera au statut « ${STATUS_LABELS[status] || status} ».`,
    label: "Confirmer",
    icon: AlertTriangle,
  };
  const content = ACTION_CONTENT[status] || fallback;
  const Icon = content.icon;
  function closeIfAllowed() {
    if (processing) return;
    setVisible(false);
    window.setTimeout(() => onClose?.(), CLOSE_MS);
  }

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={closeIfAllowed}
        className={`absolute inset-0 bg-darkBlue/35 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fermer la confirmation"
      />

      <div
        className={`absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-darkBlue/10 bg-lightGrey shadow-[0_25px_80px_rgba(19,30,54,0.25)] transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`mt-0.5 flex size-11 min-w-11 items-center justify-center rounded-2xl border border-darkBlue/10 ${
                content.destructive ? "bg-red/10" : "bg-darkBlue/5"
              }`}
            >
              <Icon
                className={`size-5 ${
                  content.destructive ? "text-red" : "text-darkBlue/70"
                }`}
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight text-darkBlue">
                {content.title}
              </h2>
              <p className="mt-1 text-sm leading-5 text-darkBlue/70">
                {content.text}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeIfAllowed}
            disabled={processing}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition canHover:hover:bg-darkBlue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>

        {error ? (
          <div className="px-5 pt-4">
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
              {error}
            </div>
          </div>
        ) : null}

        <div className="flex flex-row-reverse gap-3 p-5">
          <button
            type="button"
            onClick={closeIfAllowed}
            disabled={processing}
            className="inline-flex w-full items-center justify-center rounded-2xl border border-darkBlue/10 bg-white px-4 py-3 text-sm font-semibold text-darkBlue transition canHover:hover:bg-darkBlue/5 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={processing}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-70 ${
              content.destructive
                ? "bg-red canHover:hover:bg-red/90"
                : "bg-blue canHover:hover:bg-blue/90"
            }`}
          >
            {processing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Traitement…
              </>
            ) : (
              content.label
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
