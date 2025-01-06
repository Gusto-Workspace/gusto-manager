const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// CRYPTO
const { decryptApiKey } = require("../services/encryption.service");

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
      .populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const restaurantData = {
      ...restaurant.toObject(),
      menus: restaurant.menus.map((menu) => ({
        _id: menu._id,
        name: menu.name,
        description: menu.description,
        price: menu.price,
        type: menu.type,
        visible: menu.visible,
        created_at: menu.created_at,
        combinations: menu.combinations,
        dishes: menu.dishes.map((dishId) => {
          for (const category of restaurant.dish_categories) {
            const dish = category.dishes.find(
              (dish) => dish._id.toString() === dishId.toString()
            );
            if (dish) {
              return {
                _id: dish._id,
                name: dish.name,
                description: dish.description,
                price: dish.price,
                showOnWebsite: dish.showOnWebsite,
                vegan: dish.vegan,
                vegetarian: dish.vegetarian,
                bio: dish.bio,
                glutenFree: dish.glutenFree,
                category: category.name,
              };
            }
          }
          return dishId;
        }),
      })),
    };

    res.status(200).json({ restaurant: restaurantData });
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

// RECUPERER LES PAIEMENTS STRIPE DES CARTES CADEAUX
router.get("/owner/restaurants/:id/payments", async (req, res) => {
  const { id } = req.params;
  const { limit = 10, starting_after } = req.query;

  try {
    const restaurant = await RestaurantModel.findById(id);
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey)
    );

    const chargesList = await stripeInstance.charges.list({
      limit: Number(limit),
      starting_after,
      expand: ["data.balance_transaction"],
    });

    // Formatage
    const charges = chargesList.data.map((charge) => {
      const balanceTx = charge.balance_transaction;

      return {
        id: charge.id,
        date: charge.created,
        customer:
          charge.billing_details?.name || charge.customer || "Non renseigné",
        grossAmount: (charge.amount / 100).toFixed(2),
        feeAmount: (balanceTx?.fee / 100).toFixed(2),
        netAmount: (balanceTx?.net / 100).toFixed(2),
        status: charge.status,
        refunded: charge.refunded,
      };
    });

    return res.status(200).json({
      charges,
      has_more: chargesList.has_more,
      last_charge_id:
        charges.length > 0 ? charges[charges.length - 1].id : null,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des transactions :", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Récupérer les virements Stripe (payouts)
router.get("/owner/restaurants/:id/payouts", async (req, res) => {
  const { id } = req.params;
  const { limit = 10, starting_after } = req.query;

  try {
    const restaurant = await RestaurantModel.findById(id);
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey)
    );

    // Liste paginée des virements
    const payoutsList = await stripeInstance.payouts.list({
      limit: Number(limit),
      starting_after,
    });

    // Formatage
    const payouts = payoutsList.data.map((payout) => {
      return {
        id: payout.id,
        arrivalDate: payout.arrival_date, // timestamp UNIX
        amount: (payout.amount / 100).toFixed(2),
        currency: payout.currency,
        status: payout.status,
      };
    });

    return res.status(200).json({
      payouts,
      has_more: payoutsList.has_more,
      last_payout_id:
        payouts.length > 0 ? payouts[payouts.length - 1].id : null,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des virements :", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Récupérer les transactions associées à un payout
router.get(
  "/owner/restaurants/:id/payouts/:payoutId/payments",
  async (req, res) => {
    const { id, payoutId } = req.params;
    const { limit = 10, starting_after } = req.query;

    try {
      const restaurant = await RestaurantModel.findById(id);
      if (!restaurant || !restaurant.stripeSecretKey) {
        return res
          .status(404)
          .json({ message: "Clé Stripe introuvable pour ce restaurant." });
      }

      const stripeInstance = require("stripe")(
        decryptApiKey(restaurant.stripeSecretKey)
      );

      const balanceTxList = await stripeInstance.balanceTransactions.list({
        limit: Number(limit),
        starting_after,
        payout: payoutId,
        expand: ["data.source", "data.source.charge"],
      });

      // Filtrer pour retirer la transaction de type "payout" elle-même
      const filteredTx = balanceTxList.data.filter(
        (tx) => tx.type !== "payout"
      );

      const payoutTransactions = filteredTx.map((tx) => {
        let customerName = "Non renseigné";

        if (tx.source?.object === "charge") {
          customerName = tx.source.billing_details?.name || "Non renseigné";
        } else if (tx.source?.object === "refund") {
          const refundedCharge = tx.source.charge;
          if (refundedCharge?.object === "charge") {
            customerName =
              refundedCharge.billing_details?.name || "Non renseigné";
          }
        }

        return {
          id: tx.id,
          type: tx.type,
          grossAmount: (tx.amount / 100).toFixed(2),
          feeAmount: (tx.fee / 100).toFixed(2),
          netAmount: (tx.net / 100).toFixed(2),
          date: tx.created,
          customer: customerName,
        };
      });

      return res.status(200).json({
        payoutTransactions,
        has_more: balanceTxList.has_more,
        last_tx_id:
          payoutTransactions.length > 0
            ? payoutTransactions[payoutTransactions.length - 1].id
            : null,
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des transactions d'un payout :",
        error
      );
      return res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
);

// Récupérer les ventes mensuelles nettes (<= 1 an)
router.get(
  "/owner/restaurants/:id/payments/monthly-sales",
  async (req, res) => {
    const { id } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(id);
      if (!restaurant || !restaurant.stripeSecretKey) {
        return res
          .status(404)
          .json({ message: "Clé Stripe introuvable pour ce restaurant." });
      }

      const stripe = require("stripe")(
        decryptApiKey(restaurant.stripeSecretKey)
      );

      const sixMonthsAgo = Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 60 * 60;

      let allCharges = [];
      let hasMore = true;
      let lastChargeId = null;

      while (hasMore) {
        const listParams = {
          limit: 100,
          expand: ["data.balance_transaction"],
        };

        if (lastChargeId) {
          listParams.starting_after = lastChargeId;
        }

        const chargesList = await stripe.charges.list(listParams);

        // On ne garde que les charges dont la date >= sixMonthsAgo
        const filteredData = chargesList.data.filter(
          (c) => c.created >= sixMonthsAgo
        );
        allCharges.push(...filteredData);

        hasMore = chargesList.has_more;
        if (chargesList.data.length > 0) {
          const oldestCharge = chargesList.data[chargesList.data.length - 1];
          if (oldestCharge.created < sixMonthsAgo) {
            hasMore = false;
          } else {
            lastChargeId = oldestCharge.id;
          }
        } else {
          hasMore = false;
        }
      }

      // Filtrer pour ne garder que les paiements réussis et non remboursés
      const filteredCharges = allCharges.filter(
        (charge) =>
          charge.status === "succeeded" &&
          charge.refunded === false &&
          charge.amount_refunded === 0
      );

      // On va accumuler { [sortKey]: { netCents: number, displayMonth: string } }
      const monthlySalesMap = {};

      filteredCharges.forEach((charge) => {
        const balanceTx = charge.balance_transaction;
        if (!balanceTx || typeof balanceTx !== "object") return;
        const netCents = balanceTx.net || 0;

        // On récupère la date
        const dateObj = new Date(charge.created * 1000);

        const year = dateObj.getFullYear();
        const monthIndex = dateObj.getMonth() + 1; // Janvier = 0

        // sortKey = "YYYY-MM" pour un tri lexical cohérent (2024-11 < 2024-12 < 2025-01)
        const sortKey = `${year}-${String(monthIndex).padStart(2, "0")}`;

        // displayMonth = "MM/YYYY" ex: "02/2025"
        const displayMonth = `${String(monthIndex).padStart(2, "0")}/${year}`;

        if (!monthlySalesMap[sortKey]) {
          monthlySalesMap[sortKey] = { netCents: 0, displayMonth };
        }
        monthlySalesMap[sortKey].netCents += netCents;
      });

      // On transforme l'objet en tableau et on trie
      const monthlySalesArray = Object.entries(monthlySalesMap)
        .map(([sortKey, info]) => ({
          sortKey,
          month: info.displayMonth, // "02/2025"
          total: info.netCents / 100, // Montant net en euros
        }))
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
      // Tri du plus ancien au plus récent

      // On renvoie le tableau final
      return res.status(200).json({
        monthlySales: monthlySalesArray.map((item) => ({
          month: item.month, // "02/2025"
          total: item.total,
        })),
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des ventes mensuelles :",
        error
      );
      return res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
);

module.exports = router;
