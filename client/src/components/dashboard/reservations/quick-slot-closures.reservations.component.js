import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import {
  AlertCircle,
  CalendarX2,
  Loader2,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import { QUICK_SLOT_CLOSURE_SOURCE } from "@/_assets/utils/reservation-quick-slot-closure";

const CLOSE_MS = 180;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

export function QuickSlotClosureActionButton({
  onClick,
  compact = false,
  closedSlotCount = 0,
  className = "",
}) {
  const count = Math.max(0, Number(closedSlotCount) || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2 border border-darkBlue/10 bg-white/70 font-semibold text-darkBlue/70 shadow-sm transition hover:bg-darkBlue/5 active:scale-[0.98]",
        compact
          ? "h-[42px] rounded-2xl px-3 text-xs"
          : "h-[40px] rounded-full px-4 text-sm",
        className,
      ].join(" ")}
      aria-label={
        count
          ? `Fermer des créneaux, ${count} départ${count > 1 ? "s" : ""} fermé${count > 1 ? "s" : ""}`
          : "Fermer des créneaux"
      }
      title="Fermer précisément certains horaires aux réservations en ligne"
    >
      <CalendarX2 className="size-4 shrink-0" />
      <span>Fermer des créneaux</span>
      {count ? (
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red/10 px-1.5 text-[11px] font-bold leading-none text-red"
          title={`${count} départ${count > 1 ? "s" : ""} actuellement fermé${count > 1 ? "s" : ""}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SlotGroup({
  title,
  slots,
  selectedTimes,
  saving,
  reopeningId,
  onToggle,
  onReopen,
}) {
  if (!slots.length) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-darkBlue">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 mobile:grid-cols-4">
        {slots.map((slot) => {
          const selected = selectedTimes.has(slot.time);
          const quickClosed = slot.closureType === "quick";
          const advancedClosed = slot.closureType === "advanced";
          const rangeId = String(slot.reopenableRange?._id || "");
          const reopening = Boolean(rangeId && reopeningId === rangeId);
          const disabled =
            saving ||
            Boolean(reopeningId) ||
            advancedClosed ||
            (!slot.closed && slot.past);

          const handleClick = () => {
            if (quickClosed) onReopen(slot.reopenableRange);
            else if (!slot.closed) onToggle(slot.time);
          };

          return (
            <button
              key={slot.time}
              type="button"
              disabled={disabled}
              onClick={handleClick}
              aria-pressed={selected}
              aria-label={
                quickClosed
                  ? `Rouvrir le créneau de ${slot.time}`
                  : advancedClosed
                    ? `${slot.time}, fermé par une plage avancée`
                    : slot.past
                      ? `${slot.time}, créneau terminé`
                      : `${slot.time}, ${selected ? "sélectionné" : "disponible"}`
              }
              title={
                quickClosed
                  ? `Rouvrir ${slot.time}`
                  : advancedClosed
                    ? "Cette fermeture doit être gérée dans les paramètres avancés"
                    : undefined
              }
              className={[
                "flex h-12 w-full flex-col items-center justify-center rounded-xl border px-1.5 text-sm font-semibold leading-tight transition",
                selected
                  ? "border-blue bg-blue text-white shadow-sm"
                  : quickClosed
                    ? "border-red/20 bg-red/5 text-red hover:bg-red/10"
                    : advancedClosed
                      ? "cursor-not-allowed border-darkBlue/10 bg-darkBlue/5 text-darkBlue/55"
                      : slot.past
                        ? "cursor-not-allowed border-darkBlue/5 bg-darkBlue/5 text-darkBlue/30"
                        : "border-darkBlue/10 bg-white text-darkBlue hover:bg-darkBlue/5",
                disabled && !advancedClosed && !slot.past
                  ? "disabled:opacity-60"
                  : "",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-1">
                {quickClosed ? (
                  reopening ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )
                ) : advancedClosed ? (
                  <LockKeyhole className="size-3" />
                ) : null}
                {slot.time}
              </span>
              {quickClosed ? (
                <span className="mt-0.5 text-[10px] font-medium">Rouvrir</span>
              ) : advancedClosed ? (
                <span className="mt-0.5 text-[9px] font-medium">
                  Plage avancée
                </span>
              ) : slot.past ? (
                <span className="mt-0.5 text-[10px] font-medium">Terminé</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuickSlotClosureDrawer({
  open,
  onClose,
  selectedDay,
  slots,
  selectedTimes,
  saving,
  reopeningId,
  error,
  onToggle,
  onSubmit,
  onReopen,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  const [panelH, setPanelH] = useState(0);
  const [dragY, setDragY] = useState(0);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const scrollYRef = useRef(0);
  const scrollLockedRef = useRef(false);
  const busyRef = useRef(false);
  const previousPageStylesRef = useRef({
    bodyPosition: "",
    bodyTop: "",
    bodyLeft: "",
    bodyRight: "",
    bodyWidth: "",
    htmlOverflow: "",
  });
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  busyRef.current = saving || Boolean(reopeningId);

  const lockScroll = () => {
    if (typeof document === "undefined" || scrollLockedRef.current) return;

    const body = document.body;
    const html = document.documentElement;
    scrollYRef.current = window.scrollY || 0;
    previousPageStylesRef.current = {
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
    scrollLockedRef.current = true;
  };

  const restoreScroll = () => {
    if (typeof document === "undefined" || !scrollLockedRef.current) return;

    const body = document.body;
    const html = document.documentElement;
    const previous = previousPageStylesRef.current;
    body.style.position = previous.bodyPosition;
    body.style.top = previous.bodyTop;
    body.style.left = previous.bodyLeft;
    body.style.right = previous.bodyRight;
    body.style.width = previous.bodyWidth;
    html.style.overflow = previous.htmlOverflow;
    scrollLockedRef.current = false;
    window.scrollTo(0, scrollYRef.current || 0);
  };

  const measurePanel = () => {
    const height = panelRef.current?.getBoundingClientRect?.().height || 0;
    if (height > 0) setPanelH(height);
  };

  function closeWithAnimation() {
    if (busyRef.current) return;
    setIsVisible(false);
    setDragY(0);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const update = () => setIsTabletUp(mediaQuery.matches);
    update();
    if (mediaQuery.addEventListener)
      mediaQuery.addEventListener("change", update);
    else mediaQuery.addListener(update);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", update);
      } else {
        mediaQuery.removeListener(update);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    lockScroll();
    setIsVisible(false);
    setDragY(0);

    const frame = requestAnimationFrame(() => {
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
      cancelAnimationFrame(frame);
      window.clearTimeout(closeTimerRef.current);
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
      setPanelH(0);
    }
  }, [open]);

  const panelFallback = 720;
  const dragMaxPx = Math.max(240, (panelH || panelFallback) - 12);
  const swipeClosePx = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (event) => {
    if (isTabletUp || busyRef.current) return;
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
    if (isTabletUp || !dragStateRef.current.active) return;

    const deltaY = event.clientY - dragStateRef.current.startY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.lastT = performance.now();
    setDragY(Math.max(0, Math.min(dragMaxPx, deltaY)));
  };

  const onPointerUp = () => {
    if (isTabletUp || !dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const elapsed = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / elapsed;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }
    setDragY(0);
  };

  const submitAndClose = async () => {
    const succeeded = await onSubmit();
    if (!succeeded) return;
    busyRef.current = false;
    closeWithAnimation();
  };

  if (!open) return null;

  const lunchSlots = slots.filter((slot) => slot.service === "lunch");
  const dinnerSlots = slots.filter((slot) => slot.service === "dinner");
  const count = selectedTimes.size;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(selectedDay);
  const overlayOpacity = !isVisible
    ? 0
    : isTabletUp
      ? 1
      : 0.55 + 0.45 * (1 - dragY / dragMaxPx);

  return (
    <div className="fixed inset-0 z-[1100]" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-darkBlue/30 transition-opacity duration-200 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      <div
        ref={panelRef}
        className="absolute bottom-0 left-0 right-0 z-[1] flex max-h-[88dvh] min-h-[42vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/30 bg-lightGrey shadow-[0_-30px_90px_rgba(0,0,0,0.28)] tablet:inset-y-0 tablet:left-auto tablet:right-0 tablet:h-full tablet:max-h-[100vh] tablet:w-[520px] tablet:rounded-none"
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
          className="cursor-grab touch-none active:cursor-grabbing tablet:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center bg-white/70 py-3">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        <div className="shrink-0 border-b border-darkBlue/10 bg-white/70 px-4 pb-3 midTablet:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">Réservations — Gestion</p>
              <h2 className="text-base font-semibold text-darkBlue">
                Fermer des créneaux
              </h2>
              <p className="mt-1 truncate text-sm capitalize text-darkBlue/60">
                {dateLabel}
              </p>
            </div>
            <button
              type="button"
              disabled={saving || Boolean(reopeningId)}
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5 disabled:opacity-50"
              aria-label="Fermer"
              title="Fermer"
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-lightGrey p-4 hide-scrollbar">
          {!slots.length ? (
            <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-5 text-center text-sm text-darkBlue/60">
              Aucun service de réservation n’est disponible ce jour-là.
            </div>
          ) : (
            <>
              <p className="text-sm text-darkBlue/60">
                Sélectionnez les départs à fermer. Touchez un créneau fermé
                rapidement pour le rouvrir.
              </p>
              <SlotGroup
                title="Midi"
                slots={lunchSlots}
                selectedTimes={selectedTimes}
                saving={saving}
                reopeningId={reopeningId}
                onToggle={onToggle}
                onReopen={onReopen}
              />
              <SlotGroup
                title="Soir"
                slots={dinnerSlots}
                selectedTimes={selectedTimes}
                saving={saving}
                reopeningId={reopeningId}
                onToggle={onToggle}
                onReopen={onReopen}
              />
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-darkBlue/10 bg-white/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)] backdrop-blur-xl tablet:pb-4">
          {error ? (
            <p
              className="mb-3 flex items-start gap-2 rounded-xl border border-red/20 bg-red/5 px-3 py-2 text-sm text-red"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!count || saving || Boolean(reopeningId)}
            onClick={submitAndClose}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving
              ? "Fermeture en cours…"
              : count
                ? `Fermer ${count} créneau${count > 1 ? "x" : ""}`
                : "Sélectionnez des créneaux"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickSlotClosuresReservationsComponent({
  open,
  onClose,
  selectedDay,
  restaurantData,
  setRestaurantData,
  slots = [],
}) {
  const [selectedTimes, setSelectedTimes] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [reopeningId, setReopeningId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedTimes(new Set());
    setError("");
  }, [open, selectedDay]);

  useEffect(() => {
    const selectableTimes = new Set(
      slots
        .filter((slot) => !slot.closed && !slot.past)
        .map((slot) => slot.time),
    );
    setSelectedTimes(
      (current) =>
        new Set([...current].filter((time) => selectableTimes.has(time))),
    );
  }, [slots]);

  const toggleTime = (time) => {
    setError("");
    setSelectedTimes((current) => {
      const next = new Set(current);
      if (next.has(time)) next.delete(time);
      else next.add(time);
      return next;
    });
  };

  const submitClosures = async () => {
    if (!selectedTimes.size || saving) return false;

    try {
      setSaving(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData?._id}/reservations/blocked-ranges`,
        {
          date: format(selectedDay, "yyyy-MM-dd"),
          times: [...selectedTimes],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data?.restaurant) {
        setRestaurantData?.(response.data.restaurant);
      }
      setSelectedTimes(new Set());
      return true;
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Impossible de fermer les créneaux. Réessayez.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reopenSlot = async (range) => {
    const rangeId = String(range?._id || "");
    if (!rangeId || reopeningId) return;

    try {
      setReopeningId(rangeId);
      setError("");
      const token = localStorage.getItem("token");
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData?._id}/reservations/blocked-ranges/${rangeId}`,
        {
          params: { source: QUICK_SLOT_CLOSURE_SOURCE },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data?.restaurant) {
        setRestaurantData?.(response.data.restaurant);
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Impossible de rouvrir ce créneau. Réessayez.",
      );
    } finally {
      setReopeningId("");
    }
  };

  if (!selectedDay) return null;

  return (
    <QuickSlotClosureDrawer
      open={open}
      onClose={onClose}
      selectedDay={selectedDay}
      slots={slots}
      selectedTimes={selectedTimes}
      saving={saving}
      reopeningId={reopeningId}
      error={error}
      onToggle={toggleTime}
      onSubmit={submitClosures}
      onReopen={reopenSlot}
    />
  );
}
