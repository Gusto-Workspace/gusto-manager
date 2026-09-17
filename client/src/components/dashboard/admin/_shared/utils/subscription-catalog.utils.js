function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const MULTI_QUANTITY_ADDON_CODE = "tab_rental";

export function allowsCatalogProductOffered(product) {
  return product?.allowOffered !== false;
}

export function supportsMultipleQuantity(product) {
  return (
    normalizeString(product?.catalogCode || product?.code) ===
    MULTI_QUANTITY_ADDON_CODE
  );
}

export function getCatalogProductByPriceId(products = [], priceId) {
  const normalizedPriceId = normalizeString(priceId);
  if (!normalizedPriceId) return null;

  return (
    products.find(
      (product) => product?.default_price?.id === normalizedPriceId,
    ) || null
  );
}

export function splitSubscriptionCatalogProducts(products = []) {
  return (Array.isArray(products) ? products : []).reduce(
    (acc, product) => {
      const kind =
        normalizeString(product?.catalogKind) ||
        normalizeString(product?.metadata?.kind);

      if (kind === "plan") acc.plans.push(product);
      else if (kind === "addon") acc.addons.push(product);

      return acc;
    },
    { plans: [], addons: [] },
  );
}

export function formatCatalogProductLabel(
  product,
  { showMonthlyRecurrence = false } = {},
) {
  if (!product) return "";

  const amount = product?.default_price?.unit_amount;
  const currency = product?.default_price?.currency || "";
  const formattedAmount = typeof amount === "number" ? amount / 100 : null;
  const formattedCurrency = currency ? currency.toUpperCase() : "";
  const interval = product?.default_price?.recurring?.interval || "";
  const intervalCount = Math.max(
    1,
    Number(product?.default_price?.recurring?.interval_count || 1),
  );
  const recurrenceLabel =
    showMonthlyRecurrence && interval === "month"
      ? intervalCount === 1
        ? " / mois"
        : ` / ${intervalCount} mois`
      : "";

  return `${product.name || ""}${
    formattedAmount != null
      ? ` — ${formattedAmount} ${formattedCurrency}${recurrenceLabel}`
      : ""
  }`;
}

export function computeCatalogTotal({
  products = [],
  selectedPlanPriceId = "",
  selectedAddonPriceIds = [],
  selectedAddonQuantities = {},
  offeredAddonPriceIds = [],
}) {
  const selectedPlan = getCatalogProductByPriceId(
    products,
    selectedPlanPriceId,
  );
  const selectedAddons = Array.from(
    new Set(Array.isArray(selectedAddonPriceIds) ? selectedAddonPriceIds : []),
  )
    .map((priceId) => getCatalogProductByPriceId(products, priceId))
    .filter(Boolean);

  const totalAmountCents = [selectedPlan, ...selectedAddons].reduce(
    (sum, product) => {
      const priceId = product?.default_price?.id || "";
      const quantity =
        product === selectedPlan || !supportsMultipleQuantity(product)
          ? 1
          : Math.max(1, Number(selectedAddonQuantities?.[priceId] || 1));

      return (
        sum +
        (allowsCatalogProductOffered(product) &&
        offeredAddonPriceIds.includes(priceId)
          ? 0
          : Number(product?.default_price?.unit_amount || 0) * quantity)
      );
    },
    0,
  );

  const currency =
    selectedPlan?.default_price?.currency ||
    selectedAddons[0]?.default_price?.currency ||
    "";

  return {
    selectedPlan,
    selectedAddons,
    totalAmount: totalAmountCents / 100,
    currency: currency ? currency.toUpperCase() : "",
  };
}
