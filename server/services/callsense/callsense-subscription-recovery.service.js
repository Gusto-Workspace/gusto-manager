const Operation = require("../../models/callsense/callsense-subscription-operation.model");
const Audit = require("../../models/callsense/callsense-billing-audit.model");

// Only a Stripe creation event carrying the original idempotency key proves
// that this particular operation created this particular subscription.
async function reconcileCreation({ restaurantId, subscription, event }) {
  if (!subscription?.id || String(subscription.metadata?.restaurantId || "") !== String(restaurantId) ||
      event?.type !== "customer.subscription.created" || event.data?.object?.id !== subscription.id) return false;
  const operation = await Operation.findById(String(restaurantId)).lean();
  if (!operation || operation.kind !== "create" || operation.state !== "uncertain" ||
      event.request?.idempotency_key !== `callsense-subscription-${operation.attemptId}`) return false;
  await Audit.create({ restaurantId, action: "subscription_create_reconciled", attemptId: operation.attemptId,
    reference: subscription.id, at: new Date() });
  const result = await Operation.deleteOne({ _id: String(restaurantId), attemptId: operation.attemptId, kind: "create", state: "uncertain" });
  return Boolean(result.deletedCount);
}

// Events are retrieved, not replayed; if the search is incomplete or Stripe
// no longer retains the event, keep the lock for an explicit review.
async function reconcileExistingCreation({ restaurantId, subscription, stripe }) {
  const operation = await Operation.findById(String(restaurantId)).lean();
  if (!operation || operation.kind !== "create" || !subscription?.id) return false;
  let startingAfter;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await stripe.events.list({ type: "customer.subscription.created", created: { gte: Math.floor(new Date(operation.startedAt).getTime() / 1000) - 60 }, limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}) });
    const event = page.data.find((item) => item.data?.object?.id === subscription.id && item.request?.idempotency_key === `callsense-subscription-${operation.attemptId}`);
    if (event) return reconcileCreation({ restaurantId, subscription, event });
    if (!page.has_more) return false;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) return false;
  }
  return false;
}

// A mutation is recovered only from its own Stripe event and idempotency key.
// Synchronize before releasing the lock, so another mutation cannot overtake it.
async function reconcileExistingMutation({ restaurantId, subscription, stripe, synchronize }) {
  const operation = await Operation.findById(String(restaurantId)).lean();
  if (!operation || operation.state !== "uncertain" || !["create", "update"].includes(operation.kind) || !subscription?.id ||
      (operation.subscriptionId && operation.subscriptionId !== subscription.id) ||
      String(subscription.metadata?.restaurantId || "") !== String(restaurantId)) return false;
  if (operation.kind === "update" && operation.action === "cancel" && operation.subscriptionId === subscription.id && subscription.status === "canceled") {
    const synchronized = await synchronize({ restaurantId, subscription });
    if (synchronized?.configured === false) throw new Error("Configuration CallSense absente : synchronisation impossible");
    await Audit.create({ restaurantId, action: "subscription_update_reconciled", attemptId: operation.attemptId, reference: subscription.id, at: new Date() });
    const result = await Operation.deleteOne({ _id: String(restaurantId), attemptId: operation.attemptId, kind: "update", state: "uncertain", action: "cancel", subscriptionId: subscription.id });
    return Boolean(result.deletedCount);
  }
  const eventType = operation.kind === "create" ? "customer.subscription.created" :
    subscription.status === "canceled" ? "customer.subscription.deleted" : "customer.subscription.updated";
  let startingAfter;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await stripe.events.list({ type: eventType, created: { gte: Math.floor(new Date(operation.startedAt).getTime() / 1000) - 60 }, limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}) });
    const event = page.data.find(item => item.type === eventType && item.data?.object?.id === subscription.id &&
      item.request?.idempotency_key === `callsense-subscription-${operation.attemptId}`);
    if (event) {
      const synchronized = await synchronize({ restaurantId, subscription });
      if (synchronized?.configured === false) throw new Error("Configuration CallSense absente : synchronisation impossible");
      await Audit.create({ restaurantId, action: `subscription_${operation.kind}_reconciled`, attemptId: operation.attemptId, reference: subscription.id, at: new Date() });
      const result = await Operation.deleteOne({ _id: String(restaurantId), attemptId: operation.attemptId, kind: operation.kind, state: "uncertain" });
      return Boolean(result.deletedCount);
    }
    if (!page.has_more) return false;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) return false;
  }
  return false;
}

module.exports = { reconcileCreation, reconcileExistingCreation, reconcileExistingMutation };
