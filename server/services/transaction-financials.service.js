const { DateTime } = require("luxon");
const GiftCardOrder = require("../models/gift-card-order.model");
const TakeAwayOrder = require("../models/take-away-order.model");

const ZONE = "Europe/Paris";
const MODULES = ["gift_card", "take_away"];
const MODULE_LABELS = {
  gift_card: "Cartes cadeaux",
  take_away: "Vente à emporter",
};
const TYPES = new Set([
  "charge",
  "payment",
  "refund",
  "payment_refund",
  "refund_failure",
  "payment_failure_refund",
  "payment_reversal",
  "adjustment",
  "stripe_fee",
  "stripe_fx_fee",
  "tax_fee",
]);
const NOTES = [
  "Source : mouvements de solde Stripe, datés en Europe/Paris. Calculs en centimes, par devise de règlement Stripe.",
  "Net = encaissements - remboursements + ajustements - frais. Les virements bancaires ne sont pas des ventes.",
  "Les opérations ambiguës et les frais de compte sans lien certain avec un module sont exclus. Les paiements sur place sans preuve Stripe sont exclus.",
];
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const idOf = (value) =>
  String(typeof value === "object" ? value?.id || "" : value || "");

function parsePeriod(from, to) {
  const parse = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return null;
    const date = DateTime.fromISO(value, { zone: ZONE });
    return date.isValid && date.toISODate() === value
      ? date.startOf("day")
      : null;
  };
  const start = parse(from);
  const lastDay = parse(to);
  if (!start || !lastDay || lastDay < start)
    throw fail("Choisissez une période valide.");
  if (lastDay.diff(start, "days").days > 1095)
    throw fail(
      "La période est limitée à trois ans. Exportez plusieurs périodes.",
    );
  return {
    from,
    to,
    start: Math.floor(start.toSeconds()),
    end: Math.floor(lastDay.plus({ days: 1 }).toSeconds()),
    zone: ZONE,
  };
}

function monthlyPeriod(now = new Date()) {
  const current = DateTime.fromJSDate(now, { zone: ZONE }).startOf("month");
  return parsePeriod(
    current.minus({ months: 5 }).toISODate(),
    DateTime.fromJSDate(now, { zone: ZONE }).toISODate(),
  );
}

function parseModules(value, defaultValue = []) {
  const modules =
    value == null
      ? defaultValue
      : Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [];
  if (!modules.length || modules.some((module) => !MODULES.includes(module)))
    throw fail("Sélectionnez au moins un module valide.");
  return [...new Set(modules)];
}

// Scoped lookups only: local histories identify a movement; they NEVER add money.
async function findLocalMatches(restaurantId, paymentIntentIds, refundIds) {
  const [gifts, orders] = await Promise.all([
    paymentIntentIds.length
      ? GiftCardOrder.find({
          restaurantId,
          paymentIntentId: { $in: paymentIntentIds },
        })
          .select("paymentIntentId purchaseCode")
          .lean()
      : [],
    paymentIntentIds.length || refundIds.length
      ? TakeAwayOrder.find({
          restaurant_id: restaurantId,
          $or: [
            { stripePaymentIntentId: { $in: paymentIntentIds } },
            { stripeRefundId: { $in: refundIds } },
            { "adjustments.stripeRefundId": { $in: refundIds } },
          ],
        })
          .select(
            "stripePaymentIntentId stripeRefundId orderNumber adjustments.stripeRefundId",
          )
          .lean()
      : [],
  ]);
  return { gifts, orders };
}

function resolveAttribution({
  charge,
  source,
  restaurantId,
  purchases = [],
  gifts = [],
  orders = [],
}) {
  const pi = idOf(charge?.payment_intent || source?.payment_intent);
  if (source?.payment_intent && pi && idOf(source.payment_intent) !== pi)
    return null;
  const local = [];
  for (const purchase of purchases) {
    if (
      purchase.paymentIntentId &&
      [pi, idOf(charge)].includes(purchase.paymentIntentId)
    )
      local.push({
        module: "gift_card",
        reference: purchase.purchaseCode || "",
      });
  }
  for (const gift of gifts) {
    if (pi && gift.paymentIntentId === pi)
      local.push({ module: "gift_card", reference: gift.purchaseCode || "" });
  }
  for (const order of orders) {
    if (
      (pi && order.stripePaymentIntentId === pi) ||
      (idOf(source) &&
        (order.stripeRefundId === idOf(source) ||
          order.adjustments?.some(
            (entry) => entry.stripeRefundId === idOf(source),
          )))
    )
      local.push({ module: "take_away", reference: order.orderNumber || "" });
  }
  // A refund must be linked to its originating sale or local refund history.
  if (source?.object === "refund" && !charge && !pi && !local.length)
    return null;
  const paymentIntent =
    typeof charge?.payment_intent === "object" ? charge.payment_intent : null;
  const metadata = [
    charge?.metadata,
    paymentIntent?.metadata,
    source?.metadata,
  ].filter(Boolean);
  const attributedModules = new Set(local.map((match) => match.module));
  let reliableMetadata = false;
  for (const data of metadata) {
    if (data.restaurantId && String(data.restaurantId) !== String(restaurantId))
      return null;
    if (!data.type) continue;
    const module =
      data.type === "gift_card"
        ? "gift_card"
        : ["takeaway_order", "takeaway_order_refund"].includes(data.type)
          ? "take_away"
          : null;
    if (!module) return null;
    attributedModules.add(module);
    if (String(data.restaurantId || "") === String(restaurantId))
      reliableMetadata = true;
  }
  if (attributedModules.size !== 1 || (!local.length && !reliableMetadata))
    return null;
  const module = [...attributedModules][0];
  return {
    module,
    reference:
      local.find((match) => match.reference)?.reference ||
      metadata.find((data) => data.orderNumber || data.purchaseCode)
        ?.orderNumber ||
      metadata.find((data) => data.purchaseCode)?.purchaseCode ||
      "",
    paymentIntentId: pi,
  };
}

function normalizeMovement(bt, source, attribution) {
  if (
    !attribution ||
    !Number.isSafeInteger(bt.amount) ||
    !Number.isSafeInteger(bt.fee) ||
    !Number.isSafeInteger(bt.net) ||
    !bt.currency ||
    !Number.isFinite(bt.created)
  )
    return null;
  let operation = "adjustment";
  let label = "Ajustement Stripe";
  if (
    ["charge", "payment"].includes(bt.type) &&
    source?.object === "charge" &&
    source.paid === true &&
    source.captured !== false &&
    source.status === "succeeded"
  ) {
    operation = "payment";
    label = "Paiement";
  } else if (["charge", "payment"].includes(bt.type)) {
    // A pending/failed payment is not an actual customer receipt.
    return null;
  } else if (
    bt.type === "payment_failure_refund" &&
    source?.object === "charge" &&
    source.status !== "succeeded"
  ) {
    return null;
  } else if (
    ["refund", "payment_refund"].includes(bt.type) &&
    bt.amount < 0 &&
    source?.object === "refund" &&
    source.status === "succeeded"
  ) {
    operation = "refund";
    label = "Remboursement";
  } else if (source?.object === "refund") {
    label = ["pending", "requires_action"].includes(source.status)
      ? "Remboursement en cours"
      : "Ajustement de remboursement";
  } else if (["stripe_fee", "stripe_fx_fee", "tax_fee"].includes(bt.type)) {
    operation = "fee";
    label = "Frais Stripe";
  }
  return {
    id: bt.id,
    sourceId: idOf(source),
    date: bt.created,
    currency: bt.currency.toLowerCase(),
    operation,
    label,
    stripeType: bt.type,
    status: source?.status || "",
    grossCents: bt.amount,
    feeCents: bt.fee,
    netCents: bt.net,
    ...attribution,
  };
}

async function readFinancialTransactions({
  stripe,
  restaurant,
  period = null,
  modules = MODULES,
  findMatches = findLocalMatches,
  stopWhenModulesFound = false,
  maxPages = 100,
  maxReads = 2500,
}) {
  const rows = [];
  const seen = new Set();
  const cache = new Map();
  let reads = 0;
  let cursor;
  let excluded = false;
  const started = Date.now();
  async function retrieve(kind, value) {
    const id = idOf(value);
    if (!id) return null;
    const key = `${kind}:${id}`;
    if (value && typeof value === "object") {
      cache.set(key, value);
      return value;
    }
    if (!cache.has(key)) {
      if (++reads > maxReads || Date.now() - started > 60000)
        throw fail(
          "Trop d'opérations à rapprocher. Réduisez la période d'export.",
          422,
        );
      // Never swallow a Stripe failure and return an incomplete financial report.
      cache.set(
        key,
        await stripe[kind].retrieve(
          id,
          kind === "charges" ? { expand: ["payment_intent"] } : {},
        ),
      );
    }
    return cache.get(key);
  }
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    if (Date.now() - started > 60000)
      throw fail(
        "La lecture Stripe est trop longue. Réduisez la période d'export.",
        422,
      );
    const page = await stripe.balanceTransactions.list({
      limit: 100,
      ...(period ? { created: { gte: period.start, lt: period.end } } : {}),
      ...(cursor ? { starting_after: cursor } : {}),
      expand: [
        "data.source",
        "data.source.payment_intent",
        "data.source.charge",
      ],
    });
    const candidates = [];
    for (const bt of page.data) {
      if (seen.has(bt.id) || !TYPES.has(bt.type)) continue;
      seen.add(bt.id);
      if (period && (bt.created < period.start || bt.created >= period.end))
        continue;
      let source = bt.source;
      if (typeof source === "string") {
        if (/^(ch_|py_)/.test(source))
          source = await retrieve("charges", source);
        else if (source.startsWith("re_"))
          source = await retrieve("refunds", source);
        else if (source.startsWith("dp_"))
          source = await retrieve("disputes", source);
        else {
          excluded = true;
          continue;
        }
      }
      if (!source) {
        excluded = true;
        continue;
      }
      let charge =
        source.object === "charge"
          ? await retrieve("charges", source)
          : await retrieve("charges", source.charge);
      if (!charge && source.payment_intent) {
        const pi = await retrieve("paymentIntents", source.payment_intent);
        charge = await retrieve("charges", pi?.latest_charge);
      }
      if (charge && typeof charge.payment_intent === "string")
        charge = {
          ...charge,
          payment_intent: await retrieve(
            "paymentIntents",
            charge.payment_intent,
          ),
        };
      candidates.push({ bt, source, charge });
    }
    const pis = [
      ...new Set(
        candidates
          .map(({ charge, source }) =>
            idOf(charge?.payment_intent || source?.payment_intent),
          )
          .filter(Boolean),
      ),
    ];
    const refundIds = candidates
      .filter(({ source }) => source?.object === "refund")
      .map(({ source }) => source.id);
    const local = await findMatches(String(restaurant._id), pis, refundIds);
    for (const { bt, source, charge } of candidates) {
      const attribution = resolveAttribution({
        charge,
        source,
        restaurantId: restaurant._id,
        purchases: restaurant.purchasesGiftCards || [],
        ...local,
      });
      const row = normalizeMovement(bt, source, attribution);
      if (!row) {
        excluded = true;
        continue;
      }
      if (modules.includes(row.module)) rows.push(row);
    }
    if (
      stopWhenModulesFound &&
      modules.every((module) => rows.some((row) => row.module === module))
    )
      break;
    if (!page.has_more) break;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor || pageNumber === maxPages - 1)
      throw fail(
        "Volume Stripe trop important. Aucun rapport partiel n'a été généré ; réduisez la période.",
        422,
      );
    cursor = next;
  }
  rows.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  return {
    rows,
    notes: [
      ...NOTES,
      ...(excluded
        ? [
            "Certains mouvements n'ont pas pu être attribués ou ne disposent pas de données financières complètes ; ils sont exclus.",
          ]
        : []),
    ],
  };
}

function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.module}:${row.currency}`;
    if (!groups.has(key))
      groups.set(key, {
        module: row.module,
        currency: row.currency,
        receiptsCents: 0,
        refundsCents: 0,
        adjustmentsCents: 0,
        feesCents: 0,
        netCents: 0,
      });
    const total = groups.get(key);
    if (row.operation === "payment") total.receiptsCents += row.grossCents;
    else if (row.operation === "refund") total.refundsCents -= row.grossCents;
    else if (row.operation === "fee") total.feesCents -= row.grossCents;
    else total.adjustmentsCents += row.grossCents;
    total.feesCents += row.feeCents;
    total.netCents += row.netCents;
  }
  const byCurrency = new Map();
  for (const group of groups.values()) {
    if (!byCurrency.has(group.currency))
      byCurrency.set(group.currency, {
        currency: group.currency,
        receiptsCents: 0,
        refundsCents: 0,
        adjustmentsCents: 0,
        feesCents: 0,
        netCents: 0,
      });
    const total = byCurrency.get(group.currency);
    for (const key of [
      "receiptsCents",
      "refundsCents",
      "adjustmentsCents",
      "feesCents",
      "netCents",
    ])
      total[key] += group[key];
  }
  return {
    byModule: [...groups.values()],
    byCurrency: [...byCurrency.values()],
  };
}

function monthlySeries(rows, period, modules = MODULES) {
  const start = DateTime.fromSeconds(period.start, { zone: ZONE }).startOf(
    "month",
  );
  const months = Array.from({ length: 6 }, (_, index) =>
    start.plus({ months: index }),
  );
  const result = {};
  const totals = new Map();
  for (const row of rows) {
    const key = `${row.module}:${row.currency}:${DateTime.fromSeconds(row.date, { zone: ZONE }).toFormat("yyyy-MM")}`;
    totals.set(key, (totals.get(key) || 0) + row.netCents);
  }
  for (const module of modules) {
    const currencies = [
      ...new Set(
        rows.filter((row) => row.module === module).map((row) => row.currency),
      ),
    ].sort();
    result[module] = (currencies.length ? currencies : ["eur"]).map(
      (currency) => ({
        currency,
        monthlySales: months.map((month) => {
          const monthKey = month.toFormat("yyyy-MM");
          const netCents = totals.get(`${module}:${currency}:${monthKey}`) || 0;
          return {
            month: month.toFormat("MM/yyyy"),
            monthKey,
            total: netCents / 100,
          };
        }),
      }),
    );
  }
  return result;
}

module.exports = {
  ZONE,
  MODULES,
  MODULE_LABELS,
  parsePeriod,
  monthlyPeriod,
  parseModules,
  resolveAttribution,
  normalizeMovement,
  readFinancialTransactions,
  summarize,
  monthlySeries,
};
