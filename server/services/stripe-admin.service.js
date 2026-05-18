const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

async function listAllStripeSubscriptions(options = {}) {
  const subscriptions = [];
  let startingAfter = null;
  let hasMore = true;

  while (hasMore) {
    const response = await stripe.subscriptions.list({
      limit: 100,
      ...options,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    subscriptions.push(...(response?.data || []));
    hasMore = Boolean(response?.has_more && response?.data?.length);
    startingAfter = hasMore
      ? response.data[response.data.length - 1].id
      : null;
  }

  return subscriptions;
}

async function listAllStripeInvoices(options = {}) {
  const invoices = [];
  let startingAfter = null;
  let hasMore = true;

  while (hasMore) {
    const response = await stripe.invoices.list({
      limit: 100,
      ...options,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    invoices.push(...(response?.data || []));
    hasMore = Boolean(response?.has_more && response?.data?.length);
    startingAfter = hasMore
      ? response.data[response.data.length - 1].id
      : null;
  }

  return invoices;
}

module.exports = {
  listAllStripeSubscriptions,
  listAllStripeInvoices,
};
