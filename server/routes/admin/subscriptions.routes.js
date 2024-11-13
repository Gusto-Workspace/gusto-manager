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

// CREATE A SUBSCRIPTION FOR AN OWNER
router.post("/admin/create-subscription", async (req, res) => {
  const {
    stripeCustomerId,
    priceId,
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

    // Si aucun abonnement existant, procéder à la création
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      collection_method: "send_invoice",
      days_until_due: 3,
      expand: ["latest_invoice"],
      metadata: { restaurantId, restaurantName },
    });

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

    const invoiceId = subscription.latest_invoice.id;
    await stripe.invoices.finalizeInvoice(invoiceId);

    await stripe.invoices.update(invoiceId, {
      payment_settings: {
        payment_method_types: ["card"],
      },
    });

    await stripe.invoices.sendInvoice(invoiceId);

    res.status(201).json({
      message: "Abonnement créé, et la facture a été envoyée au client.",
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
router.post("/admin/switch-to-automatic", async (req, res) => {
  const { subscriptionId } = req.body;

  try {
    // Met à jour l'abonnement pour passer au prélèvement automatique
    await stripe.subscriptions.update(subscriptionId, {
      collection_method: "charge_automatically",
    });

    res
      .status(200)
      .json({ message: "Abonnement mis à jour en mode automatique." });
  } catch (error) {
    console.error("Erreur lors du passage en mode automatique :", error);
    res
      .status(500)
      .json({ message: "Erreur lors du passage en mode automatique." });
  }
});

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
          restaurantId: subscription.metadata.restaurantId, // Récupération de l'ID du restaurant
          restaurantName: subscription.metadata.restaurantName, // Récupération du nom du restaurant
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
