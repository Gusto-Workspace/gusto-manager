import {
  AlertTriangle,
  CreditCard,
  ExternalLink,
  MapPin,
  ShoppingBag,
} from "lucide-react";

import { STATUS_LABELS, getStatusTone } from "./take-away.utils";

function getPaymentLabel(order) {
  if (order.paymentStatus === "refunded") return "Remboursée";
  if (order.paymentStatus === "paid") return "Payée";
  if (order.paymentMethod === "online") return "Paiement en attente";
  return "Sur place";
}

export default function TakeAwayOrderCardComponent({
  order,
  onOpenDetails,
  columnLayout = false,
}) {
  const itemCount = (order.items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const refundFailed =
    order.paymentMethod === "online" &&
    order.paymentStatus === "paid" &&
    ["canceled", "rejected"].includes(order.status) &&
    order.stripeRefundStatus === "failed";
  const customerName = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");
  const metaPill =
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80";

  return (
    <li className="w-full">
      <article className="relative rounded-2xl border border-darkBlue/10 bg-white/70 p-3 text-left shadow-sm transition-shadow canHover:hover:shadow-md active:bg-white">
        <div
          className={`flex min-w-0 flex-col gap-3 ${
            columnLayout
              ? ""
              : "midTablet:flex-row midTablet:items-center midTablet:gap-2"
          }`}
        >
          <div
            className={`flex min-w-0 items-center gap-2 ${
              columnLayout
                ? ""
                : "midTablet:min-w-[138px] midTablet:max-w-[220px] midTablet:shrink-0"
            }`}
          >
            <p className="min-w-0 flex-1 truncate font-semibold text-darkBlue">
              {customerName || "Client"}
            </p>

            <span
              className={`ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                columnLayout ? "" : "midTablet:hidden"
              } ${getStatusTone(order.status)}`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div
            className={`hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto ${
              columnLayout
                ? "pr-11"
                : "pr-11 midTablet:flex-1 midTablet:justify-end midTablet:pr-0"
            }`}
          >
            <span className={metaPill}>
              <MapPin className="size-3.5 opacity-50" />
              {order.fulfillmentMode === "delivery" ? "Livraison" : "Retrait"}
            </span>
            <span className={metaPill}>
              <ShoppingBag className="size-3.5 opacity-50" />
              {itemCount} article{itemCount > 1 ? "s" : ""}
            </span>
            <span className={metaPill}>
              <CreditCard className="size-3.5 opacity-50" />
              {getPaymentLabel(order)}
            </span>
            {refundFailed ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red/20 bg-red/10 px-2.5 py-1 text-[11px] font-semibold text-red">
                <AlertTriangle className="size-3.5" />
                Remboursement échoué
              </span>
            ) : null}
          </div>

          {!columnLayout ? (
            <span
              className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold midTablet:inline-flex ${getStatusTone(
                order.status,
              )}`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenDetails?.(order)}
            className={`absolute bottom-3 right-3 inline-flex shrink-0 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white p-2 text-xs font-semibold text-darkBlue transition canHover:hover:bg-darkBlue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 active:scale-[0.98] ${
              columnLayout ? "" : "midTablet:static"
            }`}
            aria-label="Ouvrir le détail de la commande"
          >
            <ExternalLink className="size-4 text-darkBlue/60" />
          </button>
        </div>
      </article>
    </li>
  );
}
