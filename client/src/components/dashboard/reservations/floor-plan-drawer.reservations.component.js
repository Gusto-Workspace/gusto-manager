import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import { X, Map, Clock3, Loader2 } from "lucide-react";

const CLOSE_MS = 220;
const CANVAS_MOUNT_DELAY_MS = 90;

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

function StatusLegend() {
  const items = [
    { label: "Libre", dot: "bg-white border-darkBlue/40" },
    { label: "Assignée", dot: "bg-blue/20 border-blue" },
    { label: "Occupée", dot: "bg-green/20 border-green" },
    {
      label: "Client en retard",
      dot: "bg-[rgba(255,159,10,0.22)] border-[rgb(255,159,10)]",
    },
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

  const closeWithAnimation = () => {
    setShouldRenderCanvas(false);
    setIsVisible(false);

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
    if (!open) return;

    lockScroll();
    setIsVisible(false);
    setShouldRenderCanvas(false);

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    const mountTimer = window.setTimeout(() => {
      setShouldRenderCanvas(true);
    }, CANVAS_MOUNT_DELAY_MS);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(mountTimer);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
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
      setLiveMode(false);
      setSelectedTime((prev) => prev || timeOptions[0] || "");
    } else {
      setLiveMode(true);
      setSelectedTime("");
    }
  }, [open, isDayContext, timeOptions]);

  useEffect(() => {
    if (!open) return;
    setSelectedTableState(null);
  }, [open, activeRoomId, selectedTime, liveMode, selectedDay]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        onClick={closeWithAnimation}
        className={[
          "fixed inset-0 z-[120] bg-darkBlue/20 transition-opacity duration-150",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-label="Fermer le plan de salle"
      />

      <aside
        className={[
          "fixed right-0 top-0 z-[130] h-dvh w-1/2 max-w-[1180px]",
          "border-l border-darkBlue/10 bg-lightGrey shadow-2xl",
          "transform-gpu will-change-transform transition-transform",
          "duration-[220ms] ease-out flex flex-col",
          isVisible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-darkBlue/10 bg-white/90">
          <div className="px-4 tablet:px-6 py-4 flex items-start justify-between gap-4">
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

          <div className="px-4 tablet:px-6 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 tablet:grid-cols-[1.1fr_1fr] gap-3 h-[66px]">
              <div className="flex items-center gap-3 rounded-[22px] border border-darkBlue/10 bg-white/70 px-4">
                <label className="text-xs font-medium uppercase tracking-wide text-darkBlue/45">
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

              <div className="rounded-[22px] h-fit border border-darkBlue/10 bg-white/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-darkBlue/45">
                      Temps réel
                    </p>
                    {isDayContext ? (
                      <p className="mt-1 text-sm text-darkBlue/55">
                        {liveMode
                          ? "Le plan suit l’état en cours."
                          : "Le plan suit le créneau sélectionné."}
                      </p>
                    ) : liveMode ? (
                      <p className="mt-1 text-sm text-darkBlue/55">
                        Le plan suit l’état en cours.
                      </p>
                    ) : (
                      <span className="mt-1 text-sm text-darkBlue/55">-</span>
                    )}
                  </div>

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
              </div>
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
            <StatusLegend isDayContext={isDayContext} liveMode={liveMode} />{" "}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 tablet:p-6">
            {loading ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-white/60 flex items-center justify-center">
                <div className="inline-flex items-center gap-3 text-darkBlue/60">
                  <Loader2 className="size-5 animate-spin" />
                  Chargement du plan…
                </div>
              </div>
            ) : error ? (
              <div className="min-h-[520px] rounded-[28px] border border-red/20 bg-white/60 flex items-center justify-center px-6 text-center text-red">
                {error}
              </div>
            ) : !floorPlanEnabled || !rooms.length ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-white/60 flex items-center justify-center px-6 text-center text-darkBlue/55">
                Aucun plan de salle disponible pour le moment.
              </div>
            ) : !activeRoom ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-white/60 flex items-center justify-center px-6 text-center text-darkBlue/55">
                Salle introuvable.
              </div>
            ) : !shouldRenderCanvas ? (
              <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085]" />
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
        </div>
      </aside>
    </>
  );
}
