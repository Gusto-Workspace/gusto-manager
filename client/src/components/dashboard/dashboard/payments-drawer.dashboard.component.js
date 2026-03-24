import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Calendar,
  User,
  CreditCard,
  Gift,
  Mail,
  Phone,
  Users,
  Clock,
  CheckCircle2,
  ExternalLink,
  ReceiptText,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { TableSvg, CommentarySvg } from "@/components/_shared/_svgs/_index";

const CLOSE_MS = 280;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

function parseDateLike(value) {
  if (!value && value !== 0) return null;

  if (typeof value === "number") {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDateLike(value);
  return date ? date.toLocaleDateString("fr-FR") : "-";
}

function formatDateTime(value) {
  const date = parseDateLike(value);
  return date
    ? date.toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";
}

function formatReservationTime(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 5).replace(":", "h") : "-";
}

function formatCurrency(amount, currency = "eur") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "eur").toUpperCase(),
  }).format(Number(amount || 0));
}

function getTransactionTypeUi(transaction, t) {
  if (transaction?.type === "gift_card_purchase") {
    return {
      icon: Gift,
      label: t("payments.types.giftCardPurchase", "Achat carte cadeau"),
      cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B66]",
    };
  }

  return {
    icon: CreditCard,
    label: t("payments.types.bankHoldCapture", "Empreinte bancaire capturée"),
    cls: "bg-blue/10 text-blue border-blue/30",
  };
}

function getPaymentStatusUi(transaction, t) {
  if (transaction?.refunded) {
    return {
      label: t("payments.refunded"),
      cls: "bg-[#3b82f61a] text-[#1d4ed8] border-none",
    };
  }

  switch (String(transaction?.status || "")) {
    case "succeeded":
      return {
        label: t("payments.status.succeeded"),
        cls: "bg-[#4ead7a1a] text-[#167a47] border-none",
      };
    case "pending":
      return {
        label: t("payments.status.pending"),
        cls: "bg-[#f973161a] text-[#c2410c] border-none",
      };
    case "failed":
      return {
        label: t("payments.status.failed"),
        cls: "bg-[#ef44441a] text-[#b91c1c] border-none",
      };
    case "canceled":
      return {
        label: t("payments.status.canceled"),
        cls: "bg-[#9ca3af1a] text-[#4b5563] border-none",
      };
    default:
      return {
        label: t("payments.status.unknown"),
        cls: "bg-darkBlue/5 text-darkBlue border border-darkBlue/10",
      };
  }
}

function getGiftCardStatusLabel(status, t) {
  switch (String(status || "")) {
    case "Valid":
      return t("payments.sourceStatus.gift.valid", "Valide");
    case "Used":
      return t("payments.sourceStatus.gift.used", "Utilisee");
    case "Expired":
      return t("payments.sourceStatus.gift.expired", "Expiree");
    case "Archived":
      return t("payments.sourceStatus.gift.archived", "Archivee");
    default:
      return status || "-";
  }
}

function getBankHoldStatusLabel(status, t) {
  switch (String(status || "")) {
    case "captured":
      return t("payments.sourceStatus.bankHold.captured", "Capturee");
    case "authorized":
      return t("payments.sourceStatus.bankHold.authorized", "Autorisee");
    case "released":
      return t("payments.sourceStatus.bankHold.released", "Liberee");
    default:
      return status || "-";
  }
}

function getReservationTableLabel(reservation) {
  const explicitName = String(reservation?.table?.name || "").trim();
  if (explicitName) return explicitName;

  const tableIds = Array.isArray(reservation?.table?.tableIds)
    ? reservation.table.tableIds
    : [];

  if (!tableIds.length) return "-";
  return tableIds.map((id) => String(id || "").trim()).join(" + ");
}

function DetailRow({ icon: Icon, label, value, mono = false }) {
  const display = value === 0 ? "0" : value || "-";

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-darkBlue/5 text-darkBlue">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue/45">
          {label}
        </p>
        <p
          className={`mt-1 break-words text-sm text-darkBlue ${
            mono ? "font-mono text-[13px]" : ""
          }`}
        >
          {display}
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-darkBlue/45">
        {title}
      </p>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

export default function PaymentsDrawerDashboardComponent({
  open,
  onClose,
  transaction,
  t,
  onRefund,
  refundLoading = false,
}) {
  const [isVisible, setIsVisible] = useState(false);

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
    const height = el.getBoundingClientRect().height || 0;
    if (height > 0) setPanelH(height);
  };

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
    window.addEventListener("resize", onResize);

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeWithAnimation();
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

  const statusUi = useMemo(
    () => getPaymentStatusUi(transaction, t),
    [transaction, t],
  );
  const typeUi = useMemo(
    () => getTransactionTypeUi(transaction, t),
    [transaction, t],
  );
  const TypeIcon = typeUi.icon;

  const canRefund =
    Boolean(transaction) &&
    !transaction?.refunded &&
    transaction?.status === "succeeded" &&
    !refundLoading;

  if (!open || !transaction) return null;

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

    const currentY = event.clientY;
    const deltaY = currentY - dragStateRef.current.startY;

    dragStateRef.current.lastY = currentY;
    dragStateRef.current.lastT = performance.now();

    setDragY(Math.max(0, Math.min(dragMaxPx, deltaY)));
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const deltaT = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / deltaT;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  const overlayOpacity = !isVisible
    ? 0
    : 1 * (1 - Math.min(1, dragY / dragMaxPx));

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      <div
        className={`
          absolute inset-0 bg-darkBlue/30 transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      <div
        ref={panelRef}
        className={`
          absolute z-[1] flex flex-col overflow-hidden
          bg-white border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh]
          rounded-t-3xl
          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[520px] tablet:max-h-[100vh]
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
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center py-3">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        <div className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/70 px-4 pb-3 midTablet:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t?.("payments.drawer.title", "Détail de la transaction")}
              </p>

              <h3 className="truncate text-base font-semibold text-darkBlue">
                {transaction?.customer ||
                  t?.("payments.customerFallback", "Non renseigné")}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${typeUi.cls}`}
                >
                  <TypeIcon className="size-3.5" />
                  {typeUi.label}
                </span>

                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusUi.cls}`}
                >
                  {statusUi.label}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                  <Calendar className="size-3.5 text-darkBlue/50" />
                  {formatDate(transaction?.date)}
                </span>
              </div>
            </div>

            <button
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5"
              aria-label={t?.("payments.drawer.close", "Fermer")}
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        <div className="hide-scrollbar flex-1 overflow-y-auto bg-lightGrey p-4 overscroll-contain">
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4 shadow-sm">
            <div className="flex flex-col gap-2 midTablet:flex-row midTablet:items-end midTablet:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-darkBlue/45">
                  {t?.("payments.drawer.summary", "Résumé")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-darkBlue">
                  {formatCurrency(
                    transaction.grossAmount,
                    transaction.currency,
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-darkBlue/5 px-3 py-1.5 text-xs font-medium text-darkBlue">
                  <Calendar className="size-4" />
                  {formatDateTime(transaction.date)}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-darkBlue/5 px-3 py-1.5 text-xs font-medium text-darkBlue">
                  <Wallet className="size-4" />
                  {formatCurrency(transaction.netAmount, transaction.currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <Section
              title={t?.("payments.drawer.sections.payment", "Paiement")}
            >
              <DetailRow
                icon={Calendar}
                label={t?.("payments.paymentDate", "Date du paiement")}
                value={formatDateTime(transaction.date)}
              />
              <DetailRow
                icon={ReceiptText}
                label={t?.("payments.grossAmount", "Montant payé")}
                value={formatCurrency(
                  transaction.grossAmount,
                  transaction.currency,
                )}
              />
              <DetailRow
                icon={Wallet}
                label={t?.("payments.netAmount", "Montant net")}
                value={formatCurrency(
                  transaction.netAmount,
                  transaction.currency,
                )}
              />
              <DetailRow
                icon={CreditCard}
                label={t?.("payments.fees", "Frais Stripe")}
                value={formatCurrency(
                  transaction.feeAmount,
                  transaction.currency,
                )}
              />
              {transaction?.refunded && transaction?.refundedAt ? (
                <DetailRow
                  icon={RotateCcw}
                  label={t?.("payments.refundedAtLabel", "Remboursé le")}
                  value={formatDateTime(transaction.refundedAt)}
                />
              ) : null}
            </Section>

            {transaction?.giftPurchase ? (
              <Section
                title={t?.("payments.drawer.sections.giftCard", "Carte cadeau")}
              >
                <DetailRow
                  icon={Gift}
                  label={t?.("payments.giftCode", "Code cadeau")}
                  value={transaction.giftPurchase.purchaseCode || "-"}
                  mono
                />
                <DetailRow
                  icon={Wallet}
                  label={t?.("payments.giftValue", "Valeur")}
                  value={formatCurrency(
                    transaction.giftPurchase.value,
                    transaction.currency,
                  )}
                />
                <DetailRow
                  icon={User}
                  label={t?.("payments.buyer", "Acheteur")}
                  value={
                    `${transaction.giftPurchase.buyerFirstName || ""} ${
                      transaction.giftPurchase.buyerLastName || ""
                    }`.trim() || "-"
                  }
                />
                <DetailRow
                  icon={Mail}
                  label={t?.("payments.email", "Email")}
                  value={transaction.giftPurchase.sendEmail || "-"}
                />
                <DetailRow
                  icon={Phone}
                  label={t?.("payments.phone", "Téléphone")}
                  value={transaction.giftPurchase.senderPhone || "-"}
                />
              </Section>
            ) : null}

            {transaction?.reservation ? (
              <Section
                title={t?.(
                  "payments.drawer.sections.reservation",
                  "Réservation",
                )}
              >
                <DetailRow
                  icon={Calendar}
                  label={t?.("payments.reservationDate", "Date réservation")}
                  value={formatDate(transaction.reservation.reservationDate)}
                />
                <DetailRow
                  icon={Clock}
                  label={t?.("payments.reservationTime", "Heure réservation")}
                  value={formatReservationTime(
                    transaction.reservation.reservationTime,
                  )}
                />
                <DetailRow
                  icon={Users}
                  label={t?.("payments.numberOfGuests", "Couverts")}
                  value={String(transaction.reservation.numberOfGuests || 0)}
                />
                <DetailRow
                  icon={User}
                  label={t?.("payments.customer", "Client")}
                  value={transaction.customer}
                />
                <DetailRow
                  icon={Mail}
                  label={t?.("payments.email", "Email")}
                  value={transaction.reservation.customerEmail || "-"}
                />
                <DetailRow
                  icon={Phone}
                  label={t?.("payments.phone", "Téléphone")}
                  value={transaction.reservation.customerPhone || "-"}
                />
              </Section>
            ) : null}

            {transaction?.bankHold ? (
              <Section
                title={t?.(
                  "payments.drawer.sections.bankHold",
                  "Empreinte bancaire",
                )}
              >
                <DetailRow
                  icon={CreditCard}
                  label={t?.("payments.bankHoldAmount", "Montant capturé")}
                  value={formatCurrency(
                    transaction.bankHold.amountTotal,
                    transaction.bankHold.currency || transaction.currency,
                  )}
                />

                <DetailRow
                  icon={Calendar}
                  label={t?.("payments.capturedAt", "Capturée le")}
                  value={formatDateTime(transaction.date)}
                />
              </Section>
            ) : null}
          </div>
        </div>

        <div className="border-t border-darkBlue/10 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {transaction?.refunded ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/15 bg-darkBlue/5 px-4 py-2 text-sm font-medium text-darkBlue">
                <CheckCircle2 className="size-4 text-[#1d4ed8]" />
                {t?.("payments.refunded", "Remboursé")}
              </span>
            ) : null}

            {canRefund ? (
              <button
                type="button"
                onClick={() => onRefund?.(transaction)}
                disabled={refundLoading}
                className="
                  inline-flex items-center justify-center gap-2 rounded-full
                  bg-red px-4 py-2 text-sm font-medium text-white
                  shadow-sm transition-all duration-150
                  hover:shadow-md hover:opacity-95
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              >
                {refundLoading ? (
                  t?.("payments.refunding", "Remboursement...")
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    {t?.("payments.refund", "Rembourser")}
                  </>
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={closeWithAnimation}
              className="
                inline-flex items-center justify-center gap-2 rounded-full
                bg-darkBlue/5 px-4 py-2 text-sm font-medium text-darkBlue
                border border-darkBlue/15 hover:bg-darkBlue/8
              "
            >
              {t?.("payments.drawer.close", "Fermer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
