export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

import SibApiV3Sdk from "sib-api-v3-sdk";

async function sendConfirmationEmail(params) {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  // Contenu HTML de l'email en ton professionnel
  const emailContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #2E8B57;">Confirmation de réservation</h2>
          <p>Bonjour ${params.customerName},</p>
          <p>
            Nous vous confirmons que votre réservation a bien été enregistrée pour le 
            <strong>${params.reservationDate}</strong> à <strong>${params.reservationTime}</strong>.
          </p>
          <p>
            La réservation est effectuée pour <strong>${params.numberOfGuests} personne${params.numberOfGuests > 1 ? "s" : ""}</strong>.
          </p>
          <p>
            Nous vous remercions de votre confiance et nous nous réjouissons de vous accueillir prochainement au sein de <strong>${params.restaurantName}</strong>.
          </p>
          <p>
            Pour toute question ou modification, n'hésitez pas à nous contacter.
          </p>
          <p>Cordialement,</p>
          <p>L'équipe de ${params.restaurantName}</p>
        </body>
      </html>
    `;

  const mainEmail = {
    sender: {
      email: "no-reply@gusto-manager.com",
      name: params.restaurantName,
    },
    to: [
      {
        email: params.customerEmail,
        name: params.customerName,
      },
    ],
    subject: "Confirmation de votre réservation",
    htmlContent: emailContent,
  };

  try {
    const response = await apiInstance.sendTransacEmail(mainEmail);
    return response;
  } catch (error) {
    console.error(
      "Erreur lors de l'envoi de l'email :",
      error.response?.body || error
    );
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Méthode non autorisée" });
  }

  try {
    const data = req.body;

    // Vérifier que toutes les données nécessaires sont présentes
    if (
      !data.customerName ||
      !data.customerEmail ||
      !data.reservationDate ||
      !data.reservationTime ||
      !data.restaurantName ||
      !data.numberOfGuests
    ) {
      return res
        .status(400)
        .json({ message: "Paramètres manquants ou invalides" });
    }

    const emailResponse = await sendConfirmationEmail(data);

    return res.status(200).json({
      status: 200,
      message: "Email envoyé avec succès",
      data: emailResponse,
    });
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    return res
      .status(500)
      .json({ message: "Erreur lors de l'envoi de l'email" });
  }
}
