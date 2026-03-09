// ICONS
import { X } from "lucide-react";

export default function ConfirmModalParametersComponent({
  open,
  title = "Confirmer",
  message = "Êtes-vous sûr ?",
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  onConfirm,
  onClose,
  onCancel,
  danger = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[520px] rounded-3xl border border-darkBlue/10 bg-white/90 shadow-xl backdrop-blur-md">
          <div className="p-5 midTablet:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-darkBlue">{title}</p>
                <p className="mt-2 text-sm text-darkBlue/70 whitespace-pre-line">
                  {message}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center justify-center rounded-2xl px-5 h-11 text-sm font-semibold text-darkBlue bg-white/70 border border-darkBlue/10 hover:bg-darkBlue/5 transition"
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                onClick={onConfirm}
                className={[
                  "inline-flex items-center justify-center rounded-2xl px-5 h-11 text-sm font-semibold text-white transition active:scale-[0.98]",
                  danger
                    ? "bg-red hover:bg-red/90"
                    : "bg-blue hover:bg-blue/90",
                ].join(" ")}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
