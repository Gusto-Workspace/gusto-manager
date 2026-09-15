function normalizeText(value) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
    : "";
}

function normalizeModuleLabel(value) {
  return normalizeText(value).replace(/^module\s+/, "");
}

function normalizePlanLabel(value) {
  return normalizeText(value).replace(/^abonnement\s+/, "");
}

function parsePriceLabel(value) {
  const match = String(value || "")
    .replace(",", ".")
    .match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function numericPrice(item, field) {
  if (item?.[field] !== undefined && item?.[field] !== null) {
    const value = Number(item[field]);
    return Number.isFinite(value) ? value : null;
  }
  return parsePriceLabel(item?.priceLabel);
}

function catalogKind(product = {}) {
  return normalizeText(product.catalogKind || product.metadata?.kind);
}

function catalogCode(product = {}) {
  return String(
    product.catalogCode || product.code || product.metadata?.code || "",
  ).trim();
}

function catalogPrice(product = {}) {
  const amount = product.default_price?.unit_amount;
  return typeof amount === "number" ? amount / 100 : null;
}

function productMatchesIdentifiers(product, item = {}) {
  const priceId = product.default_price?.id || "";
  return Boolean(
    (item.priceId && priceId === item.priceId) ||
      (item.productId && product.id === item.productId) ||
      (item.code && catalogCode(product) === item.code),
  );
}

const MODULE_ALIAS_GROUPS = {
  reservations: new Set(["reservation", "reservations"]),
  personnel: new Set(["gestion du personnel", "personnel"]),
  giftCards: new Set(["cartes cadeaux"]),
};

const MODULE_CODES = {
  reservations: new Set(["reservations"]),
  personnel: new Set(["employees"]),
  giftCards: new Set(["gift_cards"]),
};

function moduleAliasGroup(value) {
  const label = normalizeModuleLabel(value);
  return (
    Object.entries(MODULE_ALIAS_GROUPS).find(([, aliases]) =>
      aliases.has(label),
    )?.[0] || ""
  );
}

function productAliasGroup(product) {
  const code = catalogCode(product);
  return (
    Object.entries(MODULE_CODES).find(([, codes]) => codes.has(code))?.[0] ||
    moduleAliasGroup(product?.name)
  );
}

function findUnique(products, predicate) {
  const matches = products.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function findLegacyPlan(subscription, plans) {
  const identifierMatch = findUnique(plans, (product) =>
    productMatchesIdentifiers(product, subscription),
  );
  if (identifierMatch) return identifierMatch;

  const legacyLabel = normalizePlanLabel(subscription?.name);
  if (legacyLabel) {
    const labelMatch = findUnique(
      plans,
      (product) => normalizePlanLabel(product.name) === legacyLabel,
    );
    if (labelMatch) return labelMatch;
  }

  const legacyPrice = numericPrice(subscription, "priceMonthly");
  if (legacyPrice === null) return null;
  return findUnique(plans, (product) => catalogPrice(product) === legacyPrice);
}

function findLegacyAddon(module, addons) {
  const identifierMatch = findUnique(addons, (product) =>
    productMatchesIdentifiers(product, module),
  );
  if (identifierMatch) return identifierMatch;

  const legacyLabel = normalizeModuleLabel(module?.name);
  const exactLabelMatch = findUnique(
    addons,
    (product) => normalizeModuleLabel(product.name) === legacyLabel,
  );
  if (legacyLabel && exactLabelMatch) return exactLabelMatch;

  const aliasGroup = moduleAliasGroup(module?.name);
  if (!aliasGroup) return null;
  return findUnique(
    addons,
    (product) => productAliasGroup(product) === aliasGroup,
  );
}

function catalogCommercialFields(product = {}) {
  const price = product.default_price || {};
  return {
    name: product.name || "",
    code: catalogCode(product),
    priceId: price.id || "",
    productId: product.id || "",
    currency: String(price.currency || "EUR").toUpperCase(),
    interval: price.recurring?.interval || "month",
    intervalCount: Math.max(1, Number(price.recurring?.interval_count || 1)),
  };
}

function hasCommercialIdentifier(item = {}) {
  return Boolean(item.code || item.priceId || item.productId);
}

function usesStructuredCommercialFormat(document = {}) {
  return Boolean(
    document.commercialSnapshot ||
      hasCommercialIdentifier(document.subscription) ||
      (Array.isArray(document.modules) &&
        document.modules.some(hasCommercialIdentifier)),
  );
}

function cloneLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({ ...line }));
}

function cloneModules(modules) {
  return (Array.isArray(modules) ? modules : []).map((module) => ({
    ...module,
  }));
}

function legacyModuleToLine(module = {}) {
  const offered = module.offered === true;
  const legacyPrice = numericPrice(module, "priceMonthly");
  return {
    label: module.name || "Prestation historique",
    qty: Math.max(1, Number(module.quantity || 1)),
    unitPrice: offered ? 0 : (legacyPrice ?? 0),
    offered,
    active: true,
    kind: "NORMAL",
  };
}

function legacyModuleToCatalogModule(module, product) {
  const offered = module?.offered === true;
  const legacyPrice = numericPrice(module, "priceMonthly");
  return {
    ...catalogCommercialFields(product),
    offered,
    priceMonthly: offered ? 0 : (legacyPrice ?? catalogPrice(product) ?? 0),
    quantity: Math.max(1, Number(module?.quantity || 1)),
    sourceKind: "ADDON",
    requiresReview: false,
  };
}

function normalizeLegacyRental(document, addons, modules, lines) {
  const rental = document?.timeClockTerminalRental;
  if (!rental?.enabled) return;

  const legacyRental = {
    name: "Location tablette",
    offered: false,
    priceMonthly: rental.priceMonthly,
    quantity: rental.quantity,
    code: rental.code || "tab_rental",
    priceId: rental.priceId || "",
    productId: rental.productId || "",
  };
  const product = findLegacyAddon(legacyRental, addons);
  if (!product) {
    lines.push(legacyModuleToLine(legacyRental));
    return;
  }

  if (!modules.some((module) => productMatchesIdentifiers(product, module))) {
    modules.push(legacyModuleToCatalogModule(legacyRental, product));
  }
}

function normalizeDocumentCommercialForForm(
  document = {},
  catalogProducts = [],
) {
  const subscription = { ...(document.subscription || {}) };
  if (
    document.subscriptionLabel &&
    !subscription.name &&
    !Number(subscription.priceMonthly)
  ) {
    subscription.name = String(document.subscriptionLabel);
    const legacyPrice = parsePriceLabel(document.subscriptionLabel);
    if (legacyPrice !== null) subscription.priceMonthly = legacyPrice;
  }
  const modules = cloneModules(document.modules);
  const lines = cloneLines(document.lines);
  const products = Array.isArray(catalogProducts) ? catalogProducts : [];
  const plans = products.filter((product) => catalogKind(product) === "plan");
  const addons = products.filter((product) => catalogKind(product) === "addon");

  if (usesStructuredCommercialFormat(document)) {
    normalizeLegacyRental(document, addons, modules, lines);
    return { subscription, modules, lines, usedLegacyFallback: false };
  }

  const plan = findLegacyPlan(subscription, plans);
  const normalizedSubscription = plan
    ? {
        ...subscription,
        ...catalogCommercialFields(plan),
        priceMonthly:
          numericPrice(subscription, "priceMonthly") ?? catalogPrice(plan) ?? 0,
        quantity: Math.max(1, Number(subscription.quantity || 1)),
      }
    : subscription;

  const normalizedModules = [];
  modules.forEach((module) => {
    const product = findLegacyAddon(module, addons);
    if (product) {
      normalizedModules.push(legacyModuleToCatalogModule(module, product));
    } else if (module?.name) {
      lines.push(legacyModuleToLine(module));
    }
  });
  normalizeLegacyRental(document, addons, normalizedModules, lines);

  return {
    subscription: normalizedSubscription,
    modules: normalizedModules,
    lines,
    usedLegacyFallback: true,
  };
}

module.exports = {
  normalizeDocumentCommercialForForm,
  usesStructuredCommercialFormat,
};
