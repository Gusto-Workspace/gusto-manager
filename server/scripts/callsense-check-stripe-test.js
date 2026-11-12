// Dedicated disposable Stripe Test customer; does not touch customer subscriptions.
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { offerIds, validateOffer } = require("../services/callsense-usage.service");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !String(process.env.STRIPE_API_SECRET_KEY || "").startsWith("sk_test_")) throw new Error("Clé Stripe Test et opt-in Test requis");
  const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
  const ids = offerIds();
  const minutes = Number(process.env.CALLSENSE_TEST_MINUTES || 1001);
  if (![1000, 1001].includes(minutes)) throw new Error("Volume de test non autorisé");
  const [fixed, measured, meter] = await Promise.all([stripe.prices.retrieve(ids.fixed), stripe.prices.retrieve(ids.metered, { expand: ["tiers"] }), stripe.billing.meters.retrieve(ids.meter)]);
  assert.equal(validateOffer(fixed, measured, meter, ids), true);
  const marker = crypto.randomUUID();
  let customer;
  let subscription;
  try {
    customer = await stripe.customers.create({ name: "Gusto CallSense disposable test", metadata: { callsense_test: marker } });
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    subscription = await stripe.subscriptions.create({ customer: customer.id, collection_method: "charge_automatically", default_payment_method: paymentMethod.id, payment_behavior: "error_if_incomplete",
      items: [{ price: ids.fixed }, { price: ids.metered }], metadata: { callsense_test: marker } });
    assert.equal(subscription.items.data.filter((item) => item.price.id === ids.fixed).length, 1);
    assert.equal(subscription.items.data.filter((item) => item.price.id === ids.metered).length, 1);
    const identifier = `callsense_test_${marker}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { event_name: "gusto_callsense_minutes", timestamp, identifier, payload: { stripe_customer_id: customer.id, value: String(minutes) } };
    const first = await stripe.billing.meterEvents.create(params, { idempotencyKey: identifier });
    const second = await stripe.billing.meterEvents.create(params, { idempotencyKey: identifier });
    assert.equal(first.identifier, second.identifier);
    let total = null;
    console.log("Événement de test accepté ; attente de son agrégation asynchrone.");
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const summary = await stripe.billing.meters.listEventSummaries(ids.meter, { customer: customer.id,
        start_time: Math.floor(timestamp / 60) * 60, end_time: Math.floor(timestamp / 60) * 60 + 120 });
      total = summary.data.reduce((sum, item) => sum + Number(item.aggregated_value || 0), 0);
      if (total === minutes) break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    assert.equal(total, minutes, "Agrégation non disponible ou inattendue");
    console.log(`Stripe Test : deux lignes et ${minutes} minutes envoyées deux fois avec une seule agrégation vérifiées.`);
    const preview = await stripe.invoices.createPreview({ customer: customer.id, subscription: subscription.id });
    assert.equal(preview.subtotal, 4500 + Math.max(0, minutes - 1000) * 5, "Sous-total hors taxes inattendu");
    const amounts = preview.lines.data.map((item) => ({ amount: item.amount, description: item.description || "" }));
    console.log(`Aperçu Stripe Test : montant ${preview.total} centimes ; taxes ${JSON.stringify(preview.total_taxes || [])} ; lignes ${JSON.stringify(amounts)}.`);
  } finally {
    if (subscription?.id) await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }).catch(() => {});
    if (customer?.id) await stripe.customers.del(customer.id).catch(() => {});
  }
}
main().catch((error) => { console.error("Test Stripe isolé échoué :", error.message); process.exitCode = 1; });
