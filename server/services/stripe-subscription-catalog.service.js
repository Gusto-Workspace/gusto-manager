const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

const SUBSCRIPTION_CATALOG_NAME = "restaurant_subscription";
const MULTI_QUANTITY_ADDON_CODE = "tab_rental";
const SMS_ADDON_CODE = "sms_reminders";
const offeredPriceRequests = new Map();

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
          usage_type: normalizeString(price.recurring.usage_type),
          meter:
            typeof price.recurring.meter === "string"
              ? price.recurring.meter
              : normalizeString(price.recurring.meter?.id),
        }
      : null,
    billing_scheme: normalizeString(price.billing_scheme),
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
    normalizeString(price?.recurring?.usage_type || "licensed") !== "metered" &&
    typeof price?.unit_amount === "number"
  );
}

function selectionIncludesSms(selection) {
  return (selection?.addons || []).some(
    (addon) => normalizeString(addon?.code) === SMS_ADDON_CODE,
  );
}

function catalogCodeAllowsOffered(code) {
  return normalizeString(code) !== SMS_ADDON_CODE;
}

function getSmsMeteredPriceId(selection) {
  if (!selectionIncludesSms(selection)) return "";
  const priceId = normalizeString(process.env.STRIPE_SMS_METERED_PRICE_ID);
  if (!priceId) {
    const error = new Error(
      "STRIPE_SMS_METERED_PRICE_ID est requis pour ajouter le module Rappels SMS.",
    );
    error.statusCode = 400;
    throw error;
  }
  return priceId;
}

function isSmsMeteredComponent(price, metadata = {}) {
  const configuredPriceId = normalizeString(
    process.env.STRIPE_SMS_METERED_PRICE_ID,
  );
  return (
    (configuredPriceId && normalizeString(price?.id) === configuredPriceId) ||
    (normalizeString(metadata?.code) === SMS_ADDON_CODE &&
      normalizeString(price?.recurring?.usage_type) === "metered")
  );
}



function getPriceProductId(price = {}) {
  return typeof price?.product === "string"
    ? price.product
    : normalizeString(price?.product?.id);
}

function isCompatibleOfferedPrice(price, criteria) {
  return (
    price?.active === true &&
    normalizeString(price?.type) === "recurring" &&
    getPriceProductId(price) === criteria.productId &&
    Number(price?.unit_amount) === 0 &&
    normalizeString(price?.currency).toLowerCase() === criteria.currency &&
    normalizeString(price?.recurring?.interval) === criteria.interval &&
    toInteger(price?.recurring?.interval_count, 1) === criteria.intervalCount
  );
}

function compareOfferedPrices(left, right) {
  const createdDifference =
    toInteger(left?.created) - toInteger(right?.created);
  if (createdDifference !== 0) return createdDifference;
  return normalizeString(left?.id).localeCompare(normalizeString(right?.id));
}

async function listActiveProductPrices(stripeClient, productId) {
  const prices = [];
  let startingAfter = null;

  do {
    const response = await stripeClient.prices.list({
      product: productId,
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const page = Array.isArray(response?.data) ? response.data : [];
    prices.push(...page);
    startingAfter =
      response?.has_more && page.length ? page[page.length - 1].id : null;
  } while (startingAfter);

  return prices;
}

async function getOrCreateOfferedPrice(addon, stripeClient = stripe) {
  if (!addon?.offered) return addon?.priceId;

  const criteria = {
    productId: normalizeString(addon?.productId),
    currency: normalizeString(addon?.currency).toLowerCase(),
    interval: normalizeString(addon?.interval) || "month",
    intervalCount: Math.max(1, toInteger(addon?.intervalCount, 1)),
  };
  const requestKey = [
    criteria.productId,
    criteria.currency,
    criteria.interval,
    criteria.intervalCount,
  ].join(":");

  if (isCompatibleOfferedPrice(addon?.price, criteria)) {
    return addon.price.id;
  }

  if (offeredPriceRequests.has(requestKey)) {
    return offeredPriceRequests.get(requestKey);
  }

  const request = (async () => {
    const prices = await listActiveProductPrices(
      stripeClient,
      criteria.productId,
    );
    const matchingPrice = prices
      .filter((price) => isCompatibleOfferedPrice(price, criteria))
      .sort(compareOfferedPrices)[0];

    if (matchingPrice) return matchingPrice.id;

    const price = await stripeClient.prices.create({
      product: criteria.productId,
      currency: criteria.currency,
      unit_amount: 0,
      recurring: {
        interval: criteria.interval,
        interval_count: criteria.intervalCount,
      },
      metadata: {
        offered: "true",
        catalogCode: addon.code || "",
      },
    });
    return price.id;
  })();

  offeredPriceRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    offeredPriceRequests.delete(requestKey);
  }
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
    allowOffered: catalogCodeAllowsOffered(metadata.code),
    default_price: defaultPrice,
  };
}

async function listSubscriptionCatalogProducts({ limit = 100 } = {}) {
  const products = [];
  let startingAfter = null;
  let smsFixedPricePromise = null;

  while (products.length < limit) {
    const response = await stripe.products.list({
      active: true,
      limit: Math.min(100, limit - products.length),
      expand: ["data.default_price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const product of response.data) {
      const metadata = getCatalogMetadata(product);
      if (metadata.catalog !== SUBSCRIPTION_CATALOG_NAME) continue;
      if (!["plan", "addon"].includes(metadata.kind)) continue;

      let commercialPrice = product?.default_price;
      if (metadata.code === SMS_ADDON_CODE) {
        const fixedPriceId = normalizeString(
          process.env.STRIPE_SMS_FIXED_PRICE_ID,
        );
        if (!fixedPriceId) continue;
        smsFixedPricePromise ||= stripe.prices.retrieve(fixedPriceId);
        const fixedPrice = await smsFixedPricePromise;
        const fixedProductId =
          typeof fixedPrice?.product === "string"
            ? fixedPrice.product
            : fixedPrice?.product?.id;
        if (fixedProductId !== product.id) continue;
        commercialPrice = fixedPrice;
      }

      if (!isRecurringMonthlyPrice(commercialPrice)) continue;
      products.push({ ...product, default_price: commercialPrice });
    }

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
    interval: normalizeString(price?.recurring?.interval),
    intervalCount: toInteger(price?.recurring?.interval_count, 1),
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
  addonItems = [],
} = {}) {
  const plan = await retrieveCatalogPriceEntry(planPriceId);
  if (plan.kind !== "plan") {
    const error = new Error(
      "Le tarif principal sélectionné n'est pas un plan.",
    );
    error.statusCode = 400;
    throw error;
  }

  const requestedAddonItems =
    Array.isArray(addonItems) && addonItems.length
      ? addonItems
      : (Array.isArray(addonPriceIds) ? addonPriceIds : []).map((priceId) => ({
          priceId,
          quantity: 1,
        }));

  const normalizedAddonItems = requestedAddonItems
    .map((item) => {
      const rawQuantity = typeof item === "string" ? 1 : item?.quantity;
      const numericQuantity = Number(rawQuantity ?? 1);

      return {
        priceId: normalizeString(
          typeof item === "string" ? item : item?.priceId,
        ),
        quantity: numericQuantity,
        offered: Boolean(typeof item === "string" ? false : item?.offered),
      };
    })
    .filter((item) => item.priceId);

  if (
    normalizedAddonItems.some(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    )
  ) {
    const error = new Error(
      "La quantité de chaque module doit être comprise entre 1 et 100.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    new Set(normalizedAddonItems.map((item) => item.priceId)).size !==
    normalizedAddonItems.length
  ) {
    const error = new Error(
      "La sélection contient plusieurs fois le même module additionnel.",
    );
    error.statusCode = 400;
    throw error;
  }

  const addons = await Promise.all(
    normalizedAddonItems.map(async ({ priceId, quantity, offered }) => {
      const entry = await retrieveCatalogPriceEntry(priceId);
      return {
        ...entry,
        quantity,
        offered: catalogCodeAllowsOffered(entry.code) ? offered : false,
      };
    }),
  );

  addons.forEach((addon) => {
    if (addon.kind !== "addon") {
      const error = new Error(
        "Un des tarifs sélectionnés n'est pas un module additionnel.",
      );
      error.statusCode = 400;
      throw error;
    }

    if (
      addon.quantity > 1 &&
      normalizeString(addon.code) !== MULTI_QUANTITY_ADDON_CODE
    ) {
      const error = new Error(
        "Seul le module Location tablette peut avoir une quantité supérieure à 1.",
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
      plan.amount +
      addons.reduce(
        (sum, addon) => sum + (addon.offered ? 0 : addon.amount * addon.quantity),
        0,
      ),
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
      const recurring = price?.recurring || null;
      const technical = isSmsMeteredComponent(price, metadata);

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
        interval: normalizeString(recurring?.interval),
        intervalCount: toInteger(recurring?.interval_count, 1),
        usageType: normalizeString(recurring?.usage_type),
        meterId:
          typeof recurring?.meter === "string"
            ? recurring.meter
            : normalizeString(recurring?.meter?.id),
        billingScheme: normalizeString(price?.billing_scheme),
        technical,
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

function buildSubscriptionSummaryFromItems(allItems = [], subscription = null) {
  const technicalItems = allItems.filter((item) => item?.technical);
  const items = allItems.filter((item) => !item?.technical);
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
  const totalAmount = items.reduce(
    (sum, item) => sum + Number(item.totalAmount || 0),
    0,
  );
  const currency = items[0]?.currency || technicalItems[0]?.currency || "";

  return {
    subscription,
    items,
    technicalItems,
    plan,
    addons,
    otherItems,
    totalAmount,
    currency,
  };
}

function buildSubscriptionItemUpdatePayload({ currentSummary, selection }) {
  const operations = [];
  const currentPlan = currentSummary?.plan || null;
  if (currentPlan?.subscriptionItemId) {
    operations.push({
      id: currentPlan.subscriptionItemId,
      price: selection.plan.priceId,
      quantity: Number(currentPlan.quantity || 1),
    });
  } else {
    operations.push({ price: selection.plan.priceId });
  }

  (currentSummary?.otherItems || []).forEach((item) => {
    if (!item?.subscriptionItemId || !item?.priceId) return;
    operations.push({
      id: item.subscriptionItemId,
      price: item.priceId,
      quantity: Number(item.quantity || 1),
    });
  });

  const currentAddonsByPriceId = new Map();
  (currentSummary?.addons || []).forEach((item) => {
    const priceId = normalizeString(item?.priceId);
    if (!priceId) return;
    if (!currentAddonsByPriceId.has(priceId)) {
      currentAddonsByPriceId.set(priceId, []);
    }
    currentAddonsByPriceId.get(priceId).push(item);
  });

  (selection?.addons || []).forEach((addon) => {
    const matchingQueue =
      currentAddonsByPriceId.get(normalizeString(addon?.priceId)) || [];
    const existingAddon = matchingQueue.shift();
    if (existingAddon?.subscriptionItemId) {
      operations.push({
        id: existingAddon.subscriptionItemId,
        price: existingAddon.priceId,
        quantity: Number(addon.quantity || 1),
      });
    } else {
      operations.push({
        price: addon.priceId,
        quantity: Number(addon.quantity || 1),
      });
    }
  });

  Array.from(currentAddonsByPriceId.values())
    .flat()
    .forEach((item) => {
      if (item?.subscriptionItemId) {
        operations.push({ id: item.subscriptionItemId, deleted: true });
      }
    });

  const smsMeteredPriceId = normalizeString(
    process.env.STRIPE_SMS_METERED_PRICE_ID,
  );
  const currentSmsMeteredItems = [
    ...(currentSummary?.technicalItems || []),
    ...(currentSummary?.items || []).filter(
      (item) => normalizeString(item?.priceId) === smsMeteredPriceId,
    ),
  ].filter(
    (item, index, items) =>
      normalizeString(item?.priceId) === smsMeteredPriceId &&
      items.findIndex(
        (candidate) =>
          candidate?.subscriptionItemId === item?.subscriptionItemId,
      ) === index,
  );

  if (selectionIncludesSms(selection)) {
    const [keptMeteredItem, ...duplicateMeteredItems] =
      currentSmsMeteredItems;
    if (keptMeteredItem?.subscriptionItemId) {
      operations.push({
        id: keptMeteredItem.subscriptionItemId,
        price: smsMeteredPriceId,
      });
    } else {
      operations.push({ price: getSmsMeteredPriceId(selection) });
    }
    duplicateMeteredItems.forEach((item) => {
      if (item?.subscriptionItemId) {
        operations.push({ id: item.subscriptionItemId, deleted: true });
      }
    });
  } else {
    currentSmsMeteredItems.forEach((item) => {
      if (item?.subscriptionItemId) {
        operations.push({ id: item.subscriptionItemId, deleted: true });
      }
    });
  }

  return operations;
}

function buildSmsDeactivationPhaseItems(subscription) {
  const smsPriceIds = new Set(
    [
      process.env.STRIPE_SMS_FIXED_PRICE_ID,
      process.env.STRIPE_SMS_METERED_PRICE_ID,
    ]
      .map(normalizeString)
      .filter(Boolean),
  );
  return (subscription?.items?.data || [])
    .filter((item) => !smsPriceIds.has(normalizeString(item?.price?.id)))
    .map((item) => ({
      price: item.price.id,
      ...(item?.price?.recurring?.usage_type === "metered"
        ? {}
        : { quantity: Number(item.quantity || 1) }),
    }));
}

function buildScheduledRemovalState({ schedule, summary } = {}) {
  if (!schedule || !["active", "not_started"].includes(schedule.status)) {
    return [];
  }
  const transitionAt = Number(schedule?.current_phase?.end_date || 0);
  if (!transitionAt) return [];
  const futurePhase = (schedule.phases || []).find(
    (phase) => Number(phase?.start_date || 0) >= transitionAt,
  );
  if (!futurePhase) return [];

  const futurePriceIds = new Set(
    (futurePhase.items || [])
      .map((item) =>
        normalizeString(
          typeof item?.price === "string" ? item.price : item?.price?.id,
        ),
      )
      .filter(Boolean),
  );
  const smsMeteredPriceId = normalizeString(
    process.env.STRIPE_SMS_METERED_PRICE_ID,
  );

  return (summary?.addons || [])
    .filter((addon) => {
      const relatedPriceIds = [normalizeString(addon?.priceId)];
      if (normalizeString(addon?.code) === SMS_ADDON_CODE) {
        relatedPriceIds.push(smsMeteredPriceId);
      }
      return relatedPriceIds.filter(Boolean).some(
        (priceId) => !futurePriceIds.has(priceId),
      );
    })
    .map((addon) => ({
      code: normalizeString(addon?.code),
      priceId: normalizeString(addon?.priceId),
      name: addon?.productName || "",
      scheduledForRemoval: true,
      scheduledRemovalAt: transitionAt,
    }));
}

async function buildSubscriptionSummary(subscriptionOrId) {
  const subscription = await ensureExpandedSubscription(subscriptionOrId);
  const allItems = await buildSubscriptionItemSummaries(subscription);
  return buildSubscriptionSummaryFromItems(allItems, subscription);
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
    offeredAddonCodes: addons
      .filter((addon) => addon?.offered)
      .map((addon) => normalizeString(addon?.code))
      .join(","),
  };
}

module.exports = {
  SMS_ADDON_CODE,
  SUBSCRIPTION_CATALOG_NAME,
  buildScheduledRemovalState,
  buildCatalogSelectionMetadata,
  buildSmsDeactivationPhaseItems,
  buildSubscriptionItemUpdatePayload,
  buildSubscriptionSummary,
  buildSubscriptionSummaryFromItems,
  catalogCodeAllowsOffered,
  getSmsMeteredPriceId,
  isSmsMeteredComponent,
  getOrCreateOfferedPrice,
  isRecurringMonthlyPrice,
  listSubscriptionCatalogProducts,
  normalizeString,
  resolveCatalogSelection,
  selectionIncludesSms,
};
