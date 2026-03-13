import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Phone,
  Mail,
  Users,
  Clock,
  Calendar,
  User,
  ChevronDown,
} from "lucide-react";
import { TableSvg, CommentarySvg } from "@/components/_shared/_svgs/_index";

const CLOSE_MS = 280;

// Swipe config (mobile only)
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

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

function fmtDateTime(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCurrency(amount, currency = "eur") {
  const n = Number(amount || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "eur").toUpperCase(),
  }).format(n);
}

export default function ReservationsDrawerComponent({
  open,
  onClose,
  reservation,
  t,
  onAction,
  errorMessage,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [bankHoldOpen, setBankHoldOpen] = useState(false);

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

  // ✅ detect tablet+ (to avoid breaking slide-right)
  const [isTabletUp, setIsTabletUp] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsTabletUp(mq.matches);

    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  // ✅ Swipe state (mobile only)
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);

  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  // Open animation (like notifications)
  useEffect(() => {
    if (!open) return;

    lockScroll();
    setIsVisible(false);
    setDragY(0);
    setBankHoldOpen(false);

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
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
    setDragY(0);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const status = reservation?.status || null;

  const bankHold = reservation?.bankHold || {};
  const bankHoldEnabled = Boolean(bankHold?.enabled);
  const bankHoldStatus = String(bankHold?.status || "none");

  const bankHoldStatusUi = useMemo(() => {
    if (bankHoldStatus === "authorized") {
      return {
        cls: "bg-green/10 text-green border-green/30",
        label: "Autorisée",
      };
    }

    if (bankHoldStatus === "captured") {
      return {
        cls: "bg-blue/10 text-blue border-blue/30",
        label: "Capturée",
      };
    }

    if (bankHoldStatus === "released") {
      return {
        cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
        label: "Libérée",
      };
    }

    if (bankHoldStatus === "authorization_scheduled") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Autorisation planifiée",
      };
    }

    if (bankHoldStatus === "card_saved") {
      return {
        cls: "bg-blue/10 text-blue border-blue/30",
        label: "Carte enregistrée",
      };
    }

    if (bankHoldStatus === "authorization_pending") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Autorisation en attente",
      };
    }

    if (bankHoldStatus === "setup_pending") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Carte en attente",
      };
    }

    if (bankHoldStatus === "failed") {
      return {
        cls: "bg-red/10 text-red border-red/20",
        label: "Échec",
      };
    }

    if (bankHoldStatus === "expired") {
      return {
        cls: "bg-red/10 text-red border-red/20",
        label: "Expirée",
      };
    }

    return {
      cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
      label: "Aucune",
    };
  }, [bankHoldStatus]);

  const canCaptureBankHold = bankHoldEnabled && bankHoldStatus === "authorized";
  const canReleaseBankHold = bankHoldEnabled && bankHoldStatus === "authorized";

  const statusUi = useMemo(() => {
    if (status === "AwaitingBankHold")
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Empreinte en attente",
      };
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
    if (status === "Canceled")
      return { cls: "bg-red/10 text-red border-red/20", label: "Annulée" };
    if (status === "Rejected")
      return { cls: "bg-red/10 text-red border-red/20", label: "Refusée" };
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

  // ✅ swipe thresholds (mobile)
  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  // ✅ swipe handlers (mobile drag zone only)
  const onPointerDown = (e) => {
    if (isTabletUp) return; // ✅ never swipe on tablet+
    if (e.pointerType === "mouse" && e.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.lastY = e.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const y = e.clientY;
    const dy = y - dragStateRef.current.startY;

    dragStateRef.current.lastY = y;
    dragStateRef.current.lastT = performance.now();

    const clamped = Math.max(0, Math.min(DRAG_MAX_PX, dy));
    setDragY(clamped);
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const dt = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const v = (dragStateRef.current.lastY - dragStateRef.current.startY) / dt; // px/ms

    if (dragY >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  // overlay opacity while dragging (mobile)
  const overlayOpacity = !isVisible
    ? 0
    : 1 * (1 - Math.min(1, dragY / DRAG_MAX_PX));

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          absolute z-[1]
          bg-white border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[520px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out will-change-transform
          ${
            isVisible
              ? "translate-y-0 tablet:translate-y-0 tablet:translate-x-0"
              : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"
          }
        `}
        style={
          isTabletUp
            ? undefined
            : {
                transform: isVisible
                  ? `translateY(${dragY}px)`
                  : "translateY(100%)",
                transition: dragStateRef.current.active
                  ? "none"
                  : "transform 240ms ease-out",
                willChange: "transform",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* ✅ Mobile drag zone */}
        <div
          className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="py-3 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pb-3 midTablet:py-3 border-b border-darkBlue/10 bg-white/70">
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

        {errorMessage ? (
          <div className="px-4 pt-4">
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
              {errorMessage}
            </div>
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 bg-lightGrey overflow-y-auto p-4 hide-scrollbar overscroll-contain">
          {/* Résumé */}
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <User className="size-4 mt-0.5 text-darkBlue/40" />
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

                <button
                  type="button"
                  className="min-w-0 truncate hover:underline text-left"
                  title="Clique pour appeler"
                  onClick={() => {
                    if (!reservation?.customerPhone) return;
                    window.location.href = `tel:${String(
                      reservation?.customerPhone,
                    ).replace(/\s/g, "")}`;
                  }}
                >
                  {reservation?.customerPhone || "-"}
                </button>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <Mail className="size-4 mt-0.5 text-darkBlue/40" />

                <button
                  type="button"
                  className="min-w-0 truncate hover:underline text-left"
                  title="Clique pour envoyer un email"
                  onClick={() => {
                    if (!reservation?.customerEmail) return;
                    window.location.href = `mailto:${reservation?.customerEmail}`;
                  }}
                >
                  {reservation?.customerEmail || "-"}
                </button>
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

          {/* Empreinte bancaire */}
          {bankHoldEnabled ? (
            <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setBankHoldOpen((prev) => !prev)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <p className="text-xs text-darkBlue/50">Empreinte bancaire</p>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${bankHoldStatusUi.cls}`}
                  >
                    {bankHoldStatusUi.label}
                  </span>
                </div>

                <ChevronDown
                  className={`size-4 text-darkBlue/50 transition-transform ${
                    bankHoldOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {bankHoldOpen ? (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-1 gap-2 text-sm text-darkBlue/80">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Montant</span>
                      <span className="font-medium text-darkBlue">
                        {formatCurrency(
                          bankHold?.amountTotal || 0,
                          bankHold?.currency || "eur",
                        )}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Autorisée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.authorizedAt)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Capturée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.capturedAt)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Libérée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.releasedAt)}
                      </span>
                    </div>

                    {bankHold?.lastError ? (
                      <div className="mt-2 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-xs text-red">
                        {bankHold.lastError}
                      </div>
                    ) : null}
                  </div>

                  {canCaptureBankHold || canReleaseBankHold ? (
                    <div className="mt-4 flex gap-2">
                      {canCaptureBankHold ? (
                        <button
                          onClick={() =>
                            onAction?.(reservation, "capture_bank_hold")
                          }
                          className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                        >
                          Capturer
                        </button>
                      ) : null}

                      {canReleaseBankHold ? (
                        <button
                          onClick={() =>
                            onAction?.(reservation, "release_bank_hold")
                          }
                          className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                        >
                          Libérer
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">
              {t?.("labels.actions", "Actions")}
            </p>

            <div className="flex gap-2">
              {primaryAction ? (
                <button
                  onClick={() => onAction?.(reservation, primaryAction.type)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                >
                  {primaryAction.label}
                </button>
              ) : null}

              {status !== "Canceled" &&
              status !== "Finished" &&
              status !== "Rejected" ? (
                <button
                  onClick={() => onAction?.(reservation, "edit")}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue"
                >
                  {t?.("buttons.edit", "Modifier")}
                </button>
              ) : null}

              {status === "Canceled" || status === "Rejected" ? (
                <>
                  <button
                    onClick={() => onAction?.(reservation, "restore_confirmed")}
                    className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                  >
                    Repasser en "Confirmée"
                  </button>

                  <button
                    onClick={() => onAction?.(reservation, "delete")}
                    className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                  >
                    Supprimer
                  </button>
                </>
              ) : status === "Finished" ? (
                <button
                  onClick={() => onAction?.(reservation, "delete")}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                >
                  Supprimer
                </button>
              ) : (
                <button
                  onClick={() =>
                    onAction?.(
                      reservation,
                      status === "Pending"
                        ? "reject"
                        : status === "Active"
                          ? "delete"
                          : "cancel",
                    )
                  }
                  className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                >
                  {status === "Pending"
                    ? "Refuser"
                    : status === "Active"
                      ? "Supprimer"
                      : "Annuler"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer mobile */}
        <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <button
            onClick={closeWithAnimation}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            {t?.("buttons.back", "Retour")}
          </button>
        </div>
      </div>
    </div>
  );
}
