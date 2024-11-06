// Dans votre fichier de route
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// GET STRIPE SUBSCRIPTIONS
router.get("/admin/subscriptions", async (req, res) => {
  try {
    const products = await stripe.products.list({
      limit: 20,
      active: true,
      expand: ["data.default_price"], // Expande le prix par défaut de chaque produit
    });

    res.status(200).json({ products: products.data });
  } catch (error) {
    console.error("Erreur lors de la récupération des abonnements:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des abonnements Stripe",
    });
  }
});

// CREATE A SUBSCRIPTION FOR A OWNER
router.post("/admin/create-subscription", async (req, res) => {
  const { stripeCustomerId, priceId, billingAddress, phone, language } =
    req.body;

  try {
    // 1. Créer l'abonnement sans essayer de débiter un moyen de paiement
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      collection_method: "send_invoice", // Utiliser "send_invoice" pour un envoi manuel
      days_until_due: 3, // Exemple de délai pour le paiement
      expand: ["latest_invoice"], // Inclut les informations de la dernière facture
    });

    // 2. Mettre à jour les informations de facturation du client
    await stripe.customers.update(stripeCustomerId, {
      address: {
        line1: billingAddress.line1,
        postal_code: billingAddress.zipCode,
        city: billingAddress.city,
        country: billingAddress.country,
      },
      phone: phone,
      preferred_locales: [language || "fr"], // Définit la langue par défaut
    });

    res.status(201).json({
      message:
        "Abonnement créé et la facture sera envoyée pour paiement manuel.",
      subscription,
    });
  } catch (error) {
    console.error("Erreur lors de la création de l'abonnement:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la création de l'abonnement" });
  }
});

module.exports = router;
