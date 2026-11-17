const SibApiV3Sdk = require("sib-api-v3-sdk");

const EMAIL_EVENT_TYPES = new Set([
  "received",
  "confirmed",
  "rejected",
  "canceled",
  "ready",
  "out_for_delivery",
  "partial_rejection",
  "expired",
  "refund_update",
]);

function cleanString(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value));
}

function formatMoney(value, currency = "eur") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: cleanString(currency).toUpperCase() || "EUR",
  }).format(Number(value || 0));
}

function formatScheduledFor(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function interpolateTemplate(value, variables) {
  return cleanString(value).replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (_, key) => (Object.hasOwn(variables, key) ? variables[key] : ""),
  );
}

function paymentLocation(order) {
  return order.fulfillmentMode === "delivery" ? "à la livraison" : "au retrait";
}

function refundOperations(order) {
  if (order.adjustments?.length) return order.adjustments;
  // Historical orders have a single refund. A local pending marker alone
  // does not prove that Stripe has received the request.
  let state = "queued";
  if (order.paymentStatus === "refunded") state = "succeeded";
  else if (order.stripeRefundId) {
    if (["failed", "canceled"].includes(order.stripeRefundStatus))
      state = "failed";
    else if (order.stripeRefundStatus === "succeeded") state = "succeeded";
    else if (["pending", "requires_action"].includes(order.stripeRefundStatus))
      state = "pending";
    else state = "uncertain";
  } else if (order.stripeRefundStatus === "failed") state = "uncertain";
  else if (order.paymentStatus === "failed") state = "not_required";
  return [
    {
      amountCents: Math.round(Number(order.total || 0) * 100),
      state,
    },
  ];
}

function refundMessage(order, operations = refundOperations(order)) {
  if (order.paymentMethod !== "online") return "";
  const paid = ["paid", "refunded"].includes(order.paymentStatus);
  if (!paid) {
    return operations.some((operation) => operation.state !== "not_required")
      ? "La situation du paiement en ligne est en cours de vérification. Aucun remboursement n'est confirmé à ce stade."
      : "Le paiement en ligne n'a pas été finalisé.";
  }
  const amounts = new Map();
  for (const operation of operations) {
    if (operation.amountCents > 0 && operation.state !== "not_required") {
      amounts.set(
        operation.state,
        (amounts.get(operation.state) || 0) + operation.amountCents,
      );
    }
  }
  return [...amounts]
    .map(([state, cents]) => {
      const amount = formatMoney(cents / 100, order.currency);
      if (state === "succeeded")
        return `Le remboursement de ${amount} est confirmé. Le délai d'affichage dépend de votre banque.`;
      if (state === "pending")
        return `Le remboursement de ${amount} est en cours de traitement. Il n'est pas encore confirmé.`;
      if (state === "failed")
        return `Le remboursement de ${amount} a échoué ou a été annulé. Veuillez contacter le restaurant.`;
      if (state === "uncertain")
        return `Le remboursement de ${amount} est en cours de vérification. Il n'est pas encore confirmé.`;
      return `Le remboursement de ${amount} est demandé. Sa prise en charge par le prestataire de paiement n'est pas encore confirmée.`;
    })
    .join(" ");
}

function paymentLabel(order) {
  if (order.paymentMethod !== "online")
    return `Paiement ${paymentLocation(order)}`;
  if (order.paymentStatus === "refunded") return "Payé en ligne · remboursé";
  if (order.paymentStatus !== "paid") return "Paiement en ligne non finalisé";
  const operations = order.adjustments?.length
    ? order.adjustments
    : ["canceled", "rejected"].includes(order.status)
      ? refundOperations(order)
      : [];
  const outstanding = operations.filter(
    (operation) =>
      operation.amountCents > 0 &&
      !["succeeded", "not_required"].includes(operation.state),
  );
  if (outstanding.some((operation) => operation.state === "uncertain"))
    return "Payé en ligne · remboursement en cours de vérification";
  if (outstanding.some((operation) => operation.state === "failed"))
    return "Payé en ligne · remboursement échoué ou annulé";
  if (outstanding.length) return "Payé en ligne · remboursement à confirmer";
  return "Payé en ligne";
}

function renderTotals(order) {
  const lines = [
    `<strong>Total initial : ${escapeHtml(formatMoney(order.total, order.currency))}</strong>`,
  ];
  if (order.remainingAmountCents != null) {
    const label =
      order.paymentMethod === "on_site" &&
      !["rejected", "canceled"].includes(order.status)
        ? `Montant à régler ${paymentLocation(order)}`
        : "Montant ajusté";
    lines.push(
      `${escapeHtml(label)} : ${escapeHtml(formatMoney(order.remainingAmountCents / 100, order.currency))}`,
    );
  }
  if (
    order.paymentMethod === "online" &&
    ["paid", "refunded"].includes(order.paymentStatus)
  ) {
    const confirmedCents = refundOperations(order)
      .filter((operation) => operation.state === "succeeded")
      .reduce((sum, operation) => sum + operation.amountCents, 0);
    if (confirmedCents > 0)
      lines.push(
        `Remboursement confirmé : ${escapeHtml(formatMoney(confirmedCents / 100, order.currency))}`,
      );
  }
  return lines.join("<br>");
}

function getEventCopy(eventType, order, variables) {
  const [kind, operationId] = eventType.split(":");
  const operation = (order.adjustments || []).find(
    (entry) => entry.id === operationId,
  );
  if (kind === "refund_update" && order.paymentMethod !== "online") return null;
  if (
    ["partial_rejection", "expired", "refund_update"].includes(kind) &&
    operation
  ) {
    // A delayed partial email may be sent after a later full cancellation.
    const partialActive =
      kind === "partial_rejection" &&
      !["rejected", "canceled"].includes(order.status);
    const financial =
      order.paymentMethod === "on_site" && partialActive
        ? `Le montant à régler ${paymentLocation(order)} a été ajusté.`
        : refundMessage(
            order,
            kind === "expired" ? refundOperations(order) : [operation],
          );
    const descriptions = {
      partial_rejection: "Certains articles de votre commande ont été refusés",
      expired:
        "Votre commande a été annulée faute de validation dans le délai prévu",
      refund_update: "Le remboursement de votre commande a été mis à jour",
    };
    return {
      subject: `${kind === "expired" ? "Commande annulée" : kind === "partial_rejection" ? "Commande ajustée" : "Remboursement"} ${variables.orderNumber}`,
      heading: descriptions[kind],
      message:
        `${descriptions[kind]}. ${partialActive ? "Les articles conservés restent confirmés. " : kind === "partial_rejection" ? `Votre commande a depuis été ${order.status === "rejected" ? "refusée" : "annulée"}. ` : ""}Articles concernés : ${operation.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}${operation.reason ? `. Motif : ${operation.reason}` : ""}. ${financial}`.trim(),
    };
  }

  if (eventType === "received") {
    return {
      subject: `Commande ${variables.orderNumber} bien reçue`,
      heading: "Votre commande a bien été reçue",
      message:
        "Le restaurant doit encore la confirmer. Vous recevrez un nouvel email dès qu’elle sera acceptée.",
    };
  }
  if (eventType === "confirmed") {
    const templates = order?.restaurantTakeAwayEmailTemplates || {};
    return {
      subject:
        interpolateTemplate(templates.confirmationSubject, variables) ||
        `Confirmation de votre commande ${variables.orderNumber}`,
      heading: "Votre commande est confirmée",
      message:
        interpolateTemplate(templates.confirmationBody, variables) ||
        "Nous préparons votre commande avec soin.",
    };
  }
  if (eventType === "rejected") {
    return {
      subject: `Commande ${variables.orderNumber} refusée`,
      heading: "Votre commande n’a pas pu être acceptée",
      message: ["Votre commande a été refusée.", refundMessage(order)]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (eventType === "canceled") {
    return {
      subject: `Commande ${variables.orderNumber} annulée`,
      heading: "Votre commande a été annulée",
      message: [
        "Votre commande a été annulée.",
        refundMessage(order),
        "Pour toute question, vous pouvez contacter directement le restaurant.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (eventType === "ready") {
    return {
      subject: `Commande ${variables.orderNumber} prête`,
      heading: "Votre commande est prête",
      message: "Vous pouvez venir la récupérer au restaurant.",
    };
  }
  if (eventType === "out_for_delivery") {
    return {
      subject: `Commande ${variables.orderNumber} en livraison`,
      heading: "Votre commande est en route",
      message: "Votre commande a quitté le restaurant pour être livrée.",
    };
  }
  return null;
}

function renderItems(order) {
  return (order?.items || [])
    .map((item) => {
      const options = (item.options || [])
        .map((option) => escapeHtml(option.name))
        .filter(Boolean)
        .join(", ");
      const detail = options
        ? `<br><span style="color:#76635c;">${options}</span>`
        : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eaded9;">${Math.max(0, Number(item.quantity || 0) - Number(item.refusedQuantity || 0))} × ${escapeHtml(item.name)}${item.refusedQuantity ? `<br><span style="color:#76635c;">${Number(item.refusedQuantity)} refusé(s) sur ${Number(item.quantity)} commandé(s)</span>` : ""}${detail}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eaded9;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(item.refusedQuantity ? Math.max(0, Number(item.quantity) - Number(item.refusedQuantity)) * (Number(item.unitPrice) + Number(item.optionsTotal || 0)) : item.lineTotal, order.currency))}</td>
      </tr>`;
    })
    .join("");
}

function renderAddress(order) {
  if (order?.fulfillmentMode !== "delivery") return "";
  const address = order.deliveryAddress || {};
  const lines = [
    address.line1,
    address.line2,
    [address.zipCode, address.city].filter(Boolean).join(" "),
    address.instructions ? `Instructions : ${address.instructions}` : "",
  ]
    .map(escapeHtml)
    .filter(Boolean)
    .join("<br>");
  return `<p style="margin:18px 0 0;"><strong>Adresse de livraison</strong><br>${lines}</p>`;
}

function buildTakeAwayEmail({ eventType, order, restaurant }) {
  if (!EMAIL_EVENT_TYPES.has(String(eventType).split(":")[0]) || !order)
    return null;
  const restaurantName = cleanString(restaurant?.name) || "Restaurant";
  const customerName = [order.customerFirstName, order.customerLastName]
    .map(cleanString)
    .filter(Boolean)
    .join(" ");
  const variables = {
    customerName: customerName || "client",
    restaurantName,
    orderNumber: cleanString(order.orderNumber),
    scheduledFor: formatScheduledFor(order.scheduledFor),
  };
  const orderForCopy = Object.assign(Object.create(order), {
    restaurantTakeAwayEmailTemplates:
      restaurant?.takeAwaySettings?.email_templates || {},
  });
  const copy = getEventCopy(eventType, orderForCopy, variables);
  if (!copy) return null;

  const mode = order.fulfillmentMode === "delivery" ? "Livraison" : "Retrait";
  const payment = paymentLabel(order);

  return {
    subject: copy.subject,
    toEmail: cleanString(order.customerEmail),
    toName: variables.customerName,
    restaurantName,
    htmlContent: `<!doctype html><html><body style="margin:0;background:#f6e7e6;color:#472a22;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
        <div style="border:1px solid #dfaa94;border-radius:24px;background:#fffaf8;padding:28px;">
          <p style="margin:0 0 8px;color:#b8795d;font-size:13px;text-transform:uppercase;letter-spacing:.14em;">${escapeHtml(restaurantName)}</p>
          <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;line-height:1.15;">${escapeHtml(copy.heading)}</h1>
          <p style="margin:18px 0 0;line-height:1.7;">Bonjour ${escapeHtml(variables.customerName)},</p>
          <p style="margin:10px 0 0;line-height:1.7;">${escapeHtml(copy.message)}</p>
          <div style="margin-top:24px;border-radius:18px;background:#f8eeea;padding:18px;line-height:1.65;">
            <strong>Commande ${escapeHtml(variables.orderNumber)}</strong><br>
            ${escapeHtml(mode)} · ${escapeHtml(variables.scheduledFor)}<br>
            ${escapeHtml(payment)}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;font-size:14px;">${renderItems(order)}</table>
          <p style="margin:18px 0 0;text-align:right;font-size:18px;">${renderTotals(order)}</p>
          ${renderAddress(order)}
          ${order.customerNote ? `<p style="margin:18px 0 0;"><strong>Votre note</strong><br>${escapeHtml(order.customerNote)}</p>` : ""}
        </div>
      </div>
    </body></html>`,
  };
}

function brevoClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendTakeAwayOrderEmail({ eventType, order, restaurant }) {
  const email = buildTakeAwayEmail({ eventType, order, restaurant });
  if (!email) return { skipped: true, reason: "unknown_type" };
  if (!looksLikeEmail(email.toEmail)) {
    return { skipped: true, reason: "invalid_email" };
  }
  if (!process.env.BREVO_API_KEY) {
    return { skipped: true, reason: "missing_brevo_key" };
  }

  const payload = new SibApiV3Sdk.SendSmtpEmail();
  payload.sender = {
    email: "no-reply@gusto-manager.com",
    name: email.restaurantName,
  };
  payload.to = [{ email: email.toEmail, name: email.toName }];
  payload.subject = email.subject;
  payload.htmlContent = email.htmlContent;
  try {
    return await brevoClient().sendTransacEmail(payload);
  } catch (error) {
    // A network failure/5xx can occur after acceptance. Retrying blindly can
    // send a second confirmation. Only explicit 4xx rejections are retryable.
    const status = Number(error?.status || error?.response?.status);
    error.deliveryUncertain = !(status >= 400 && status < 500 && status !== 408);
    throw error;
  }
}

module.exports = {
  EMAIL_EVENT_TYPES,
  buildTakeAwayEmail,
  sendTakeAwayOrderEmail,
};
