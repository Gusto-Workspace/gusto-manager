import { useEffect, useMemo, useRef, useState } from "react";
import { X, Phone, Mail, Users, Clock, Calendar } from "lucide-react";
import { TableSvg } from "@/components/_shared/_svgs/table.svg";
import { CommentarySvg } from "@/components/_shared/_svgs/commentary.svg";

const CLOSE_MS = 160;

// Swipe config
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

export default function BottomSheetReservationsComponent({
  open,
  onClose,
  reservation,
  t,
  onAction, // (reservation, actionType) => void
}) {
  const [isVisible, setIsVisible] = useState(false);

  // ✅ iOS-safe scroll lock (position:fixed)
  const scrollYRef = useRef(0);
  const prevStylesRef = useRef({
    bodyPosition: "",
    bodyTop: "",
    bodyLeft: "",
    bodyRight: "",
    bodyWidth: "",
    htmlOverflow: "",
  });

  // ✅ panel height (for clamp)
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);

  // ✅ swipe state
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

    const body = document.body;
    const html = document.documentElement;

    scrollYRef.current = window.scrollY || 0;

    prevStylesRef.current = {
      bodyPosition: body.style.position || "",
      bodyTop: body.style.top || "",
      bodyLeft: body.style.left || "",
      bodyRight: body.style.right || "",
      bodyWidth: body.style.width || "",
      htmlOverflow: html.style.overflow || "",
    };

    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  };

  const restoreScroll = () => {
    if (typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;

    const {
      bodyPosition,
      bodyTop,
      bodyLeft,
      bodyRight,
      bodyWidth,
      htmlOverflow,
    } = prevStylesRef.current;

    body.style.position = bodyPosition || "";
    body.style.top = bodyTop || "";
    body.style.left = bodyLeft || "";
    body.style.right = bodyRight || "";
    body.style.width = bodyWidth || "";
    html.style.overflow = htmlOverflow || "";

    window.scrollTo(0, scrollYRef.current || 0);
  };

  function closeWithAnimation() {
    setIsVisible(false);
    setDragY(0);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  // measure panel height (for clamp)
  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

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

  // ✅ clamp equals panel height (minus tiny margin)
  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  // ✅ swipe handlers
  const onPointerDown = (e) => {
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
    if (!dragStateRef.current.active) return;

    const y = e.clientY;
    const dy = y - dragStateRef.current.startY;

    dragStateRef.current.lastY = y;
    dragStateRef.current.lastT = performance.now();

    const clamped = Math.max(0, Math.min(DRAG_MAX_PX, dy));
    setDragY(clamped);
  };

  const onPointerUp = () => {
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

  // ✅ no hook needed here (fix hook-order bug)
  const overlayOpacity = !isVisible
    ? 0
    : 0.55 + 0.45 * (1 - dragY / DRAG_MAX_PX);

  // ✅ only now we can early-return safely (after hooks)
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] tablet:hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className={`
          absolute inset-0
          bg-black/35
          backdrop-blur-[2px]
          transition-opacity duration-150
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          absolute left-0 right-0 bottom-0 z-[1]
          w-full
          rounded-t-[28px]
          border border-white/30
          bg-lightGrey
          shadow-[0_-30px_90px_rgba(0,0,0,0.28)]
          overflow-hidden
          min-h-[40vh] max-h-[88vh]
          flex flex-col
        `}
        style={{
          transform: isVisible ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: dragStateRef.current.active
            ? "none"
            : "transform 200ms ease-out",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag zone */}
        <div
          className="cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Handle */}
          <div className="pt-3 pb-2 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-darkBlue/50">
                  {t?.("buttons.details", "Détails")} —{" "}
                  {t?.("titles.main", "Réservations")}
                </p>

                <h3 className="mt-1 text-lg font-semibold text-darkBlue leading-tight truncate">
                  {reservation?.customerName || "-"}
                </h3>

                <div className="mt-2 flex flex-wrap items-center gap-2">
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
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/70 hover:bg-white/85 active:scale-[0.98] transition p-2 shadow-sm"
                aria-label={t?.("buttons.close", "Fermer")}
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar overscroll-contain">
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

          {/* Actions */}
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

        {/* Footer (safe-area like GiftCards) */}
        <div className="sticky bottom-0 border-t border-white/40 bg-white/70 backdrop-blur-xl px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
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
