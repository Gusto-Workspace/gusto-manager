const SibApiV3Sdk = require('sib-api-v3-sdk');

function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];

    apiKey.apiKey = process.env.BREVO_API_KEY;

    return defaultClient;
  } catch (err) {
    throw new Error(err);
  }
}

function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    // TEMPLATE ID
    switch (true) {
      case params.debug:
        if (params.password) {
          sendSmtpEmail.htmlContent = `<html>
                                      <body>
                                        <p>Bonjour {{params.name}},</p>
                                        <p>Voici votre mot de passe temporaire : {{params.randomPassword}}</p>
                                        <p>Pensez à changer ce mot de passe pour votre sécurité !</p>
                                      </body>
                                     </html>`;
        } else {
          sendSmtpEmail.htmlContent = `<html>
                                      <body>
                                        <p>{{params.name}}</p>
                                        <p>{{params.randomPassword}}</p>
                                      </body>
                                     </html>`;
        }
        break;
      case ['sign-up', 'password-changed', 'product', 'purchase', 'newsletter', 'ambassador-newsletter'].includes(params.type):
        sendSmtpEmail.htmlContent = `<html>
                                      <body>
                                        <p>Bonjour {{params.name}},</p>
                                        <p>{{params.message}}</p>
                                        <p>Cordialement,</p>
                                        <p>SAONA Concept</p>
                                      </body>
                                     </html>`;
        break;
      default:
        sendSmtpEmail.templateId = params.templateId;
    }

    // SENDER
    sendSmtpEmail.sender = {
      email: process.env.BREVO_SMTP_SENDER,
      name: process.env.APP_NAME
    };

    // REPLY TO
    sendSmtpEmail.replyTo = {
      email: process.env.BREVO_SMTP_SENDER,
      name: process.env.APP_NAME
    };

    // TO
    sendSmtpEmail.to = params.to;

    // HEADERS
    sendSmtpEmail.headers = {};
    sendSmtpEmail.headers['Content-Type'] = 'text/html';
    sendSmtpEmail.headers.charset = 'utf-8';

    // SUBJECT
    sendSmtpEmail.subject = params.subject;

    // PARAMS
    sendSmtpEmail.params = params.params ?? {};
    sendSmtpEmail.params.url = process.env.APP_URL;
    sendSmtpEmail.params.app = process.env.APP_NAME;

    apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    throw new Error(err);
  }
}

module.exports = {
  sendTransactionalEmail
};
