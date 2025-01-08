const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// CRYPTO
const { decryptApiKey } = require("../services/encryption.service");

// RECUPERER LES PAIEMENTS STRIPE
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

      const sixMonthsAgo =
        Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 60 * 60;

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
  
      const stripeInstance = require("stripe")(decryptApiKey(restaurant.stripeSecretKey));
  
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
