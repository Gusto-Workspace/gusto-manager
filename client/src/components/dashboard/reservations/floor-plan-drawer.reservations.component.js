import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import {
  X,
  Clock3,
  Loader2,
  LayoutGrid,
  Pin,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getActiveFloorPlanRooms,
  getDefaultActiveFloorPlanRoomId,
} from "./floor-plan.rooms.utils";

const CLOSE_MS = 240;
const OPEN_MS = 240;

// Swipe config (mobile only)
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

const FLOOR_PLAN_ROOMS_CACHE = new Map();
const FloorPlanCanvasReservationsComponent = dynamic(
  () => import("./floor-plan-canvas.reservations.component"),
  { ssr: false },
);

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

function dateKeyOf(date) {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function getInitialDrawerState(restaurantId) {
  const cacheKey = restaurantId ? String(restaurantId) : "";
  const cached = cacheKey ? FLOOR_PLAN_ROOMS_CACHE.get(cacheKey) : null;

  const rooms = safeArr(cached?.rooms);
  const floorPlanEnabled = Boolean(cached?.enabled);
  const activeRoomId = getDefaultActiveFloorPlanRoomId(rooms);

  return {
    rooms,
    floorPlanEnabled,
    activeRoomId,
  };
}

function StatusLegend() {
  const items = [
    { label: "Libre", dot: "bg-white border-darkBlue/40" },
    { label: "Assignée", dot: "bg-blue/20 border-blue" },
    { label: "Occupée", dot: "bg-green/20 border-green" },
    { label: "À libérer", dot: "bg-red/20 border-red" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1.5"
        >
          <span className={`size-3 rounded-full border ${item.dot}`} />
          <span className="text-xs text-darkBlue/70">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function FloorPlanDrawerReservationsComponent({
  open,
  onClose,
  restaurantId,
  restaurantData,
  reservations,
  selectedDay,
  variant = "drawer",
  floorPlanPinned = false,
  onToggleFloorPlanPinned,
}) {
  const isPanel = variant === "panel";
  const effectiveOpen = isPanel || open;
  const initialState = useMemo(
    () => getInitialDrawerState(restaurantId),
    [restaurantId],
  );

  const [isVisible, setIsVisible] = useState(false);

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState(initialState.rooms);
  const [floorPlanEnabled, setFloorPlanEnabled] = useState(
    initialState.floorPlanEnabled,
  );
  const [activeRoomId, setActiveRoomId] = useState(initialState.activeRoomId);
  const [liveMode, setLiveMode] = useState(true);
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedTableState, setSelectedTableState] = useState(null);
  const [shouldResetView, setShouldResetView] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const tablesCatalog = restaurantData?.reservationsSettings?.tables || [];
  const reservationParameters = restaurantData?.reservationsSettings || {};

  const contextDate = selectedDay || new Date();
  const contextDateKey = dateKeyOf(contextDate);
  const isDayContext = Boolean(selectedDay);
  const isTodayContext = contextDateKey === dateKeyOf(new Date());

  const showLiveToggle = !isDayContext || isTodayContext;
  const showHeader = !isPanel;
  const inlineTimeControls = isPanel && isDayContext && !liveMode;

  const [isTabletUp, setIsTabletUp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const timeOptionsScrollRef = useRef(null);
  const canvasHostRef = useRef(null);
  const legendButtonRef = useRef(null);
  const legendPanelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);
  const [dragY, setDragY] = useState(0);

  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const closeTimerRef = useRef(null);

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

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  const closeWithAnimation = () => {
    if (isPanel) {
      onClose?.();
      return;
    }

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    }

    setIsVisible(false);
    setDragY(0);

    closeTimerRef.current = window.setTimeout(() => {
      const defaultRoomId = getDefaultActiveFloorPlanRoomId(rooms);

      setActiveRoomId(defaultRoomId);
      setSelectedTableState(null);
      setShouldResetView(true);

      if (!isDayContext || isTodayContext) {
        setLiveMode(true);
        setSelectedTime("");
      } else {
        setLiveMode(false);
        setSelectedTime(timeOptions[0] || "");
      }

      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }

      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  };

  const dayReservations = useMemo(() => {
    return safeArr(reservations).filter((r) => {
      const d = new Date(r?.reservationDate);
      if (Number.isNaN(d.getTime())) return false;
      return dateKeyOf(d) === contextDateKey;
    });
  }, [reservations, contextDateKey]);

  const timeOptions = useMemo(() => {
    const uniq = Array.from(
      new Set(
        dayReservations
          .map((r) => String(r?.reservationTime || "").slice(0, 5))
          .filter(Boolean),
      ),
    );
    return uniq.sort((a, b) => a.localeCompare(b));
  }, [dayReservations]);

  const activeRooms = useMemo(() => getActiveFloorPlanRooms(rooms), [rooms]);

  const activeRoom = useMemo(() => {
    return (
      activeRooms.find((room) => String(room._id) === String(activeRoomId)) ||
      null
    );
  }, [activeRooms, activeRoomId]);

  useEffect(() => {
    import("./floor-plan-canvas.reservations.component");
  }, []);

  useEffect(() => {
    const nextState = getInitialDrawerState(restaurantId);
    setRooms(nextState.rooms);
    setFloorPlanEnabled(nextState.floorPlanEnabled);
    setActiveRoomId((prev) => {
      const hasPrev = getActiveFloorPlanRooms(nextState.rooms).some(
        (room) => String(room._id) === String(prev),
      );
      return hasPrev ? prev : nextState.activeRoomId;
    });
  }, [restaurantId]);

  useEffect(() => {
    if (shouldResetView) {
      setShouldResetView(false);
    }
  }, [shouldResetView]);

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
    if (!effectiveOpen) {
      setIsVisible(false);
      setDragY(0);
      if (!isPanel) restoreScroll();
      return;
    }

    if (!isPanel) lockScroll();
    setDragY(0);

    const raf = requestAnimationFrame(() => {
      measurePanel();
      setIsVisible(true);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOpen, isPanel]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      restoreScroll();
    };
  }, []);

  useEffect(() => {
    if (!effectiveOpen || !restaurantId) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const cacheKey = String(restaurantId);
    const cached = FLOOR_PLAN_ROOMS_CACHE.get(cacheKey);

    if (cached) {
      const cachedRooms = safeArr(cached.rooms);

      setRooms(cachedRooms);
      setFloorPlanEnabled(Boolean(cached.enabled));
      setError("");
      setActiveRoomId((prev) => {
        const activeCachedRooms = getActiveFloorPlanRooms(cachedRooms);
        const exists = activeCachedRooms.some(
          (room) => String(room._id) === String(prev),
        );
        return exists ? prev : getDefaultActiveFloorPlanRoomId(cachedRooms);
      });
    }

    async function fetchRooms({ silent = false } = {}) {
      try {
        if (!silent && !cached) {
          setLoading(true);
        }

        setError("");

        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const nextRooms = safeArr(res.data?.rooms);
        const nextEnabled = Boolean(res.data?.enabled);

        FLOOR_PLAN_ROOMS_CACHE.set(cacheKey, {
          rooms: nextRooms,
          enabled: nextEnabled,
        });

        setRooms(nextRooms);
        setFloorPlanEnabled(nextEnabled);
        setActiveRoomId((prev) => {
          const nextActiveRooms = getActiveFloorPlanRooms(nextRooms);
          const exists = nextActiveRooms.some(
            (room) => String(room._id) === String(prev),
          );
          return exists ? prev : getDefaultActiveFloorPlanRoomId(nextRooms);
        });
      } catch (e) {
        if (!cached) {
          setError(
            e?.response?.data?.message ||
              "Impossible de charger le plan de salle.",
          );
        }
      } finally {
        if (!silent && !cached) {
          setLoading(false);
        }
      }
    }

    fetchRooms({ silent: Boolean(cached) });
  }, [effectiveOpen, restaurantId]);

  useEffect(() => {
    if (!effectiveOpen) return;

    if (!isDayContext || isTodayContext) {
      setLiveMode(true);
      setSelectedTime("");
      setSelectedTableState(null);
      return;
    }

    setLiveMode(false);
    setSelectedTime((prev) => {
      const hasPrev = timeOptions.includes(prev);
      return hasPrev ? prev : timeOptions[0] || "";
    });
    setSelectedTableState(null);
  }, [
    effectiveOpen,
    contextDateKey,
    isDayContext,
    isTodayContext,
    timeOptions,
  ]);

  useEffect(() => {
    if (!effectiveOpen) return;
    setSelectedTableState(null);
    setLegendOpen(false);
  }, [effectiveOpen, activeRoomId, selectedTime, liveMode, selectedDay]);

  useEffect(() => {
    if (!effectiveOpen) return;
    if (!selectedTableState && !legendOpen) return;
    if (typeof document === "undefined") return;

    const onPointerDown = (event) => {
      const target = event.target;
      const panel = panelRef.current;
      const canvasHost = canvasHostRef.current;
      const legendButton = legendButtonRef.current;
      const legendPanel = legendPanelRef.current;

      if (
        legendOpen &&
        !legendButton?.contains(target) &&
        !legendPanel?.contains(target)
      ) {
        setLegendOpen(false);
      }

      if (selectedTableState && canvasHost && !canvasHost.contains(target)) {
        setSelectedTableState(null);
      } else if (selectedTableState && panel && !panel.contains(target)) {
        setSelectedTableState(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [effectiveOpen, selectedTableState, legendOpen]);

  useEffect(() => {
    if (!effectiveOpen) return;
    if (!isDayContext) return;
    if (liveMode) {
      if (selectedTime !== "") {
        setSelectedTime("");
      }
      return;
    }

    const firstTime = timeOptions[0] || "";
    const hasSelectedTime = timeOptions.includes(selectedTime);

    if (!hasSelectedTime && firstTime) {
      setSelectedTime(firstTime);
    }
  }, [effectiveOpen, isDayContext, liveMode, timeOptions, selectedTime]);

  useEffect(() => {
    setSelectedTableState(null);
  }, [selectedTime, liveMode, activeRoomId, contextDateKey]);

  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const scrollTimeOptions = (direction) => {
    const target = timeOptionsScrollRef.current;
    if (!target) return;
    target.scrollBy({
      left: direction * Math.max(180, target.clientWidth * 0.65),
      behavior: "smooth",
    });
  };

  const onPointerDown = (e) => {
    if (isPanel) return;
    if (isTabletUp) return;
    if (!effectiveOpen) return;
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
    : 1 * (1 - Math.min(1, dragY / DRAG_MAX_PX));

  if (!effectiveOpen) return null;

  return (
    <div
      className={
        isPanel
          ? "relative z-0 h-full min-h-[680px] w-full"
          : `fixed inset-0 z-[260] ${
              open ? "pointer-events-auto" : "pointer-events-none"
            }`
      }
      role={isPanel ? undefined : "dialog"}
      aria-modal={isPanel ? undefined : "true"}
      aria-hidden={isPanel ? undefined : !open}
    >
      {/* Overlay */}
      {!isPanel ? (
        <div
          className={`
            absolute inset-0 bg-darkBlue/30
            transition-opacity duration-200
            ${isVisible ? "opacity-100" : "opacity-0"}
          `}
          style={{ opacity: overlayOpacity }}
          onClick={open ? closeWithAnimation : undefined}
          aria-label="Fermer le plan de salle"
        />
      ) : null}

      {/* Panel */}
      <aside
        ref={panelRef}
        className={
          isPanel
            ? `
              relative z-[1] flex h-full min-h-[680px] w-full flex-col overflow-hidden
              rounded-[28px] border border-darkBlue/10 bg-lightGrey shadow-sm
            `
            : `
              absolute z-[1]
              border border-darkBlue/10 bg-lightGrey
              shadow-[0_25px_80px_rgba(19,30,54,0.25)]
              flex flex-col overflow-hidden
              transform-gpu
              left-0 right-0 bottom-0 w-full min-h-[50vh] max-h-[90vh]
              rounded-t-3xl
              tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
              tablet:h-full tablet:max-h-none tablet:w-1/2 tablet:max-w-[1180px]
              tablet:rounded-none tablet:border-l tablet:border-t-0 tablet:border-r-0 tablet:border-b-0
              transition-transform ease-out will-change-transform
              ${
                isVisible
                  ? "translate-y-0 tablet:translate-y-0 tablet:translate-x-0"
                  : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"
              }
            `
        }
        style={
          isPanel
            ? undefined
            : isTabletUp
              ? {
                  transitionDuration: `${OPEN_MS}ms`,
                  backfaceVisibility: "hidden",
                }
              : {
                  transform: isVisible
                    ? `translate3d(0, ${dragY}px, 0)`
                    : "translate3d(0, 100%, 0)",
                  transition: dragStateRef.current.active
                    ? "none"
                    : `transform ${OPEN_MS}ms ease-out`,
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag zone */}
        {!isPanel ? (
          <div
            className="tablet:hidden shrink-0 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="py-3 flex justify-center bg-white">
              <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
            </div>
          </div>
        ) : null}

        {/* Scrollable content: tout le drawer scroll */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto hide-scrollbar overscroll-none"
        >
          {/* Header */}
          <div className="border-b border-darkBlue/10">
            {showHeader ? (
              <div className="sticky top-0 z-20 bg-white border-b border-darkBlue/10">
                <div className="px-4 pb-3 desktop:py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="size-5 text-darkBlue/70" />
                      <h2 className="text-lg tablet:text-xl font-semibold text-darkBlue">
                        Plan de salle
                      </h2>
                    </div>

                    <p className="mt-1 text-sm text-darkBlue/55">
                      {isDayContext
                        ? `Affichage du ${new Intl.DateTimeFormat("fr-FR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          }).format(contextDate)}`
                        : "Affichage en direct du service du jour"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isDayContext &&
                    !floorPlanPinned &&
                    typeof onToggleFloorPlanPinned === "function" ? (
                      <button
                        type="button"
                        onClick={onToggleFloorPlanPinned}
                        className="hidden size-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue/70 transition hover:bg-darkBlue/5 min-[1024px]:inline-flex"
                        aria-label="Épingler le plan de salle"
                        title="Épingler le plan de salle"
                      >
                        <Pin className="size-4" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={closeWithAnimation}
                      className="inline-flex items-center justify-center size-10 rounded-full border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                      aria-label="Fermer"
                      title="Fermer"
                    >
                      <X className="size-4 text-darkBlue/70" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div
              className={`px-4 tablet:px-6 py-4 flex flex-col gap-3 bg-white/90 ${
                !showHeader ? "rounded-t-[28px]" : ""
              } ${
                inlineTimeControls
                  ? "min-[1024px]:grid min-[1024px]:grid-cols-2 min-[1024px]:items-center"
                  : ""
              }`}
            >
              <div
                className={`grid grid-cols-1 gap-3 ${
                  showLiveToggle ? "tablet:grid-cols-[1.1fr_1fr]" : ""
                }`}
              >
                <div className="flex items-center gap-3 rounded-[22px] border border-darkBlue/10 bg-white/70 px-4 py-3 tablet:h-[66px]">
                  <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-darkBlue/45">
                    Salle
                  </label>

                  <select
                    value={activeRoomId}
                    onChange={(e) => setActiveRoomId(e.target.value)}
                    className="w-full h-11 rounded-2xl border border-darkBlue/10 bg-white px-3 text-sm text-darkBlue outline-none"
                  >
                    {activeRooms.map((room) => (
                      <option key={room._id} value={room._id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </div>

                {showLiveToggle ? (
                  <div className="rounded-[22px] border border-darkBlue/10 bg-white/70 px-4 py-3 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-darkBlue/45">
                      Temps réel
                    </p>

                    <button
                      type="button"
                      onClick={() => setLiveMode((v) => !v)}
                      className={[
                        "relative inline-flex h-8 w-14 items-center rounded-full transition",
                        liveMode ? "bg-blue" : "bg-darkBlue/15",
                      ].join(" ")}
                      aria-pressed={liveMode}
                    >
                      <span
                        className={[
                          "inline-block size-6 transform rounded-full bg-white shadow transition",
                          liveMode ? "translate-x-7" : "translate-x-1",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                ) : null}
              </div>

              {isDayContext && !liveMode ? (
                <div className="flex min-w-0 items-center gap-2 rounded-[22px] border border-darkBlue/10 bg-white/70 px-3 py-3">
                  <Clock3 className="size-4 shrink-0 text-darkBlue/55" />
                  <span className="sr-only">Créneau d’affichage</span>

                  {timeOptions.length ? (
                    <button
                      type="button"
                      onClick={() => scrollTimeOptions(-1)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue/65 transition hover:bg-darkBlue/5"
                      aria-label="Créneaux précédents"
                      title="Créneaux précédents"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  ) : null}

                  <div
                    ref={timeOptionsScrollRef}
                    className="hide-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain scroll-smooth"
                  >
                    {timeOptions.length ? (
                      timeOptions.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTime(time)}
                          className={[
                            "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition",
                            selectedTime === time
                              ? "bg-darkBlue text-white border-darkBlue"
                              : "bg-white text-darkBlue border-darkBlue/10 hover:bg-darkBlue/5",
                          ].join(" ")}
                        >
                          {time}
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-darkBlue/50">
                        Aucun créneau ce jour-là.
                      </div>
                    )}
                  </div>

                  {timeOptions.length ? (
                    <button
                      type="button"
                      onClick={() => scrollTimeOptions(1)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue/65 transition hover:bg-darkBlue/5"
                      aria-label="Créneaux suivants"
                      title="Créneaux suivants"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Body */}
          <div
            className={`relative rounded-[28px] bg-[#667085] ${
              isPanel ? "m-4 min-h-[560px]" : "m-4 min-h-[520px] tablet:m-6"
            }`}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              setSelectedTableState(null);
              setLegendOpen(false);
            }}
          >
            {!loading && !error && floorPlanEnabled && activeRooms.length ? (
              <>
                <button
                  ref={legendButtonRef}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedTableState(null);
                    setLegendOpen((value) => !value);
                  }}
                  className="absolute left-4 top-4 z-[70] inline-flex size-11 items-center justify-center rounded-full border border-white/25 bg-white/8 text-white/90 transition hover:bg-white/12"
                  aria-label="Afficher la légende du plan"
                  title="Légende"
                >
                  <Info className="size-5" />
                </button>

                {legendOpen ? (
                  <div
                    ref={legendPanelRef}
                    className="absolute left-4 top-16 z-[80] w-[240px] rounded-3xl border border-white/20 bg-white/95 p-4 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-label="Légende du plan de salle"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-darkBlue">
                        Légende
                      </p>
                      <button
                        type="button"
                        onClick={() => setLegendOpen(false)}
                        className="inline-flex size-8 items-center justify-center rounded-full border border-darkBlue/10 bg-white transition hover:bg-darkBlue/5"
                        aria-label="Fermer la légende"
                      >
                        <X className="size-4 text-darkBlue/70" />
                      </button>
                    </div>
                    <StatusLegend />
                  </div>
                ) : null}
              </>
            ) : null}

            {loading ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] flex items-center justify-center">
                <div className="inline-flex items-center gap-3 text-lightGrey">
                  <Loader2 className="size-5 animate-spin" />
                  Chargement du plan…
                </div>
              </div>
            ) : error ? (
              <div className="min-h-[520px] rounded-[28px] border border-red/20 bg-[#667085] flex items-center justify-center px-6 text-center text-red">
                {error}
              </div>
            ) : !floorPlanEnabled || !activeRooms.length ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] flex items-center justify-center px-6 text-center text-lightGrey">
                Aucun plan de salle disponible pour le moment.
              </div>
            ) : !activeRoom ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] flex items-center justify-center px-6 text-center text-lightGrey">
                Salle introuvable.
              </div>
            ) : (
              <div ref={canvasHostRef} className="h-full min-h-[520px]">
                <FloorPlanCanvasReservationsComponent
                  key={`${activeRoom?._id || "room"}_${JSON.stringify(activeRoom?.canvas || {})}_${safeArr(activeRoom?.objects).length}_${safeArr(
                    activeRoom?.objects,
                  )
                    .map(
                      (o) =>
                        `${o.id}_${o.x}_${o.y}_${o.w}_${o.h}_${o.rotation}`,
                    )
                    .join("|")}`}
                  room={activeRoom}
                  reservations={dayReservations}
                  tablesCatalog={tablesCatalog}
                  reservationParameters={reservationParameters}
                  selectedDate={contextDate}
                  selectedTime={selectedTime}
                  liveMode={liveMode}
                  selectedTableState={selectedTableState}
                  onSelectTable={setSelectedTableState}
                  shouldResetView={shouldResetView}
                />
              </div>
            )}
          </div>

          {/* Footer mobile */}
          {!isPanel ? (
            <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
              <button
                onClick={closeWithAnimation}
                className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
              >
                Retour
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
