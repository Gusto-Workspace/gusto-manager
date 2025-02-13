const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
const SibApiV3Sdk = require("sib-api-v3-sdk");

// MODELS
const OwnerModel = require("../models/owner.model");
const RestaurantModel = require("../models/restaurant.model");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// Fonction pour initialiser le client Brevo
function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur lors de l'instanciation du client:", err);
    throw new Error(err);
  }
}

// Fonction pour envoyer un email transactionnel avec le code de réinitialisation
function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    // Utilisation de la même structure que dans le code fonctionnel
    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Gusto Manager",
    };
    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.htmlContent = `<p>Votre code de réinitialisation est : <strong>${params.code}</strong></p>`;

    // Envoi de l'email
    return apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    throw new Error(err);
  }
}

// Route pour envoyer le code de réinitialisation de mot de passe
router.post("/owner/send-reset-code", async (req, res) => {
  const { email } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Génère un code de réinitialisation à 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    owner.resetCode = resetCode;
    owner.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // Expire dans 10 minutes
    await owner.save();

    // Paramètres pour l'email
    const paramsEmail = {
      to: [{ email: owner.email, name: owner.firstname }],
      subject: "Votre code de réinitialisation de mot de passe",
      code: resetCode,
    };

    await sendTransactionalEmail(paramsEmail);
    res.status(200).json({ message: "Code envoyé par email" });
  } catch (error) {
    console.error(
      "Erreur lors de l'envoi du code de réinitialisation :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour vérifier le code de réinitialisation
router.post("/owner/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Vérifier le code et l'expiration
    if (owner.resetCode !== code || new Date() > owner.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    res.status(200).json({ message: "Code valide" });
  } catch (error) {
    console.error(
      "Erreur lors de la vérification du code de réinitialisation :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour réinitialiser le mot de passe
router.put("/owner/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Vérifie que le code est toujours valide
    if (owner.resetCode !== code || new Date() > owner.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    // Mettre à jour le mot de passe
    owner.password = newPassword; // Le hashing est géré dans le hook "pre('save')"
    owner.resetCode = undefined; // Supprime le code de réinitialisation
    owner.resetCodeExpires = undefined; // Supprime l'expiration du code
    await owner.save();

    res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
  } catch (error) {
    console.error(
      "Erreur lors de la réinitialisation du mot de passe :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET OWNER DATA
router.get("/owner/get-data", authenticateToken, async (req, res) => {
  try {
    const owner = await OwnerModel.findById(req.user.id).select("-password");
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const restaurant = await RestaurantModel.findById(req.user.restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus");

    res.status(200).json({ owner, restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// UPDATE OWNER DATA
router.put("/owner/update-data", authenticateToken, async (req, res) => {
  const { firstname, lastname, email, phoneNumber } = req.body;

  try {
    const owner = await OwnerModel.findById(req.user.id);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    // Mise à jour des informations
    owner.firstname = firstname;
    owner.lastname = lastname;
    owner.email = email;
    owner.phoneNumber = phoneNumber;

    await owner.save();

    if (owner.stripeCustomerId) {
      // Mettre à jour le client Stripe avec les nouvelles informations du propriétaire
      try {
        await stripe.customers.update(owner.stripeCustomerId, {
          email: owner.email,
          name: `${owner.firstname} ${owner.lastname}`,
        });
      } catch (stripeError) {
        console.error(
          "Erreur lors de la mise à jour du client Stripe :",
          stripeError
        );
        return res
          .status(500)
          .json({ message: "Erreur lors de la mise à jour du client Stripe" });
      }
    }

    res.status(200).json({ message: "Owner information updated successfully" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du propriétaire :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// UPDATE OWNER PASSWORD
router.put("/owner/update-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const owner = await OwnerModel.findById(req.user.id);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    const isMatch = await owner.comparePassword(
      currentPassword,
      owner.password
    );
    if (!isMatch)
      return res.status(401).json({ message: "Incorrect current password" });

    owner.password = newPassword;
    await owner.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du mot de passe :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
