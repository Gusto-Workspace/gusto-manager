import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import { Menu, Clock3, Loader2 } from "lucide-react";
import SidebarReservationsWebapp from "../_shared/sidebar.webapp";

const FloorPlanCanvasReservationsComponent = dynamic(
  () => import("../../reservations/floor-plan-canvas.reservations.component"),
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

export default function FloorPlanReservationsWebapp({
  restaurantId,
  restaurantData,
  reservations,
  selectedDay,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([]);
  const [floorPlanEnabled, setFloorPlanEnabled] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [liveMode, setLiveMode] = useState(true);
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedTableState, setSelectedTableState] = useState(null);
  const [shouldRenderCanvas, setShouldRenderCanvas] = useState(false);

  const tablesCatalog = restaurantData?.reservations?.parameters?.tables || [];
  const reservationParameters = restaurantData?.reservations?.parameters || {};

  const contextDate = selectedDay || new Date();
  const contextDateKey = dateKeyOf(contextDate);
  const isDayContext = Boolean(selectedDay);
  const isTodayContext = isSameDay(contextDate, new Date());
  const showLiveToggle = !isDayContext || isTodayContext;

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
    setShouldRenderCanvas(false);

    const t = window.setTimeout(() => {
      setShouldRenderCanvas(true);
    }, 120);

    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
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

    if (restaurantId) {
      fetchRooms();
    }
  }, [restaurantId]);

  useEffect(() => {
    if (isDayContext) {
      if (!isTodayContext) {
        setLiveMode(false);
      }
      setSelectedTime((prev) => prev || timeOptions[0] || "");
    } else {
      setLiveMode(true);
      setSelectedTime("");
    }
  }, [isDayContext, isTodayContext, timeOptions]);

  useEffect(() => {
    setSelectedTableState(null);
  }, [activeRoomId, selectedTime, liveMode, selectedDay, contextDateKey]);

  return (
    <div className="flex flex-col gap-4">
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={closeSidebar}
        title="Réservations"
      />

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={openSidebar}
            className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 active:scale-[0.98] transition p-3"
            aria-label="Menu"
            title="Menu"
          >
            <Menu className="size-5 text-darkBlue/70" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-darkBlue truncate">
              Plan de salle
            </h1>
            <p className="text-sm text-darkBlue/55">
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
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-[28px] border border-darkBlue/10 bg-white/90 p-4 tablet:p-6">
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

      {/* Canvas */}
      <div className="rounded-[28px] min-h-[520px] bg-[#667085] overflow-hidden">
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
        ) : !floorPlanEnabled || !rooms.length ? (
          <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] flex items-center justify-center px-6 text-center text-lightGrey">
            Aucun plan de salle disponible pour le moment.
          </div>
        ) : !activeRoom ? (
          <div className="min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] flex items-center justify-center px-6 text-center text-lightGrey">
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
  );
}
