function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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

export function formatCatalogProductLabel(product) {
  if (!product) return "";

  const amount = product?.default_price?.unit_amount;
  const currency = product?.default_price?.currency || "";
  const formattedAmount = typeof amount === "number" ? amount / 100 : null;
  const formattedCurrency = currency ? currency.toUpperCase() : "";

  return `${product.name || ""}${
    formattedAmount != null ? ` — ${formattedAmount} ${formattedCurrency}` : ""
  }`;
}

export function computeCatalogTotal({
  products = [],
  selectedPlanPriceId = "",
  selectedAddonPriceIds = [],
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
    (sum, product) => sum + Number(product?.default_price?.unit_amount || 0),
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
