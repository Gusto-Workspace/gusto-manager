const SibApiV3Sdk = require("sib-api-v3-sdk");

const EMAIL_EVENT_TYPES = new Set([
  "received",
  "confirmed",
  "rejected",
  "canceled",
  "ready",
  "out_for_delivery",
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

function getEventCopy(eventType, order, variables) {
  const refunded = order?.paymentStatus === "refunded";
  const paidOnline =
    order?.paymentMethod === "online" && order?.paymentStatus === "paid";

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
      message: refunded
        ? "Votre commande a été refusée. Votre paiement en ligne a été remboursé. Le délai d’affichage dépend ensuite de votre banque."
        : paidOnline
          ? "Votre commande a été refusée. Le remboursement de votre paiement a été initié. Sa finalisation n’est pas encore confirmée."
          : "Votre commande a été refusée. Aucun paiement en ligne ne sera encaissé pour cette commande.",
    };
  }
  if (eventType === "canceled") {
    return {
      subject: `Commande ${variables.orderNumber} annulée`,
      heading: "Votre commande a été annulée",
      message: refunded
        ? "Votre commande a été annulée. Votre paiement en ligne a été remboursé. Le délai d’affichage dépend ensuite de votre banque."
        : paidOnline
          ? "Votre commande a été annulée. Le remboursement de votre paiement a été initié. Sa finalisation n’est pas encore confirmée."
          : "Votre commande a été annulée. Pour toute question, vous pouvez contacter directement le restaurant.",
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
        <td style="padding:10px 0;border-bottom:1px solid #eaded9;">${Number(item.quantity || 0)} × ${escapeHtml(item.name)}${detail}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eaded9;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(item.lineTotal, order.currency))}</td>
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
  if (!EMAIL_EVENT_TYPES.has(eventType) || !order) return null;
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
  const payment =
    order.paymentMethod === "online"
      ? order.paymentStatus === "refunded"
        ? "Payé en ligne · remboursé"
        : order.paymentStatus === "paid"
          ? ["canceled", "rejected"].includes(order.status)
            ? "Payé en ligne · remboursement à confirmer"
            : "Payé en ligne"
          : "Paiement en ligne non finalisé"
      : order.fulfillmentMode === "delivery"
        ? "Paiement à la livraison"
        : "Paiement au retrait";

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
          <p style="margin:18px 0 0;text-align:right;font-size:18px;"><strong>Total : ${escapeHtml(formatMoney(order.total, order.currency))}</strong></p>
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
  return brevoClient().sendTransacEmail(payload);
}

module.exports = {
  EMAIL_EVENT_TYPES,
  buildTakeAwayEmail,
  sendTakeAwayOrderEmail,
};
