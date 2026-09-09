import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  StickyNote,
  User,
  X,
} from "lucide-react";

import {
  NEXT_STATUS,
  STATUS_LABELS,
  formatTime,
  getStatusTone,
  toMoney,
} from "../../take-away/take-away.utils";
import useMobileDrawerSwipe from "@/components/_shared/use-mobile-drawer-swipe";
import ConfirmModalTakeAwayWebapp from "./confirm-modal.take-away.webapp";

const CLOSE_MS = 280;

const ACTION_LABELS = {
  confirmed: "Confirmer",
  preparing: "En préparation",
  ready: "Commande prête",
  out_for_delivery: "En livraison",
  completed: "Terminer",
  canceled: "Annuler",
  rejected: "Refuser",
};

function formatDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getPaymentSummary(order) {
  if (order.paymentStatus === "refunded") return "Payée en ligne · remboursée";
  if (order.paymentStatus === "paid") return "Payée en ligne";
  if (order.paymentMethod === "online") return "Paiement en ligne en attente";
  return "Paiement sur place ou à la livraison";
}

export default function TakeAwayOrderDrawerWebapp({
  open,
  order,
  onClose,
  onAction,
  processing,
  errorMessage,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const {
    panelRef,
    measurePanel,
    resetDrag,
    getOverlayOpacity,
    getPanelStyle,
    dragHandleProps,
  } = useMobileDrawerSwipe(closeWithAnimation);

  useEffect(() => {
    if (!open) {
      setIsVisible(false);
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    setIsVisible(false);
    setPendingAction("");
    resetDrag();

    const frame = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });
    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !order) return null;

  const availableActions = (NEXT_STATUS[order.status] || []).filter(
    (status) =>
      status !== "out_for_delivery" || order.fulfillmentMode === "delivery",
  );
  const paidTerminalOrder =
    order.paymentMethod === "online" &&
    order.paymentStatus === "paid" &&
    ["canceled", "rejected"].includes(order.status);
  const refundFailed =
    paidTerminalOrder && order.stripeRefundStatus === "failed";
  const refundPending =
    paidTerminalOrder && order.stripeRefundStatus !== "failed";

  function closeWithAnimation() {
    setIsVisible(false);
    setPendingAction("");
    resetDrag();
    window.setTimeout(() => onClose?.(), CLOSE_MS);
  }

  function runAction(status) {
    setPendingAction(status);
  }

  async function confirmPendingAction() {
    if (!pendingAction || processing) return;
    const targetStatus =
      pendingAction === "retry_refund" ? order.status : pendingAction;
    const succeeded = await onAction?.(order, targetStatus);
    if (succeeded !== false) setPendingAction("");
  }

  return (
    <>
      <div className="fixed inset-0 z-[260]" role="dialog" aria-modal="true">
        <div
          onClick={closeWithAnimation}
          className={`absolute inset-0 bg-darkBlue/30 transition-opacity duration-200 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: getOverlayOpacity(isVisible) }}
        />

        <aside
          ref={panelRef}
          className={`absolute inset-x-0 bottom-0 z-[1] flex min-h-[40vh] max-h-[86vh] w-full flex-col overflow-hidden rounded-t-3xl border border-darkBlue/10 bg-white shadow-[0_25px_80px_rgba(19,30,54,0.25)] transition-transform duration-300 ease-out will-change-transform midTablet:inset-y-0 midTablet:left-auto midTablet:right-0 midTablet:h-full midTablet:max-h-[100vh] midTablet:w-[520px] midTablet:rounded-none ${
            isVisible
              ? "translate-y-0 midTablet:translate-x-0"
              : "translate-y-full midTablet:translate-x-full midTablet:translate-y-0"
          }`}
          style={getPanelStyle(isVisible)}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="cursor-grab touch-none bg-white active:cursor-grabbing midTablet:hidden"
            {...dragHandleProps}
          >
            <div className="flex justify-center py-3">
              <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
            </div>
          </div>

          <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-darkBlue/10 bg-white/70 px-4 pb-3 midTablet:py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-darkBlue/45">
                {order.orderNumber}
              </p>
              <h2 className="truncate text-xl font-semibold text-darkBlue">
                {[order.customerFirstName, order.customerLastName]
                  .filter(Boolean)
                  .join(" ") || "Client"}
              </h2>
              <span
                className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(
                  order.status,
                )}`}
              >
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            <button
              type="button"
              onClick={closeWithAnimation}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue/70 transition canHover:hover:bg-darkBlue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 active:scale-[0.98]"
              aria-label="Fermer"
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </header>

          <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain bg-lightGrey p-4">
            {errorMessage ? (
              <div
                role="alert"
                className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red"
              >
                {errorMessage}
              </div>
            ) : null}

            <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                Organisation
              </p>
              <div className="mt-3 grid gap-2 text-sm text-darkBlue/75">
                <p className="flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                  <Clock className="size-4 shrink-0 text-darkBlue/45" />
                  <span>
                    {formatDate(order.scheduledFor)} à{" "}
                    {formatTime(order.scheduledFor)}
                  </span>
                </p>
                <p className="flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                  <MapPin className="size-4 shrink-0 text-darkBlue/45" />
                  <span>
                    {order.fulfillmentMode === "delivery"
                      ? "Livraison"
                      : "Retrait"}
                  </span>
                </p>
                <p className="flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                  <CreditCard className="size-4 shrink-0 text-darkBlue/45" />
                  <span>{getPaymentSummary(order)}</span>
                </p>
              </div>

              {refundFailed ? (
                <div
                  role="alert"
                  className="mt-3 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red"
                >
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 shrink-0" />
                    Le remboursement Stripe a échoué.
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    La décision métier est conservée. Vérifiez Stripe puis
                    relancez le remboursement.
                  </p>
                  <button
                    type="button"
                    onClick={() => runAction("retry_refund")}
                    disabled={processing}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-red/20 bg-white px-3 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <RotateCcw className="size-4" />
                    Réessayer le remboursement
                  </button>
                </div>
              ) : refundPending ? (
                <div className="mt-3 rounded-2xl border border-blue/20 bg-blue/10 px-4 py-3 text-xs font-semibold text-blue">
                  Remboursement Stripe en cours de confirmation.
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                Client
              </p>
              <div className="mt-3 grid gap-2 text-sm text-darkBlue/75">
                <div className="flex min-h-11 items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                  <User className="size-4 shrink-0 text-darkBlue/45" />
                  <span className="min-w-0 truncate font-semibold text-darkBlue">
                    {[order.customerFirstName, order.customerLastName]
                      .filter(Boolean)
                      .join(" ") || "Nom non renseigné"}
                  </span>
                </div>
                <a
                  href={
                    order.customerPhone
                      ? `tel:${order.customerPhone}`
                      : undefined
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-lightGrey px-3 py-2"
                >
                  <Phone className="size-4 shrink-0 text-darkBlue/45" />
                  <span className="break-all">
                    {order.customerPhone || "Téléphone non renseigné"}
                  </span>
                </a>
                <a
                  href={
                    order.customerEmail
                      ? `mailto:${order.customerEmail}`
                      : undefined
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-lightGrey px-3 py-2"
                >
                  <Mail className="size-4 shrink-0 text-darkBlue/45" />
                  <span className="break-all">
                    {order.customerEmail || "Email non renseigné"}
                  </span>
                </a>
              </div>
            </section>

            {order.fulfillmentMode === "delivery" ? (
              <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                  Adresse de livraison
                </p>
                <div className="mt-3 text-sm leading-6 text-darkBlue/75">
                  <p>
                    {order.deliveryAddress?.line1 || "Adresse non renseignée"}
                  </p>
                  {order.deliveryAddress?.line2 ? (
                    <p>{order.deliveryAddress.line2}</p>
                  ) : null}
                  <p>
                    {order.deliveryAddress?.zipCode}{" "}
                    {order.deliveryAddress?.city}
                  </p>
                  {order.deliveryAddress?.instructions ? (
                    <p className="mt-2 rounded-xl bg-lightGrey px-3 py-2 italic">
                      {order.deliveryAddress.instructions}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                Commande
              </p>
              <div className="mt-3 space-y-3">
                {(order.items || []).map((item, index) => (
                  <div
                    key={`${item.catalogItemId}-${index}`}
                    className="border-b border-darkBlue/10 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-darkBlue">
                          {item.quantity}× {item.name}
                        </p>
                        {(item.options || []).map((option) => (
                          <p
                            key={`${item.catalogItemId}-${option.name}`}
                            className="mt-1 text-xs text-darkBlue/55"
                          >
                            {option.name} · {toMoney(option.price)}
                          </p>
                        ))}
                        {item.note ? (
                          <p className="mt-2 text-xs italic text-darkBlue/60">
                            {item.note}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm font-bold text-darkBlue">
                        {toMoney(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-darkBlue/10 pt-3 text-sm">
                <p className="flex justify-between text-darkBlue/65">
                  <span>Sous-total</span>
                  <span>{toMoney(order.subtotal)}</span>
                </p>
                {order.fulfillmentMode === "delivery" ? (
                  <p className="mt-2 flex justify-between text-darkBlue/65">
                    <span>Frais de livraison</span>
                    <span>{toMoney(order.deliveryFee)}</span>
                  </p>
                ) : null}
                <p className="mt-3 flex justify-between text-base font-bold text-darkBlue">
                  <span>Total</span>
                  <span>{toMoney(order.total)}</span>
                </p>
              </div>
            </section>

            {order.customerNote || order.restaurantNote ? (
              <section className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                  <StickyNote className="size-4" />
                  Notes
                </p>
                {order.customerNote ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-darkBlue/45">
                      Client
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-darkBlue/75">
                      {order.customerNote}
                    </p>
                  </div>
                ) : null}
                {order.restaurantNote ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-darkBlue/45">
                      Interne
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-darkBlue/75">
                      {order.restaurantNote}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {availableActions.length ? (
            <footer className="shrink-0 border-t border-darkBlue/10 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(19,30,54,0.08)] mobile:px-5">
              <div className="grid grid-cols-2 gap-2">
                {availableActions.map((status, index) => {
                  const destructive = ["canceled", "rejected"].includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={processing}
                      onClick={() => runAction(status)}
                      className={`min-h-12 rounded-2xl px-3 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                        index === 0
                          ? "bg-blue text-white shadow-sm"
                          : destructive
                            ? "border border-red/20 bg-red/10 text-red"
                            : "border border-darkBlue/10 bg-white text-darkBlue"
                      }`}
                    >
                      {processing
                        ? "Traitement…"
                        : ACTION_LABELS[status] || STATUS_LABELS[status]}
                    </button>
                  );
                })}
              </div>
            </footer>
          ) : null}
        </aside>
      </div>

      <ConfirmModalTakeAwayWebapp
        open={Boolean(pendingAction)}
        order={order}
        status={pendingAction}
        processing={processing}
        error={errorMessage}
        onClose={() => setPendingAction("")}
        onConfirm={confirmPendingAction}
      />
    </>
  );
}
