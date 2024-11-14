const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// Fonction pour mettre à jour le statut des cartes cadeaux expirées
async function updateExpiredStatus(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId);

  if (!restaurant) {
    console.error("Restaurant not found with ID:", restaurantId);
    return;
  }

  const now = new Date();

  restaurant.purchasesGiftCards.forEach((purchase) => {
    if (purchase.status === "Valid" && purchase.validUntil < now) {
      purchase.status = "Expired";
    }
  });

  await restaurant.save();
}

// GET ALL OWNER RESTAURANTS
router.get("/owner/restaurants", authenticateToken, async (req, res) => {
  const ownerId = req.query.ownerId;

  try {
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "name _id"
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// CHANGE RESTAURANT SELECTED
router.post("/owner/change-restaurant", authenticateToken, (req, res) => {
  const { restaurantId } = req.body;

  const decodedToken = req.user;

  const updatedToken = jwt.sign({ ...decodedToken, restaurantId }, JWT_SECRET);

  res.status(200).json({ token: updatedToken });
});

// GET RESTAURANT DETAILS FROM PANEL
router.get("/owner/restaurants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Met à jour les statuts des cartes expirées avant de récupérer les données

    await updateExpiredStatus(id);

    const restaurant = await RestaurantModel.findById(id)
      .populate("owner_id", "firstname")
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET RESTAURANT DETAILS FROM SITE
router.get("/restaurants/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await RestaurantModel.findById(id)
      .populate("owner_id", "firstname")
      .populate({
        path: "menus",
        populate: {
          path: "dishes",
          model: "Dish",
        },
      });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET CURRENT SUBSCRIPTION FOR A RESTAURANT BY CUSTOMER ID
router.get(
  "/owner/restaurant-subscription",
  authenticateToken,
  async (req, res) => {
    const { restaurantId } = req.query;
    const stripeCustomerId = req.user?.stripeCustomerId;

    if (!stripeCustomerId) {
      return res.status(400).json({
        message:
          "stripeCustomerId est manquant dans les informations d'utilisateur.",
      });
    }

    try {
      // Récupère les abonnements spécifiques au client
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        expand: ["data.items.data.price"], // Expansion nécessaire
      });

      // Cherche l'abonnement correspondant dans les métadonnées
      const restaurantSubscription = subscriptions.data.find(
        (subscription) => subscription.metadata.restaurantId === restaurantId
      );

      if (!restaurantSubscription) {
        return res
          .status(404)
          .json({ message: "Aucun abonnement trouvé pour ce restaurant." });
      }

      // Récupère l'ID du produit associé à l'abonnement
      const price = restaurantSubscription.items.data[0].price;
      const product = await stripe.products.retrieve(price.product);

      // Récupérer les factures associées à l'abonnement
      const invoices = await stripe.invoices.list({
        subscription: restaurantSubscription.id,
        limit: 100, // Ajustez cette limite si nécessaire
      });

      const subscriptionDetails = {
        name: product.name,
        amount: price.unit_amount / 100,
        currency: price.currency.toUpperCase(),
        status: restaurantSubscription.status,
        invoices: invoices.data.map((invoice) => ({
          id: invoice.id,
          amount_due: invoice.amount_due / 100,
          currency: invoice.currency.toUpperCase(),
          status: invoice.status,
          date: invoice.created,
          download_url: invoice.invoice_pdf,
        })),
      };

      res.status(200).json({ subscription: subscriptionDetails });
    } catch (error) {
      console.error("Erreur lors de la récupération de l'abonnement:", error);
      res
        .status(500)
        .json({ message: "Erreur lors de la récupération de l'abonnement" });
    }
  }
);

module.exports = router;
