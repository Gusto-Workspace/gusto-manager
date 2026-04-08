const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

async function listAllStripeSubscriptions(options = {}) {
  const subscriptions = [];
  let startingAfter = null;

  while (true) {
    const response = await stripe.subscriptions.list({
      limit: 100,
      ...options,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    subscriptions.push(...(response?.data || []));

    if (!response?.has_more || !response?.data?.length) {
      break;
    }

    startingAfter = response.data[response.data.length - 1].id;
  }

  return subscriptions;
}

async function listAllStripeInvoices(options = {}) {
  const invoices = [];
  let startingAfter = null;

  while (true) {
    const response = await stripe.invoices.list({
      limit: 100,
      ...options,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    invoices.push(...(response?.data || []));

    if (!response?.has_more || !response?.data?.length) {
      break;
    }

    startingAfter = response.data[response.data.length - 1].id;
  }

  return invoices;
}

module.exports = {
  listAllStripeSubscriptions,
  listAllStripeInvoices,
};
