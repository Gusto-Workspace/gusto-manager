import { Loader2, X } from "lucide-react";

export default function SenderStatusModalAdminComponent({
  action,
  error,
  loading,
  onClose,
  onConfirm,
}) {
  if (!action?.sender || action.status !== "rejected") return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center tablet:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sender-status-modal-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-darkBlue/35"
        disabled={loading}
        onClick={onClose}
      />
      <div className="relative w-full rounded-t-3xl border border-darkBlue/10 bg-white p-5 shadow-[0_25px_80px_rgba(19,30,54,0.25)] tablet:max-w-lg tablet:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="sender-status-modal-title"
              className="font-semibold text-darkBlue"
            >
              Rejeter le Sender ID
            </h2>
            <p className="mt-2 text-sm text-darkBlue/70">
              Confirmer le rejet du Sender ID « {action.sender.value} » pour{" "}
              {action.sender.restaurantName}
              &nbsp;?
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            disabled={loading}
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5 disabled:opacity-50"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-darkBlue/15 bg-white px-4 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-red/90 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
            Rejeter
          </button>
        </div>
      </div>
    </div>
  );
}
