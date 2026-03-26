import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Trash2, X } from "lucide-react";

const CLOSE_MS = 180;

const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

export default function CreateDrawerGiftCardsComponent({
  open,
  onClose,
  title,
  onSubmit,
  register,
  errors,
  currencySymbol,
  isDeleting,
  editingGift,
  t,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(0);

  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const primaryLabel = isDeleting
    ? t?.("buttons.confirm") || "Confirmer"
    : t?.("buttons.save") || "Enregistrer";
  const secondaryLabel = t?.("buttons.cancel") || "Annuler";

  const descriptionLabel = t?.("form.labels.description") || "Description";
  const optionalLabel = t?.("form.labels.optional") || "optionnel";
  const valueLabel = t?.("form.labels.value") || "Valeur";
  const requiredLabel = t?.("form.errors.required") || "Champ requis";
  const subtitle = isDeleting
    ? "Cette action est définitive."
    : "Renseignez la description et la valeur de la carte cadeau.";

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
    setIsVisible(false);
    setDragY(0);

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeWithAnimation();
    };

    window.addEventListener("resize", onResize);
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
    if (!open) {
      setIsVisible(false);
      setDragY(0);
    }
  }, [open]);

  const panelFallback = 720;
  const dragMaxPx = Math.max(240, (panelH || panelFallback) - 12);
  const swipeClosePx = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (event) => {
    if (isTabletUp) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const deltaY = event.clientY - dragStateRef.current.startY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.lastT = performance.now();

    const clamped = Math.max(0, Math.min(dragMaxPx, deltaY));
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
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / dt;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  const overlayOpacity = useMemo(() => {
    if (!isVisible) return 0;
    return isTabletUp ? 1 : 0.55 + 0.45 * (1 - dragY / dragMaxPx);
  }, [dragMaxPx, dragY, isTabletUp, isVisible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[180]" role="dialog" aria-modal="true">
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      <div
        ref={panelRef}
        className={`
          absolute z-[1]
          border border-white/30 bg-lightGrey
          shadow-[0_-30px_90px_rgba(0,0,0,0.28)]
          overflow-hidden
          flex flex-col

          left-0 right-0 bottom-0 w-full min-h-[42vh] max-h-[88vh]
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
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="cursor-grab active:cursor-grabbing touch-none tablet:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="bg-white/70 py-3 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        <div className="sticky top-0 z-10 px-4 pb-3 midTablet:py-3 border-b border-darkBlue/10 bg-white/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t?.("labels.details", "Détails")} —{" "}
                {t?.("titles.main", "Cartes cadeaux")}
              </p>

              <h3 className="text-base font-semibold text-darkBlue">{title}</h3>

              <p className="mt-1 text-sm text-darkBlue/60">{subtitle}</p>
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

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4 hide-scrollbar overscroll-contain">
            <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/60">
                {descriptionLabel}{" "}
                <span className="normal-case tracking-normal text-darkBlue/35">
                  · {optionalLabel}
                </span>
              </label>

              <textarea
                className={`
                  mt-2 w-full min-h-[92px]
                  rounded-xl border border-darkBlue/10 bg-white/80
                  px-3 py-2 text-base text-darkBlue
                  outline-none transition resize-none
                  placeholder:text-darkBlue/35
                  focus:border-blue/40 focus:ring-1 focus:ring-blue/20
                  ${isDeleting ? "opacity-60 cursor-not-allowed" : ""}
                `}
                {...register("description")}
                disabled={isDeleting}
                placeholder="Commencer à écrire..."
              />
            </div>

            <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/60">
                {valueLabel}
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
                  onWheel={(event) => event.currentTarget.blur()}
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
                <p className="mt-2 text-[12px] text-red">{requiredLabel}</p>
              ) : null}

              {!isDeleting ? (
                <p className="mt-2 text-[12px] text-darkBlue/45">
                  Astuce : pour une carte “menu / expérience”, ajoutez une
                  description.
                </p>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-darkBlue/10 bg-white/70 backdrop-blur-xl px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)] tablet:pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeWithAnimation}
                className="w-full inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white/80 hover:bg-white transition px-4 py-3 text-sm font-semibold text-darkBlue"
              >
                {secondaryLabel}
              </button>

              <button
                type="submit"
                className={`
                  w-full inline-flex items-center justify-center gap-2
                  rounded-xl px-4 py-3 text-sm font-semibold text-white
                  shadow-sm transition
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
        </form>
      </div>
    </div>
  );
}
