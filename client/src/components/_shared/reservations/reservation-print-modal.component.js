import { Printer, X } from "lucide-react";

const PRINT_OPTIONS = [
  { value: "day", label: "Journée complète" },
  { value: "lunch", label: "Service du midi" },
  { value: "dinner", label: "Service du soir" },
];

export default function ReservationPrintModal({ onClose, onSelect }) {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="reservation-print-modal-title">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-[1] w-full max-w-[420px] rounded-2xl border border-darkBlue/10 bg-white/95 p-5 shadow-[0_22px_55px_rgba(19,30,54,0.20)] tablet:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-darkBlue">
              <Printer className="size-4" />
              <h2 id="reservation-print-modal-title" className="text-lg font-semibold">
                Imprimer les réservations
              </h2>
            </div>
            <p className="mt-1 text-sm text-darkBlue/60">
              Choisissez la liste à imprimer.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue/60 transition hover:bg-darkBlue/5"
            aria-label="Fermer"
            title="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {PRINT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className="inline-flex items-center justify-between rounded-xl border border-darkBlue/10 bg-white px-4 py-3 text-left text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
            >
              {option.label}
              <Printer className="size-4 text-darkBlue/45" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
