import { useEffect, useMemo, useRef, useState } from "react";
import { X, Phone, Mail, Users, Clock, Calendar } from "lucide-react";
import { TableSvg } from "@/components/_shared/_svgs/table.svg";
import { CommentarySvg } from "@/components/_shared/_svgs/commentary.svg";

const CLOSE_MS = 280;

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("fr-FR");
}

function fmtTime(t) {
  const v = String(t || "");
  if (!v) return "--:--";
  return v.slice(0, 5).replace(":", "h");
}

export default function DetailsDrawerReservationsComponent({
  open,
  onClose,
  reservation,
  t,
  onAction, // (reservation, actionType) => void
}) {
  const [isVisible, setIsVisible] = useState(false);

  // Scroll lock robuste
  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const restoreScroll = () => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = prevBodyOverflowRef.current || "";
    document.documentElement.style.overflow = prevHtmlOverflowRef.current || "";
  };

  const lockScroll = () => {
    if (typeof document === "undefined") return;
    prevBodyOverflowRef.current = document.body.style.overflow || "";
    prevHtmlOverflowRef.current = document.documentElement.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  };

  useEffect(() => {
    if (!open) return;

    lockScroll();
    const raf = requestAnimationFrame(() => setIsVisible(true));

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setIsVisible(false);
  }, [open]);

  function closeWithAnimation() {
    setIsVisible(false);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const status = reservation?.status || null;

  const statusUi = useMemo(() => {
    if (status === "Pending")
      return {
        cls: "bg-blue/10 text-blue border-blue/30",
        label: "En attente",
      };
    if (status === "Confirmed")
      return { cls: "bg-blue/15 text-blue border-blue/40", label: "Confirmée" };
    if (status === "Active")
      return {
        cls: "bg-green/10 text-green border-green/30",
        label: "En cours",
      };
    if (status === "Late")
      return {
        cls: "bg-[#FF914D22] text-[#B95E1C] border-[#FF914D66]",
        label: "En retard",
      };
    if (status === "Finished")
      return {
        cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
        label: "Terminée",
      };
    return {
      cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
      label: status || "-",
    };
  }, [status]);

  const primaryAction = useMemo(() => {
    if (status === "Pending")
      return { type: "confirm", label: t?.("buttons.confirm") || "Confirmer" };
    if (status === "Confirmed" || status === "Late")
      return { type: "active", label: t?.("buttons.active") || "Activer" };
    if (status === "Active")
      return { type: "finish", label: t?.("buttons.finish") || "Terminer" };
    return null;
  }, [status, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        className={`
          absolute z-[1]
          bg-lightGrey border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col
          overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[520px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out

          ${
            isVisible
              ? `
                translate-y-0
                tablet:translate-y-0 tablet:translate-x-0
              `
              : `
                translate-y-full
                tablet:translate-y-0 tablet:translate-x-full
              `
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-darkBlue/10 bg-white/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t?.("buttons.details", "Détails")} —{" "}
                {t?.("titles.main", "Réservations")}
              </p>

              <h3 className="text-base font-semibold text-darkBlue truncate">
                {reservation?.customerName || "-"}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusUi.cls}`}
                >
                  {statusUi.label}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                  <Clock className="size-3.5 text-darkBlue/50" />
                  {fmtTime(reservation?.reservationTime)}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                  <Calendar className="size-3.5 text-darkBlue/50" />
                  {fmtDate(reservation?.reservationDate)}
                </span>
              </div>
            </div>

            <button
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label={t?.("buttons.close", "Fermer")}
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          {/* Résumé */}
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-darkBlue/50">
                  {t?.("labels.customer", "Client")}
                </p>
                <p className="text-sm font-semibold text-darkBlue truncate">
                  {reservation?.customerName || "-"}
                </p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-2 text-xs font-semibold text-darkBlue">
                <Users className="size-4 text-darkBlue/50" />
                {reservation?.numberOfGuests || 0}
              </span>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <Phone className="size-4 mt-0.5 text-darkBlue/40" />
                <p className="min-w-0 truncate">
                  {reservation?.customerPhone || "-"}
                </p>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                <p className="min-w-0 truncate">
                  {reservation?.customerEmail || "-"}
                </p>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <TableSvg className="size-4 mt-0.5 text-darkBlue/40 opacity-40" />
                <p className="min-w-0 truncate">
                  {reservation?.table?.name || "-"}
                </p>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <CommentarySvg className="size-4 mt-0.5 text-darkBlue/40 opacity-40" />
                <p className="min-w-0">
                  {reservation?.commentary?.trim?.()
                    ? reservation.commentary
                    : "-"}
                </p>
              </div>
            </div>
          </div>

          {/* Actions secondaires (desktop aussi) */}
          <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">Actions</p>

            <div className="flex gap-2">
              {primaryAction ? (
                <button
                  onClick={() => onAction?.(reservation, primaryAction.type)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                >
                  {primaryAction.label}
                </button>
              ) : null}

              <button
                onClick={() => onAction?.(reservation, "edit")}
                className="w-full inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue"
              >
                Modifier
              </button>

              <button
                onClick={() => onAction?.(reservation, "delete")}
                className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>

        {/* Footer mobile */}
        <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 pt-3 pb-6">
          <button
            onClick={closeWithAnimation}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
