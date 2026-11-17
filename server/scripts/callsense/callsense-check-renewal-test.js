// Disposable Stripe Test clock; no existing customer or subscription is touched.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { offerIds } = require("../../services/callsense/callsense-usage.service");
async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !String(process.env.STRIPE_API_SECRET_KEY || "").startsWith("sk_test_")) throw new Error("Stripe Test uniquement");
  const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 0 });
  const ids = offerIds();
  let clock, customer, subscription;
  try {
    const start = Math.floor(Date.now() / 1000) - 120;
    clock = await stripe.testHelpers.testClocks.create({ frozen_time: start, name: "Gusto CallSense disposable renewal" });
    customer = await stripe.customers.create({ name: "Gusto CallSense disposable renewal", test_clock: clock.id });
    const payment = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    subscription = await stripe.subscriptions.create({ customer: customer.id, default_payment_method: payment.id, payment_behavior: "error_if_incomplete", items: [{ price: ids.fixed }, { price: ids.metered }] });
    const measured = subscription.items.data.find((item) => item.price.id === ids.metered);
    const previousEnd = measured.current_period_end || subscription.current_period_end;
    assert.ok(previousEnd > start);
    const initialInvoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
    assert.ok(initialInvoices.data.some((invoice) => ["open", "paid"].includes(invoice.status) && invoice.subtotal === 4500));
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: previousEnd + 60 });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      clock = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (clock.status === "ready") break;
      if (clock.status !== "advancing") throw new Error("Horloge Stripe en erreur");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert.equal(clock.status, "ready", "Renouvellement non disponible dans le délai");
    const renewed = await stripe.subscriptions.retrieve(subscription.id);
    const newItem = renewed.items.data.find((item) => item.price.id === ids.metered);
    assert.equal(newItem.current_period_start || renewed.current_period_start, previousEnd);
    assert.ok((newItem.current_period_end || renewed.current_period_end) > previousEnd);
    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
    assert.ok(invoices.data.length >= 2);
    console.log(`Stripe Test : renouvellement et continuité des périodes vérifiés ; ${invoices.data.length} factures de test, statuts ${[...new Set(invoices.data.map((invoice) => invoice.status))].join(", ")}.`);
  } finally {
    if (subscription?.id) await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }).catch(() => {});
    if (customer?.id) await stripe.customers.del(customer.id).catch(() => {});
    if (clock?.id) await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
  }
}
main().catch(() => { console.error("Test de renouvellement Stripe Test indisponible ou échoué."); process.exitCode = 1; });
