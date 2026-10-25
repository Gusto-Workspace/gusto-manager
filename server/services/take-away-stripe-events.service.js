const { randomUUID } = require("crypto");
const Receipt = require("../models/take-away-stripe-event.model");
const {
  validateTakeAwayStripeEventEnvelope,
  handleTakeAwayStripeWebhookEvent,
  getStripeForRestaurant,
} = require("./take-away.service");

function retryError(code) {
  return Object.assign(new Error("Traitement Stripe à réessayer"), {
    status: 503,
    code,
  });
}

// Re-read the authoritative object rather than applying an old failure/refund
// snapshot after a success. No write is made to Stripe here.
async function refreshEvent(event, restaurant, stripeInstance = null) {
  const stripe = getStripeForRestaurant(restaurant, stripeInstance);
  const id = event.data.object.id;
  const object = event.type.startsWith("refund.")
    ? await stripe.refunds.retrieve(id)
    : await stripe.paymentIntents.retrieve(id);
  let type = event.type;
  if (!type.startsWith("refund.")) {
    if (object.status === "succeeded") type = "payment_intent.succeeded";
    else if (object.status === "canceled") type = "payment_intent.canceled";
    else if (type !== "payment_intent.payment_failed") {
      throw retryError("STRIPE_STATE_NOT_FINAL");
    } else if (object.status !== "requires_payment_method") {
      return null; // A newer payment attempt is processing; don't mark it failed.
    }
  }
  const refreshed = { ...event, type, data: { object } };
  validateTakeAwayStripeEventEnvelope({
    restaurantId: String(restaurant._id),
    event: refreshed,
  });
  return refreshed;
}

function createEventProcessor({
  receipts = Receipt,
  refresh = refreshEvent,
  handle = handleTakeAwayStripeWebhookEvent,
} = {}) {
  return async function processEvent({ restaurant, event }) {
    const restaurantId = String(restaurant._id);
    const validation = validateTakeAwayStripeEventEnvelope({
      restaurantId,
      event,
    });
    if (!validation.supported) return { handled: false };
    const objectId = String(event.data.object.id || "");
    if (!objectId)
      throw Object.assign(new Error("Objet Stripe absent"), { status: 400 });
    const key = `${restaurantId}:${event.id}`;
    try {
      await receipts.create({
        _id: key,
        restaurantId,
        eventId: event.id,
        eventType: event.type,
        objectId,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const existing = await receipts.findById(key);
    if (
      !existing ||
      existing.eventType !== event.type ||
      existing.objectId !== objectId
    )
      throw retryError("STRIPE_RECEIPT_CONFLICT");
    if (existing.processedAt)
      return { handled: existing.handled, duplicate: true };

    const owner = randomUUID();
    const now = new Date();
    const claimed = await receipts.findOneAndUpdate(
      {
        _id: key,
        processedAt: null,
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
      },
      {
        $set: {
          leaseOwner: owner,
          leaseUntil: new Date(now.getTime() + 120000),
        },
        $inc: { attempts: 1 },
      },
      { new: true },
    );
    if (!claimed) throw retryError("STRIPE_EVENT_BUSY");
    try {
      const currentEvent = await refresh(event, restaurant);
      const result = currentEvent
        ? await handle({ restaurant, event: currentEvent })
        : { handled: true };
      if (result?.handled !== true)
        throw retryError("STRIPE_EVENT_NOT_HANDLED");
      const saved = await receipts.updateOne(
        { _id: key, leaseOwner: owner, processedAt: null },
        {
          $set: {
            processedAt: new Date(),
            handled: true,
            leaseOwner: "",
            leaseUntil: null,
            lastErrorCode: "",
          },
        },
      );
      if (saved.modifiedCount !== 1)
        throw retryError("STRIPE_RECEIPT_NOT_SAVED");
      return { handled: true };
    } catch (error) {
      await receipts
        .updateOne(
          { _id: key, leaseOwner: owner, processedAt: null },
          {
            $set: {
              leaseOwner: "",
              leaseUntil: null,
              lastErrorCode: "STRIPE_PROCESSING_FAILED",
            },
          },
        )
        .catch(() => {});
      throw error;
    }
  };
}

module.exports = {
  createEventProcessor,
  refreshEvent,
  processTakeAwayStripeEvent: createEventProcessor(),
};
