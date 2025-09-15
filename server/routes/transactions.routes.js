const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// CRYPTO
const { decryptApiKey } = require("../services/encryption.service");

// RECUPERER TOUS LES PAIEMENTS STRIPE (10 par 10)
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

// RECHERCHE DE PAIEMENTS PAR NOM/PRÉNOM
router.get("/owner/restaurants/:id/payments/search", async (req, res) => {
  const { id } = req.params;
  const { query, limit = 100 } = req.query;

  if (!query) {
    return res.status(400).json({
      message: "Veuillez fournir un nom ou un prénom pour la recherche.",
    });
  }

  try {
    // 1) Récupération du restaurant et de sa clé Stripe
    const restaurant = await RestaurantModel.findById(id);
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey)
    );

    // 2) Récupération de toutes les charges

    const chargesList = await stripeInstance.charges.list({
      limit: Number(limit),
      expand: ["data.balance_transaction"],
    });

    // 3) Filtrer uniquement sur billing_details.name (en minuscule)
    const lowerQuery = query.toLowerCase();
    const filteredCharges = chargesList.data.filter((charge) => {
      const billingName = (charge.billing_details?.name || "").toLowerCase();
      return billingName.includes(lowerQuery);
    });

    // 4) Formatage des résultats
    const charges = filteredCharges.map((charge) => {
      const balanceTx = charge.balance_transaction;

      return {
        id: charge.id,
        date: charge.created,
        customer: charge.billing_details?.name || "Non renseigné",
        grossAmount: (charge.amount / 100).toFixed(2),
        feeAmount: balanceTx ? (balanceTx.fee / 100).toFixed(2) : "0.00",
        netAmount: balanceTx ? (balanceTx.net / 100).toFixed(2) : "0.00",
        status: charge.status,
        refunded: charge.refunded,
      };
    });

    // 5) Retour au client
    return res.status(200).json({
      charges,
      has_more: false,
      count: charges.length,
    });
  } catch (error) {
    console.error("Erreur lors de la recherche des paiements :", error);
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

// Récupération des ventes mensuelles de cartes cadeaux (6 mois)
router.get("/owner/restaurants/:id/payments/monthly-sales", async (req, res) => {
  const { id } = req.params;

  try {
    const restaurant = await RestaurantModel.findById(id);
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res.status(404).json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripe = require("stripe")(decryptApiKey(restaurant.stripeSecretKey));

    const sixMonthsAgo = Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 60 * 60;

    const params = {
      limit: 100,
      created: { gte: sixMonthsAgo },
      type: "charge", // uniquement les entrées de solde liées aux paiements
    };

    const monthlySalesMap = Object.create(null);

    let hasMore = true;
    let startingAfter = undefined;

    while (hasMore) {
      const page = await stripe.balanceTransactions.list(
        startingAfter ? { ...params, starting_after: startingAfter } : params
      );

      for (const bt of page.data) {
        if (bt.type !== "charge") continue;

        // Choisis `bt.created` (date du paiement) ou `bt.available_on` (dispo des fonds)
        const t = bt.created || bt.available_on;
        const d = new Date(t * 1000);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");

        const sortKey = `${year}-${month}`;
        const displayMonth = `${month}/${year}`;

        if (!monthlySalesMap[sortKey]) {
          monthlySalesMap[sortKey] = { netCents: 0, displayMonth };
        }
        monthlySalesMap[sortKey].netCents += bt.net || 0; // `net` déjà après frais
      }

      hasMore = page.has_more;
      startingAfter = page.data.length ? page.data[page.data.length - 1].id : undefined;
      if (!startingAfter) break;
    }

    const monthlySales = Object.entries(monthlySalesMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, info]) => ({
        month: info.displayMonth,
        total: +(info.netCents / 100).toFixed(2),
      }));

    // petit cache côté client
    res.set("Cache-Control", "private, max-age=60");

    return res.status(200).json({ monthlySales });
  } catch (error) {
    console.error("Erreur lors de la récupération des ventes mensuelles :", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});


// Rembourser un paiement
router.post("/owner/restaurants/:id/payments/refund", async (req, res) => {
  const { id } = req.params; // restaurant ID
  const { paymentId } = req.body; // ID du paiement (charge.id)

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

    // On crée le remboursement via Stripe
    const refund = await stripeInstance.refunds.create({
      charge: paymentId,
    });

    // Optionnel : vous pouvez renvoyer plus d'infos si besoin
    return res.status(200).json({
      success: true,
      message: "Remboursement effectué avec succès",
      refund,
    });
  } catch (error) {
    console.error("Erreur lors du remboursement :", error);
    return res.status(500).json({
      success: false,
      message: "Erreur interne lors du remboursement",
      error: error?.message || error,
    });
  }
});

module.exports = router;
