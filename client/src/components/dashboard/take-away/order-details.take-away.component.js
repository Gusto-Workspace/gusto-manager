import { CircleMinus } from "lucide-react";
import {
  getOrderDetailsPresentation,
  REFUND_LABELS,
} from "./order-details.take-away.utils";

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const formatMoney = (value) => money.format(Number(value || 0));

export default function OrderDetailsTakeAway({ order }) {
  const {
    rows,
    originalCents,
    remainingCents,
    adjusted,
    canceled,
    refundedCents,
    productRefundedCents,
    deliveryRefundedCents,
    unallocatedRefundedCents,
    pendingRefunds,
  } = getOrderDetailsPresentation(order);
  const online = order.paymentMethod === "online";
  const delivery = order.fulfillmentMode === "delivery";

  return (
    <section className="overflow-hidden rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm">
      <div className="border-b border-darkBlue/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-darkBlue">
          Détail des produits
        </h3>
        <p className="mt-1 text-xs text-darkBlue/60">
          {adjusted
            ? "Quantités commandées et conservées après ajustement"
            : "Produits et personnalisations commandés"}
        </p>
      </div>

      <ul className="divide-y divide-darkBlue/10 px-4">
        {rows.map(
          ({ item, id, quantity, refused, retained, unitPrice, refunds }) => (
            <li key={id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-semibold leading-6 text-darkBlue [overflow-wrap:anywhere]">
                    {item.name}
                  </h4>
                  {refused > 0 ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-red/20 bg-red/10 px-2 py-0.5 text-[11px] font-semibold text-[#9F3528]">
                      <CircleMinus
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      {canceled
                        ? "Annulé"
                        : retained === 0
                          ? "Refusé"
                          : "Refus partiel"}
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-[11px] text-darkBlue/60">
                    {adjusted ? "Montant conservé" : "Montant"}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-darkBlue">
                    {formatMoney(retained * unitPrice)}
                  </p>
                  {refused > 0 ? (
                    <p className="mt-1 text-[11px] text-darkBlue/60">
                      Initial :{" "}
                      {formatMoney(item.lineTotal ?? quantity * unitPrice)}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="mt-2 text-xs leading-5 text-darkBlue/65">
                Prix unitaire{" "}
                <span className="whitespace-nowrap font-medium tabular-nums text-darkBlue">
                  {formatMoney(unitPrice)}
                </span>
                {item.optionsTotal > 0 ? " · options incluses" : ""}
              </p>

              {item.options?.length ? (
                <div className="mt-2 rounded-lg bg-lightGrey/70 px-3 py-2">
                  <p className="text-[11px] font-semibold text-darkBlue/60">
                    Options par unité
                  </p>
                  <ul className="mt-1 space-y-1">
                    {item.options.map((option, optionIndex) => (
                      <li
                        key={`${option.name}-${optionIndex}`}
                        className="flex items-baseline justify-between gap-3 text-xs leading-5 text-darkBlue/75"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {option.name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">
                          {Number(option.price) > 0
                            ? `+ ${formatMoney(option.price)}`
                            : "Inclus"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {item.note ? (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-darkBlue/70 [overflow-wrap:anywhere]">
                  <span className="font-semibold">Personnalisation : </span>
                  {item.note}
                </p>
              ) : null}

              {adjusted ? (
                <dl className="mt-3 grid grid-cols-3 divide-x divide-darkBlue/10 rounded-xl border border-darkBlue/10 bg-white py-2 text-center">
                  <div className="px-1">
                    <dt className="text-[11px] text-darkBlue/60">Commandés</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-darkBlue">
                      {quantity}
                    </dd>
                  </div>
                  <div className="px-1">
                    <dt className="text-[11px] text-darkBlue/60">Conservés</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-darkBlue">
                      {retained}
                    </dd>
                  </div>
                  <div className="px-1">
                    <dt className="text-[11px] text-darkBlue/60">
                      {canceled ? "Annulés" : "Refusés"}
                    </dt>
                    <dd
                      className={`mt-0.5 text-sm font-semibold tabular-nums ${refused > 0 ? "text-[#9F3528]" : "text-darkBlue/60"}`}
                    >
                      {refused}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-darkBlue/65">
                  Quantité commandée :{" "}
                  <span className="font-semibold tabular-nums text-darkBlue">
                    {quantity}
                  </span>
                </p>
              )}
              {refunds.length ? (
                <dl className="mt-3 space-y-2 rounded-xl border border-blue/15 bg-blue/5 px-3 py-2 text-xs">
                  {refunds.map((refund) => (
                    <div
                      key={refund.state}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="min-w-0 leading-5 text-darkBlue/75">
                        <span className="font-semibold">
                          {REFUND_LABELS[refund.state]}
                        </span>
                        <span className="block text-[11px] text-darkBlue/60">
                          {refund.quantity}{" "}
                          {refund.quantity > 1 ? "unités" : "unité"}
                        </span>
                      </dt>
                      <dd className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-darkBlue">
                        {formatMoney(refund.amountCents / 100)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ),
        )}
      </ul>

      <div className="border-t border-darkBlue/10 bg-lightGrey/60 p-4">
        <h3 className="text-xs font-semibold text-darkBlue">Récapitulatif</h3>
        <dl className="mt-3 space-y-2 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3 text-darkBlue/65">
            <dt>
              {adjusted
                ? "Sous-total initial des produits"
                : "Sous-total des produits"}
            </dt>
            <dd className="shrink-0 whitespace-nowrap">
              {formatMoney(order.subtotal)}
            </dd>
          </div>
          {delivery ? (
            <div className="flex items-baseline justify-between gap-3 text-darkBlue/65">
              <dt>{adjusted ? "Livraison initiale" : "Livraison"}</dt>
              <dd className="shrink-0 whitespace-nowrap">
                {formatMoney(order.deliveryFee)}
              </dd>
            </div>
          ) : null}
          {adjusted ? (
            <>
              <div className="flex items-baseline justify-between gap-3 font-medium text-darkBlue">
                <dt>Total initial</dt>
                <dd className="shrink-0 whitespace-nowrap">
                  {formatMoney(order.total)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-darkBlue/65">
                <dt>Ajustement de commande</dt>
                <dd className="shrink-0 whitespace-nowrap">
                  − {formatMoney((originalCents - remainingCents) / 100)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex items-baseline justify-between gap-3 border-t border-darkBlue/10 pt-3 text-base font-bold text-darkBlue">
            <dt>
              {online
                ? adjusted
                  ? "Montant conservé"
                  : "Total de la commande"
                : delivery
                  ? "À régler à la livraison"
                  : "À régler au retrait"}
            </dt>
            <dd className="shrink-0 whitespace-nowrap">
              {formatMoney(remainingCents / 100)}
            </dd>
          </div>
        </dl>
        {online && (refundedCents > 0 || pendingRefunds.length > 0) ? (
          <div className="mt-4 rounded-xl border border-blue/15 bg-blue/5 p-3">
            <h4 className="text-xs font-semibold text-darkBlue">
              Remboursements en ligne
            </h4>
            <dl className="mt-2 space-y-2 text-xs tabular-nums text-darkBlue/75">
              {productRefundedCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Produits remboursés</dt>
                  <dd className="shrink-0 whitespace-nowrap">
                    {formatMoney(productRefundedCents / 100)}
                  </dd>
                </div>
              ) : null}
              {deliveryRefundedCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Livraison remboursée</dt>
                  <dd className="shrink-0 whitespace-nowrap">
                    {formatMoney(deliveryRefundedCents / 100)}
                  </dd>
                </div>
              ) : null}
              {unallocatedRefundedCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Remboursement sans détail par produit</dt>
                  <dd className="shrink-0 whitespace-nowrap">
                    {formatMoney(unallocatedRefundedCents / 100)}
                  </dd>
                </div>
              ) : null}
              {refundedCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3 border-t border-blue/15 pt-2 font-semibold text-darkBlue">
                  <dt>
                    {refundedCents === originalCents
                      ? "Remboursement intégral confirmé"
                      : "Remboursement partiel confirmé"}
                  </dt>
                  <dd className="shrink-0 whitespace-nowrap">
                    {formatMoney(refundedCents / 100)}
                  </dd>
                </div>
              ) : null}
              {pendingRefunds.map((refund) => (
                <div
                  key={refund.state}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt>{REFUND_LABELS[refund.state]}</dt>
                  <dd className="shrink-0 whitespace-nowrap">
                    {formatMoney(refund.amountCents / 100)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
