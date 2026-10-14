const crypto = require("crypto");
const { DateTime } = require("luxon");
const TakeAwayOrderModel = require("../../models/take-away-order.model");
const RestaurantModel = require("../../models/restaurant.model");
const SmsJobModel = require("../../models/sms-job.model");
const {
  TAKE_AWAY_SMS_EVENTS,
  takeAwaySmsVariables,
} = require("./take-away-sms-settings.service");
const {
  renderSmsTemplate,
  normalizeToGsm7,
  analyzeSingleSms,
} = require("./sms-message.service");
const { getRestaurantTimezone } = require("./sms-schedule.service");

function smsEventType(event, order) {
  const snapshot = event.snapshot || {};
  if (event.type === "order_status") return snapshot.status;
  if (event.type === "partial_rejection") return "partial_rejection";
  if (event.type === "confirmation_expired") return "canceled";
  if (event.type === "order_terminated")
    return snapshot.targetStatus || order.status;
  if (
    event.type === "refund_confirmed" &&
    snapshot.state === "succeeded" &&
    snapshot.stripeRefundStatus === "succeeded"
  )
    return "refund_confirmed";
  return "";
}

function eventSkipReason(event, order, restaurant, type) {
  const settings = restaurant.takeAwaySettings?.smsNotifications || {};
  const selection = settings.events?.[type];
  if (
    !restaurant.options?.sms_reminders ||
    !restaurant.options?.take_away ||
    !settings.enabled ||
    !selection?.enabled
  )
    return "feature_disabled";
  // Enabling an event must not replay historical orders/refunds.
  const since = Math.max(
    new Date(settings.enabledAt || 0).getTime(),
    new Date(selection.enabledAt || 0).getTime(),
  );
  if (new Date(event.createdAt).getTime() < since)
    return "event_before_activation";
  const partial = settings.events?.partial_rejection;
  if (
    type === "confirmed" &&
    event.operationId &&
    partial?.enabled &&
    new Date(event.createdAt).getTime() >=
      new Date(partial.enabledAt || 0).getTime()
  )
    return "covered_by_partial_rejection";
  const mode = event.snapshot?.fulfillmentMode;
  if (
    (type === "ready" && mode !== "pickup") ||
    (type === "out_for_delivery" && mode !== "delivery")
  )
    return "fulfillment_not_applicable";
  if (type === "pending" && order.status !== "pending") return "event_obsolete";
  if (
    ["confirmed", "preparing", "ready", "out_for_delivery"].includes(type) &&
    ["canceled", "rejected"].includes(order.status)
  )
    return "event_obsolete";
  return "";
}

async function syncTakeAwaySmsJobs({
  orderModel = TakeAwayOrderModel,
  restaurantModel = RestaurantModel,
  smsJobModel = SmsJobModel,
  now = new Date(),
} = {}) {
  const orders = await orderModel
    .find({ businessEvents: { $elemMatch: { smsProcessedAt: null } } })
    .select("restaurant_id source status businessEvents")
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  const restaurants = new Map();
  for (const order of orders) {
    const restaurantId = String(order.restaurant_id);
    if (!restaurants.has(restaurantId))
      restaurants.set(
        restaurantId,
        await restaurantModel.findById(order.restaurant_id),
      );
    const restaurant = restaurants.get(restaurantId);
    for (const event of order.businessEvents || []) {
      if (event.smsProcessedAt) continue;
      const type = smsEventType(event, order);
      if (Object.hasOwn(TAKE_AWAY_SMS_EVENTS, type)) {
        const skipReason = restaurant
          ? eventSkipReason(event, order, restaurant, type)
          : "restaurant_not_found";
        const identity = { takeAwayOrderId: order._id, eventId: event.id };
        const occurrenceKey = `${order._id}:${event.id}`;
        const reference = `gusto-ta-sms-${order._id}-${crypto.createHash("sha256").update(occurrenceKey).digest("hex").slice(0, 12)}`;
        try {
          await smsJobModel.updateOne(
            identity,
            {
              $setOnInsert: {
                ...identity,
                restaurantId: order.restaurant_id,
                type: `take_away_${type}`,
                occurrenceKey,
                providerReference: reference,
                scheduledAt: now,
                status: skipReason ? "skipped" : "scheduled",
                skipReason,
                skippedAt: skipReason ? now : null,
                eventSnapshot: { ...event.snapshot, source: order.source, eventOccurredAt: event.createdAt },
                templateSnapshot:
                  restaurant?.takeAwaySettings?.smsNotifications?.events?.[type]
                    ?.template || TAKE_AWAY_SMS_EVENTS[type].template,
              },
            },
            { upsert: true, runValidators: true },
          );
        } catch (error) {
          if (error?.code !== 11000) throw error;
          // A competing worker must have persisted this exact event first.
          if (!(await smsJobModel.findOne(identity))) throw error;
        }
      }
      // Only acknowledge AFTER durable job creation. A crash in between simply
      // repeats the upsert; businessEvents remains the sole command outbox.
      await orderModel.updateOne(
        { _id: order._id },
        {
          $set: { "businessEvents.$[event].smsProcessedAt": now },
        },
        {
          arrayFilters: [
            { "event.id": event.id, "event.smsProcessedAt": null },
          ],
        },
      );
    }
  }
}

function buildTakeAwayFinalMessage({ job, restaurant, prefixRequired }) {
  const snapshot = job.eventSnapshot || {};
  const type = job.type.slice("take_away_".length);
  const date = DateTime.fromJSDate(new Date(snapshot.scheduledFor)).setZone(
    getRestaurantTimezone(restaurant),
  );
  const money = (value) =>
    `${Number(value || 0)
      .toFixed(2)
      .replace(".", ",")} ${String(snapshot.currency || "eur").toUpperCase()}`;
  const values = {
    firstName: snapshot.customerFirstName || "",
    restaurantName: restaurant.name || "Restaurant",
    orderNumber: snapshot.orderNumber || "",
    date: date.isValid ? date.toFormat("dd/MM/yyyy") : "",
    time: date.isValid ? date.toFormat("HH:mm") : "",
    fulfillmentMode:
      snapshot.fulfillmentMode === "delivery" ? "livraison" : "retrait",
    total: money(snapshot.total),
    reason: snapshot.reason || "",
    rejectedItems: (snapshot.lines || [])
      .map((line) => `${line.quantity} x ${line.name}`)
      .join(", "),
    refundAmount:
      snapshot.paymentMethod === "online" || type === "refund_confirmed"
        ? money(Number(snapshot.amountCents || 0) / 100)
        : "non applicable",
  };
  const prefix = prefixRequired ? `${restaurant.name || "Restaurant"}: ` : "";
  const rendered =
    prefix +
    renderSmsTemplate(job.templateSnapshot, values, takeAwaySmsVariables(type));
  const analysis = analyzeSingleSms(normalizeToGsm7(rendered).value);
  return { message: analysis.message, analysis };
}

module.exports = {
  smsEventType,
  eventSkipReason,
  syncTakeAwaySmsJobs,
  buildTakeAwayFinalMessage,
};
