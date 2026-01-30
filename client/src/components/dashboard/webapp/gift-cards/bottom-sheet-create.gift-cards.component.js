import { useEffect, useMemo, useRef, useState } from "react";
import { X, Trash2, Save } from "lucide-react";

const CLOSE_MS = 160;

// Swipe config
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

export default function BottomSheeCreatetGiftCardsComponent({
  open,
  onClose,

  // UI text
  title,

  // form
  onSubmit, // handleSubmit(onSubmit)
  register,
  errors,
  currencySymbol,

  // state
  isDeleting,
  editingGift,

  // translations optional
  t,
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
  const [panelH, setPanelH] = useState(null); // fallback

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

    const onResize = () => {
      requestAnimationFrame(measurePanel);
    };

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

  if (!open) return null;

  const primaryLabel = isDeleting
    ? t?.("buttons.confirm") || "Confirmer"
    : t?.("buttons.save") || "Enregistrer";

  const secondaryLabel = t?.("buttons.cancel") || "Annuler";

  // ✅ clamp equals panel height (minus tiny margin)
  const DRAG_MAX_PX = Math.max(240, panelH - 12);
  const SWIPE_CLOSE_PX = Math.max(90, Math.floor(panelH * CLOSE_RATIO));

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

  const overlayOpacity = useMemo(() => {
    if (!isVisible) return 0;
    return 0.55 + 0.45 * (1 - dragY / DRAG_MAX_PX);
  }, [isVisible, dragY, DRAG_MAX_PX]);

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
          min-h-[42vh] max-h-[88vh]
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
                <h3 className="mt-1 text-lg font-semibold text-darkBlue leading-tight">
                  {title}
                </h3>

                <p className="mt-1 text-sm text-darkBlue/60">
                  {isDeleting
                    ? "Cette action est définitive."
                    : "Renseignez la description (optionnel) et la valeur."}
                </p>
              </div>

              <button
                onClick={closeWithAnimation}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/70 hover:bg-white/85 active:scale-[0.98] transition p-2 shadow-sm"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          className="px-4 pb-4 overflow-y-auto hide-scrollbar overscroll-contain"
          onTouchMove={(e) => e.stopPropagation()}
        >
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {/* Card: Description */}
            <div className="rounded-2xl border border-white/40 bg-white/70 shadow-sm p-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/60">
                Description{" "}
                <span className="normal-case tracking-normal text-darkBlue/35">
                  · optionnel
                </span>
              </label>

              <textarea
                className={`
                  mt-2 w-full min-h-[92px]
                  rounded-xl border border-darkBlue/10 bg-white/80
                  px-3 py-2 text-base text-darkBlue
                  outline-none transition
                  placeholder:text-darkBlue/35
                  focus:border-blue/40 focus:ring-1 focus:ring-blue/20
                  ${isDeleting ? "opacity-60 cursor-not-allowed" : ""}
                `}
                {...register("description")}
                disabled={isDeleting}
                placeholder={"Commencer à écrire..."}
              />
            </div>

            {/* Card: Value */}
            <div className="rounded-2xl border border-white/40 bg-white/70 shadow-sm p-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/60">
                Valeur
              </label>

              <div
                className={`
                  mt-2 flex items-stretch overflow-hidden
                  rounded-xl border bg-white/85
                  ${errors?.value ? "border-red/40" : "border-darkBlue/10"}
                `}
              >
                <span
                  className={`px-3 inline-flex items-center text-darkBlue/70 select-none ${
                    isDeleting ? "opacity-60" : ""
                  }`}
                >
                  {currencySymbol}
                </span>

                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="-"
                  defaultValue={editingGift?.value || ""}
                  disabled={isDeleting}
                  {...register("value", { required: !isDeleting })}
                  className={`
                    h-11 w-full border-l border-darkBlue/10
                    px-3 text-base text-darkBlue
                    outline-none
                    [appearance:textfield]
                    [&::-webkit-outer-spin-button]:appearance-none
                    [&::-webkit-inner-spin-button]:appearance-none
                    placeholder:text-darkBlue/35
                    focus:bg-white
                    ${isDeleting ? "opacity-60 cursor-not-allowed" : ""}
                  `}
                />
              </div>

              {errors?.value && !isDeleting ? (
                <p className="mt-2 text-[12px] text-red">Champ requis</p>
              ) : null}

              <p className="mt-2 text-[12px] text-darkBlue/45">
                Astuce : pour une carte “menu / expérience”, ajoutez une
                description.
              </p>
            </div>

            <div className="h-2" />
          </form>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-white/40 bg-white/70 backdrop-blur-xl px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeWithAnimation}
              className={`
                w-full inline-flex items-center justify-center
                rounded-xl border border-darkBlue/10
                bg-white/80 hover:bg-white active:scale-[0.98]
                transition px-4 py-3 text-sm font-semibold text-darkBlue
              `}
            >
              {secondaryLabel}
            </button>

            <button
              type="button"
              onClick={onSubmit}
              className={`
                w-full inline-flex items-center justify-center gap-2
                rounded-xl px-4 py-3 text-sm font-semibold text-white
                shadow-sm active:scale-[0.98] transition
                ${isDeleting ? "bg-red hover:bg-red/90" : "bg-blue hover:bg-blue/90"}
              `}
            >
              {isDeleting ? (
                <Trash2 className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
