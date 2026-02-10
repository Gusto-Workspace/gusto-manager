const SibApiV3Sdk = require("sib-api-v3-sdk");

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function fmtDateFR(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR");
}

function brevoClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendEmail({
  subject,
  htmlContent,
  toEmail,
  toName,
  restaurantName,
}) {
  if (!looksLikeEmail(toEmail))
    return { skipped: true, reason: "invalid_email" };
  if (!process.env.BREVO_API_KEY)
    return { skipped: true, reason: "missing_brevo_key" };

  const apiInstance = brevoClient();

  const mainEmail = {
    sender: {
      email: "no-reply@gusto-manager.com",
      name: restaurantName || "Gusto Manager",
    },
    to: [{ email: String(toEmail).trim(), name: toName || "" }],
    subject,
    htmlContent,
  };

  return apiInstance.sendTransacEmail(mainEmail);
}

function tplConfirmed({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
}) {
  return `
  <html><body style="font-family: Arial, sans-serif; color:#333;">
    <p>Bonjour ${customerName},</p>
    <p>
      Nous vous confirmons que votre réservation pour
      <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>
      a bien été enregistrée à la date du <strong>${fmtDateFR(reservationDate)}</strong>
      à <strong>${reservationTime}</strong>.
    </p>
    <p>Nous vous remercions de votre confiance et nous nous réjouissons de vous accueillir prochainement au sein de <strong>${restaurantName}</strong>.</p>
    <p>Pour toute question ou modification, n'hésitez pas à nous contacter.</p>
    <p>Cordialement,</p>
    <p>L'équipe de ${restaurantName}</p>
  </body></html>`;
}

function tplPending({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
}) {
  return `
  <html><body style="font-family: Arial, sans-serif; color:#333;">
    <p>Bonjour ${customerName},</p>
    <p>
      Nous avons bien reçu votre demande de réservation pour
      <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>
      le <strong>${fmtDateFR(reservationDate)}</strong> à <strong>${reservationTime}</strong>.
    </p>
    <p>Votre demande est actuellement <strong>en attente de validation</strong>. Nous revenons vers vous dès que possible.</p>
    <p>Cordialement,</p>
    <p>L’équipe de ${restaurantName}</p>
  </body></html>`;
}

function tplCanceled({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
}) {
  return `
  <html><body style="font-family: Arial, sans-serif; color:#333;">
    <p>Bonjour ${customerName},</p>
    <p>
      Nous vous informons que votre réservation pour
      <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>
      le <strong>${fmtDateFR(reservationDate)}</strong> à <strong>${reservationTime}</strong>
      a été <strong>annulée</strong>.
    </p>
    <p>Si vous souhaitez reprogrammer une réservation, n’hésitez pas à nous recontacter.</p>
    <p>Cordialement,</p>
    <p>L’équipe de ${restaurantName}</p>
  </body></html>`;
}

function tplRejected({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
}) {
  return `
  <html><body style="font-family: Arial, sans-serif; color:#333;">
    <p>Bonjour ${customerName},</p>
    <p>
      Nous sommes désolés, mais nous ne pouvons pas accepter votre demande de réservation pour
      <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>
      le <strong>${fmtDateFR(reservationDate)}</strong> à <strong>${reservationTime}</strong>.
    </p>
    <p>N’hésitez pas à réserver un nouveau créneau sur notre site internet.</p>
    <p>Cordialement,</p>
    <p>L’équipe de ${restaurantName}</p>
  </body></html>`;
}

async function sendReservationEmail(type, { reservation, restaurantName }) {
  if (!reservation) return { skipped: true, reason: "no_reservation" };
  const email = reservation.customerEmail;

  const payload = {
    customerName: reservation.customerName,
    toEmail: email,
    toName: reservation.customerName,
    numberOfGuests: reservation.numberOfGuests,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
    restaurantName,
  };

  if (type === "confirmed") {
    return sendEmail({
      subject: "Confirmation de votre réservation",
      htmlContent: tplConfirmed(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  if (type === "pending") {
    return sendEmail({
      subject: "Votre demande de réservation est en attente",
      htmlContent: tplPending(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  if (type === "canceled") {
    return sendEmail({
      subject: "Annulation de votre réservation",
      htmlContent: tplCanceled(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  if (type === "rejected") {
    return sendEmail({
      subject: "Votre demande de réservation a été refusée",
      htmlContent: tplRejected(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  return { skipped: true, reason: "unknown_type" };
}

module.exports = { sendReservationEmail };
