// Disposable MongoDB Test documents and Stripe Test customer. No live reporting.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Consumption = require("../models/callsense/callsense-consumption.model");
const Call = require("../models/callsense/callsense-call.model");
const { offerIds } = require("../services/callsense-usage.service");
const { sendEntry } = require("../services/callsense-metering.service");
async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !String(process.env.STRIPE_API_SECRET_KEY || "").startsWith("sk_test_")) throw new Error("Stripe Test requis");
  const dbName = decodeURIComponent(new URL(process.env.CONNECTION_STRING_TEST).pathname.slice(1));
  if (!/(^|[-_])test($|[-_])/i.test(dbName)) throw new Error("MongoDB Test requis");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Base inattendue");
  const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 0 });
  const ids = offerIds(), restaurantId = new mongoose.Types.ObjectId(), callId = new mongoose.Types.ObjectId();
  const marker = crypto.randomUUID();
  let customer, subscription;
  try {
    customer = await stripe.customers.create({ name: "CallSense finalized disposable", metadata: { callsense_test: marker } });
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    subscription = await stripe.subscriptions.create({ customer: customer.id, default_payment_method: pm.id, payment_behavior: "error_if_incomplete", items: [{ price: ids.fixed }, { price: ids.metered }], expand: ["latest_invoice"] });
    const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id;
    const before = await stripe.invoices.retrieve(invoiceId);
    assert.ok(["paid", "open"].includes(before.status));
    const item = subscription.items.data.find((row) => row.price.id === ids.metered);
    const start = item.current_period_start || subscription.current_period_start, end = item.current_period_end || subscription.current_period_end;
    const entry = await Consumption.create({ restaurantId, callId, parentSid: `CA${"a".repeat(32)}`, childSid: `CA${"b".repeat(32)}`,
      stripeCustomerId: customer.id, subscriptionId: subscription.id, periodStart: new Date(start * 1000), periodEnd: new Date(end * 1000),
      occurredAt: new Date((end - 1) * 1000), seconds: 61, minutes: 2, identifier: `callsense_test_${marker}` });
    await Call.create({ _id: callId, restaurantId, accountSid: "ACtest", callSid: `CA${marker.replace(/-/g, "")}`, incomingReceived: true, billingState: "review" });
    let sends = 0;
    const fakeStripe = { billing: { meterEvents: { create: async () => { sends += 1; throw new Error("envoi interdit"); } } } };
    assert.equal(await sendEntry(entry.toObject(), fakeStripe, new Date((end + 1) * 1000)), "review");
    assert.equal(await sendEntry((await Consumption.findById(entry._id).lean()), fakeStripe, new Date((end + 2) * 1000)), "review");
    assert.equal(sends, 0);
    const router = require("../routes/callsense.routes");
    const route = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense/metering/:callId/resolve");
    const res = { code: 200, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await route.route.stack.at(-1).handle({ params: { restaurantId: String(restaurantId), callId: String(callId) }, body: { resolution: "manual", acknowledgement: "JE CONFIRME LA VERIFICATION" }, user: { id: "test" } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.ok, true);
    const stored = await Consumption.findById(entry._id).lean();
    assert.equal(stored.state, "resolved"); assert.equal(stored.resolution, "manual");
    const after = await stripe.invoices.retrieve(invoiceId);
    assert.deepEqual([after.status, after.total, after.amount_paid, after.lines.data.length], [before.status, before.total, before.amount_paid, before.lines.data.length]);
    console.log("Stripe Test : facture finalisée identique avant/après ; observation tardive simulée placée en revue et résolue manuellement sur MongoDB Test, aucun événement envoyé.");
  } finally {
    await Consumption.deleteMany({ restaurantId }); await Call.deleteMany({ restaurantId });
    if (subscription?.id) await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }).catch(() => {});
    if (customer?.id) await stripe.customers.del(customer.id).catch(() => {});
  }
}
main().catch(() => { console.error("Test de facture finalisée indisponible ou échoué."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
