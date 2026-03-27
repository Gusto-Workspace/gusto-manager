const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

const RestaurantModel = require("../models/restaurant.model");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toTimestampSeconds(value) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed / 1000);
    }
  }

  return 0;
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.toString === "function") return value.toString();
  return "";
}

function uniqueNonEmpty(values = []) {
  return Array.from(
    new Set(values.map((value) => normalizeString(value)).filter(Boolean)),
  );
}

function buildStripeAddress(address = {}) {
  const line1 = normalizeString(address?.line1);
  const postalCode = normalizeString(
    address?.zipCode || address?.postal_code || address?.postalCode,
  );
  const city = normalizeString(address?.city);
  const country = normalizeString(address?.country) || "France";

  if (!line1 && !postalCode && !city) return undefined;

  return {
    line1,
    postal_code: postalCode,
    city,
    country,
  };
}

function buildRestaurantCustomerPayload({
  restaurant,
  owner,
  billingAddress,
  phone,
  language,
}) {
  const ownerName = [owner?.firstname, owner?.lastname]
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .join(" ");

  const payload = {
    email: normalizeString(restaurant?.email) || normalizeString(owner?.email),
    name: normalizeString(restaurant?.name) || ownerName,
    phone:
      normalizeString(phone) ||
      normalizeString(restaurant?.phone) ||
      normalizeString(owner?.phoneNumber),
    preferred_locales: [normalizeString(language) || "fr"],
    metadata: {
      owner_id: toIdString(owner?._id),
      restaurant_id: toIdString(restaurant?._id),
      restaurant_name: normalizeString(restaurant?.name),
      owner_name: ownerName,
    },
  };

  const address = buildStripeAddress(billingAddress || restaurant?.address);
  if (address) payload.address = address;

  return payload;
}

async function retrieveStripeCustomer(stripeCustomerId) {
  const normalized = normalizeString(stripeCustomerId);
  if (!normalized) return null;

  const customer = await stripe.customers.retrieve(normalized);
  if (!customer || customer.deleted) return null;

  return customer;
}

async function retrieveStripeSubscription(subscriptionId, options = {}) {
  const normalized = normalizeString(subscriptionId);
  if (!normalized) return null;

  return stripe.subscriptions.retrieve(normalized, options);
}

function customerIsDedicatedToRestaurant(customer, restaurantId) {
  return (
    normalizeString(customer?.metadata?.restaurant_id) ===
    toIdString(restaurantId)
  );
}

async function isStripeCustomerDedicatedToRestaurant({
  stripeCustomerId,
  restaurantId,
}) {
  const customer = await retrieveStripeCustomer(stripeCustomerId);
  return customerIsDedicatedToRestaurant(customer, restaurantId);
}

async function loadRestaurantBillingContext(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).populate(
    "owner_id",
    "firstname lastname email phoneNumber stripeCustomerId restaurants",
  );

  if (!restaurant) {
    const error = new Error("Restaurant non trouvé");
    error.statusCode = 404;
    throw error;
  }

  if (!restaurant.owner_id) {
    const error = new Error("Propriétaire introuvable pour ce restaurant");
    error.statusCode = 404;
    throw error;
  }

  return {
    restaurant,
    owner: restaurant.owner_id,
  };
}

async function syncRestaurantStripeCustomer({
  stripeCustomerId,
  restaurant,
  owner,
  billingAddress,
  phone,
  language,
}) {
  if (!normalizeString(stripeCustomerId)) return null;

  return stripe.customers.update(
    stripeCustomerId,
    buildRestaurantCustomerPayload({
      restaurant,
      owner,
      billingAddress,
      phone,
      language,
    }),
  );
}

async function adoptOwnerCustomerForRestaurant({
  restaurant,
  owner,
  billingAddress,
  phone,
  language,
}) {
  const ownerCustomerId = normalizeString(owner?.stripeCustomerId);
  const restaurantCount = Array.isArray(owner?.restaurants)
    ? owner.restaurants.length
    : 0;

  if (!ownerCustomerId || normalizeString(restaurant?.stripeCustomerId)) {
    return null;
  }

  if (restaurantCount > 1) {
    return null;
  }

  restaurant.stripeCustomerId = ownerCustomerId;
  await restaurant.save();

  await syncRestaurantStripeCustomer({
    stripeCustomerId: ownerCustomerId,
    restaurant,
    owner,
    billingAddress,
    phone,
    language,
  });

  return ownerCustomerId;
}

async function createRestaurantStripeCustomer({
  restaurant,
  owner,
  billingAddress,
  phone,
  language,
}) {
  const customer = await stripe.customers.create(
    buildRestaurantCustomerPayload({
      restaurant,
      owner,
      billingAddress,
      phone,
      language,
    }),
  );

  restaurant.stripeCustomerId = customer.id;
  await restaurant.save();

  return customer.id;
}

async function ensureRestaurantStripeCustomer({
  restaurantId,
  restaurant,
  owner,
  billingAddress,
  phone,
  language,
  createIfMissing = true,
  syncExisting = false,
}) {
  let ctxRestaurant = restaurant;
  let ctxOwner = owner;

  if (!ctxRestaurant || !ctxOwner) {
    const loaded = await loadRestaurantBillingContext(
      restaurantId || restaurant?._id,
    );
    ctxRestaurant = loaded.restaurant;
    ctxOwner = loaded.owner;
  }

  let stripeCustomerId = normalizeString(ctxRestaurant?.stripeCustomerId);
  let isDedicatedRestaurantCustomer = false;

  if (!stripeCustomerId) {
    stripeCustomerId = await adoptOwnerCustomerForRestaurant({
      restaurant: ctxRestaurant,
      owner: ctxOwner,
      billingAddress,
      phone,
      language,
    });
  }

  if (stripeCustomerId) {
    isDedicatedRestaurantCustomer = await isStripeCustomerDedicatedToRestaurant(
      {
        stripeCustomerId,
        restaurantId: ctxRestaurant?._id,
      },
    );
  }

  if (!stripeCustomerId && createIfMissing) {
    stripeCustomerId = await createRestaurantStripeCustomer({
      restaurant: ctxRestaurant,
      owner: ctxOwner,
      billingAddress,
      phone,
      language,
    });
    isDedicatedRestaurantCustomer = true;
  } else if (
    stripeCustomerId &&
    syncExisting &&
    isDedicatedRestaurantCustomer
  ) {
    await syncRestaurantStripeCustomer({
      stripeCustomerId,
      restaurant: ctxRestaurant,
      owner: ctxOwner,
      billingAddress,
      phone,
      language,
    });
  }

  return {
    restaurant: ctxRestaurant,
    owner: ctxOwner,
    stripeCustomerId: normalizeString(stripeCustomerId),
    isDedicatedRestaurantCustomer,
  };
}

async function listRestaurantCandidateCustomerIds({ restaurantId }) {
  const { restaurant, owner } =
    await loadRestaurantBillingContext(restaurantId);

  return {
    restaurant,
    owner,
    customerIds: uniqueNonEmpty([
      restaurant?.stripeCustomerId,
      owner?.stripeCustomerId,
    ]),
  };
}

async function findRestaurantSubscription({ restaurantId }) {
  const { restaurant, owner, customerIds } =
    await listRestaurantCandidateCustomerIds({
      restaurantId,
    });

  for (const customerId of customerIds) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      expand: ["data.items.data.price", "data.latest_invoice"],
      limit: 100,
    });

    const match = subscriptions.data.find(
      (subscription) =>
        subscription?.metadata?.restaurantId === String(restaurantId),
    );

    if (match) {
      return {
        restaurant,
        owner,
        stripeCustomerId: customerId,
        subscription: match,
      };
    }
  }

  return {
    restaurant,
    owner,
    stripeCustomerId: normalizeString(restaurant?.stripeCustomerId),
    subscription: null,
  };
}

async function listSubscriptionMigrationChain({
  subscriptionId,
  maxDepth = 10,
}) {
  const chain = [];
  const visited = new Set();
  let currentId = normalizeString(subscriptionId);

  while (currentId && !visited.has(currentId) && chain.length < maxDepth) {
    visited.add(currentId);

    const subscription = await retrieveStripeSubscription(currentId, {
      expand: ["latest_invoice"],
    });

    if (!subscription) break;

    chain.push(subscription);
    currentId = normalizeString(
      subscription?.metadata?.migratedFromSubscriptionId,
    );
  }

  return chain;
}

function getSubscriptionVisibleHistoryStartAt(subscription) {
  return Math.max(
    toTimestampSeconds(subscription?.metadata?.payerHistoryVisibleSince),
    toTimestampSeconds(subscription?.metadata?.transferTriggeredAt),
  );
}

function invoiceBelongsToCurrentPayerHistory({ subscription, invoice }) {
  if (!invoice?.id) return false;

  const visibleHistoryStartAt =
    getSubscriptionVisibleHistoryStartAt(subscription);

  if (!visibleHistoryStartAt) {
    return true;
  }

  return toTimestampSeconds(invoice?.created) >= visibleHistoryStartAt;
}

async function listSubscriptionInvoicesHistory({
  subscriptionId,
  maxDepth = 10,
  limitPerSubscription = 100,
}) {
  const chain = await listSubscriptionMigrationChain({
    subscriptionId,
    maxDepth,
  });
  const invoiceMap = new Map();
  const currentSubscription = chain[0] || null;

  for (const subscription of chain) {
    const invoices = await stripe.invoices.list({
      subscription: subscription.id,
      limit: limitPerSubscription,
    });

    invoices.data.forEach((invoice) => {
      if (!invoice?.id) return;
      if (
        currentSubscription &&
        !invoiceBelongsToCurrentPayerHistory({
          subscription: currentSubscription,
          invoice,
        })
      ) {
        return;
      }

      invoiceMap.set(invoice.id, {
        ...invoice,
        sourceSubscriptionId: subscription.id,
      });
    });
  }

  return Array.from(invoiceMap.values()).sort(
    (a, b) => Number(b?.created || 0) - Number(a?.created || 0),
  );
}

async function stripeCustomerUsedByAnyRestaurant(stripeCustomerId) {
  const normalized = normalizeString(stripeCustomerId);
  if (!normalized) return false;

  return RestaurantModel.exists({ stripeCustomerId: normalized });
}

module.exports = {
  customerIsDedicatedToRestaurant,
  ensureRestaurantStripeCustomer,
  findRestaurantSubscription,
  invoiceBelongsToCurrentPayerHistory,
  isStripeCustomerDedicatedToRestaurant,
  listSubscriptionInvoicesHistory,
  listSubscriptionMigrationChain,
  loadRestaurantBillingContext,
  retrieveStripeCustomer,
  retrieveStripeSubscription,
  stripeCustomerUsedByAnyRestaurant,
  syncRestaurantStripeCustomer,
};
