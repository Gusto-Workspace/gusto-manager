import { useMemo, useState, useEffect } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { CustomerSvg } from "@/components/_shared/_svgs/customer.svg";

// ICONS
import {
  Search,
  Tag,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  UserCheck,
  Crown,
  RotateCcw,
  UserX,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";

const MODAL_CLOSE_MS = 220;

export default function ConfirmModalCustomersComponent({
  isOpen,
  onClose,
  customer,
  isProcessing,
  error,
  onConfirm,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setVisible(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const name =
    `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim() ||
    "ce client";

  const closeIfAllowed = () => {
    if (isProcessing) return;
    setVisible(false);
    setTimeout(() => onClose?.(), MODAL_CLOSE_MS);
  };

  return (
    <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        onClick={closeIfAllowed}
        className={`
          absolute inset-0 bg-darkBlue/35 
          transition-opacity duration-200
          ${visible ? "opacity-100" : "opacity-0"}
        `}
      />

      {/* Modal */}
      <div
        className={`
          absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-[92vw] max-w-[520px]
          rounded-3xl border border-darkBlue/10 bg-lightGrey
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          transform transition-all duration-200
          ${visible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`
                mt-0.5 size-11 min-w-11 rounded-2xl border border-darkBlue/10
                flex items-center justify-center bg-red/10
              `}
            >
              <Trash2 className="size-5 text-red" />
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold text-darkBlue leading-tight">
                Supprimer la fiche client
              </h2>
              <p className="mt-1 text-sm text-darkBlue/70">
                La fiche de <span className="font-semibold">{name}</span> sera
                supprimée définitivement. Cette action est irréversible.
              </p>
            </div>
          </div>

          <button
            onClick={closeIfAllowed}
            disabled={isProcessing}
            className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-50"
            aria-label="Fermer"
            type="button"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>

        {/* Error */}
        {error ? (
          <div className="px-5 mt-4">
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
              {error}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-5 pb-5 pt-5">
          <div className="flex-row-reverse flex gap-3">
            <button
              className="w-full inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue disabled:opacity-60"
              onClick={closeIfAllowed}
              disabled={isProcessing}
              type="button"
            >
              Retour
            </button>

            <button
              className={`
                w-full inline-flex items-center justify-center rounded-2xl
                px-4 py-3 text-sm font-semibold text-white shadow-sm
                active:scale-[0.99] transition
                bg-red hover:bg-red/90
                ${isProcessing ? "opacity-60 cursor-not-allowed" : ""}
              `}
              disabled={isProcessing}
              onClick={onConfirm}
              type="button"
            >
              {isProcessing ? "Chargement..." : "Supprimer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
