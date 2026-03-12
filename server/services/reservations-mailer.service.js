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

function tplReminder24h({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
}) {
  return `
  <html>
    <body style="font-family: Arial, sans-serif; color:#333; line-height:1.6;">
      <p>Bonjour ${customerName},</p>

      <p>
        Nous avons le plaisir de vous rappeler votre réservation chez
        <strong>${restaurantName}</strong> pour
        <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>,
        prévue le <strong>${fmtDateFR(reservationDate)}</strong> à
        <strong>${reservationTime}</strong>.
      </p>

      <p>
        Toute l’équipe se réjouit de vous accueillir.
      </p>

      <p>
        En cas d’empêchement ou de modification, nous vous remercions de bien vouloir nous prévenir dès que possible.
      </p>

      <p>À très bientôt,</p>

      <p>L’équipe de ${restaurantName}</p>
    </body>
  </html>`;
}

function tplBankHoldActionRequired({
  customerName,
  numberOfGuests,
  reservationDate,
  reservationTime,
  restaurantName,
  bankHoldAmountTotal,
  actionUrl,
}) {
  return `
  <html>
    <body style="font-family: Arial, sans-serif; color:#333; line-height:1.6;">
      <p>Bonjour ${customerName},</p>

      <p>
        Votre réservation a été enregistrée chez
        <strong>${restaurantName}</strong> pour
        <strong>${numberOfGuests} personne${numberOfGuests > 1 ? "s" : ""}</strong>,
        le <strong>${fmtDateFR(reservationDate)}</strong> à
        <strong>${reservationTime}</strong>.
      </p>

      <p>
        Afin de confirmer définitivement cette réservation, nous vous invitons à
        valider l’empreinte bancaire demandée.
      </p>

      <p>
        <strong>Montant de l’empreinte bancaire :</strong>
        ${Number(bankHoldAmountTotal || 0).toFixed(2)} €
      </p>

      <p>
        Ce lien est valable <strong>1 heure</strong>.
      </p>

      <p style="margin: 24px 0;">
        <a
          href="${actionUrl}"
          style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;"
        >
          Valider mon empreinte bancaire
        </a>
      </p>

      <p>
        Sans validation dans le délai imparti, la réservation sera automatiquement annulée.
      </p>

      <p>Cordialement,</p>
      <p>L’équipe de ${restaurantName}</p>
    </body>
  </html>`;
}

async function sendReservationEmail(
  type,
  { reservation, restaurantName, actionUrl, bankHoldAmountTotal },
) {
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
    actionUrl,
    bankHoldAmountTotal,
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

  if (type === "reminder24h") {
    return sendEmail({
      subject: "Rappel de votre réservation demain",
      htmlContent: tplReminder24h(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  if (type === "bankHoldActionRequired") {
    return sendEmail({
      subject: "Validation requise pour confirmer votre réservation",
      htmlContent: tplBankHoldActionRequired(payload),
      toEmail: payload.toEmail,
      toName: payload.toName,
      restaurantName,
    });
  }

  return { skipped: true, reason: "unknown_type" };
}

module.exports = { sendReservationEmail };
