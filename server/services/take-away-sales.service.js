const TakeAwayOrder = require("../models/take-away-order.model");
const { DateTime } = require("luxon");
const {
  ZONE,
  MODULES,
  monthlySeries,
} = require("./transaction-financials.service");

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
];
const PAYMENT_STATUSES = ["not_required", "paid"];
const ON_SITE_NOTES = [
  "Activité à emporter = net des mouvements Stripe + montant des commandes au retrait enregistrées. Ce total ne constitue pas un montant encaissé.",
  "Au retrait : commandes actives (y compris en attente d'acceptation), datées à leur création en Europe/Paris ; montant restant après ajustement, sinon total historique, frais de livraison compris. Annulations, refus et remboursements exclus. L'encaissement au retrait n'est pas confirmé.",
  "Les commandes masquées par suppression logique restent incluses dans l’activité historique. Les commandes anciennement supprimées physiquement ne peuvent pas être reconstituées.",
];

async function readOnSiteOrders(restaurantId, period) {
  return TakeAwayOrder.find({
    restaurant_id: restaurantId,
    paymentMethod: "on_site",
    paymentStatus: { $in: PAYMENT_STATUSES },
    status: { $in: ACTIVE_STATUSES },
    // A Stripe-linked order belongs exclusively to the existing Stripe path.
    stripePaymentIntentId: { $in: ["", null] },
    createdAt: {
      $gte: new Date(period.start * 1000),
      $lt: new Date(period.end * 1000),
    },
  })
    .select(
      "paymentMethod paymentStatus status stripePaymentIntentId createdAt currency total remainingAmountCents",
    )
    .lean();
}

// Chart-only composition. On-site orders never become financial movements and
// must not enter transaction exports, receipts, fees or bank payout calculations.
function monthlyActivitySeries(rows, orders, period, modules = MODULES) {
  const series = monthlySeries(rows, period, modules);
  if (!modules.includes("take_away")) return series;
  const totals = new Map();
  const seen = new Set();
  for (const order of orders) {
    const id = String(order._id || "");
    if (
      !id ||
      seen.has(id) ||
      order.paymentMethod !== "on_site" ||
      !ACTIVE_STATUSES.includes(order.status) ||
      !PAYMENT_STATUSES.includes(order.paymentStatus) ||
      order.stripePaymentIntentId
    )
      continue;
    seen.add(id);
    const date =
      order.createdAt == null
        ? NaN
        : new Date(order.createdAt).getTime() / 1000;
    const amount = order.remainingAmountCents ?? Math.round(order.total * 100);
    const currency = String(order.currency || "eur").toLowerCase();
    if (
      !Number.isFinite(date) ||
      date < period.start ||
      date >= period.end ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      !/^[a-z]{3}$/.test(currency)
    )
      continue;
    const monthKey = DateTime.fromSeconds(date, { zone: ZONE }).toFormat(
      "yyyy-MM",
    );
    if (!totals.has(currency)) totals.set(currency, new Map());
    const months = totals.get(currency);
    months.set(monthKey, (months.get(monthKey) || 0) + amount);
  }

  const online = new Map(series.take_away.map((item) => [item.currency, item]));
  const currencies = [
    ...new Set([
      ...rows
        .filter((row) => row.module === "take_away")
        .map((row) => row.currency),
      ...totals.keys(),
    ]),
  ].sort();
  const emptyMonths = monthlySeries([], period, ["take_away"]).take_away[0]
    .monthlySales;
  series.take_away = (currencies.length ? currencies : ["eur"]).map(
    (currency) => ({
      currency,
      monthlySales: (online.get(currency)?.monthlySales || emptyMonths).map(
        (point) => {
          const onlineCents = Math.round(point.total * 100);
          const onSiteCents = totals.get(currency)?.get(point.monthKey) || 0;
          return {
            ...point,
            onlineNet: onlineCents / 100,
            onSiteOrders: onSiteCents / 100,
            total: (onlineCents + onSiteCents) / 100,
          };
        },
      ),
    }),
  );
  return series;
}

module.exports = { readOnSiteOrders, monthlyActivitySeries, ON_SITE_NOTES };
