const Brevo = require("sib-api-v3-sdk");

function sendAccountEmail({ email, subject, htmlContent }) {
  Brevo.ApiClient.instance.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
  return new Brevo.TransactionalEmailsApi().sendTransacEmail({
    sender: { email: "no-reply@gusto-manager.com", name: "Gusto Manager" },
    to: [{ email }],
    subject,
    htmlContent,
  });
}

function isValidNewPassword(password, minimumLength = 12) {
  return typeof password === "string" && password.trim().length >= minimumLength &&
    Buffer.byteLength(password, "utf8") <= 72;
}

module.exports = { sendAccountEmail, isValidNewPassword };
