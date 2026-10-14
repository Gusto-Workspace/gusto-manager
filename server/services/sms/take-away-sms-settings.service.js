const { validateSmsTemplate } = require("./sms-message.service");

const BASE_VARIABLES = [
  "firstName",
  "restaurantName",
  "orderNumber",
  "date",
  "time",
  "fulfillmentMode",
  "total",
];
const TAKE_AWAY_SMS_EVENTS = {
  pending: {
    label: "En attente de validation",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} est en attente de validation pour le {date} a {time}.",
  },
  confirmed: {
    label: "Commande confirmée",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} est confirmee pour le {date} a {time}.",
  },
  preparing: {
    label: "En préparation",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} est en preparation.",
  },
  ready: {
    label: "Commande prête",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} est prete au retrait chez {restaurantName}.",
  },
  out_for_delivery: {
    label: "En livraison",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} est en livraison.",
  },
  completed: {
    label: "Commande remise au client",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} est terminee. Merci !",
  },
  rejected: {
    label: "Commande entièrement refusée",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} a ete refusee.",
  },
  canceled: {
    label: "Commande annulée",
    template:
      "Bonjour {firstName}, votre commande {orderNumber} chez {restaurantName} a ete annulee. {reason}",
  },
  partial_rejection: {
    label: "Articles ou quantités refusés",
    template:
      "Commande {orderNumber} chez {restaurantName} : articles refuses : {rejectedItems}. Le reste de votre commande est confirme. {reason}",
  },
  refund_confirmed: {
    label: "Remboursement confirmé",
    template:
      "Commande {orderNumber} chez {restaurantName} : remboursement de {refundAmount} confirme. Le delai bancaire peut varier.",
  },
};

function takeAwaySmsVariables(event) {
  return new Set([
    ...BASE_VARIABLES,
    ...(["partial_rejection", "canceled", "rejected"].includes(event)
      ? ["reason"]
      : []),
    ...(event === "partial_rejection" ? ["rejectedItems", "refundAmount"] : []),
    ...(event === "refund_confirmed" ? ["refundAmount"] : []),
  ]);
}

function serializeTakeAwaySmsSettings(settings = {}) {
  return {
    enabled: settings.enabled === true,
    events: Object.fromEntries(
      Object.entries(TAKE_AWAY_SMS_EVENTS).map(([key, event]) => [
        key,
        {
          enabled: settings.events?.[key]?.enabled === true,
          template: settings.events?.[key]?.template || event.template,
        },
      ]),
    ),
  };
}

function sanitizeTakeAwaySmsSettings(
  input = {},
  current = {},
  now = new Date(),
) {
  const serialized = serializeTakeAwaySmsSettings(current);
  const enabled = Object.hasOwn(input, "enabled")
    ? input.enabled === true
    : serialized.enabled;
  return {
    enabled,
    enabledAt: enabled
      ? current.enabled
        ? current.enabledAt || now
        : now
      : null,
    events: Object.fromEntries(
      Object.entries(TAKE_AWAY_SMS_EVENTS).map(([key]) => {
        const previous = current.events?.[key] || {};
        const patch = input.events?.[key] || {};
        const selected = Object.hasOwn(patch, "enabled")
          ? patch.enabled === true
          : previous.enabled === true;
        return [
          key,
          {
            enabled: selected,
            enabledAt: selected
              ? previous.enabled
                ? previous.enabledAt || now
                : now
              : null,
            template: validateSmsTemplate(
              patch.template ?? serialized.events[key].template,
              takeAwaySmsVariables(key),
              {
                orderNumber: "TA-1234",
                fulfillmentMode: "retrait",
                total: "25,00 EUR",
                reason: "Indisponible",
                rejectedItems: "2 x Pizza",
                refundAmount: "12,00 EUR",
              },
            ),
          },
        ];
      }),
    ),
  };
}

// Persisted alongside the business mutation, never reconstructed from a UI/SSE event.
function orderStatusSmsEvent(order, status, now = new Date()) {
  if (!Object.hasOwn(TAKE_AWAY_SMS_EVENTS, status))
    return null;
  if (
    status === "pending" &&
    order.paymentMethod === "online" &&
    !["paid", "refunded"].includes(order.paymentStatus)
  )
    return null;
  return {
    id: `status:${status}`,
    type: "order_status",
    createdAt: now,
    snapshot: {
      orderId: String(order._id || ""),
      orderNumber: order.orderNumber,
      customerFirstName: order.customerFirstName,
      customerPhone: order.customerPhone,
      scheduledFor: order.scheduledFor,
      fulfillmentMode: order.fulfillmentMode,
      total:
        order.remainingAmountCents == null
          ? order.total
          : order.remainingAmountCents / 100,
      currency: order.currency,
      status,
    },
  };
}

function addOrderStatusSmsEvent(update, order, status, now) {
  const event = orderStatusSmsEvent(order, status, now);
  if (
    event &&
    !(order.businessEvents || []).some((existing) => existing.id === event.id)
  ) {
    update.$push = { ...(update.$push || {}), businessEvents: event };
  }
  return update;
}

function addRefundConfirmedSmsEvent(
  update,
  order,
  status,
  refund,
  now = new Date(),
) {
  if (order.source !== "public" || refund.status !== "succeeded") return update;
  const statusEvent = orderStatusSmsEvent(order, status, now);
  const event = {
    ...statusEvent,
    id: `refund:${refund.id}:confirmed`,
    type: "refund_confirmed",
    snapshot: {
      ...statusEvent.snapshot,
      state: "succeeded",
      stripeRefundStatus: refund.status,
      stripeRefundId: refund.id,
      amountCents: refund.amount,
      paymentMethod: "online",
    },
  };
  const events = (order.businessEvents || []).some(
    (existing) => existing.id === statusEvent.id,
  )
    ? [event]
    : [statusEvent, event];
  update.$push = { ...(update.$push || {}), businessEvents: { $each: events } };
  return update;
}

module.exports = {
  TAKE_AWAY_SMS_EVENTS,
  takeAwaySmsVariables,
  serializeTakeAwaySmsSettings,
  sanitizeTakeAwaySmsSettings,
  orderStatusSmsEvent,
  addOrderStatusSmsEvent,
  addRefundConfirmedSmsEvent,
};
