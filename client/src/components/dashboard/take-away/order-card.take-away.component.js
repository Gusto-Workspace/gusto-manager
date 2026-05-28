import { Clock, ExternalLink, MapPin, ShoppingBag } from "lucide-react";

import {
  STATUS_LABELS,
  formatTime,
  getStatusTone,
  toMoney,
} from "./take-away.utils";

export default function TakeAwayOrderCardComponent({ order, onOpenDetails }) {
  const itemCount = (order.items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );

  return (
    <li className="w-full">
      <div className="w-full rounded-2xl border border-darkBlue/10 bg-white/70 p-3 text-left shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-darkBlue">
                  {[order.customerFirstName, order.customerLastName]
                    .filter(Boolean)
                    .join(" ") || order.orderNumber}
                </p>
                <p className="text-xs font-semibold text-darkBlue/45">
                  {order.orderNumber}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(
                  order.status,
                )}`}
              >
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80">
                  <Clock className="size-3.5 opacity-50" />
                  {formatTime(order.scheduledFor)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80">
                  <ShoppingBag className="size-3.5 opacity-50" />
                  {itemCount} article{itemCount > 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80">
                  <MapPin className="size-3.5 opacity-50" />
                  {order.fulfillmentMode === "delivery"
                    ? "Livraison"
                    : "Retrait"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-darkBlue">
                  {toMoney(order.total)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenDetails(order)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white p-2 text-xs font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                  aria-label="Détails"
                  title="Détails"
                >
                  <ExternalLink className="size-4 text-darkBlue/60" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
