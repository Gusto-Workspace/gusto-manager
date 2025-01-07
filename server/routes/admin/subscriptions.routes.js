const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

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

// CREATE SETUP INTENT FOR SEPA
router.post("/admin/create-setup-intent", async (req, res) => {
  const { stripeCustomerId } = req.body; // ID Stripe du client

  try {
    // Créer un SetupIntent pour du SEPA Direct Debit
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["sepa_debit"],
    });

    // Renvoyer le clientSecret au frontend
    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("Erreur lors de la création du SetupIntent:", err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE A SUBSCRIPTION FOR AN OWNER VIA SEPA
router.post("/admin/create-subscription-sepa", async (req, res) => {
  const {
    stripeCustomerId,
    priceId,
    paymentMethodId,
    billingAddress,
    phone,
    language,
    restaurantId,
    restaurantName,
  } = req.body;

  try {
    // Vérifier si un abonnement existe déjà pour le restaurant
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      expand: ["data.items.data.price"],
    });

    const existingSubscription = existingSubscriptions.data.find(
      (subscription) => subscription.metadata.restaurantId === restaurantId
    );

    if (existingSubscription) {
      return res.status(400).json({
        message: "subscriptions.add.errors.alreadyCreated",
      });
    }

    // Mettre à jour l'adresse et le téléphone du client
    await stripe.customers.update(stripeCustomerId, {
      address: {
        line1: billingAddress.line1,
        postal_code: billingAddress.zipCode,
        city: billingAddress.city,
        country: billingAddress.country,
      },
      phone: phone,
      preferred_locales: [language || "fr"],
    });

    // Créer l'abonnement en prélèvement automatique
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      collection_method: "charge_automatically",
      metadata: {
        restaurantId,
        restaurantName,
      },
      expand: ["latest_invoice.payment_intent"],
    });

    res.status(201).json({
      message:
        "Abonnement SEPA créé avec succès. Le paiement sera prélevé automatiquement.",
      subscription,
    });
  } catch (error) {
    console.error("Erreur lors de la création de l'abonnement:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la création de l'abonnement" });
  }
});

// SWITCH TO AUTOMATIC PAYMENT MODE
// router.post("/admin/switch-to-automatic", async (req, res) => {
//   const { subscriptionId } = req.body;

//   try {
//     // Met à jour l'abonnement pour passer au prélèvement automatique
//     await stripe.subscriptions.update(subscriptionId, {
//       collection_method: "charge_automatically",
//     });

//     res
//       .status(200)
//       .json({ message: "Abonnement mis à jour en mode automatique." });
//   } catch (error) {
//     console.error("Erreur lors du passage en mode automatique :", error);
//     res
//       .status(500)
//       .json({ message: "Erreur lors du passage en mode automatique." });
//   }
// });


// GET ALL SUBSCRIPTIONS FROM OWNERS
router.get("/admin/all-subscriptions", authenticateToken, async (req, res) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      expand: ["data.items.data.price", "data.latest_invoice"],
    });

    const formattedSubscriptions = await Promise.all(
      subscriptions.data.map(async (subscription) => {
        const price = subscription.items.data[0].price;
        const productId = price.product;
        const product = await stripe.products.retrieve(productId);

        return {
          ...subscription,
          productName: product.name,
          productAmount: price.unit_amount / 100,
          productCurrency: price.currency.toUpperCase(),
          restaurantId: subscription.metadata.restaurantId, 
          restaurantName: subscription.metadata.restaurantName,
        };
      })
    );

    res.status(200).json({ subscriptions: formattedSubscriptions });
  } catch (error) {
    console.error("Erreur lors de la récupération des abonnements:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des abonnements" });
  }
});

// GET ALL INVOICES FOR A SUBSCRIPTION
router.get("/admin/subscription-invoices/:subscriptionId", async (req, res) => {
  const { subscriptionId } = req.params;

  try {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100, // Limite de factures à récupérer (ajustable)
    });

    res.status(200).json({ invoices: invoices.data });
  } catch (error) {
    console.error("Erreur lors de la récupération des factures :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des factures" });
  }
});

module.exports = router;
