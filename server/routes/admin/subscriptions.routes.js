const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");
const RestaurantModel = require("../../models/restaurant.model");
const {
  ensureRestaurantStripeCustomer,
  customerIsDedicatedToRestaurant,
  findRestaurantSubscription,
  invoiceBelongsToCurrentPayerHistory,
  isStripeCustomerDedicatedToRestaurant,
  listSubscriptionInvoicesHistory,
  loadRestaurantBillingContext,
  retrieveStripeCustomer,
  retrieveStripeSubscription,
} = require("../../services/stripe-billing.service");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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

async function deriveSubscriptionNextChargeAt(sourceSubscription) {
  const defaultNextChargeAt =
    toTimestamp(sourceSubscription?.current_period_end) ||
    Math.floor(Date.now() / 1000);

  const subscriptionPriceIds = new Set(
    (sourceSubscription?.items?.data || [])
      .map((item) => normalizeString(item?.price?.id))
      .filter(Boolean),
  );

  if (subscriptionPriceIds.size === 0) {
    return defaultNextChargeAt;
  }

  const invoices = await stripe.invoices.list({
    subscription: sourceSubscription.id,
    limit: 12,
    expand: ["data.lines.data.price"],
  });

  const invoiceDerivedNextChargeAt = invoices.data.reduce(
    (maxPeriodEnd, invoice) => {
      const isPaidInvoice =
        normalizeString(invoice?.status) === "paid" ||
        toTimestamp(invoice?.status_transitions?.paid_at) > 0;

      if (!isPaidInvoice) {
        return maxPeriodEnd;
      }

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

  return Math.max(defaultNextChargeAt, invoiceDerivedNextChargeAt);
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

  const price = sourceSubscription?.items?.data?.[0]?.price || null;
  const product =
    typeof price?.product === "string"
      ? await stripe.products.retrieve(price.product)
      : null;

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
    price,
    product,
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
  const price = hydratedSubscription?.items?.data?.[0]?.price || null;
  const product =
    typeof price?.product === "string"
      ? await stripe.products.retrieve(price.product)
      : null;

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
    price,
    product,
    payerChangeRequired,
  };
}

function serializePayerChangePreview(preview) {
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
      priceId: preview.price?.id || "",
      productName: preview.product?.name || "",
      amount:
        typeof preview.price?.unit_amount === "number"
          ? preview.price.unit_amount / 100
          : null,
      currency: preview.price?.currency
        ? preview.price.currency.toUpperCase()
        : "",
      currentPayerOwnerName:
        normalizeString(preview.subscription?.metadata?.payerOwnerName) ||
        normalizeString(preview.subscription?.metadata?.previousPayerOwnerName) ||
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
  const price = preview.price;
  const product = preview.product;

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
      priceId: price?.id || "",
      productName: product?.name || "",
      amount:
        typeof price?.unit_amount === "number" ? price.unit_amount / 100 : null,
      currency: price?.currency ? price.currency.toUpperCase() : "",
    },
    existingDedicatedSubscription: preview.existingDedicatedSubscription
      ? {
          id: preview.existingDedicatedSubscription.id,
          status: preview.existingDedicatedSubscription.status,
        }
      : null,
  };
}

// GET STRIPE SUBSCRIPTIONS
router.get("/admin/subscriptions", async (req, res) => {
  try {
    const products = await stripe.products.list({
      limit: 20,
      active: true,
      expand: ["data.default_price"], // Expande le prix par défaut de chaque produit
    });

    res.status(200).json({ products: products.data });
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

    // Créer l'abonnement en prélèvement automatique
    const subscription = await stripe.subscriptions.create({
      customer: resolvedStripeCustomerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      collection_method: "charge_automatically",
      metadata: buildSubscriptionPayerMetadata({
        metadata: {
          restaurantId,
          restaurantName: resolvedRestaurantName,
        },
        owner: resolvedSubscriptionOwner,
      }),
      expand: ["latest_invoice.payment_intent"],
    });

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
router.get("/admin/all-subscriptions", authenticateToken, async (req, res) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      expand: ["data.items.data.price", "data.latest_invoice"],
    });

    const restaurantIds = uniqueNonEmpty(
      subscriptions.data.map(
        (subscription) => subscription?.metadata?.restaurantId,
      ),
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
      subscriptions.data.map(
        (subscription) => subscription?.metadata?.migratedFromSubscriptionId,
      ),
    );
    const migratedFromPairs = await Promise.all(
      migratedFromSubscriptionIds.map(async (subscriptionId) => [
        subscriptionId,
        await retrieveStripeSubscription(subscriptionId, {
          expand: ["latest_invoice"],
        }),
      ]),
    );
    const migratedFromSubscriptionById = new Map(migratedFromPairs);

    const customerIds = uniqueNonEmpty(
      subscriptions.data.map((subscription) =>
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
      subscriptions.data.map(async (subscription) => {
        const price = subscription.items.data[0].price;
        const productId = price.product;
        const product = await stripe.products.retrieve(productId);
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
          [subscription?.latest_invoice, migratedFromSubscription?.latest_invoice]
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
          productName: product.name,
          productAmount: price.unit_amount / 100,
          productCurrency: price.currency.toUpperCase(),
          restaurantId: subscription.metadata.restaurantId,
          restaurantName: subscription.metadata.restaurantName,
          displayOwnerName: ownerName,
          displayCustomerEmail: customerEmail,
          displayInvoiceStatus,
          displayLastInvoiceAt,
          billingMode,
          payerChangeRequired,
          migrationAvailable:
            Boolean(restaurantId) && billingMode === "legacy_customer",
        };
      }),
    );

    res.status(200).json({ subscriptions: formattedSubscriptions });
  } catch (error) {
    console.error("Erreur lors de la récupération des abonnements:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des abonnements" });
  }
});

router.get(
  "/admin/subscriptions/:subscriptionId/migration-preview",
  async (req, res) => {
    try {
      const preview = await buildSubscriptionMigrationPreview({
        sourceSubscriptionId: req.params.subscriptionId,
        restaurantId: req.query.restaurantId,
      });

      res.status(200).json({ preview: serializeMigrationPreview(preview) });
    } catch (error) {
      console.error(
        "Erreur lors de la préparation de la migration d'abonnement:",
        error,
      );
      res.status(error?.statusCode || 500).json({
        message:
          error?.message ||
          "Erreur lors de la préparation de la migration d'abonnement",
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

router.post("/admin/migrate-subscription-sepa", async (req, res) => {
  const {
    sourceSubscriptionId,
    restaurantId,
    paymentMethodId,
    billingAddress,
    phone,
    language,
  } = req.body;

  try {
    if (!sourceSubscriptionId) {
      return res
        .status(400)
        .json({ message: "sourceSubscriptionId est requis." });
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        message: "paymentMethodId est requis pour migrer l'abonnement.",
      });
    }

    const preview = await buildSubscriptionMigrationPreview({
      sourceSubscriptionId,
      restaurantId,
    });

    if (!preview.canMigrate) {
      return res.status(409).json({
        message:
          preview.blockingReason ||
          "Cette migration ne peut pas être exécutée automatiquement.",
      });
    }

    const { stripeCustomerId: targetStripeCustomerId } =
      await ensureRestaurantStripeCustomer({
        restaurant: preview.restaurant,
        owner: preview.owner,
        billingAddress,
        phone,
        language,
        createIfMissing: true,
        syncExisting: true,
      });

    const existingDedicatedSubscription =
      await findRestaurantSubscriptionOnCustomer({
        stripeCustomerId: targetStripeCustomerId,
        restaurantId: preview.restaurant._id,
      });

    if (existingDedicatedSubscription) {
      return res.status(409).json({
        message:
          "Une migration est déjà en cours ou un abonnement dédié existe déjà pour ce restaurant.",
      });
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (
      normalizeString(toStripeCustomerId(paymentMethod?.customer)) !==
      normalizeString(targetStripeCustomerId)
    ) {
      return res.status(400).json({
        message:
          "Le mandat SEPA sélectionné n'est pas rattaché au client Stripe dédié du restaurant.",
      });
    }

    await stripe.customers.update(targetStripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const sourceItems = preview.sourceSubscription.items.data
      .map((item) => ({
        price: item?.price?.id,
        quantity: item?.quantity || 1,
      }))
      .filter((item) => normalizeString(item.price));

    if (sourceItems.length === 0) {
      return res.status(400).json({
        message: "Impossible de retrouver le tarif Stripe à migrer.",
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const hasRemainingPeriod = Number(preview.nextChargeAt || 0) > now + 60;
    const migrationTiming = hasRemainingPeriod
      ? {
          billing_cycle_anchor: preview.nextChargeAt,
          proration_behavior: "none",
        }
      : {};

    const migratedSubscription = await stripe.subscriptions.create({
      customer: targetStripeCustomerId,
      items: sourceItems,
      default_payment_method: paymentMethodId,
      collection_method: "charge_automatically",
      ...migrationTiming,
      metadata: buildSubscriptionPayerMetadata({
        metadata: {
          ...preview.sourceSubscription.metadata,
          restaurantId: preview.restaurant._id.toString(),
          restaurantName: preview.restaurant.name || "",
          migratedFromSubscriptionId: preview.sourceSubscription.id,
          migratedFromCustomerId: preview.sourceCustomerId,
          migrationMode: "restaurant_customer",
        },
        owner: preview.owner,
      }),
      expand: ["latest_invoice.payment_intent", "items.data.price"],
    });

    await stripe.subscriptions.update(preview.sourceSubscription.id, {
      metadata: {
        ...preview.sourceSubscription.metadata,
        migratedToSubscriptionId: migratedSubscription.id,
        migratedToCustomerId: targetStripeCustomerId,
        migrationState: "replaced",
      },
    });

    await stripe.subscriptions.cancel(preview.sourceSubscription.id, {
      invoice_now: false,
      prorate: false,
    });

    res.status(201).json({
      message: "L'abonnement a été migré vers un client Stripe dédié.",
      subscription: migratedSubscription,
      canceledSubscriptionId: preview.sourceSubscription.id,
      nextChargeAt: hasRemainingPeriod ? preview.nextChargeAt : null,
    });
  } catch (error) {
    console.error("Erreur lors de la migration de l'abonnement:", error);
    res.status(error?.statusCode || 500).json({
      message: error?.message || "Erreur lors de la migration de l'abonnement",
    });
  }
});

router.post("/admin/update-subscription-payer-sepa", async (req, res) => {
  const {
    restaurantId,
    paymentMethodId,
    billingAddress,
    phone,
    language,
    priceId,
  } = req.body;

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

    const currentSubscriptionItem =
      preview.subscription.items?.data?.[0] || null;
    const selectedPriceId = normalizeString(priceId);
    const currentPriceId = normalizeString(currentSubscriptionItem?.price?.id);
    const shouldSwitchPrice =
      Boolean(selectedPriceId) &&
      Boolean(currentSubscriptionItem?.id) &&
      selectedPriceId !== currentPriceId;

    const updatedSubscription = await stripe.subscriptions.update(
      preview.subscription.id,
      {
        default_payment_method: paymentMethodId,
        billing_cycle_anchor: "now",
        ...(shouldSwitchPrice
          ? {
              items: [
                {
                  id: currentSubscriptionItem.id,
                  price: selectedPriceId,
                  quantity: currentSubscriptionItem?.quantity || 1,
                },
              ],
              proration_behavior: "none",
            }
          : {
              proration_behavior: "none",
            }),
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
