import { Info, X } from "lucide-react";

export default function SettingsInfoModal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center tablet:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-info-modal-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-darkBlue/35"
        onClick={onClose}
      />
      <div className="relative w-full rounded-t-3xl border border-darkBlue/10 bg-white p-5 shadow-[0_25px_80px_rgba(19,30,54,0.25)] tablet:max-w-lg tablet:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-darkBlue/5">
              <Info className="size-5 text-darkBlue" />
            </span>
            <div>
              <h2
                id="settings-info-modal-title"
                className="font-semibold text-darkBlue"
              >
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-darkBlue/70">
                {children}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>
      </div>
    </div>
  );
}
