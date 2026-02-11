import { useEffect, useRef, useState } from "react";
import {
  X,
  CheckCheck,
  Bell,
  CalendarClock,
  CalendarCheck2,
  CalendarX2,
  Gift,
  Users,
  MessageSquareText,
  Info,
} from "lucide-react";

const CLOSE_MS = 280;
const PAGE_SIZE = 30;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtRelativeFR(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();

  const startOfDay = (dt) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();

  const dayNow = startOfDay(now);
  const dayD = startOfDay(d);

  const diffDays = Math.round((dayNow - dayD) / (24 * 60 * 60 * 1000));

  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());

  if (diffDays === 0) return `Aujourd’hui à ${hh}:${mm}`;
  if (diffDays === 1) return `Hier à ${hh}:${mm}`;
  if (diffDays === 2) return `Avant-hier à ${hh}:${mm}`;

  const dd = pad2(d.getDate());
  const mo = pad2(d.getMonth() + 1);
  return `${dd}/${mo} à ${hh}:${mm}`;
}

function getReservationStatus(n) {
  // ✅ priorité à meta (stable)
  return n?.meta?.reservationStatus ?? n?.data?.status ?? null;
}

function titleForNotification(n) {
  if (n?.module === "reservations") {
    const st = getReservationStatus(n);
    if (st === "Pending") return "Nouvelle réservation en attente";
    if (st === "Confirmed") return "Nouvelle réservation confirmée";
    if (st === "Late") return "Réservation en retard";
    if (st === "Active") return "Réservation en cours";
    if (st === "Finished") return "Réservation terminée";
    return "Nouvelle réservation";
  }

  if (n?.module === "gift_cards") return "Carte cadeau";
  if (n?.module === "employees") return "Demande de congés";
  if (n?.module === "messages") return "Message";

  return n?.title || "Notification";
}

function IconForNotification({ n }) {
  if (n?.module === "reservations") {
    const st = getReservationStatus(n);
    if (st === "Pending") return <CalendarClock className="size-4" />;
    if (st === "Confirmed") return <CalendarCheck2 className="size-4" />;
    if (st === "Late") return <CalendarX2 className="size-4" />;
    return <CalendarCheck2 className="size-4" />;
  }

  if (n?.module === "gift_cards") return <Gift className="size-4" />;
  if (n?.module === "employees") return <Users className="size-4" />;
  if (n?.module === "messages") return <MessageSquareText className="size-4" />;

  return <Bell className="size-4" />;
}

export default function NotificationsDrawerComponent({
  open,
  onClose,
  notifications = [],
  nextCursor = null,
  loading = false,
  fetchNotifications,
  markNotificationRead,
  markAllRead,
  role,
  lastNotificationsSyncRef,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  const list = Array.isArray(notifications) ? notifications : [];

  // Scroll lock robuste
  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

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

  // ref stable pour éviter re-fetch loops si la fonction change d'identité
  const fetchRef = useRef(fetchNotifications);
  useEffect(() => {
    fetchRef.current = fetchNotifications;
  }, [fetchNotifications]);

  // Open animation
  useEffect(() => {
    if (!open) return;

    setIsVisible(false);
    setHasFetchedOnce(false);

    lockScroll();

    const raf = requestAnimationFrame(() => setIsVisible(true));

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setIsVisible(false);
  }, [open]);

  function closeWithAnimation() {
    setIsVisible(false);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  useEffect(() => {
    if (!open) return;
    if (!loading && !hasFetchedOnce) {
      setHasFetchedOnce(true);
    }
  }, [open, loading, hasFetchedOnce]);

  useEffect(() => {
    if (!open) return;

    const isStale =
      Date.now() - (lastNotificationsSyncRef?.current || 0) > 120000;

    if (!notifications.length || isStale) {
      fetchRef.current?.({
        unreadOnly: false, // on charge tout, filtre local ensuite
        reset: true,
      });
    }
  }, [open, notifications.length]);

  function loadMore() {
    if (!nextCursor || loading) return;

    fetchRef.current?.({
      module: null,
      unreadOnly: false,
      limit: PAGE_SIZE,
      cursor: nextCursor,
      reset: false,
    });
  }

  const displayedList = unreadOnly ? list.filter((n) => !n.read) : list;

  if (!open) return null;

  const baseList = unreadOnly ? displayedList : list;

  const shouldShowLoading = !hasFetchedOnce || (loading && !baseList.length);
  const shouldShowEmpty = hasFetchedOnce && !loading && !baseList.length;

  // ✅ plus de useMemo -> plus de hook mismatch
  const markAllLabel = unreadOnly ? "Tout lire (non lues)" : "Tout lire";

  return (
    <div className="fixed inset-0 z-[999]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        className={`
          absolute z-[1]
          bg-white
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[420px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out will-change-transform

          ${
            isVisible
              ? `translate-y-0 tablet:translate-y-0 tablet:translate-x-0`
              : `translate-y-full tablet:translate-y-0 tablet:translate-x-full`
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-black/10 bg-white/70">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-darkBlue">Notifications</p>
            </div>

            <button
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label="Fermer"
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {/* Tous / Non lu + check */}
        <div className="px-4 py-3 border-b border-black/10 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-darkBlue/10 bg-white p-1">
              <button
                onClick={() => setUnreadOnly(false)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  !unreadOnly
                    ? "bg-darkBlue/5 text-darkBlue"
                    : "text-darkBlue/60 hover:bg-darkBlue/5"
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setUnreadOnly(true)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  unreadOnly
                    ? "bg-darkBlue/5 text-darkBlue"
                    : "text-darkBlue/60 hover:bg-darkBlue/5"
                }`}
              >
                Non lu
              </button>
            </div>

            <button
              onClick={() => markAllRead?.(null)}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label={markAllLabel}
              title={markAllLabel}
            >
              <CheckCheck className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          {shouldShowLoading ? (
            <p className="text-sm text-darkBlue/60">Chargement...</p>
          ) : shouldShowEmpty ? (
            <div className="rounded-2xl border border-darkBlue/10 bg-darkBlue/5 p-4">
              <p className="text-xs text-darkBlue/60 mt-1">
                {unreadOnly
                  ? "Vous êtes à jour !"
                  : "Aucune notification pour le moment."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {baseList.map((n) => {
                const title = titleForNotification(n);
                const when = fmtRelativeFR(n.createdAt);

                return (
                  <button
                    key={n._id}
                    onClick={() => {
                      if (!n.read) markNotificationRead?.(n._id);
                    }}
                    className={`
                      text-left p-3 rounded-2xl border transition
                      ${
                        n.read
                          ? "bg-white border-black/10 hover:bg-black/5"
                          : "bg-darkBlue/5 border-darkBlue/20 hover:bg-darkBlue/10"
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          mt-0.5 shrink-0
                          size-9 rounded-xl border flex items-center justify-center
                          ${
                            n.read
                              ? "bg-white border-black/10 text-darkBlue/60"
                              : "bg-white/80 border-darkBlue/15 text-darkBlue"
                          }
                        `}
                        aria-hidden="true"
                      >
                        <IconForNotification n={n} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-darkBlue truncate">
                            {title}
                          </p>

                          {!n.read ? (
                            <span className="mt-1 inline-flex size-2 rounded-full bg-blue" />
                          ) : null}
                        </div>

                        {n.message ? (
                          <p className="text-xs text-darkBlue/70 mt-1 line-clamp-3">
                            {n.message}
                          </p>
                        ) : (
                          <p className="text-xs text-darkBlue/50 mt-1 inline-flex items-center gap-1">
                            <Info className="size-3" />
                            Détail indisponible
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <p className="text-[11px] italic text-darkBlue/50">
                            {when}
                          </p>

                          <span className="text-[11px] text-darkBlue/50">
                            {n.read ? "Lu" : "Non lu"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!unreadOnly && nextCursor && hasFetchedOnce && (
            <div className="pt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-sm disabled:opacity-50"
              >
                {loading ? "Chargement..." : "Charger plus"}
              </button>
            </div>
          )}
        </div>

        {/* Footer mobile */}
        <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-4">
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
