import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Mail,
  User,
  Calendar,
  CreditCard,
  Hash,
  Trash2,
} from "lucide-react";

const CLOSE_MS = 160;

// Swipe config
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

function objectIdToDate(oid) {
  return new Date(parseInt(String(oid).substring(0, 8), 16) * 1000);
}

function getCreatedDate(purchase) {
  if (!purchase) return null;
  if (purchase.created_at) return new Date(purchase.created_at);
  if (purchase.createdAt) return new Date(purchase.createdAt);
  if (purchase._id) return objectIdToDate(purchase._id);
  return null;
}

export default function BottomSheetPurchasesComponent({
  open,
  onClose,
  purchase,
  t,
  onAction, // (purchase, actionType) => void
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(false);

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

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

  const lockScroll = () => {
    if (typeof document === "undefined") return;
    prevBodyOverflowRef.current = document.body.style.overflow || "";
    prevHtmlOverflowRef.current = document.documentElement.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  };

  const restoreScroll = () => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = prevBodyOverflowRef.current || "";
    document.documentElement.style.overflow = prevHtmlOverflowRef.current || "";
  };

  function closeWithAnimation() {
    setIsVisible(false);
    setDragY(0);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

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

  useEffect(() => {
    if (!open) return;

    lockScroll();
    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setIsVisible(false);
      setDragY(0);
    }
  }, [open]);

  const status = purchase?.status || null;

  // ✅ statut au singulier (FR)
  const statusLabelSingular = useMemo(() => {
    if (status === "Valid") return "Valide";
    if (status === "Used") return "Utilisée";
    if (status === "Expired") return "Expirée";
    if (status === "Archived") return "Archivée";
    return status || "-";
  }, [status]);

  const statusUi = useMemo(() => {
    if (status === "Valid")
      return {
        cls: "bg-green/10 text-green border-green/25",
        label: statusLabelSingular,
      };
    if (status === "Used")
      return {
        cls: "bg-blue/10 text-blue border-blue/25",
        label: statusLabelSingular,
      };
    if (status === "Expired")
      return {
        cls: "bg-red/10 text-red border-red/25",
        label: statusLabelSingular,
      };
    if (status === "Archived")
      return {
        cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
        label: statusLabelSingular,
      };
    return {
      cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
      label: statusLabelSingular,
    };
  }, [status, statusLabelSingular]);

  const createdDate = useMemo(() => getCreatedDate(purchase), [purchase]);

  const beneficiaryName = useMemo(() => {
    const v = `${purchase?.beneficiaryFirstName || ""} ${
      purchase?.beneficiaryLastName || ""
    }`.trim();
    return v || "-";
  }, [purchase]);

  const primaryAction = useMemo(() => {
    if (!purchase) return null;
    if (status === "Valid" || status === "Expired")
      return { type: "Used", label: "Carte utilisée" };
    if (status === "Used")
      return { type: "Valid", label: t("buttons.revalidateCard") };
    return null;
  }, [purchase, status, t]);

  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (e) => {
    if (isTabletUp) return;
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
    const v = (dragStateRef.current.lastY - dragStateRef.current.startY) / dt;

    if (dragY >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }
    setDragY(0);
  };

  const overlayOpacity = !isVisible
    ? 0
    : 0.55 + 0.45 * (1 - dragY / DRAG_MAX_PX);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[170]" role="dialog" aria-modal="true">
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
          border border-white/30 bg-lightGrey
          shadow-[0_-30px_90px_rgba(0,0,0,0.28)]
          overflow-hidden
          flex flex-col

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[88vh]
          rounded-t-[28px]

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[520px] tablet:max-h-[100vh]
          tablet:rounded-none
        `}
        style={
          isTabletUp
            ? {
                transform: isVisible ? "translateX(0)" : "translateX(100%)",
                transition: "transform 220ms ease-out",
                willChange: "transform",
              }
            : {
                transform: isVisible
                  ? `translateY(${dragY}px)`
                  : "translateY(100%)",
                transition: dragStateRef.current.active
                  ? "none"
                  : "transform 200ms ease-out",
                willChange: "transform",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag zone */}
        <div
          className="cursor-grab active:cursor-grabbing touch-none tablet:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="py-3 flex justify-center bg-white/70">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pb-3 midTablet:py-3 border-b border-darkBlue/10 bg-white/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t("labels.details", "Détails")} — Carte cadeau achetée
              </p>

              <h3 className="text-base font-semibold text-darkBlue truncate">
                {beneficiaryName}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusUi.cls}`}
                >
                  {statusUi.label}
                </span>

                {purchase?.value != null ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                    <CreditCard className="size-3.5 text-darkBlue/50" />
                    {purchase.value}€
                  </span>
                ) : null}

                {purchase?.purchaseCode ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                    <Hash className="size-3.5 text-darkBlue/50" />
                    <span className="font-mono font-normal text-[11px]">
                      {purchase.purchaseCode}
                    </span>
                  </span>
                ) : null}

                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                  <Calendar className="size-3.5 text-darkBlue/50" />
                  {createdDate ? createdDate.toLocaleDateString("fr-FR") : "-"}
                </span>
              </div>
            </div>

            <button
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label={t("buttons.close", "Fermer")}
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar overscroll-contain">
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4 flex flex-col gap-3">
            <p className="text-xs text-darkBlue/50">
              {t("labels.infos", "Infos")}
            </p>

            <div className="flex items-start gap-2 text-sm text-darkBlue/80">
              <Hash className="size-4 mt-0.5 font-normal text-darkBlue/40" />
              <p className="min-w-0">
                {t("labels.code")} :{" "}
                <span className="font-mono text-[13px]">
                  {purchase?.purchaseCode || "-"}
                </span>
              </p>
            </div>

            <div className="flex items-start gap-2 text-sm text-darkBlue/80">
              <User className="size-4 mt-0.5 text-darkBlue/40" />
              <p className="min-w-0">
                {t("labels.sender")} : {purchase?.sender || "-"}
              </p>
            </div>

            <div className="flex items-start gap-2 text-sm text-darkBlue/80">
              <Mail className="size-4 mt-0.5 text-darkBlue/40" />
              <p className="min-w-0 truncate">{purchase?.sendEmail || "-"}</p>
            </div>

            <div className="flex items-start gap-2 text-sm text-darkBlue/80">
              <Calendar className="size-4 mt-0.5 text-darkBlue/40" />
              <p className="min-w-0">
                {t("labels.orderedDay")} :{" "}
                {createdDate ? createdDate.toLocaleDateString("fr-FR") : "-"}
              </p>
            </div>

            {purchase?.description?.trim?.() ? (
              <div className="pt-2">
                <p className="text-xs text-darkBlue/50 mb-1">
                  {t("labels.description")}
                </p>
                <p className="text-sm text-darkBlue/80">
                  {purchase.description}
                </p>
              </div>
            ) : null}

            {status === "Valid" && purchase?.validUntil ? (
              <p className="text-xs text-darkBlue/60 pt-2">
                {t("labels.valididy")} :{" "}
                {new Date(purchase.validUntil).toLocaleDateString("fr-FR")}
              </p>
            ) : null}

            {status === "Used" && purchase?.useDate ? (
              <p className="text-xs text-darkBlue/60 pt-2">
                {t("labels.useDate")} :{" "}
                {new Date(purchase.useDate).toLocaleDateString("fr-FR")}
              </p>
            ) : null}
          </div>

          {/* Actions */}
          <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">
              {t("labels.actions", "Actions")}
            </p>

            <div className="flex gap-2">
              {primaryAction ? (
                <button
                  onClick={() => onAction?.(purchase, primaryAction.type)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                >
                  {primaryAction.label}
                </button>
              ) : null}

              <button
                onClick={() => onAction?.(purchase, "Delete")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
              >
                <Trash2 className="size-4" />
                {t("buttons.delete", "Supprimer")}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="midTablet:hidden sticky bottom-0 border-t border-white/40 bg-white/70 backdrop-blur-xl px-4 py-3 tablet:pb-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <button
            onClick={closeWithAnimation}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            {t("buttons.back", "Retour")}
          </button>
        </div>
      </div>
    </div>
  );
}
