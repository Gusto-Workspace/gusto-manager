const crypto = require("crypto");

const { findRestaurantSubscription } = require("./stripe-billing.service");
const {
  buildSubscriptionSummary,
  catalogCodeAllowsOffered,
} = require("./stripe-subscription-catalog.service");

const TABLET_RENTAL_CODE = "tab_rental";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCurrency(value) {
  return normalizeString(value).toUpperCase();
}

function positiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCommercialItem(item = {}) {
  const quantity = positiveInteger(item.quantity, 1);
  const unitAmount = finiteNumber(item.unitAmount, 0);

  return {
    kind: ["PLAN", "ADDON", "OTHER"].includes(item.kind) ? item.kind : "OTHER",
    code: normalizeString(item.code),
    priceId: normalizeString(item.priceId),
    productId: normalizeString(item.productId),
    label: normalizeString(item.label),
    quantity,
    unitAmount,
    totalAmount: finiteNumber(item.totalAmount, unitAmount * quantity),
    currency: normalizeCurrency(item.currency),
    interval: normalizeString(item.interval) || "month",
    intervalCount: positiveInteger(item.intervalCount, 1),
    requiresReview: Boolean(item.requiresReview),
    reviewReason: normalizeString(item.reviewReason),
  };
}

function commercialItemKey(item = {}) {
  const normalized = normalizeCommercialItem(item);
  return (
    normalized.code ||
    normalized.priceId ||
    normalized.productId ||
    `${normalized.kind}:${normalized.label.toLowerCase()}`
  );
}

function commercialFingerprint(items = []) {
  const canonical = (Array.isArray(items) ? items : [])
    .map(normalizeCommercialItem)
    .sort((left, right) =>
      commercialItemKey(left).localeCompare(commercialItemKey(right)),
    )
    .map((item) => ({
      key: commercialItemKey(item),
      kind: item.kind,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      currency: item.currency,
      interval: item.interval,
      intervalCount: item.intervalCount,
    }));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function createCommercialSnapshot({
  source,
  subscriptionId = "",
  currency = "EUR",
  items = [],
  capturedAt = new Date(),
  reviewWarnings = [],
}) {
  const normalizedItems = items.map(normalizeCommercialItem);
  const invalidNonOfferableItem = normalizedItems.find(
    (item) =>
      !catalogCodeAllowsOffered(item.code) &&
      finiteNumber(item.unitAmount) <= 0,
  );
  if (invalidNonOfferableItem) {
    const error = new Error(
      `${invalidNonOfferableItem.label || invalidNonOfferableItem.code} ne peut pas être offert.`,
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    source,
    subscriptionId: normalizeString(subscriptionId),
    capturedAt,
    currency: normalizeCurrency(currency || normalizedItems[0]?.currency),
    items: normalizedItems,
    fingerprint: commercialFingerprint(normalizedItems),
    reviewRequired: normalizedItems.some((item) => item.requiresReview),
    reviewWarnings: (Array.isArray(reviewWarnings) ? reviewWarnings : [])
      .map(normalizeString)
      .filter(Boolean),
  };
}

function stripeItemToCommercialItem(item = {}, { kind, requiresReview } = {}) {
  const quantity = positiveInteger(item.quantity, 1);
  const unitAmount = finiteNumber(item.amount, 0);

  return normalizeCommercialItem({
    kind:
      kind ||
      (item.kind === "plan"
        ? "PLAN"
        : item.kind === "addon"
          ? "ADDON"
          : "OTHER"),
    code: item.code,
    priceId: item.priceId,
    productId: item.productId,
    label: item.productName,
    quantity,
    unitAmount,
    totalAmount: unitAmount * quantity,
    currency: item.currency,
    interval: item.interval,
    intervalCount: item.intervalCount,
    requiresReview,
    reviewReason: requiresReview
      ? "Cette prestation Stripe historique doit être vérifiée avant envoi."
      : "",
  });
}

function buildStripeCommercialSnapshot(summary, subscription) {
  const plan = summary?.plan || null;
  const knownAddons = Array.isArray(summary?.addons) ? summary.addons : [];
  const otherItems = Array.isArray(summary?.otherItems)
    ? summary.otherItems
    : [];
  const planRequiresReview = Boolean(plan && plan.kind !== "plan");
  const items = [
    ...(plan
      ? [
          stripeItemToCommercialItem(plan, {
            kind: "PLAN",
            requiresReview: planRequiresReview,
          }),
        ]
      : []),
    ...knownAddons.map((item) =>
      stripeItemToCommercialItem(item, { kind: "ADDON" }),
    ),
    ...otherItems.map((item) =>
      stripeItemToCommercialItem(item, {
        kind: "OTHER",
        requiresReview: true,
      }),
    ),
  ];
  const reviewWarnings = items
    .filter((item) => item.requiresReview)
    .map(
      (item) =>
        `${item.label || item.priceId || "Prestation Stripe"} n'a pas pu être classée avec certitude.`,
    );

  return createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    subscriptionId: subscription?.id || summary?.subscription?.id || "",
    currency: summary?.currency || items[0]?.currency || "",
    items,
    reviewWarnings,
  });
}

function buildManualCommercialSnapshot(documentData = {}) {
  const items = [];
  const subscription = documentData.subscription || {};

  if (
    normalizeString(subscription.name) ||
    finiteNumber(subscription.priceMonthly) > 0
  ) {
    items.push({
      kind: "PLAN",
      code: subscription.code,
      priceId: subscription.priceId,
      productId: subscription.productId,
      label: subscription.name || "Abonnement Gusto Manager",
      quantity: positiveInteger(subscription.quantity, 1),
      unitAmount: finiteNumber(subscription.priceMonthly),
      currency: subscription.currency,
      interval: subscription.interval,
      intervalCount: subscription.intervalCount,
    });
  }

  (Array.isArray(documentData.modules) ? documentData.modules : []).forEach(
    (module) => {
      if (!normalizeString(module?.name)) return;
      const offered =
        catalogCodeAllowsOffered(module.code) &&
        (Boolean(module.offered) || finiteNumber(module.priceMonthly) <= 0);
      items.push({
        kind: module.sourceKind === "OTHER" ? "OTHER" : "ADDON",
        code: module.code,
        priceId: module.priceId,
        productId: module.productId,
        label: module.name,
        quantity: positiveInteger(module.quantity, 1),
        unitAmount: offered ? 0 : finiteNumber(module.priceMonthly),
        currency: module.currency,
        interval: module.interval,
        intervalCount: module.intervalCount,
      });
    },
  );

  if (documentData?.timeClockTerminalRental?.enabled) {
    const rental = documentData.timeClockTerminalRental;
    const legacyRentalItem = {
      kind: "ADDON",
      code: rental.code || TABLET_RENTAL_CODE,
      priceId: rental.priceId,
      productId: rental.productId,
      label: "Location tablette",
      quantity: positiveInteger(rental.quantity, 1),
      unitAmount: finiteNumber(rental.priceMonthly, 12),
      currency: rental.currency,
      interval: rental.interval,
      intervalCount: rental.intervalCount,
    };
    const legacyRentalKey = commercialItemKey(legacyRentalItem);
    if (!items.some((item) => commercialItemKey(item) === legacyRentalKey)) {
      items.push(legacyRentalItem);
    }
  }

  return createCommercialSnapshot({
    source: "MANUAL",
    currency: items[0]?.currency || "",
    items,
  });
}

function commercialSnapshotToDocumentFields(snapshot = {}) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const plan = items.find((item) => item.kind === "PLAN") || null;
  const modules = items.filter((item) =>
    ["ADDON", "OTHER"].includes(item.kind),
  );

  return {
    subscription: {
      name: plan?.label || "",
      priceMonthly: finiteNumber(plan?.unitAmount),
      quantity: positiveInteger(plan?.quantity, 1),
      code: plan?.code || "",
      priceId: plan?.priceId || "",
      productId: plan?.productId || "",
      currency: normalizeCurrency(plan?.currency || snapshot.currency),
      interval: plan?.interval || "month",
      intervalCount: positiveInteger(plan?.intervalCount, 1),
    },
    modules: modules.map((item) => ({
      name: item.label,
      offered:
        catalogCodeAllowsOffered(item.code) &&
        finiteNumber(item.unitAmount) <= 0,
      priceMonthly: finiteNumber(item.unitAmount),
      quantity: positiveInteger(item.quantity, 1),
      code: item.code,
      priceId: item.priceId,
      productId: item.productId,
      currency: normalizeCurrency(item.currency),
      interval: item.interval || "month",
      intervalCount: positiveInteger(item.intervalCount, 1),
      sourceKind: item.kind === "OTHER" ? "OTHER" : "ADDON",
      requiresReview: Boolean(item.requiresReview),
    })),
    timeClockTerminalRental: {
      enabled: false,
    },
  };
}

function commercialItemsDiffer(before, after) {
  const left = normalizeCommercialItem(before);
  const right = normalizeCommercialItem(after);

  return [
    "kind",
    "label",
    "quantity",
    "unitAmount",
    "currency",
    "interval",
    "intervalCount",
  ].some((field) => left[field] !== right[field]);
}

function compareCommercialSnapshots(previousSnapshot, currentSnapshot) {
  const previousItems = (
    Array.isArray(previousSnapshot?.items) ? previousSnapshot.items : []
  ).map(normalizeCommercialItem);
  const currentItems = (
    Array.isArray(currentSnapshot?.items) ? currentSnapshot.items : []
  ).map(normalizeCommercialItem);
  const previousPlan =
    previousItems.find((item) => item.kind === "PLAN") || null;
  const currentPlan = currentItems.find((item) => item.kind === "PLAN") || null;
  const previousByKey = new Map(
    previousItems
      .filter((item) => item.kind !== "PLAN")
      .map((item) => [commercialItemKey(item), item]),
  );
  const currentByKey = new Map(
    currentItems
      .filter((item) => item.kind !== "PLAN")
      .map((item) => [commercialItemKey(item), item]),
  );
  const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);
  const changes = [];

  if (!previousPlan && currentPlan) {
    changes.push({ changeType: "ADDED", before: null, after: currentPlan });
  } else if (previousPlan && !currentPlan) {
    changes.push({ changeType: "REMOVED", before: previousPlan, after: null });
  } else if (
    previousPlan &&
    currentPlan &&
    commercialItemsDiffer(previousPlan, currentPlan)
  ) {
    changes.push({
      changeType: "UPDATED",
      before: previousPlan,
      after: currentPlan,
    });
  }

  keys.forEach((key) => {
    const before = previousByKey.get(key) || null;
    const after = currentByKey.get(key) || null;

    if (!before && after)
      changes.push({ changeType: "ADDED", before: null, after });
    else if (before && !after)
      changes.push({ changeType: "REMOVED", before, after: null });
    else if (before && after && commercialItemsDiffer(before, after))
      changes.push({ changeType: "UPDATED", before, after });
  });

  return {
    hasChanges: changes.length > 0,
    changes,
    previousFingerprint:
      previousSnapshot?.fingerprint || commercialFingerprint(previousItems),
    currentFingerprint:
      currentSnapshot?.fingerprint || commercialFingerprint(currentItems),
  };
}

async function loadRestaurantCommercialSnapshot(restaurantId) {
  const context = await findRestaurantSubscription({ restaurantId });
  if (!context?.subscription) return null;
  const summary = await buildSubscriptionSummary(context.subscription);
  return buildStripeCommercialSnapshot(summary, context.subscription);
}

module.exports = {
  TABLET_RENTAL_CODE,
  buildManualCommercialSnapshot,
  buildStripeCommercialSnapshot,
  commercialFingerprint,
  commercialSnapshotToDocumentFields,
  compareCommercialSnapshots,
  createCommercialSnapshot,
  loadRestaurantCommercialSnapshot,
  normalizeCommercialItem,
};
