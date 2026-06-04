import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  X,
  Phone,
  Mail,
  Users,
  Clock,
  Calendar,
  User,
  ChevronDown,
  LoaderCircle,
  StickyNote,
  Ticket,
} from "lucide-react";
import { TableSvg, CommentarySvg } from "@/components/_shared/_svgs/_index";
import {
  getReservationStatusClassName,
  getReservationStatusLabel,
} from "./reservation-status.utils";
import { CustomerTagPill } from "@/components/_shared/customers/customer-tags-ui";

const CLOSE_MS = 280;

// Swipe config (mobile only)
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

function fmtDateTime(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCurrency(amount, currency = "eur") {
  const n = Number(amount || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "eur").toUpperCase(),
  }).format(n);
}

function getReservationTableLabel(reservation, tablesCatalog = []) {
  const explicitName = String(reservation?.table?.name || "").trim();
  if (explicitName) return explicitName;

  const tableIds = Array.isArray(reservation?.table?.tableIds)
    ? reservation.table.tableIds
    : [];

  if (!tableIds.length) return null;

  const catalogById = new Map(
    (Array.isArray(tablesCatalog) ? tablesCatalog : []).map((table) => [
      String(table?._id || ""),
      String(table?.name || "").trim(),
    ]),
  );

  const names = Array.from(
    new Set(
      tableIds
        .map((id) => catalogById.get(String(id || "").trim()))
        .filter(Boolean),
    ),
  );

  return names.length ? names.join(" + ") : null;
}

function getReservationCustomerName(reservation) {
  const fullName = String(reservation?.customerName || "").trim();
  if (fullName) return fullName;

  const firstName = String(reservation?.customerFirstName || "").trim();
  const lastName = String(reservation?.customerLastName || "").trim();
  const fallback = `${firstName} ${lastName}`.trim();

  return fallback || "-";
}

function getReservationCustomerId(reservation) {
  const summaryId = String(reservation?.customerSummary?._id || "").trim();
  if (summaryId) return summaryId;

  const customer = reservation?.customer;
  if (!customer) return "";
  if (typeof customer === "object") return String(customer?._id || "").trim();
  return String(customer || "").trim();
}

function getReservationDateTime(reservation) {
  const date = new Date(reservation?.reservationDate);
  if (Number.isNaN(date.getTime())) return null;

  const [hours = "0", minutes = "0"] = String(
    reservation?.reservationTime || "",
  ).split(":");

  date.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0);
  return date;
}

export default function ReservationsDrawerComponent({
  open,
  onClose,
  reservation,
  t,
  onAction,
  errorMessage,
  tablesCatalog,
  restaurantId,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [bankHoldOpen, setBankHoldOpen] = useState(false);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");

  const restoreScroll = () => {};
  const lockScroll = () => {};

  // ✅ detect tablet+ (to avoid breaking slide-right)
  const [isTabletUp, setIsTabletUp] = useState(false);
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

  // ✅ Swipe state (mobile only)
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);

  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  // Open animation (like notifications)
  useEffect(() => {
    if (!open) return;

    lockScroll();
    setIsVisible(false);
    setDragY(0);
    setBankHoldOpen(false);

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
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
    if (!open) setIsVisible(false);
  }, [open]);

  function closeWithAnimation() {
    setIsVisible(false);
    setDragY(0);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const status = reservation?.status || null;
  const customerId = getReservationCustomerId(reservation);

  const bankHold = reservation?.bankHold || {};
  const bankHoldEnabled = Boolean(bankHold?.enabled);
  const bankHoldStatus = String(bankHold?.status || "none");

  const bankHoldStatusUi = useMemo(() => {
    if (bankHoldStatus === "authorized") {
      return {
        cls: "bg-green/10 text-green border-green/30",
        label: "Autorisée",
      };
    }

    if (bankHoldStatus === "captured") {
      return {
        cls: "bg-blue/10 text-blue border-blue/30",
        label: "Capturée",
      };
    }

    if (bankHoldStatus === "released") {
      return {
        cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
        label: "Libérée",
      };
    }

    if (bankHoldStatus === "authorization_scheduled") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Autorisation planifiée",
      };
    }

    if (bankHoldStatus === "card_saved") {
      return {
        cls: "bg-blue/10 text-blue border-blue/30",
        label: "Carte enregistrée",
      };
    }

    if (bankHoldStatus === "authorization_pending") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Autorisation en attente",
      };
    }

    if (bankHoldStatus === "setup_pending") {
      return {
        cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
        label: "Carte en attente",
      };
    }

    if (bankHoldStatus === "failed") {
      return {
        cls: "bg-red/10 text-red border-red/20",
        label: "Échec",
      };
    }

    if (bankHoldStatus === "expired") {
      return {
        cls: "bg-red/10 text-red border-red/20",
        label: "Expirée",
      };
    }

    return {
      cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
      label: "Aucune",
    };
  }, [bankHoldStatus]);

  const canCaptureBankHold = bankHoldEnabled && bankHoldStatus === "authorized";
  const canReleaseBankHold = bankHoldEnabled && bankHoldStatus === "authorized";
  const tableLabel =
    getReservationTableLabel(reservation, tablesCatalog) || "-";

  useEffect(() => {
    if (!open) {
      setCustomerDetails(null);
      setCustomerLoading(false);
      setCustomerError("");
      return;
    }

    if (!restaurantId || !customerId) {
      setCustomerDetails(null);
      setCustomerLoading(false);
      setCustomerError("");
      return;
    }

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    let ignore = false;

    setCustomerDetails(null);
    setCustomerLoading(true);
    setCustomerError("");

    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/customers/${customerId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          params: {
            resaPage: 1,
            resaLimit: 6,
            giftPage: 1,
            giftLimit: 5,
            takeAwayPage: 1,
            takeAwayLimit: 5,
          },
        },
      )
      .then(({ data }) => {
        if (ignore) return;
        setCustomerDetails(data || null);
      })
      .catch((error) => {
        if (ignore) return;
        setCustomerDetails(null);
        setCustomerError(
          error?.response?.data?.message ||
            "Impossible de charger la fiche client.",
        );
      })
      .finally(() => {
        if (ignore) return;
        setCustomerLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [open, restaurantId, customerId]);

  const customerSummary = reservation?.customerSummary || null;
  const customerProfile = customerDetails?.customer || customerSummary || null;
  const customerStats = customerProfile?.stats || {};
  const currentReservationId = String(reservation?._id || "").trim();
  const now = new Date();
  const detailedCustomerReservations =
    customerDetails?.history?.reservations?.items || [];
  const summaryCustomerReservations = customerSummary?.lastReservations || [];
  const customerReservationsSource = customerDetails
    ? detailedCustomerReservations
    : summaryCustomerReservations;
  const customerReservations = customerReservationsSource
    .reduce(
      (acc, item) => {
        const itemId = String(item?._id || item?.reservationId || "").trim();
        const fallbackKey = [
          item?.reservationDate || "",
          item?.reservationTime || "",
          item?.numberOfGuests || "",
          item?.status || "",
        ].join("|");
        const key = itemId || fallbackKey;
        if (key && acc.seen.has(key)) return acc;
        if (key) acc.seen.add(key);
        acc.items.push(item);
        return acc;
      },
      { seen: new Set(), items: [] },
    )
    .items.filter((item) => {
      const itemId = String(item?._id || item?.reservationId || "").trim();
      if (currentReservationId && itemId === currentReservationId) {
        return false;
      }

      const itemDateTime = getReservationDateTime(item);
      if (itemDateTime && itemDateTime > now) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aDate = getReservationDateTime(a)?.getTime() || 0;
      const bDate = getReservationDateTime(b)?.getTime() || 0;
      return bDate - aDate;
    })
    .slice(0, 5);

  const statusUi = useMemo(
    () => ({
      cls: getReservationStatusClassName(status),
      label: getReservationStatusLabel(status),
    }),
    [status],
  );

  const primaryAction = useMemo(() => {
    if (status === "Pending")
      return { type: "confirm", label: t?.("buttons.confirm") || "Confirmer" };
    if (["Confirmed", "Active", "Late"].includes(status))
      return { type: "finish", label: t?.("buttons.finish") || "Terminer" };
    return null;
  }, [status, t]);

  if (!open) return null;

  // ✅ swipe thresholds (mobile)
  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  // ✅ swipe handlers (mobile drag zone only)
  const onPointerDown = (e) => {
    if (isTabletUp) return; // ✅ never swipe on tablet+
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
    const v = (dragStateRef.current.lastY - dragStateRef.current.startY) / dt; // px/ms

    if (dragY >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  // overlay opacity while dragging (mobile)
  const overlayOpacity = !isVisible
    ? 0
    : 1 * (1 - Math.min(1, dragY / DRAG_MAX_PX));

  return (
    <div className="fixed inset-0 z-[260]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          absolute z-[1]
          bg-white border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[520px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out will-change-transform
          ${
            isVisible
              ? "translate-y-0 tablet:translate-y-0 tablet:translate-x-0"
              : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"
          }
        `}
        style={
          isTabletUp
            ? undefined
            : {
                transform: isVisible
                  ? `translateY(${dragY}px)`
                  : "translateY(100%)",
                transition: dragStateRef.current.active
                  ? "none"
                  : "transform 240ms ease-out",
                willChange: "transform",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* ✅ Mobile drag zone */}
        <div
          className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="py-3 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pb-3 midTablet:py-3 border-b border-darkBlue/10 bg-white/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t?.("buttons.details", "Détails")} —{" "}
                {t?.("titles.main", "Réservations")}
              </p>

              <h3 className="text-base font-semibold text-darkBlue truncate">
                {getReservationCustomerName(reservation)}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-2">
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
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label={t?.("buttons.close", "Fermer")}
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="px-4 pt-4">
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
              {errorMessage}
            </div>
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 bg-lightGrey overflow-y-auto p-4 hide-scrollbar overscroll-contain">
          {/* Résumé */}
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <User className="size-4 mt-0.5 text-darkBlue/40" />
                <p className="text-sm font-semibold text-darkBlue truncate">
                  {getReservationCustomerName(reservation)}
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

                <button
                  type="button"
                  className="min-w-0 truncate hover:underline text-left"
                  title="Clique pour appeler"
                  onClick={() => {
                    if (!reservation?.customerPhone) return;
                    window.location.href = `tel:${String(
                      reservation?.customerPhone,
                    ).replace(/\s/g, "")}`;
                  }}
                >
                  {reservation?.customerPhone || "-"}
                </button>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <Mail className="size-4 mt-0.5 text-darkBlue/40" />

                <button
                  type="button"
                  className="min-w-0 truncate hover:underline text-left"
                  title="Clique pour envoyer un email"
                  onClick={() => {
                    if (!reservation?.customerEmail) return;
                    window.location.href = `mailto:${reservation?.customerEmail}`;
                  }}
                >
                  {reservation?.customerEmail || "-"}
                </button>
              </div>

              <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                <TableSvg className="size-4 mt-0.5 text-darkBlue/40 opacity-40" />
                <p className="min-w-0 truncate">{tableLabel}</p>
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

          {/* Fiche client */}
          <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-darkBlue/50">Fiche client</p>
              {customerLoading ? (
                <LoaderCircle className="size-4 animate-spin text-darkBlue/40" />
              ) : null}
            </div>

            {!customerId ? (
              <p className="mt-3 rounded-2xl border border-darkBlue/10 bg-white/50 px-3 py-3 text-sm text-darkBlue/60">
                Aucune fiche client liée à cette réservation.
              </p>
            ) : customerError ? (
              <p className="mt-3 rounded-2xl border border-red/20 bg-red/10 px-3 py-3 text-sm text-red">
                {customerError}
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(customerProfile?.tags || []).length ? (
                    customerProfile.tags.map((tagKey) => (
                      <CustomerTagPill
                        key={`${customerId}-reservation-drawer-tag-${tagKey}`}
                        tagKey={tagKey}
                      />
                    ))
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-darkBlue/10 bg-white/60 px-3 py-1 text-xs font-semibold text-darkBlue/60">
                      Aucun tag
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-darkBlue/10 bg-white/50 p-3">
                    <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                      <Calendar className="size-3.5 text-darkBlue/40" />
                      Réservations
                    </p>
                    <p className="mt-1 text-lg font-semibold text-darkBlue">
                      {customerStats.reservationsTotal || 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-darkBlue/10 bg-white/50 p-3">
                    <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                      <Ticket className="size-3.5 text-darkBlue/40" />
                      Annulations
                    </p>
                    <p className="mt-1 text-lg font-semibold text-darkBlue">
                      {customerStats.reservationsCanceled || 0}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-darkBlue/10 bg-white/50 px-3 py-3">
                  <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                    <StickyNote className="size-3.5 text-darkBlue/40" />
                    Note client
                  </p>
                  <p className="mt-1 text-sm text-darkBlue/80 whitespace-pre-wrap">
                    {String(customerProfile?.notes || "").trim() || "—"}
                  </p>
                </div>

                <div className="mt-3 rounded-2xl border border-darkBlue/10 bg-white/50 px-3 py-3">
                  <p className="text-[11px] text-darkBlue/50">
                    Dernières réservations
                  </p>

                  {customerLoading && !customerReservations.length ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-darkBlue/55">
                      <LoaderCircle className="size-4 animate-spin text-darkBlue/40" />
                      Chargement des dernières réservations…
                    </div>
                  ) : customerReservations.length ? (
                    <div className="mt-2 flex flex-col gap-2">
                      {customerReservations.map((item, index) => (
                        <div
                          key={`${customerId}-last-reservation-${
                            item?._id || item?.reservationId || index
                          }`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-darkBlue/10 bg-white/60 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-darkBlue">
                              {fmtDate(item?.reservationDate)} ·{" "}
                              {fmtTime(item?.reservationTime)}
                            </p>
                            <p className="text-[11px] text-darkBlue/50">
                              {getReservationStatusLabel(item?.status)}
                            </p>
                          </div>

                          <span className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white px-2 py-1 text-[11px] font-semibold text-darkBlue/70">
                            <Users className="size-3 text-darkBlue/40" />
                            {item?.numberOfGuests || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-darkBlue/55">
                      Aucune réservation passée récente.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Empreinte bancaire */}
          {bankHoldEnabled ? (
            <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setBankHoldOpen((prev) => !prev)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <p className="text-xs text-darkBlue/50">Empreinte bancaire</p>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${bankHoldStatusUi.cls}`}
                  >
                    {bankHoldStatusUi.label}
                  </span>
                </div>

                <ChevronDown
                  className={`size-4 text-darkBlue/50 transition-transform ${
                    bankHoldOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {bankHoldOpen ? (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-1 gap-2 text-sm text-darkBlue/80">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Montant</span>
                      <span className="font-medium text-darkBlue">
                        {formatCurrency(
                          bankHold?.amountTotal || 0,
                          bankHold?.currency || "eur",
                        )}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Autorisée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.authorizedAt)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Capturée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.capturedAt)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-darkBlue/50">Libérée le</span>
                      <span className="font-medium text-darkBlue text-right">
                        {fmtDateTime(bankHold?.releasedAt)}
                      </span>
                    </div>

                    {bankHold?.lastError ? (
                      <div className="mt-2 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-xs text-red">
                        {bankHold.lastError}
                      </div>
                    ) : null}
                  </div>

                  {canCaptureBankHold || canReleaseBankHold ? (
                    <div className="mt-4 flex gap-2">
                      {canCaptureBankHold ? (
                        <button
                          onClick={() =>
                            onAction?.(reservation, "capture_bank_hold")
                          }
                          className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                        >
                          Capturer
                        </button>
                      ) : null}

                      {canReleaseBankHold ? (
                        <button
                          onClick={() =>
                            onAction?.(reservation, "release_bank_hold")
                          }
                          className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                        >
                          Libérer
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">
              {t?.("labels.actions", "Actions")}
            </p>

            <div className="flex gap-2">
              {primaryAction ? (
                <button
                  onClick={() => onAction?.(reservation, primaryAction.type)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                >
                  {primaryAction.label}
                </button>
              ) : null}

              {status !== "Canceled" &&
              status !== "Finished" &&
              status !== "Rejected" ? (
                <button
                  onClick={() => onAction?.(reservation, "edit")}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue"
                >
                  {t?.("buttons.edit", "Modifier")}
                </button>
              ) : null}

              {["Canceled", "Rejected"].includes(status) ? (
                <>
                  <button
                    onClick={() => onAction?.(reservation, "restore_confirmed")}
                    className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                  >
                    Repasser en &quot;Confirmée&quot;
                  </button>

                  <button
                    onClick={() => onAction?.(reservation, "delete")}
                    className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                  >
                    Supprimer
                  </button>
                </>
              ) : status === "Finished" ? (
                <button
                  onClick={() => onAction?.(reservation, "delete")}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                >
                  Supprimer
                </button>
              ) : (
                <button
                  onClick={() =>
                    onAction?.(
                      reservation,
                      status === "Pending" ? "reject" : "cancel",
                    )
                  }
                  className="w-full inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
                >
                  {status === "Pending" ? "Refuser" : "Annuler"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer mobile */}
        <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <button
            onClick={closeWithAnimation}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            {t?.("buttons.back", "Retour")}
          </button>
        </div>
      </div>
    </div>
  );
}
