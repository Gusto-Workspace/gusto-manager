import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import { X, Map, Clock3, Loader2 } from "lucide-react";

const CLOSE_MS = 240;
const OPEN_MS = 240;
const CANVAS_MOUNT_DELAY_MS = 180;

// Swipe config (mobile only)
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

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

function isSameDay(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);

  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function StatusLegend() {
  const items = [
    { label: "Libre", dot: "bg-white border-darkBlue/40" },
    { label: "Assignée", dot: "bg-blue/20 border-blue" },
    { label: "Occupée", dot: "bg-green/20 border-green" },
    {
      label: "Client en retard",
      dot: "bg-[rgba(255,159,10,0.22)] border-[rgb(255,159,10)]",
    },
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
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRenderCanvas, setShouldRenderCanvas] = useState(false);

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([]);
  const [floorPlanEnabled, setFloorPlanEnabled] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [liveMode, setLiveMode] = useState(true);
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedTableState, setSelectedTableState] = useState(null);

  const tablesCatalog = restaurantData?.reservations?.parameters?.tables || [];
  const reservationParameters = restaurantData?.reservations?.parameters || {};

  const contextDate = selectedDay || new Date();
  const contextDateKey = dateKeyOf(contextDate);
  const isDayContext = Boolean(selectedDay);

  const isTodayContext = isSameDay(contextDate, new Date());
  const showLiveToggle = !isDayContext || isTodayContext;

  const [isTabletUp, setIsTabletUp] = useState(false);

  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const [panelH, setPanelH] = useState(null);
  const [dragY, setDragY] = useState(0);

  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

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
    setShouldRenderCanvas(false);
    setIsVisible(false);
    setDragY(0);

    window.setTimeout(() => {
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

  const activeRoom = useMemo(() => {
    return (
      safeArr(rooms).find((r) => String(r._id) === String(activeRoomId)) || null
    );
  }, [rooms, activeRoomId]);

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
    setShouldRenderCanvas(false);
    setDragY(0);

    const showTimer = window.setTimeout(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    }, 10);

    const mountTimer = window.setTimeout(() => {
      setShouldRenderCanvas(true);
    }, CANVAS_MOUNT_DELAY_MS);

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(mountTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    async function fetchRooms() {
      try {
        setLoading(true);
        setError("");

        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const nextRooms = safeArr(res.data?.rooms);
        setRooms(nextRooms);
        setFloorPlanEnabled(Boolean(res.data?.enabled));

        if (nextRooms.length) {
          setActiveRoomId((prev) => {
            const exists = nextRooms.some(
              (r) => String(r._id) === String(prev),
            );
            return exists ? prev : String(nextRooms[0]._id);
          });
        } else {
          setActiveRoomId("");
        }
      } catch (e) {
        setError(
          e?.response?.data?.message ||
            "Impossible de charger le plan de salle.",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchRooms();
  }, [open, restaurantId]);

  useEffect(() => {
    if (!open) return;

    if (isDayContext) {
      if (!isTodayContext) {
        setLiveMode(false);
      }
      setSelectedTime((prev) => prev || timeOptions[0] || "");
    } else {
      setLiveMode(true);
      setSelectedTime("");
    }
  }, [open, isDayContext, isTodayContext, timeOptions]);

  useEffect(() => {
    if (!open) return;
    setSelectedTableState(null);
  }, [open, activeRoomId, selectedTime, liveMode, selectedDay]);

  useEffect(() => {
    setSelectedTableState(null);
  }, [selectedTime, liveMode, activeRoomId, contextDateKey]);

  if (!open) return null;

  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (e) => {
    if (isTabletUp) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const scrollTop = scrollRef.current?.scrollTop || 0;
    if (scrollTop > 0) return;

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
        aria-label="Fermer le plan de salle"
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        className={`
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
        `}
        style={
          isTabletUp
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

        {/* Scrollable content: tout le drawer scroll */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto hide-scrollbar overscroll-contain"
        >
          {/* Header */}
          <div className="border-b border-darkBlue/10">
            <div className="sticky top-0 z-20 bg-white border-b border-darkBlue/10">
              <div className="px-4 pb-3 desktop:py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Map className="size-5 text-darkBlue/70" />
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

                <button
                  type="button"
                  onClick={closeWithAnimation}
                  className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                  aria-label="Fermer"
                  title="Fermer"
                >
                  <X className="size-4 text-darkBlue/70" />
                </button>
              </div>
            </div>

            <div className="px-4 tablet:px-6 py-4 flex flex-col gap-3 bg-white/90">
              <div className="grid grid-cols-1 tablet:grid-cols-[1.1fr_1fr] gap-3">
                <div className="flex items-center gap-3 rounded-[22px] border border-darkBlue/10 bg-white/70 px-4 py-3 tablet:h-[66px]">
                  <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-darkBlue/45">
                    Salle
                  </label>

                  <select
                    value={activeRoomId}
                    onChange={(e) => setActiveRoomId(e.target.value)}
                    className="w-full h-11 rounded-2xl border border-darkBlue/10 bg-white px-3 text-sm text-darkBlue outline-none"
                  >
                    {safeArr(rooms).map((room) => (
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
                <div className="rounded-[22px] border border-darkBlue/10 bg-white/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Clock3 className="size-4 text-darkBlue/55" />
                    <label className="text-sm font-medium text-darkBlue">
                      Créneau d’affichage
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {timeOptions.length ? (
                      timeOptions.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTime(time)}
                          className={[
                            "inline-flex items-center rounded-full px-3 h-9 text-sm font-medium transition border",
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
                </div>
              ) : null}

              <StatusLegend />
            </div>
          </div>

          {/* Body */}
          <div className="rounded-[28px] m-4 tablet:m-6 min-h-[420px] tablet:min-h-[520px] bg-[#667085]">
            {loading ? (
              <div className="min-h-[420px] tablet:min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-lightGrey flex items-center justify-center">
                <div className="inline-flex items-center gap-3 text-darkBlue/60">
                  <Loader2 className="size-5 animate-spin" />
                  Chargement du plan…
                </div>
              </div>
            ) : error ? (
              <div className="min-h-[420px] tablet:min-h-[520px] rounded-[28px] border border-red/20 bg-lightGrey flex items-center justify-center px-6 text-center text-red">
                {error}
              </div>
            ) : !floorPlanEnabled || !rooms.length ? (
              <div className="min-h-[420px] tablet:min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-lightGrey flex items-center justify-center px-6 text-center text-darkBlue/55">
                Aucun plan de salle disponible pour le moment.
              </div>
            ) : !activeRoom ? (
              <div className="min-h-[420px] tablet:min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-lightGrey flex items-center justify-center px-6 text-center text-darkBlue/55">
                Salle introuvable.
              </div>
            ) : !shouldRenderCanvas ? (
              <div className="min-h-[420px] tablet:min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085]" />
            ) : (
              <FloorPlanCanvasReservationsComponent
                room={activeRoom}
                reservations={dayReservations}
                tablesCatalog={tablesCatalog}
                reservationParameters={reservationParameters}
                selectedDate={contextDate}
                selectedTime={selectedTime}
                liveMode={liveMode}
                selectedTableState={selectedTableState}
                onSelectTable={setSelectedTableState}
              />
            )}
          </div>

          {/* Footer mobile */}
          <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <button
              onClick={closeWithAnimation}
              className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
            >
              Retour
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
