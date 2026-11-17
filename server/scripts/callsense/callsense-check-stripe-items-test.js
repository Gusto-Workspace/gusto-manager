require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { offerIds } = require("../../services/callsense/callsense-usage.service");
const catalog = require("../../services/billing/stripe-subscription-catalog.service");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !String(process.env.STRIPE_API_SECRET_KEY || "").startsWith("sk_test_")) throw new Error("Stripe Test uniquement");
  const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
  const ids = offerIds();
  const products = await catalog.listSubscriptionCatalogProducts();
  const plan = products.find((item) => item.catalogKind === "plan" && item.default_price?.id);
  const other = products.find((item) => item.catalogKind === "addon" && !["callsense", "sms_reminders"].includes(item.catalogCode) && item.default_price?.id);
  if (!plan || !other) throw new Error("Plan et module tiers Test requis");
  const marker = crypto.randomUUID();
  let customer;
  let subscription;
  try {
    customer = await stripe.customers.create({ name: "Gusto CallSense item test", metadata: { callsense_test: marker } });
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    subscription = await stripe.subscriptions.create({ customer: customer.id, default_payment_method: paymentMethod.id, payment_behavior: "error_if_incomplete",
      items: [{ price: plan.default_price.id }, { price: other.default_price.id }], metadata: { callsense_test: marker }, expand: ["items.data.price"] });
    const selection = await catalog.resolveCatalogSelection({ planPriceId: plan.default_price.id, addonPriceIds: [other.default_price.id, ids.fixed] });
    let summary = await catalog.buildSubscriptionSummary(subscription);
    let operations = catalog.buildSubscriptionItemUpdatePayload({ currentSummary: summary, selection });
    subscription = await stripe.subscriptions.update(subscription.id, { items: operations, proration_behavior: "none", expand: ["items.data.price"] });
    assert.equal(subscription.items.data.filter((item) => item.price.id === ids.fixed).length, 1);
    assert.equal(subscription.items.data.filter((item) => item.price.id === ids.metered).length, 1);
    summary = await catalog.buildSubscriptionSummary(subscription);
    operations = catalog.buildSubscriptionItemUpdatePayload({ currentSummary: summary, selection });
    subscription = await stripe.subscriptions.update(subscription.id, { items: operations, proration_behavior: "none", expand: ["items.data.price"] });
    assert.equal(subscription.items.data.filter((item) => item.price.id === ids.metered).length, 1);
    summary = await catalog.buildSubscriptionSummary(subscription);
    operations = catalog.buildSubscriptionItemUpdatePayload({ currentSummary: summary, selection: { ...selection, addons: selection.addons.filter((addon) => addon.code !== "callsense") } });
    subscription = await stripe.subscriptions.update(subscription.id, { items: operations, proration_behavior: "none", expand: ["items.data.price"] });
    assert.equal(subscription.items.data.some((item) => [ids.fixed, ids.metered].includes(item.price.id)), false);
    assert.equal(subscription.items.data.some((item) => item.price.id === other.default_price.id), true);
    assert.equal(subscription.items.data.some((item) => item.price.id === plan.default_price.id), true);
    console.log("Stripe Test : ajout, sauvegarde répétée, retrait CallSense et conservation du plan et d'un autre module vérifiés.");
  } finally {
    if (subscription?.id) await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }).catch(() => {});
    if (customer?.id) await stripe.customers.del(customer.id).catch(() => {});
  }
}
main().catch((error) => { console.error("Test Stripe items échoué :", error.message); process.exitCode = 1; });
