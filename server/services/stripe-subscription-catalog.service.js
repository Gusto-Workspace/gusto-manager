const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

const SUBSCRIPTION_CATALOG_NAME = "restaurant_subscription";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializePrice(price) {
  if (!price?.id) return null;

  return {
    id: price.id,
    unit_amount:
      typeof price.unit_amount === "number" ? price.unit_amount : null,
    currency: price.currency ? price.currency.toUpperCase() : "",
    recurring: price.recurring
      ? {
          interval: normalizeString(price.recurring.interval),
          interval_count: toInteger(price.recurring.interval_count, 1),
        }
      : null,
    active: price.active !== false,
  };
}

function getCatalogMetadata(product = {}) {
  return {
    catalog: normalizeString(product?.metadata?.catalog),
    kind: normalizeString(product?.metadata?.kind),
    code: normalizeString(product?.metadata?.code),
    order: toInteger(product?.metadata?.order, 0),
  };
}

function isRecurringMonthlyPrice(price) {
  return (
    price?.active !== false &&
    normalizeString(price?.type || "recurring") === "recurring" &&
    normalizeString(price?.recurring?.interval) === "month" &&
    toInteger(price?.recurring?.interval_count, 1) === 1 &&
    typeof price?.unit_amount === "number"
  );
}

function sortCatalogProducts(left, right) {
  const leftMeta = getCatalogMetadata(left);
  const rightMeta = getCatalogMetadata(right);

  if (leftMeta.kind !== rightMeta.kind) {
    return leftMeta.kind === "plan" ? -1 : 1;
  }

  if (leftMeta.order !== rightMeta.order) {
    return leftMeta.order - rightMeta.order;
  }

  return String(left?.name || "").localeCompare(
    String(right?.name || ""),
    "fr",
  );
}

function serializeCatalogProduct(product = {}) {
  const metadata = getCatalogMetadata(product);
  const defaultPrice = serializePrice(product?.default_price);

  return {
    id: product.id,
    name: product.name || "",
    description: product.description || "",
    active: product.active !== false,
    metadata,
    catalogKind: metadata.kind,
    catalogCode: metadata.code,
    catalogOrder: metadata.order,
    default_price: defaultPrice,
  };
}

async function listSubscriptionCatalogProducts({ limit = 100 } = {}) {
  const products = [];
  let startingAfter = null;

  while (products.length < limit) {
    const response = await stripe.products.list({
      active: true,
      limit: Math.min(100, limit - products.length),
      expand: ["data.default_price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    response.data.forEach((product) => {
      const metadata = getCatalogMetadata(product);
      if (metadata.catalog !== SUBSCRIPTION_CATALOG_NAME) return;
      if (!["plan", "addon"].includes(metadata.kind)) return;
      if (!isRecurringMonthlyPrice(product?.default_price)) return;
      products.push(product);
    });

    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }

  return products.sort(sortCatalogProducts).map(serializeCatalogProduct);
}

async function retrieveCatalogPriceEntry(priceId) {
  const normalizedPriceId = normalizeString(priceId);
  if (!normalizedPriceId) {
    const error = new Error("Le tarif Stripe est requis.");
    error.statusCode = 400;
    throw error;
  }

  const price = await stripe.prices.retrieve(normalizedPriceId, {
    expand: ["product"],
  });

  const product =
    typeof price?.product === "string"
      ? await stripe.products.retrieve(price.product)
      : price?.product || null;

  const metadata = getCatalogMetadata(product);

  if (!product?.active || metadata.catalog !== SUBSCRIPTION_CATALOG_NAME) {
    const error = new Error(
      "Le tarif Stripe sélectionné n'appartient pas au catalogue d'abonnements.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (!["plan", "addon"].includes(metadata.kind)) {
    const error = new Error(
      "Le tarif Stripe sélectionné n'a pas de type de catalogue valide.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (!isRecurringMonthlyPrice(price)) {
    const error = new Error(
      "Le tarif Stripe sélectionné doit être mensuel, récurrent et actif.",
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    priceId: price.id,
    productId: product.id,
    productName: product.name || "",
    description: product.description || "",
    amount: typeof price.unit_amount === "number" ? price.unit_amount / 100 : 0,
    amountCents: typeof price.unit_amount === "number" ? price.unit_amount : 0,
    currency: price.currency ? price.currency.toUpperCase() : "",
    kind: metadata.kind,
    code: metadata.code,
    order: metadata.order,
    price,
    product,
  };
}

async function resolveCatalogSelection({
  planPriceId,
  addonPriceIds = [],
} = {}) {
  const plan = await retrieveCatalogPriceEntry(planPriceId);
  if (plan.kind !== "plan") {
    const error = new Error(
      "Le tarif principal sélectionné n'est pas un plan.",
    );
    error.statusCode = 400;
    throw error;
  }

  const uniqueAddonPriceIds = Array.from(
    new Set(
      (Array.isArray(addonPriceIds) ? addonPriceIds : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  );

  const addons = await Promise.all(
    uniqueAddonPriceIds.map((priceId) => retrieveCatalogPriceEntry(priceId)),
  );

  addons.forEach((addon) => {
    if (addon.kind !== "addon") {
      const error = new Error(
        "Un des tarifs sélectionnés n'est pas un module additionnel.",
      );
      error.statusCode = 400;
      throw error;
    }
  });

  const duplicateAddonCodes = addons.reduce((acc, addon) => {
    if (!addon.code) return acc;
    acc[addon.code] = (acc[addon.code] || 0) + 1;
    return acc;
  }, {});

  if (Object.values(duplicateAddonCodes).some((count) => count > 1)) {
    const error = new Error(
      "La sélection contient plusieurs fois le même module additionnel.",
    );
    error.statusCode = 400;
    throw error;
  }

  const currencies = new Set([
    plan.currency,
    ...addons.map((addon) => addon.currency),
  ]);
  if (currencies.size > 1) {
    const error = new Error(
      "Le plan et les modules doivent partager la même devise Stripe.",
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    plan,
    addons: addons.sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.productName.localeCompare(right.productName, "fr");
    }),
    totalAmount:
      plan.amount + addons.reduce((sum, addon) => sum + addon.amount, 0),
    currency: plan.currency,
  };
}

async function ensureExpandedSubscription(subscriptionOrId) {
  if (!subscriptionOrId) {
    const error = new Error("Abonnement Stripe introuvable.");
    error.statusCode = 404;
    throw error;
  }

  if (typeof subscriptionOrId === "string") {
    return stripe.subscriptions.retrieve(subscriptionOrId, {
      expand: ["items.data.price", "latest_invoice"],
    });
  }

  const hasExpandedItems = Array.isArray(subscriptionOrId?.items?.data);
  if (hasExpandedItems) return subscriptionOrId;

  return stripe.subscriptions.retrieve(subscriptionOrId.id, {
    expand: ["items.data.price", "latest_invoice"],
  });
}

async function buildSubscriptionItemSummaries(subscriptionOrId) {
  const subscription = await ensureExpandedSubscription(subscriptionOrId);
  const productCache = new Map();

  const items = await Promise.all(
    (subscription?.items?.data || []).map(async (item, index) => {
      const price = item?.price || null;
      if (!price?.id) return null;

      const productId =
        typeof price.product === "string" ? price.product : price?.product?.id;

      let product = null;
      if (productId) {
        if (!productCache.has(productId)) {
          productCache.set(productId, stripe.products.retrieve(productId));
        }
        product = await productCache.get(productId);
      }

      const metadata = getCatalogMetadata(product);
      const quantity = toInteger(item?.quantity, 1);
      const amount =
        typeof price.unit_amount === "number" ? price.unit_amount / 100 : 0;

      return {
        index,
        subscriptionItemId: item?.id || "",
        priceId: price.id,
        productId: product?.id || productId || "",
        productName: product?.name || "",
        description: product?.description || "",
        amount,
        amountCents:
          typeof price.unit_amount === "number" ? price.unit_amount : 0,
        totalAmount: amount * quantity,
        quantity,
        currency: price.currency ? price.currency.toUpperCase() : "",
        kind: metadata.kind,
        code: metadata.code,
        order: metadata.order,
      };
    }),
  );

  return items.filter(Boolean).sort((left, right) => {
    const kindWeight = (item) => {
      if (item.kind === "plan") return 0;
      if (item.kind === "addon") return 1;
      return 2;
    };

    const leftWeight = kindWeight(left);
    const rightWeight = kindWeight(right);
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    if (left.order !== right.order) return left.order - right.order;
    return left.index - right.index;
  });
}

async function buildSubscriptionSummary(subscriptionOrId) {
  const subscription = await ensureExpandedSubscription(subscriptionOrId);
  const items = await buildSubscriptionItemSummaries(subscription);
  const plan = items.find((item) => item.kind === "plan") || items[0] || null;
  const addons = items.filter(
    (item) =>
      item.kind === "addon" &&
      (!plan || item.subscriptionItemId !== plan.subscriptionItemId),
  );
  const otherItems = items.filter(
    (item) =>
      (!plan || item.subscriptionItemId !== plan.subscriptionItemId) &&
      item.kind !== "addon",
  );
  const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const currency = items[0]?.currency || "";

  return {
    subscription,
    items,
    plan,
    addons,
    otherItems,
    totalAmount,
    currency,
  };
}

function buildCatalogSelectionMetadata({ plan, addons = [] } = {}) {
  return {
    subscriptionCatalog: SUBSCRIPTION_CATALOG_NAME,
    planPriceId: normalizeString(plan?.priceId),
    planCode: normalizeString(plan?.code),
    addonPriceIds: addons
      .map((addon) => normalizeString(addon?.priceId))
      .join(","),
    addonCodes: addons.map((addon) => normalizeString(addon?.code)).join(","),
  };
}

module.exports = {
  SUBSCRIPTION_CATALOG_NAME,
  buildCatalogSelectionMetadata,
  buildSubscriptionSummary,
  isRecurringMonthlyPrice,
  listSubscriptionCatalogProducts,
  normalizeString,
  resolveCatalogSelection,
};
