const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateAdmin = require("../../middleware/authenticate-admin");
const RestaurantModel = require("../../models/restaurant.model");
const DocumentModel = require("../../models/document.model");
const {
  listAllStripeSubscriptions,
} = require("../../services/stripe-admin.service");
const {
  clearStaleMigratedFromSubscriptionId,
  ensureRestaurantStripeCustomer,
  customerIsDedicatedToRestaurant,
  findRestaurantSubscription,
  invoiceBelongsToCurrentPayerHistory,
  isStripeCustomerDedicatedToRestaurant,
  listSubscriptionInvoicesHistory,
  loadRestaurantBillingContext,
  retrieveStripeCustomer,
  retrieveStripeSubscription,
  retrieveStripeSubscriptionOrNull,
} = require("../../services/stripe-billing.service");
const {
  SMS_ADDON_CODE,
  buildCatalogSelectionMetadata,
  buildScheduledRemovalState,
  buildSmsDeactivationPhaseItems,
  buildSubscriptionItemUpdatePayload,
  buildSubscriptionSummary,
  getSmsMeteredPriceId,
  getOrCreateOfferedPrice,
  listSubscriptionCatalogProducts,
  resolveCatalogSelection,
  selectionIncludesSms,
} = require("../../services/stripe-subscription-catalog.service");
const {
  buildStripeCommercialSnapshot,
} = require("../../services/contract-commercial.service");
const {
  prepareSubscriptionAmendment,
} = require("../../services/contract-amendment.service");

router.use("/admin", authenticateAdmin);

router.get(
  "/admin/restaurants/:restaurantId/contract-subscription-prefill",
  async (req, res) => {
    try {
      const latestSigned = await DocumentModel.findOne({
        type: "CONTRACT",
        restaurantId: req.params.restaurantId,
        status: "SIGNED",
      }).sort({ versionNumber: -1, createdAt: -1 });
      const snapshot =
        latestSigned?.commercialSnapshot ||
        latestSigned?.contractSnapshot?.commercialSnapshot;

      if (!latestSigned || !Array.isArray(snapshot?.items)) {
        return res.status(200).json({ available: false });
      }

      const plan = snapshot.items.find(
        (item) => item.kind === "PLAN" && normalizeString(item.priceId),
      );
      const addons = snapshot.items.filter(
        (item) => item.kind === "ADDON" && normalizeString(item.priceId),
      );

      return res.status(200).json({
        available: Boolean(plan),
        documentId: latestSigned._id,
        documentNumber: latestSigned.docNumber,
        planPriceId: plan?.priceId || "",
        addonItems: addons.map((item) => ({
          priceId: item.priceId,
          quantity: Math.max(1, Number(item.quantity || 1)),
          offered: Number(item.unitAmount || 0) <= 0,
        })),
        ignoredContractualItems: snapshot.items.filter(
          (item) => item.kind === "OTHER" || !normalizeString(item.priceId),
        ).length,
      });
    } catch (error) {
      console.error("Erreur préremplissage contrat abonnement:", error);
      return res.status(500).json({
        message: "Impossible de charger les prestations du contrat signé.",
      });
    }
  },
);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toStripeId(value) {
  if (typeof value === "string") return value;
  return normalizeString(value?.id);
}

function getSubscriptionPeriodEnd(subscription) {
  return Number(
    subscription?.current_period_end ||
      subscription?.items?.data?.[0]?.current_period_end ||
      0,
  );
}

function getSubscriptionPeriodStart(subscription) {
  return Number(
    subscription?.current_period_start ||
      subscription?.items?.data?.[0]?.current_period_start ||
      0,
  );
}

function toSchedulePhaseItems(subscription, excludedPriceIds = new Set()) {
  return (subscription?.items?.data || [])
    .filter(
      (item) =>
        item?.price?.id && !excludedPriceIds.has(normalizeString(item.price.id)),
    )
    .map((item) => ({
      price: item.price.id,
      ...(item?.price?.recurring?.usage_type === "metered"
        ? {}
        : { quantity: Number(item.quantity || 1) }),
    }));
}

function toExpandableId(value) {
  if (typeof value === "string") return value;
  return normalizeString(value?.id);
}

function preservedSchedulePhaseFields(phase, { preserveTrial = false } = {}) {
  if (!phase) return {};
  const defaultTaxRates = (phase.default_tax_rates || [])
    .map(toExpandableId)
    .filter(Boolean);
  const discounts = (phase.discounts || [])
    .map((entry) => {
      const discount = toExpandableId(entry?.discount);
      const promotionCode = toExpandableId(entry?.promotion_code);
      const coupon = toExpandableId(entry?.coupon);
      if (discount) return { discount };
      if (promotionCode) return { promotion_code: promotionCode };
      if (coupon) return { coupon };
      return null;
    })
    .filter(Boolean);

  return {
    ...(defaultTaxRates.length ? { default_tax_rates: defaultTaxRates } : {}),
    ...(discounts.length ? { discounts } : {}),
    ...(phase.description ? { description: phase.description } : {}),
    ...(preserveTrial && phase.trial_end
      ? { trial_end: phase.trial_end }
      : {}),
  };
}

async function releaseGustoSmsDeactivationSchedule({
  subscription,
  restaurant,
}) {
  const scheduleId = toStripeId(subscription?.schedule);
  if (!scheduleId) return false;

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const storedScheduleId = normalizeString(
    restaurant?.reservationsSettings?.smsReminder?.commercialDeactivation
      ?.stripeScheduleId,
  );
  const belongsToSmsDeactivation =
    normalizeString(schedule?.metadata?.gustoPurpose) ===
      "sms_deactivation" || storedScheduleId === scheduleId;
  if (!belongsToSmsDeactivation) {
    const error = new Error(
      "Cet abonnement est déjà géré par un autre Subscription Schedule Stripe.",
    );
    error.statusCode = 409;
    throw error;
  }

  if (["active", "not_started"].includes(schedule.status)) {
    await stripe.subscriptionSchedules.release(scheduleId, {
      preserve_cancel_date: true,
    });
  }
  return true;
}

async function scheduleSmsDeactivation({
  subscription,
  restaurantId,
  targetSelection,
}) {
  const effectiveAt = getSubscriptionPeriodEnd(subscription);
  const phaseStart = getSubscriptionPeriodStart(subscription);
  if (!effectiveAt || !phaseStart || effectiveAt <= phaseStart) {
    const error = new Error(
      "La période Stripe courante ne permet pas de programmer la désactivation SMS.",
    );
    error.statusCode = 409;
    throw error;
  }

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscription.id,
  });
  const scheduledPhaseStart = Number(
    schedule?.current_phase?.start_date || phaseStart,
  );
  const scheduledEffectiveAt = Number(
    schedule?.current_phase?.end_date || effectiveAt,
  );
  const currentSchedulePhase = (schedule?.phases || []).find(
    (phase) =>
      Number(phase?.start_date) === scheduledPhaseStart &&
      Number(phase?.end_date) === scheduledEffectiveAt,
  );
  const preservedCurrentPhase = preservedSchedulePhaseFields(
    currentSchedulePhase,
    { preserveTrial: true },
  );
  const preservedFuturePhase = preservedSchedulePhaseFields(
    currentSchedulePhase,
  );
  const currentItems = toSchedulePhaseItems(subscription);
  const targetItems = buildSmsDeactivationPhaseItems(subscription);
  const recurring = subscription?.items?.data?.find(
    (item) => item?.price?.id === targetSelection?.plan?.priceId,
  )?.price?.recurring;

  if (!targetItems.length || !recurring?.interval) {
    await stripe.subscriptionSchedules.release(schedule.id, {
      preserve_cancel_date: true,
    });
    const error = new Error(
      "Impossible de déterminer la phase Stripe suivant la désactivation SMS.",
    );
    error.statusCode = 409;
    throw error;
  }

  try {
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      proration_behavior: "none",
      metadata: {
        gustoPurpose: "sms_deactivation",
        restaurantId,
        effectiveAt: String(scheduledEffectiveAt),
      },
      phases: [
        {
          ...preservedCurrentPhase,
          start_date: scheduledPhaseStart,
          end_date: scheduledEffectiveAt,
          items: currentItems,
          proration_behavior: "none",
          metadata: {
            ...(subscription.metadata || {}),
            smsDeactivationPending: "true",
            smsDeactivationEffectiveAt: String(scheduledEffectiveAt),
          },
        },
        {
          ...preservedFuturePhase,
          start_date: scheduledEffectiveAt,
          duration: {
            interval: recurring.interval,
            interval_count: Number(recurring.interval_count || 1),
          },
          items: targetItems,
          proration_behavior: "none",
          metadata: {
            ...(subscription.metadata || {}),
            ...buildCatalogSelectionMetadata(targetSelection),
            smsDeactivationPending: "",
            smsDeactivationEffectiveAt: "",
          },
        },
      ],
    });
  } catch (error) {
    try {
      await stripe.subscriptionSchedules.release(schedule.id, {
        preserve_cancel_date: true,
      });
    } catch (_) {
      // La première erreur Stripe reste la cause utile à remonter.
    }
    throw error;
  }

  return { scheduleId: schedule.id, effectiveAt: scheduledEffectiveAt };
}

function toStripeCustomerId(customer) {
  if (!customer) return "";
  if (typeof customer === "string") return customer;
  if (typeof customer.id === "string") return customer.id;
  return "";
}

function uniqueNonEmpty(values = []) {
  return Array.from(
    new Set(values.map((value) => normalizeString(value)).filter(Boolean)),
  );
}

function paginateArray(items = [], page = 1, limit = 20) {
  const safeLimit = Math.max(1, toInteger(limit, 20));
  const total = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.min(Math.max(1, toInteger(page, 1)), totalPages);
  const start = (safePage - 1) * safeLimit;

  return {
    items: (items || []).slice(start, start + safeLimit),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasPrevPage: safePage > 1,
      hasNextPage: safePage < totalPages,
    },
  };
}

function serializeAddress(address = {}) {
  return {
    line1: normalizeString(address?.line1),
    zipCode: normalizeString(address?.zipCode || address?.postal_code),
    city: normalizeString(address?.city),
    country: normalizeString(address?.country) || "France",
  };
}

function buildPersonName(person = {}) {
  return [person?.firstname, person?.lastname]
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .join(" ");
}

function buildSubscriptionPayerMetadata({
  metadata = {},
  owner,
  payerChangeRequired = false,
}) {
  return {
    ...metadata,
    payerOwnerId: owner?._id?.toString?.() || "",
    payerOwnerName: buildPersonName(owner),
    payerOwnerEmail: normalizeString(owner?.email),
    payerChangeRequired: payerChangeRequired ? "true" : "false",
    pendingPayerOwnerId: payerChangeRequired
      ? owner?._id?.toString?.() || ""
      : "",
    pendingPayerOwnerName: payerChangeRequired ? buildPersonName(owner) : "",
    payerUpdatedAt: payerChangeRequired
      ? metadata?.payerUpdatedAt || ""
      : new Date().toISOString(),
  };
}

function toTimestamp(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getInvoiceLineSubscriptionId(line) {
  return normalizeString(
    line?.subscription ||
      line?.parent?.subscription_item_details?.subscription ||
      line?.subscription_item_details?.subscription,
  );
}

function getInvoiceLinePriceId(line) {
  return normalizeString(
    line?.price?.id ||
      line?.pricing?.price_details?.price ||
      line?.plan?.id ||
      line?.parent?.subscription_item_details?.price,
  );
}

function isRecurringSubscriptionInvoiceLine({
  line,
  subscriptionId,
  subscriptionPriceIds,
}) {
  const periodStart = toTimestamp(line?.period?.start);
  const periodEnd = toTimestamp(line?.period?.end);

  if (!periodStart || !periodEnd || periodEnd <= periodStart) {
    return false;
  }

  if (line?.proration === true) {
    return false;
  }

  if (normalizeString(line?.type) === "subscription") {
    return true;
  }

  const lineSubscriptionId = getInvoiceLineSubscriptionId(line);
  if (
    lineSubscriptionId &&
    lineSubscriptionId === normalizeString(subscriptionId)
  ) {
    return true;
  }

  const linePriceId = getInvoiceLinePriceId(line);
  return Boolean(linePriceId && subscriptionPriceIds.has(linePriceId));
}

function getSubscriptionRecurring(sourceSubscription) {
  return (
    (sourceSubscription?.items?.data || [])
      .map((item) => item?.price?.recurring || null)
      .find(
        (recurring) =>
          normalizeString(recurring?.interval) &&
          toInteger(recurring?.interval_count, 1) > 0,
      ) || null
  );
}

function addSingleRecurringInterval(baseTimestamp, recurring) {
  const timestamp = toTimestamp(baseTimestamp);
  if (!timestamp) return 0;

  const interval = normalizeString(recurring?.interval);
  const intervalCount = Math.max(1, toInteger(recurring?.interval_count, 1));
  const date = new Date(timestamp * 1000);

  if (interval === "day") {
    date.setUTCDate(date.getUTCDate() + intervalCount);
  } else if (interval === "week") {
    date.setUTCDate(date.getUTCDate() + intervalCount * 7);
  } else if (interval === "month") {
    date.setUTCMonth(date.getUTCMonth() + intervalCount);
  } else if (interval === "year") {
    date.setUTCFullYear(date.getUTCFullYear() + intervalCount);
  } else {
    return 0;
  }

  const nextTimestamp = Math.floor(date.getTime() / 1000);
  return nextTimestamp > timestamp ? nextTimestamp : 0;
}

function advanceRecurringTimestamp(baseTimestamp, recurring, minimumExclusive) {
  let nextTimestamp = toTimestamp(baseTimestamp);
  const threshold = toTimestamp(minimumExclusive);

  if (!nextTimestamp) {
    return 0;
  }

  for (let attempts = 0; attempts < 120; attempts += 1) {
    if (nextTimestamp > threshold) {
      return nextTimestamp;
    }

    const advancedTimestamp = addSingleRecurringInterval(
      nextTimestamp,
      recurring,
    );

    if (!advancedTimestamp || advancedTimestamp <= nextTimestamp) {
      return 0;
    }

    nextTimestamp = advancedTimestamp;
  }

  return 0;
}

function subscriptionMayRenew(sourceSubscription) {
  return new Set([
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "incomplete",
  ]).has(normalizeString(sourceSubscription?.status));
}

async function deriveSubscriptionNextChargeAt(sourceSubscription) {
  const directNextChargeAt = toTimestamp(
    sourceSubscription?.current_period_end,
  );
  const recurring = getSubscriptionRecurring(sourceSubscription);
  const now = Math.floor(Date.now() / 1000);

  const subscriptionPriceIds = new Set(
    (sourceSubscription?.items?.data || [])
      .map((item) => normalizeString(item?.price?.id))
      .filter(Boolean),
  );

  const invoices = await stripe.invoices.list({
    subscription: sourceSubscription.id,
    limit: 12,
    expand: ["data.lines.data.price"],
  });

  const eligibleInvoices = (invoices?.data || []).filter((invoice) => {
    const status = normalizeString(invoice?.status);
    return status !== "void";
  });

  const invoiceDerivedNextChargeAt = eligibleInvoices.reduce(
    (maxPeriodEnd, invoice) => {
      const invoicePeriodEnd = (invoice?.lines?.data || [])
        .filter((line) =>
          isRecurringSubscriptionInvoiceLine({
            line,
            subscriptionId: sourceSubscription.id,
            subscriptionPriceIds,
          }),
        )
        .reduce(
          (lineMaxPeriodEnd, line) =>
            Math.max(lineMaxPeriodEnd, toTimestamp(line?.period?.end)),
          0,
        );

      return Math.max(maxPeriodEnd, invoicePeriodEnd);
    },
    0,
  );

  let invoiceCreatedDerivedNextChargeAt = 0;
  let anchorDerivedNextChargeAt = 0;

  if (recurring && subscriptionMayRenew(sourceSubscription)) {
    const latestInvoiceCreatedAt = eligibleInvoices.reduce(
      (maxCreatedAt, invoice) =>
        Math.max(maxCreatedAt, toTimestamp(invoice?.created)),
      0,
    );

    invoiceCreatedDerivedNextChargeAt = advanceRecurringTimestamp(
      latestInvoiceCreatedAt,
      recurring,
      now,
    );
    anchorDerivedNextChargeAt = advanceRecurringTimestamp(
      toTimestamp(sourceSubscription?.billing_cycle_anchor),
      recurring,
      now,
    );
  }

  return Math.max(
    directNextChargeAt,
    invoiceDerivedNextChargeAt,
    invoiceCreatedDerivedNextChargeAt,
    anchorDerivedNextChargeAt,
  );
}

async function resolveDisplayedNextChargeAt(subscription) {
  return deriveSubscriptionNextChargeAt(subscription);
}

function isSubscriptionMigrationSafe({ subscription, latestInvoiceStatus }) {
  const allowedStatuses = new Set(["active", "trialing"]);
  const safeInvoiceStatuses = new Set(["", "paid", "draft", "void"]);

  if (!subscription?.id) {
    return {
      safe: false,
      reason: "Abonnement Stripe introuvable pour cette migration.",
    };
  }

  if (!allowedStatuses.has(subscription.status)) {
    return {
      safe: false,
      reason:
        "La migration automatique n'est disponible que pour les abonnements actifs ou en période d'essai.",
    };
  }

  if (!safeInvoiceStatuses.has(normalizeString(latestInvoiceStatus))) {
    return {
      safe: false,
      reason:
        "La dernière facture de cet abonnement n'est pas soldée. Il faut d'abord régulariser la facture avant la migration.",
    };
  }

  return { safe: true, reason: "" };
}

function serializeSubscriptionLineItem(item = {}) {
  return {
    subscriptionItemId: normalizeString(item?.subscriptionItemId),
    priceId: normalizeString(item?.priceId),
    productId: normalizeString(item?.productId),
    name: item?.productName || "",
    description: item?.description || "",
    amount: Number(item?.amount || 0),
    totalAmount: Number(item?.totalAmount || 0),
    currency: item?.currency || "",
    interval: normalizeString(item?.interval),
    intervalCount: Number(item?.intervalCount || 1),
    quantity: Number(item?.quantity || 1),
    kind: normalizeString(item?.kind),
    code: normalizeString(item?.code),
  };
}

function serializeSubscriptionSummary(summary = {}) {
  return {
    plan: summary?.plan ? serializeSubscriptionLineItem(summary.plan) : null,
    addons: Array.isArray(summary?.addons)
      ? summary.addons.map(serializeSubscriptionLineItem)
      : [],
    otherItems: Array.isArray(summary?.otherItems)
      ? summary.otherItems.map(serializeSubscriptionLineItem)
      : [],
    items: Array.isArray(summary?.items)
      ? summary.items.map(serializeSubscriptionLineItem)
      : [],
    planPriceId: normalizeString(summary?.plan?.priceId),
    addonPriceIds: Array.isArray(summary?.addons)
      ? summary.addons
          .map((item) => normalizeString(item?.priceId))
          .filter(Boolean)
      : [],
    addonItems: Array.isArray(summary?.addons)
      ? summary.addons.map((item) => ({
          priceId: normalizeString(item?.priceId),
          quantity: Number(item?.quantity || 1),
        }))
      : [],
    totalAmount: Number(summary?.totalAmount || 0),
    currency: summary?.currency || "",
  };
}


async function materializeOfferedAddonPrices(selection) {
  const addons = await Promise.all(
    selection.addons.map(async (addon) => ({
      ...addon,
      priceId: await getOrCreateOfferedPrice(addon),
      amount: addon.offered ? 0 : addon.amount,
      amountCents: addon.offered ? 0 : addon.amountCents,
    })),
  );
  return { ...selection, addons };
}

async function findRestaurantSubscriptionOnCustomer({
  stripeCustomerId,
  restaurantId,
}) {
  const customerId = normalizeString(stripeCustomerId);
  if (!customerId) return null;

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    expand: ["data.items.data.price", "data.latest_invoice"],
    limit: 100,
  });

  return (
    subscriptions.data.find(
      (subscription) =>
        normalizeString(subscription?.metadata?.restaurantId) ===
          normalizeString(String(restaurantId)) &&
        subscription.status !== "canceled",
    ) || null
  );
}

async function buildSubscriptionMigrationPreview({
  sourceSubscriptionId,
  restaurantId,
}) {
  const sourceSubscription = await stripe.subscriptions.retrieve(
    sourceSubscriptionId,
    {
      expand: ["items.data.price", "latest_invoice"],
    },
  );

  const resolvedRestaurantId =
    normalizeString(restaurantId) ||
    normalizeString(sourceSubscription?.metadata?.restaurantId);

  if (!resolvedRestaurantId) {
    const error = new Error(
      "Impossible de déterminer le restaurant rattaché à cet abonnement Stripe.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    restaurantId &&
    normalizeString(restaurantId) !== normalizeString(resolvedRestaurantId)
  ) {
    const error = new Error(
      "Le restaurant demandé ne correspond pas à l'abonnement Stripe sélectionné.",
    );
    error.statusCode = 400;
    throw error;
  }

  const { restaurant, owner } =
    await loadRestaurantBillingContext(resolvedRestaurantId);
  const sourceCustomerId = toStripeCustomerId(sourceSubscription.customer);
  const sourceCustomer = await retrieveStripeCustomer(sourceCustomerId);
  const sourceCustomerIsDedicated = customerIsDedicatedToRestaurant(
    sourceCustomer,
    restaurant._id,
  );
  const latestInvoiceStatus = normalizeString(
    sourceSubscription?.latest_invoice?.status,
  );

  let existingDedicatedSubscription = null;
  if (
    normalizeString(restaurant?.stripeCustomerId) &&
    normalizeString(restaurant?.stripeCustomerId) !== sourceCustomerId
  ) {
    existingDedicatedSubscription = await findRestaurantSubscriptionOnCustomer({
      stripeCustomerId: restaurant.stripeCustomerId,
      restaurantId: restaurant._id,
    });
  }

  const migrationSafety = isSubscriptionMigrationSafe({
    subscription: sourceSubscription,
    latestInvoiceStatus,
  });

  let blockingReason = "";
  if (sourceCustomerIsDedicated) {
    blockingReason =
      "Cet abonnement est déjà rattaché à un client Stripe dédié à ce restaurant.";
  } else if (existingDedicatedSubscription) {
    blockingReason =
      "Une migration est déjà en cours ou un abonnement dédié existe déjà pour ce restaurant.";
  } else if (!migrationSafety.safe) {
    blockingReason = migrationSafety.reason;
  }
  const summary = await buildSubscriptionSummary(sourceSubscription);

  const nextChargeAt = await deriveSubscriptionNextChargeAt(sourceSubscription);

  return {
    restaurant,
    owner,
    sourceSubscription,
    sourceCustomerId,
    sourceCustomer,
    sourceCustomerIsDedicated,
    existingDedicatedSubscription,
    latestInvoiceStatus,
    canMigrate: !blockingReason,
    blockingReason,
    summary,
    nextChargeAt,
  };
}

async function buildSubscriptionPayerChangePreview({ restaurantId }) {
  const { subscription, stripeCustomerId } = await findRestaurantSubscription({
    restaurantId,
  });

  if (!subscription?.id) {
    const error = new Error(
      "Aucun abonnement actif n'a été trouvé pour ce restaurant.",
    );
    error.statusCode = 404;
    throw error;
  }

  const isDedicatedRestaurantCustomer =
    await isStripeCustomerDedicatedToRestaurant({
      stripeCustomerId,
      restaurantId,
    });

  if (!isDedicatedRestaurantCustomer) {
    const error = new Error(
      "Le changement de payeur n'est disponible que pour un client Stripe dédié au restaurant.",
    );
    error.statusCode = 409;
    throw error;
  }

  const { restaurant, owner } =
    await loadRestaurantBillingContext(restaurantId);
  const sourceCustomer = await retrieveStripeCustomer(stripeCustomerId);
  const hydratedSubscription = await retrieveStripeSubscription(
    subscription.id,
    {
      expand: ["items.data.price", "latest_invoice", "default_payment_method"],
    },
  );
  const summary = await buildSubscriptionSummary(hydratedSubscription);

  const currentPayerOwnerId = normalizeString(
    hydratedSubscription?.metadata?.payerOwnerId,
  );
  const pendingPayerOwnerId = normalizeString(
    hydratedSubscription?.metadata?.pendingPayerOwnerId,
  );
  const ownerId = owner?._id?.toString?.() || "";
  const payerChangeRequired =
    normalizeString(hydratedSubscription?.metadata?.payerChangeRequired) ===
      "true" ||
    (Boolean(ownerId) &&
      ((currentPayerOwnerId && currentPayerOwnerId !== ownerId) ||
        pendingPayerOwnerId === ownerId));

  return {
    restaurant,
    owner,
    stripeCustomerId,
    sourceCustomer,
    subscription: hydratedSubscription,
    summary,
    payerChangeRequired,
  };
}

async function buildSubscriptionEditPreview({ subscriptionId }) {
  const subscription = await retrieveStripeSubscription(subscriptionId, {
    expand: ["items.data.price", "latest_invoice"],
  });

  if (!subscription?.id) {
    const error = new Error("Abonnement Stripe introuvable.");
    error.statusCode = 404;
    throw error;
  }

  const restaurantId = normalizeString(subscription?.metadata?.restaurantId);
  if (!restaurantId) {
    const error = new Error(
      "Impossible de retrouver le restaurant associé à cet abonnement.",
    );
    error.statusCode = 400;
    throw error;
  }

  const { restaurant, owner } =
    await loadRestaurantBillingContext(restaurantId);
  const summary = await buildSubscriptionSummary(subscription);
  const nextChargeAt = await resolveDisplayedNextChargeAt(subscription);
  const scheduleId = toStripeId(subscription.schedule);
  const schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : null;
  const scheduledRemovals = buildScheduledRemovalState({ schedule, summary });

  return {
    restaurant,
    owner,
    subscription,
    summary,
    nextChargeAt,
    scheduledRemovals,
  };
}

function serializePayerChangePreview(preview) {
  const summary = serializeSubscriptionSummary(preview.summary);

  return {
    canUpdatePayer: true,
    payerChangeRequired: preview.payerChangeRequired,
    restaurant: {
      id: preview.restaurant?._id?.toString?.() || "",
      name: preview.restaurant?.name || "",
      phone: preview.restaurant?.phone || "",
      email: preview.restaurant?.email || "",
      language: preview.restaurant?.language || "fr",
      address: serializeAddress(preview.restaurant?.address),
    },
    owner: {
      id: preview.owner?._id?.toString?.() || "",
      firstname: preview.owner?.firstname || "",
      lastname: preview.owner?.lastname || "",
      email: preview.owner?.email || "",
    },
    customer: {
      id: preview.stripeCustomerId,
      name: preview.sourceCustomer?.name || "",
      email: preview.sourceCustomer?.email || "",
    },
    subscription: {
      id: preview.subscription?.id || "",
      status: preview.subscription?.status || "",
      currentPeriodEnd: toTimestamp(preview.subscription?.current_period_end),
      chargesImmediately: true,
      ...summary,
      priceId: summary.planPriceId || "",
      productName: summary.plan?.name || "",
      amount: summary.totalAmount || null,
      currency: summary.currency || "",
      currentPayerOwnerName:
        normalizeString(preview.subscription?.metadata?.payerOwnerName) ||
        normalizeString(
          preview.subscription?.metadata?.previousPayerOwnerName,
        ) ||
        preview.sourceCustomer?.name ||
        "",
    },
  };
}

function serializeMigrationPreview(preview) {
  const restaurant = preview.restaurant;
  const owner = preview.owner;
  const sourceSubscription = preview.sourceSubscription;
  const sourceCustomer = preview.sourceCustomer;
  const summary = serializeSubscriptionSummary(preview.summary);

  return {
    canMigrate: preview.canMigrate,
    blockingReason: preview.blockingReason,
    restaurant: {
      id: restaurant?._id?.toString?.() || "",
      name: restaurant?.name || "",
      phone: restaurant?.phone || "",
      email: restaurant?.email || "",
      language: restaurant?.language || "fr",
      address: serializeAddress(restaurant?.address),
      stripeCustomerId: normalizeString(restaurant?.stripeCustomerId),
    },
    owner: {
      id: owner?._id?.toString?.() || "",
      firstname: owner?.firstname || "",
      lastname: owner?.lastname || "",
      email: owner?.email || "",
    },
    sourceCustomer: {
      id: preview.sourceCustomerId,
      name: sourceCustomer?.name || "",
      email: sourceCustomer?.email || "",
      isDedicatedToRestaurant: preview.sourceCustomerIsDedicated,
    },
    sourceSubscription: {
      id: sourceSubscription?.id || "",
      status: sourceSubscription?.status || "",
      currentPeriodEnd: preview.nextChargeAt,
      latestInvoiceStatus: preview.latestInvoiceStatus,
      ...summary,
      priceId: summary.planPriceId || "",
      productName: summary.plan?.name || "",
      amount: summary.totalAmount || null,
      currency: summary.currency || "",
    },
    existingDedicatedSubscription: preview.existingDedicatedSubscription
      ? {
          id: preview.existingDedicatedSubscription.id,
          status: preview.existingDedicatedSubscription.status,
        }
      : null,
  };
}

function serializeEditPreview(preview) {
  const summary = serializeSubscriptionSummary(preview.summary);
  const scheduledRemovalByPriceId = new Map(
    (preview.scheduledRemovals || []).map((removal) => [
      removal.priceId,
      removal,
    ]),
  );
  return {
    restaurant: {
      id: preview.restaurant?._id?.toString?.() || "",
      name: preview.restaurant?.name || "",
      phone: preview.restaurant?.phone || "",
      email: preview.restaurant?.email || "",
      language: preview.restaurant?.language || "fr",
      address: serializeAddress(preview.restaurant?.address),
    },
    owner: {
      id: preview.owner?._id?.toString?.() || "",
      firstname: preview.owner?.firstname || "",
      lastname: preview.owner?.lastname || "",
      email: preview.owner?.email || "",
    },
    subscription: {
      id: preview.subscription?.id || "",
      status: preview.subscription?.status || "",
      currentPeriodEnd:
        Number(preview.nextChargeAt || 0) ||
        toTimestamp(preview.subscription?.current_period_end),
      nextChargeAt:
        Number(preview.nextChargeAt || 0) ||
        toTimestamp(preview.subscription?.current_period_end),
      ...summary,
      addons: summary.addons.map((addon) => ({
        ...addon,
        ...(scheduledRemovalByPriceId.get(addon.priceId) || {
          scheduledForRemoval: false,
          scheduledRemovalAt: 0,
        }),
      })),
      scheduledRemovals: preview.scheduledRemovals || [],
    },
  };
}

// GET STRIPE SUBSCRIPTIONS
router.get("/admin/subscriptions", async (req, res) => {
  try {
    const products = await listSubscriptionCatalogProducts();
    res.status(200).json({ products });
  } catch (error) {
    console.error("Erreur lors de la récupération des abonnements:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des abonnements Stripe",
    });
  }
});

// CREATE SETUP INTENT FOR SEPA
router.post("/admin/create-setup-intent", async (req, res) => {
  const { stripeCustomerId, restaurantId } = req.body;

  try {
    let resolvedStripeCustomerId = stripeCustomerId;

    if (restaurantId) {
      const { stripeCustomerId: restaurantStripeCustomerId } =
        await ensureRestaurantStripeCustomer({
          restaurantId,
          createIfMissing: true,
        });

      resolvedStripeCustomerId = restaurantStripeCustomerId;
    }

    if (!resolvedStripeCustomerId) {
      return res
        .status(400)
        .json({ message: "Aucun client Stripe trouvé pour ce restaurant." });
    }

    // Créer un SetupIntent pour du SEPA Direct Debit
    const setupIntent = await stripe.setupIntents.create({
      customer: resolvedStripeCustomerId,
      payment_method_types: ["sepa_debit"],
    });

    // Renvoyer le clientSecret au frontend
    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("Erreur lors de la création du SetupIntent:", err);
    res.status(err?.statusCode || 500).json({
      error: err?.message || "Erreur lors de la création du SetupIntent",
    });
  }
});

// CREATE A SUBSCRIPTION FOR A RESTAURANT VIA SEPA
router.post("/admin/create-subscription-sepa", async (req, res) => {
  const {
    stripeCustomerId,
    priceId,
    planPriceId,
    addonPriceIds,
    addonItems,
    paymentMethodId,
    billingAddress,
    phone,
    language,
    restaurantId,
    restaurantName,
  } = req.body;

  try {
    let resolvedStripeCustomerId = stripeCustomerId;
    let resolvedRestaurantName = restaurantName;
    let resolvedSubscriptionOwner = null;
    let existingSubscription = null;

    if (restaurantId) {
      const subscriptionLookup = await findRestaurantSubscription({
        restaurantId,
      });

      existingSubscription = subscriptionLookup.subscription;
      resolvedRestaurantName =
        resolvedRestaurantName || subscriptionLookup.restaurant?.name || "";
    } else {
      if (!stripeCustomerId) {
        return res
          .status(400)
          .json({ message: "Aucun client Stripe trouvé pour cet abonnement." });
      }

      const existingSubscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        expand: ["data.items.data.price"],
      });

      existingSubscription = existingSubscriptions.data.find(
        (subscription) => subscription.metadata.restaurantId === restaurantId,
      );
    }

    if (existingSubscription) {
      return res.status(400).json({
        message: "subscriptions.add.errors.alreadyCreated",
      });
    }

    if (restaurantId) {
      const {
        stripeCustomerId: restaurantStripeCustomerId,
        restaurant,
        owner,
      } = await ensureRestaurantStripeCustomer({
        restaurantId,
        billingAddress,
        phone,
        language,
        createIfMissing: true,
        syncExisting: true,
      });

      resolvedStripeCustomerId = restaurantStripeCustomerId;
      resolvedRestaurantName = resolvedRestaurantName || restaurant?.name || "";
      resolvedSubscriptionOwner = owner;
    }

    if (!resolvedStripeCustomerId) {
      return res
        .status(400)
        .json({ message: "Aucun client Stripe trouvé pour cet abonnement." });
    }

    if (!restaurantId) {
      await stripe.customers.update(resolvedStripeCustomerId, {
        address: {
          line1: billingAddress.line1,
          postal_code: billingAddress.zipCode,
          city: billingAddress.city,
          country: billingAddress.country,
        },
        phone,
        preferred_locales: [language || "fr"],
      });
    }

    const selection = await resolveCatalogSelection({
      planPriceId: planPriceId || priceId,
      addonPriceIds,
      addonItems,
    });
    const stripeSelection = await materializeOfferedAddonPrices(selection);
    const smsMeteredPriceId = getSmsMeteredPriceId(stripeSelection);

    // Créer l'abonnement en prélèvement automatique
    const subscription = await stripe.subscriptions.create({
      customer: resolvedStripeCustomerId,
      items: [
        { price: stripeSelection.plan.priceId },
        ...stripeSelection.addons.map((addon) => ({
          price: addon.priceId,
          quantity: addon.quantity,
        })),
        ...(smsMeteredPriceId ? [{ price: smsMeteredPriceId }] : []),
      ],
      default_payment_method: paymentMethodId,
      collection_method: "charge_automatically",
      metadata: buildSubscriptionPayerMetadata({
        metadata: {
          restaurantId,
          restaurantName: resolvedRestaurantName,
          ...buildCatalogSelectionMetadata(stripeSelection),
        },
        owner: resolvedSubscriptionOwner,
      }),
      expand: ["latest_invoice.payment_intent", "items.data.price"],
    });

    if (restaurantId && selectionIncludesSms(stripeSelection)) {
      await RestaurantModel.updateOne(
        { _id: restaurantId },
        { $set: { "options.sms_reminders": true } },
      );
    }

    res.status(201).json({
      message:
        "Abonnement SEPA créé avec succès. Le paiement sera prélevé automatiquement.",
      subscription,
    });
  } catch (error) {
    console.error("Erreur lors de la création de l'abonnement:", error);
    res.status(error?.statusCode || 500).json({
      message: error?.message || "Erreur lors de la création de l'abonnement",
    });
  }
});

// SWITCH TO AUTOMATIC PAYMENT MODE
// router.post("/admin/switch-to-automatic", async (req, res) => {
//   const { subscriptionId } = req.body;

//   try {
//     // Met à jour l'abonnement pour passer au prélèvement automatique
//     await stripe.subscriptions.update(subscriptionId, {
//       collection_method: "charge_automatically",
//     });

//     res
//       .status(200)
//       .json({ message: "Abonnement mis à jour en mode automatique." });
//   } catch (error) {
//     console.error("Erreur lors du passage en mode automatique :", error);
//     res
//       .status(500)
//       .json({ message: "Erreur lors du passage en mode automatique." });
//   }
// });

// GET ALL SUBSCRIPTIONS FROM OWNERS
router.get("/admin/all-subscriptions", async (req, res) => {
  try {
    const requestedPage = req.query.page;
    const requestedLimit = req.query.limit;
    const subscriptions = await listAllStripeSubscriptions({
      expand: ["data.items.data.price", "data.latest_invoice"],
    });

    const restaurantIds = uniqueNonEmpty(
      subscriptions.map((subscription) => subscription?.metadata?.restaurantId),
    );
    const restaurants = await RestaurantModel.find(
      { _id: { $in: restaurantIds } },
      "_id name stripeCustomerId owner_id",
    )
      .populate("owner_id", "firstname lastname email")
      .lean();
    const restaurantById = new Map(
      restaurants.map((restaurant) => [restaurant._id.toString(), restaurant]),
    );

    const migratedFromSubscriptionIds = uniqueNonEmpty(
      subscriptions.map(
        (subscription) => subscription?.metadata?.migratedFromSubscriptionId,
      ),
    );
    const migratedFromPairs = await Promise.all(
      migratedFromSubscriptionIds.map(async (subscriptionId) => [
        subscriptionId,
        await retrieveStripeSubscriptionOrNull(subscriptionId, {
          expand: ["latest_invoice"],
        }),
      ]),
    );
    const migratedFromSubscriptionById = new Map(migratedFromPairs);
    const staleMigratedFromSubscriptionIds = new Set(
      migratedFromPairs
        .filter(([, migratedSubscription]) => !migratedSubscription)
        .map(([subscriptionId]) => normalizeString(subscriptionId))
        .filter(Boolean),
    );

    if (staleMigratedFromSubscriptionIds.size > 0) {
      await Promise.all(
        subscriptions.map(async (subscription) => {
          const migratedFromSubscriptionId = normalizeString(
            subscription?.metadata?.migratedFromSubscriptionId,
          );

          if (
            !staleMigratedFromSubscriptionIds.has(migratedFromSubscriptionId)
          ) {
            return;
          }

          try {
            await clearStaleMigratedFromSubscriptionId(subscription);
            subscription.metadata = {
              ...(subscription.metadata || {}),
              migratedFromSubscriptionId: "",
            };
          } catch (error) {
            console.warn(
              "[stripe-subscription-cleanup] impossible de nettoyer migratedFromSubscriptionId",
              subscription?.id,
              error?.message || error,
            );
          }
        }),
      );
    }

    const customerIds = uniqueNonEmpty(
      subscriptions.map((subscription) =>
        toStripeCustomerId(subscription.customer),
      ),
    );
    const customerPairs = await Promise.all(
      customerIds.map(async (customerId) => [
        customerId,
        await retrieveStripeCustomer(customerId),
      ]),
    );
    const customerById = new Map(customerPairs);

    const formattedSubscriptions = await Promise.all(
      subscriptions.map(async (subscription) => {
        const summary = await buildSubscriptionSummary(subscription);
        const nextChargeAt = await resolveDisplayedNextChargeAt(subscription);
        const restaurantId = normalizeString(
          subscription?.metadata?.restaurantId,
        );
        const restaurant = restaurantById.get(restaurantId) || null;
        const customerId = toStripeCustomerId(subscription.customer);
        const customer = customerById.get(customerId) || null;
        const migratedFromSubscription =
          migratedFromSubscriptionById.get(
            normalizeString(subscription?.metadata?.migratedFromSubscriptionId),
          ) || null;
        const displayInvoice =
          [
            subscription?.latest_invoice,
            migratedFromSubscription?.latest_invoice,
          ]
            .filter(Boolean)
            .find((invoice) =>
              invoiceBelongsToCurrentPayerHistory({
                subscription,
                invoice,
              }),
            ) || null;
        const billingMode =
          restaurant &&
          customerIsDedicatedToRestaurant(customer, restaurant._id)
            ? "restaurant_customer"
            : "legacy_customer";
        const ownerName =
          buildPersonName(restaurant?.owner_id) ||
          normalizeString(displayInvoice?.customer_name) ||
          normalizeString(customer?.name);
        const customerEmail =
          normalizeString(displayInvoice?.customer_email) ||
          normalizeString(customer?.email) ||
          normalizeString(restaurant?.owner_id?.email);
        const displayInvoiceStatus = normalizeString(displayInvoice?.status);
        const displayLastInvoiceAt = toTimestamp(displayInvoice?.created);
        const subscriptionPayerOwnerId = normalizeString(
          subscription?.metadata?.payerOwnerId,
        );
        const pendingPayerOwnerId = normalizeString(
          subscription?.metadata?.pendingPayerOwnerId,
        );
        const restaurantOwnerId = restaurant?.owner_id?._id?.toString?.() || "";
        const payerChangeRequired =
          billingMode === "restaurant_customer" &&
          (normalizeString(subscription?.metadata?.payerChangeRequired) ===
            "true" ||
            (Boolean(restaurantOwnerId) &&
              ((subscriptionPayerOwnerId &&
                subscriptionPayerOwnerId !== restaurantOwnerId) ||
                pendingPayerOwnerId === restaurantOwnerId)));

        return {
          ...subscription,
          plan: summary.plan
            ? serializeSubscriptionLineItem(summary.plan)
            : null,
          addons: summary.addons.map(serializeSubscriptionLineItem),
          otherItems: summary.otherItems.map(serializeSubscriptionLineItem),
          productName: summary.plan?.productName || "",
          productAmount: summary.totalAmount,
          productCurrency: summary.currency,
          totalAmount: summary.totalAmount,
          totalCurrency: summary.currency,
          addonNames: summary.addons.map((item) => item.productName),
          addonCount: summary.addons.length,
          restaurantId: subscription.metadata.restaurantId,
          restaurantName: subscription.metadata.restaurantName,
          displayOwnerName: ownerName,
          displayCustomerEmail: customerEmail,
          displayInvoiceStatus,
          displayLastInvoiceAt,
          nextChargeAt,
          currentPeriodEnd: toTimestamp(subscription?.current_period_end),
          cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
          cancelAt: toTimestamp(subscription?.cancel_at),
          canceledAt: toTimestamp(subscription?.canceled_at),
          billingMode,
          payerChangeRequired,
        };
      }),
    );

    const { items, pagination } = paginateArray(
      formattedSubscriptions,
      requestedPage,
      requestedLimit,
    );

    res.status(200).json({ subscriptions: items, pagination });
  } catch (error) {
    console.error("Erreur lors de la récupération des abonnements:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des abonnements" });
  }
});

router.post("/admin/subscriptions/:subscriptionId/cancel", async (req, res) => {
  const subscriptionId = normalizeString(req.params.subscriptionId);
  const requestedMode = normalizeString(req.body?.mode);
  const mode =
    requestedMode === "period_end"
      ? "period_end"
      : requestedMode === "resume"
        ? "resume"
        : "immediate";

  try {
    if (!subscriptionId) {
      return res.status(400).json({
        message: "subscriptionId est requis pour arrêter l'abonnement.",
      });
    }

    const subscription = await retrieveStripeSubscription(subscriptionId, {
      expand: ["items.data.price", "latest_invoice"],
    });

    if (!subscription?.id) {
      return res.status(404).json({
        message: "Abonnement Stripe introuvable.",
      });
    }

    let updatedSubscription = subscription;

    if (mode === "resume") {
      if (normalizeString(subscription?.status) === "canceled") {
        return res.status(409).json({
          message:
            "Cet abonnement est déjà arrêté définitivement et ne peut pas être replanifié.",
        });
      }

      if (subscription?.cancel_at_period_end !== true) {
        return res.status(200).json({
          message: "Aucun arrêt programmé n'est actif sur cet abonnement.",
          cancellation: {
            mode,
            effectiveAt: 0,
            cancelAtPeriodEnd: false,
            status: subscription?.status || "",
          },
          subscription,
        });
      }

      updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        expand: ["items.data.price", "latest_invoice"],
      });

      return res.status(200).json({
        message: "L'arrêt programmé de l'abonnement a été annulé.",
        cancellation: {
          mode,
          effectiveAt: 0,
          cancelAtPeriodEnd: updatedSubscription?.cancel_at_period_end === true,
          status: updatedSubscription?.status || "",
        },
        subscription: updatedSubscription,
      });
    }

    if (mode === "period_end") {
      updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        expand: ["items.data.price", "latest_invoice"],
      });

      return res.status(200).json({
        message:
          "L'arrêt de l'abonnement est programmé à la fin de la période.",
        cancellation: {
          mode,
          effectiveAt:
            toTimestamp(updatedSubscription?.current_period_end) ||
            toTimestamp(updatedSubscription?.cancel_at),
          cancelAtPeriodEnd: updatedSubscription?.cancel_at_period_end === true,
          status: updatedSubscription?.status || "",
        },
        subscription: updatedSubscription,
      });
    }

    updatedSubscription = await stripe.subscriptions.cancel(subscription.id, {
      invoice_now: false,
      prorate: false,
    });

    return res.status(200).json({
      message: "L'abonnement a été arrêté immédiatement.",
      cancellation: {
        mode,
        effectiveAt:
          toTimestamp(updatedSubscription?.canceled_at) ||
          Math.floor(Date.now() / 1000),
        cancelAtPeriodEnd: false,
        status: updatedSubscription?.status || "",
      },
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error("Erreur lors de l'arrêt de l'abonnement:", error);
    res.status(error?.statusCode || 500).json({
      message: error?.message || "Erreur lors de l'arrêt de l'abonnement",
    });
  }
});

router.get(
  "/admin/subscriptions/:subscriptionId/edit-preview",
  async (req, res) => {
    try {
      const preview = await buildSubscriptionEditPreview({
        subscriptionId: req.params.subscriptionId,
      });

      res.status(200).json({ preview: serializeEditPreview(preview) });
    } catch (error) {
      console.error(
        "Erreur lors de la préparation de la configuration d'abonnement:",
        error,
      );
      res.status(error?.statusCode || 500).json({
        message:
          error?.message ||
          "Erreur lors de la préparation de la configuration d'abonnement",
      });
    }
  },
);

router.get(
  "/admin/restaurants/:restaurantId/payer-change-preview",
  async (req, res) => {
    try {
      const preview = await buildSubscriptionPayerChangePreview({
        restaurantId: req.params.restaurantId,
      });

      res.status(200).json({ preview: serializePayerChangePreview(preview) });
    } catch (error) {
      console.error(
        "Erreur lors de la préparation du changement de payeur:",
        error,
      );
      res.status(error?.statusCode || 500).json({
        message:
          error?.message ||
          "Erreur lors de la préparation du changement de payeur",
      });
    }
  },
);

router.post("/admin/update-subscription-payer-sepa", async (req, res) => {
  const { restaurantId, paymentMethodId, billingAddress, phone, language } =
    req.body;

  try {
    if (!restaurantId) {
      return res.status(400).json({
        message: "restaurantId est requis pour changer le payeur.",
      });
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        message: "paymentMethodId est requis pour changer le payeur.",
      });
    }

    const preview = await buildSubscriptionPayerChangePreview({ restaurantId });
    const { stripeCustomerId } = await ensureRestaurantStripeCustomer({
      restaurant: preview.restaurant,
      owner: preview.owner,
      billingAddress,
      phone,
      language,
      createIfMissing: true,
      syncExisting: true,
    });

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (
      normalizeString(toStripeCustomerId(paymentMethod?.customer)) !==
      normalizeString(stripeCustomerId)
    ) {
      return res.status(400).json({
        message:
          "Le mandat SEPA sélectionné n'est pas rattaché au client Stripe du restaurant.",
      });
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const updatedSubscription = await stripe.subscriptions.update(
      preview.subscription.id,
      {
        default_payment_method: paymentMethodId,
        billing_cycle_anchor: "now",
        proration_behavior: "none",
        metadata: buildSubscriptionPayerMetadata({
          metadata: {
            ...(preview.subscription.metadata || {}),
            payerChangeRequired: "false",
            pendingPayerOwnerId: "",
            pendingPayerOwnerName: "",
            previousPayerOwnerId: "",
            previousPayerOwnerName: "",
            transferTriggeredAt: "",
            payerHistoryVisibleSince: new Date().toISOString(),
          },
          owner: preview.owner,
        }),
      },
    );

    res.status(200).json({
      message:
        "Le moyen de paiement de l'abonnement a été mis à jour pour le nouveau propriétaire.",
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error("Erreur lors du changement de payeur:", error);
    res.status(error?.statusCode || 500).json({
      message: error?.message || "Erreur lors du changement de payeur",
    });
  }
});

router.post("/admin/update-subscription-configuration", async (req, res) => {
  const { subscriptionId, planPriceId, addonPriceIds, addonItems } = req.body;

  try {
    if (!subscriptionId) {
      return res.status(400).json({
        message: "subscriptionId est requis pour mettre à jour l'abonnement.",
      });
    }

    const subscription = await retrieveStripeSubscription(subscriptionId, {
      expand: ["items.data.price", "latest_invoice"],
    });

    if (!subscription?.id) {
      return res.status(404).json({
        message: "Abonnement Stripe introuvable.",
      });
    }

    const currentSummary = await buildSubscriptionSummary(subscription);
    const selection = await resolveCatalogSelection({
      planPriceId,
      addonPriceIds,
      addonItems,
    });

    if (
      currentSummary.currency &&
      selection.currency &&
      currentSummary.currency !== selection.currency
    ) {
      return res.status(400).json({
        message:
          "Le plan et les modules doivent rester dans la même devise que l'abonnement existant.",
      });
    }

    const stripeSelection = await materializeOfferedAddonPrices(selection);
    const subscriptionRestaurantId = normalizeString(
      subscription?.metadata?.restaurantId,
    );
    const restaurant = subscriptionRestaurantId
      ? await RestaurantModel.findById(subscriptionRestaurantId).select(
          "reservationsSettings.smsReminder.commercialDeactivation",
        )
      : null;
    const fixedSmsPriceId = normalizeString(
      process.env.STRIPE_SMS_FIXED_PRICE_ID,
    );
    const currentFixedSms = (currentSummary.items || []).find(
      (item) => normalizeString(item?.priceId) === fixedSmsPriceId,
    );
    const removesSms =
      Boolean(currentFixedSms) && !selectionIncludesSms(stripeSelection);
    if (removesSms && !restaurant) {
      return res.status(409).json({
        message:
          "Le restaurant lié à l'abonnement est requis pour programmer la désactivation SMS.",
        code: "SMS_RESTAURANT_REQUIRED",
      });
    }
    if (subscription.schedule) {
      await releaseGustoSmsDeactivationSchedule({ subscription, restaurant });
      if (restaurant) {
        await RestaurantModel.updateOne(
          { _id: restaurant._id },
          {
            $set: {
              "reservationsSettings.smsReminder.commercialDeactivation.status":
                "cancelled",
              "reservationsSettings.smsReminder.commercialDeactivation.stripeScheduleId":
                "",
              "reservationsSettings.smsReminder.commercialDeactivation.effectiveAt":
                null,
            },
          },
        );
      }
    }

    let appliedSelection = stripeSelection;
    if (removesSms) {
      appliedSelection = {
        ...stripeSelection,
        addons: [
          ...(stripeSelection.addons || []),
          {
            ...currentFixedSms,
            code: SMS_ADDON_CODE,
            priceId: fixedSmsPriceId,
            quantity: Number(currentFixedSms.quantity || 1),
          },
        ],
      };
    }

    const items = buildSubscriptionItemUpdatePayload({
      currentSummary,
      selection: appliedSelection,
    });

    const updatedSubscription = await stripe.subscriptions.update(
      subscription.id,
      {
        items,
        proration_behavior: "none",
        metadata: {
          ...(subscription.metadata || {}),
          ...buildCatalogSelectionMetadata(appliedSelection),
        },
        expand: ["items.data.price", "latest_invoice"],
      },
    );

    if (subscriptionRestaurantId && selectionIncludesSms(stripeSelection)) {
      await RestaurantModel.updateOne(
        { _id: subscriptionRestaurantId },
        {
          $set: {
            "options.sms_reminders": true,
            "reservationsSettings.smsReminder.commercialDeactivation.status":
              "cancelled",
            "reservationsSettings.smsReminder.commercialDeactivation.stripeScheduleId":
              "",
            "reservationsSettings.smsReminder.commercialDeactivation.effectiveAt":
              null,
          },
        },
      );
    }

    let smsDeactivation = null;
    if (removesSms) {
      smsDeactivation = await scheduleSmsDeactivation({
        subscription: updatedSubscription,
        restaurantId: subscriptionRestaurantId,
        targetSelection: stripeSelection,
      });
      await RestaurantModel.updateOne(
        { _id: subscriptionRestaurantId },
        {
          $set: {
            "options.sms_reminders": true,
            "reservationsSettings.smsReminder.commercialDeactivation.status":
              "scheduled",
            "reservationsSettings.smsReminder.commercialDeactivation.stripeScheduleId":
              smsDeactivation.scheduleId,
            "reservationsSettings.smsReminder.commercialDeactivation.effectiveAt":
              new Date(smsDeactivation.effectiveAt * 1000),
            "reservationsSettings.smsReminder.commercialDeactivation.requestedAt":
              new Date(),
          },
        },
      );
    }

    const updatedSummary = await buildSubscriptionSummary(updatedSubscription);
    let amendment = null;
    let amendmentWarning = "";
    const restaurantId = normalizeString(
      updatedSubscription?.metadata?.restaurantId || subscription?.metadata?.restaurantId,
    );

    // Stripe est déjà à jour à ce stade. La préparation de l'avenant ne doit
    // jamais remettre en cause une modification d'abonnement réussie.
    if (restaurantId) {
      try {
        amendment = await prepareSubscriptionAmendment({
          restaurantId,
          stripeSnapshot: buildStripeCommercialSnapshot(
            updatedSummary,
            updatedSubscription,
          ),
        });
      } catch (amendmentError) {
        amendmentWarning =
          "L'abonnement a été modifié, mais le brouillon d'avenant n'a pas pu être préparé.";
        console.error("Erreur préparation avenant automatique:", amendmentError);
      }
    }

    res.status(200).json({
      message:
        "La configuration de l'abonnement a été mise à jour pour la prochaine échéance.",
      subscription: updatedSubscription,
      summary: serializeSubscriptionSummary(updatedSummary),
      amendment: amendment?.document
        ? {
            documentId: amendment.document._id,
            status: amendment.document.status,
            created: Boolean(amendment.created),
            updated: Boolean(amendment.updated),
          }
        : null,
      amendmentWarning,
      smsDeactivation: smsDeactivation
        ? {
            status: "scheduled",
            effectiveAt: smsDeactivation.effectiveAt,
            stripeScheduleId: smsDeactivation.scheduleId,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "Erreur lors de la mise à jour de la configuration d'abonnement:",
      error,
    );
    res.status(error?.statusCode || 500).json({
      message:
        error?.message ||
        "Erreur lors de la mise à jour de la configuration d'abonnement",
    });
  }
});

// GET ALL INVOICES FOR A SUBSCRIPTION
router.get("/admin/subscription-invoices/:subscriptionId", async (req, res) => {
  const { subscriptionId } = req.params;

  try {
    const invoices = await listSubscriptionInvoicesHistory({
      subscriptionId,
      limitPerSubscription: 100,
    });

    res.status(200).json({ invoices });
  } catch (error) {
    console.error("Erreur lors de la récupération des factures :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des factures" });
  }
});

module.exports = router;
