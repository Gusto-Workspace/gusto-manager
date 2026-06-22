import { useEffect, useState } from "react";
import { Clock, CreditCard, Mail, MapPin, Phone, X } from "lucide-react";

import {
  NEXT_STATUS,
  STATUS_LABELS,
  formatTime,
  getStatusTone,
  toMoney,
} from "./take-away.utils";

const CLOSE_MS = 220;

export default function TakeAwayOrderDrawerComponent({
  open,
  order,
  onClose,
  onAction,
  loading,
  errorMessage,
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsVisible(false);
      return;
    }
    const id = window.setTimeout(() => setIsVisible(true), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open || !order) return null;

  function closeWithAnimation() {
    setIsVisible(false);
    window.setTimeout(() => onClose?.(), CLOSE_MS);
  }

  function runAction(status) {
    const needsConfirm = ["canceled", "rejected", "completed"].includes(status);
    if (needsConfirm) {
      const ok = window.confirm(
        `Confirmer le passage de la commande en statut "${STATUS_LABELS[status]}" ?`,
      );
      if (!ok) return;
    }
    onAction?.(order, status);
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        className={`absolute inset-0 bg-darkBlue/30 transition-opacity ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeWithAnimation}
        aria-label="Fermer"
      />
      <aside
        className={`absolute inset-x-0 bottom-0 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-lightGrey shadow-2xl transition-transform duration-200 midTablet:inset-y-0 midTablet:left-auto midTablet:right-0 midTablet:max-h-none midTablet:max-w-[480px] midTablet:rounded-none ${
          isVisible
            ? "translate-y-0 midTablet:translate-x-0"
            : "translate-y-full midTablet:translate-x-full midTablet:translate-y-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-darkBlue/10 bg-white p-5">
          <div>
            <p className="text-xs font-semibold text-darkBlue/45">
              {order.orderNumber}
            </p>
            <h2 className="text-xl font-semibold text-darkBlue">
              {[order.customerFirstName, order.customerLastName]
                .filter(Boolean)
                .join(" ")}
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5"
            aria-label="Fermer"
            title="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-lightGrey p-5">
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
              {errorMessage}
            </div>
          ) : null}

          <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
              Informations client
            </p>
            <div className="mt-3 grid gap-2 text-sm text-darkBlue/70">
              <a
                href={
                  order.customerPhone ? `tel:${order.customerPhone}` : undefined
                }
                className="inline-flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2"
              >
                <Phone className="size-4 text-darkBlue/45" />
                <span>{order.customerPhone || "Téléphone non renseigné"}</span>
              </a>
              <a
                href={
                  order.customerEmail
                    ? `mailto:${order.customerEmail}`
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2"
              >
                <Mail className="size-4 text-darkBlue/45" />
                <span>{order.customerEmail || "Email non renseigné"}</span>
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
              Organisation
            </p>
            <div className="mt-3 grid gap-2 text-sm text-darkBlue/70">
              <div className="inline-flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                <Clock className="size-4 text-darkBlue/45" />
                <span>{formatTime(order.scheduledFor)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                <MapPin className="size-4 text-darkBlue/45" />
                <span>
                  {order.fulfillmentMode === "delivery"
                    ? "Livraison"
                    : "Retrait"}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-lightGrey px-3 py-2">
                <CreditCard className="size-4 text-darkBlue/45" />
                <span>
                  {order.paymentStatus === "paid"
                    ? "Payée"
                    : order.paymentStatus === "pending"
                      ? "Paiement en attente"
                      : "Paiement sur place/livraison"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
              Commande
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {(order.items || []).map((item, index) => (
                <div
                  key={`${item.catalogItemId}-${index}`}
                  className="flex justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-darkBlue">
                      {item.quantity}x {item.name}
                    </p>
                    <p className="text-xs text-darkBlue/45">
                      {toMoney(item.unitPrice)} / unité
                    </p>
                  </div>
                  <span className="text-sm font-bold text-darkBlue">
                    {toMoney(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-darkBlue/10 pt-3 text-sm">
              <div className="flex justify-between text-darkBlue/65">
                <span>Sous-total</span>
                <span>{toMoney(order.subtotal)}</span>
              </div>
              {order.fulfillmentMode === "delivery" ? (
                <div className="mt-2 flex justify-between text-darkBlue/65">
                  <span>Frais de livraison</span>
                  <span>{toMoney(order.deliveryFee)}</span>
                </div>
              ) : null}
              <div className="mt-3 flex justify-between text-base font-bold text-darkBlue">
                <span>Total</span>
                <span>{toMoney(order.total)}</span>
              </div>
            </div>
          </div>

          {order.fulfillmentMode === "delivery" ? (
            <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                Livraison
              </p>
              <div className="mt-2 text-sm text-darkBlue/70">
                <p>{order.deliveryAddress?.line1}</p>
                <p>{order.deliveryAddress?.line2}</p>
                <p>
                  {order.deliveryAddress?.zipCode} {order.deliveryAddress?.city}
                </p>
                {order.deliveryAddress?.instructions ? (
                  <p className="mt-2 italic">
                    {order.deliveryAddress.instructions}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
              Actions
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(NEXT_STATUS[order.status] || []).map((status, index) => (
                <button
                  key={status}
                  type="button"
                  disabled={loading}
                  onClick={() => runAction(status)}
                  className={`inline-flex h-10 items-center rounded-xl px-3 text-xs font-semibold transition disabled:opacity-50 ${
                    index === 0
                      ? "bg-blue text-white hover:bg-blue/90"
                      : "border border-darkBlue/10 bg-white text-darkBlue hover:bg-darkBlue/5"
                  }`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
