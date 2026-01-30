import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check } from "lucide-react";

const CLOSE_MS = 160;

// Swipe config (same as BottomSheetReservations)
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25;

export default function BottomSheetChangeRestaurantComponent(props) {
  const open = props.open;
  const onClose = props.onClose;
  const restaurantContext = props.restaurantContext;
  const currentName = props.currentName || "";
  const t = props.t;

  // ✅ NEW (reusable): which option toggles eligibility
  const optionKey = props.optionKey || "reservations"; // "gift_card" for gift cards
  const moduleLabel =
    props.moduleLabel || t?.("titles.main", "Réservations") || "Réservations";

  const [isVisible, setIsVisible] = useState(false);
  const [restaurantQuery, setRestaurantQuery] = useState("");

  // ✅ iOS-safe scroll lock
  const scrollYRef = useRef(0);
  const prevStylesRef = useRef({
    bodyPosition: "",
    bodyTop: "",
    bodyLeft: "",
    bodyRight: "",
    bodyWidth: "",
    htmlOverflow: "",
  });

  // ✅ panel height
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);

  // ✅ swipe
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

  const closeWithAnimation = () => {
    setIsVisible(false);
    setDragY(0);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  };

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  // ✅ open lifecycle (same pattern as model)
  useEffect(() => {
    if (!open) return;

    setRestaurantQuery("");
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
      setPanelH(null);
      setRestaurantQuery("");
    }
  }, [open]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dragY]);

  // ✅ restaurants list (reusable via optionKey)
  const eligibleRestaurants = useMemo(() => {
    const list = restaurantContext?.restaurantsList || [];
    return list.filter((r) => r?.options?.[optionKey] === true);
  }, [restaurantContext?.restaurantsList, optionKey]);

  const currentRestaurantId = restaurantContext?.restaurantData?._id;

  const filteredRestaurants = useMemo(() => {
    const q = restaurantQuery.trim().toLowerCase();
    if (!q) return eligibleRestaurants;
    return eligibleRestaurants.filter((r) =>
      (r?.name || "").toLowerCase().includes(q),
    );
  }, [eligibleRestaurants, restaurantQuery]);

  const selectRestaurant = (restaurantId) => {
    if (!restaurantId) return;

    if (String(restaurantId) === String(currentRestaurantId)) {
      closeWithAnimation();
      return;
    }

    closeWithAnimation();
    restaurantContext?.handleRestaurantSelect?.(restaurantId);
  };

  // ✅ clamp
  const panelFallback = 560;
  const DRAG_MAX_PX = Math.max(220, (panelH || panelFallback) - 12);
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
    <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true">
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
          min-h-[40vh] max-h-[82vh]
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
        {/* Drag zone (swipe to close) */}
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
                <p className="text-xs text-darkBlue/50">{moduleLabel}</p>

                <h3 className="mt-1 text-lg font-semibold text-darkBlue leading-tight truncate">
                  Changer de restaurant
                </h3>

                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                  <span className="text-darkBlue/50">Actuel :</span>
                  <span className="truncate max-w-[220px]">{currentName}</span>
                </div>
              </div>

              <button
                onClick={closeWithAnimation}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/70 hover:bg-white/85 active:scale-[0.98] transition p-2 shadow-sm"
                aria-label={t?.("buttons.close", "Fermer")}
                title={t?.("buttons.close", "Fermer")}
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>

            {/* Search */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
              <input
                type="text"
                inputMode="search"
                placeholder="Rechercher un restaurant…"
                value={restaurantQuery}
                onChange={(e) => setRestaurantQuery(e.target.value)}
                className={`h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 pl-9 ${
                  restaurantQuery ? "pr-10" : "pr-4"
                } text-base`}
              />
              {restaurantQuery && (
                <button
                  type="button"
                  onClick={() => setRestaurantQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-9 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                  aria-label="Effacer"
                  title="Effacer"
                >
                  <X className="size-4 text-darkBlue/60" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 hide-scrollbar overscroll-contain">
          <div className="flex flex-col gap-2">
            {filteredRestaurants.map((r) => {
              const isActive = String(r._id) === String(currentRestaurantId);
              const initials = (r?.name || "?")
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")
                .slice(0, 2);

              return (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => selectRestaurant(r._id)}
                  className={`
                    w-full rounded-2xl border border-darkBlue/10
                    bg-white/60 hover:bg-white/80
                    shadow-sm
                    px-4 py-3
                    flex items-center justify-between gap-3
                    transition active:scale-[0.99]
                    ${isActive ? "ring-1 ring-blue/30" : ""}
                  `}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="size-11 rounded-2xl bg-darkBlue/5 border border-darkBlue/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-darkBlue/60">
                        {initials || "--"}
                      </span>
                    </div>

                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold text-darkBlue">
                        {r.name}
                      </p>
                      <p className="text-xs text-darkBlue/45">
                        {optionKey === "gift_card"
                          ? "Cartes cadeaux activées"
                          : "Réservations activées"}
                      </p>
                    </div>
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue bg-blue/10 border border-blue/20 px-2 py-1 rounded-full shrink-0">
                      <Check className="size-4" />
                      Actuel
                    </span>
                  ) : (
                    <span className="text-xs text-darkBlue/45 shrink-0">
                      Choisir
                    </span>
                  )}
                </button>
              );
            })}

            {!filteredRestaurants.length && (
              <div className="px-2 py-8 text-sm text-darkBlue/50 text-center">
                Aucun restaurant trouvé.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
