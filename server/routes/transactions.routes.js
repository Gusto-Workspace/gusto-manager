const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const ReservationModel = require("../models/reservation.model");

// CRYPTO
const { decryptApiKey } = require("../services/encryption.service");

// SSE
const { broadcastToRestaurant } = require("../services/sse-bus.service");

function buildFullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function getStripePaymentIntentId(value) {
  if (!value) return "";
  if (typeof value === "string") return String(value).trim();
  if (typeof value === "object" && value.id) return String(value.id).trim();
  return "";
}

function getStripeCustomerLabel(charge) {
  const billingName = String(charge?.billing_details?.name || "").trim();
  if (billingName) return billingName;

  const customerId = String(charge?.customer || "").trim();
  if (!customerId || customerId.startsWith("cus_")) return "";

  return customerId;
}

function buildGiftPurchaseMap(purchases = []) {
  const map = new Map();

  for (const purchase of Array.isArray(purchases) ? purchases : []) {
    const paymentIntentId = String(purchase?.paymentIntentId || "").trim();
    if (!paymentIntentId) continue;

    map.set(paymentIntentId, {
      purchaseId: String(purchase?._id || "").trim(),
      value: Number(purchase?.value || 0),
      description: String(purchase?.description || "").trim(),
      purchaseCode: String(purchase?.purchaseCode || "").trim(),
      validUntil: purchase?.validUntil || null,
      giftCardStatus: String(purchase?.status || "").trim(),
      beneficiaryFirstName: String(purchase?.beneficiaryFirstName || "").trim(),
      beneficiaryLastName: String(purchase?.beneficiaryLastName || "").trim(),
      buyerFirstName: String(purchase?.buyerFirstName || "").trim(),
      buyerLastName: String(purchase?.buyerLastName || "").trim(),
      sender: String(purchase?.sender || "").trim(),
      sendEmail: String(purchase?.sendEmail || "").trim(),
      senderPhone: String(purchase?.senderPhone || "").trim(),
      createdAt: purchase?.created_at || null,
    });
  }

  return map;
}

async function buildCapturedReservationMap({
  restaurantId,
  paymentIntentIds = [],
}) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(paymentIntentIds) ? paymentIntentIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedIds.length) {
    return new Map();
  }

  const reservations = await ReservationModel.find({
    restaurant_id: restaurantId,
    "bankHold.status": "captured",
    "bankHold.paymentIntentId": { $in: normalizedIds },
  })
    .select(
      "customerFirstName customerLastName customerEmail customerPhone numberOfGuests reservationDate reservationTime commentary status table bankHold",
    )
    .lean();

  const map = new Map();

  for (const reservation of reservations) {
    const paymentIntentId = String(
      reservation?.bankHold?.paymentIntentId || "",
    ).trim();
    if (!paymentIntentId) continue;

    map.set(paymentIntentId, {
      reservationId: String(reservation?._id || "").trim(),
      customerFirstName: String(reservation?.customerFirstName || "").trim(),
      customerLastName: String(reservation?.customerLastName || "").trim(),
      customerEmail: String(reservation?.customerEmail || "").trim(),
      customerPhone: String(reservation?.customerPhone || "").trim(),
      numberOfGuests: Number(reservation?.numberOfGuests || 0),
      reservationDate: reservation?.reservationDate || null,
      reservationTime: String(reservation?.reservationTime || "").trim(),
      commentary: String(reservation?.commentary || "").trim(),
      reservationStatus: String(reservation?.status || "").trim(),
      table: reservation?.table || null,
      bankHold: reservation?.bankHold || {},
    });
  }

  return map;
}

function formatChargeForDashboard({
  charge,
  giftPurchaseByPaymentIntent = new Map(),
  capturedReservationByPaymentIntent = new Map(),
}) {
  const balanceTx = charge.balance_transaction;
  const paymentIntentId = getStripePaymentIntentId(charge?.payment_intent);
  const giftPurchase = giftPurchaseByPaymentIntent.get(paymentIntentId) || null;
  const capturedReservation =
    capturedReservationByPaymentIntent.get(paymentIntentId) || null;

  if (!giftPurchase && !capturedReservation) {
    return null;
  }

  const fallbackCustomerLabel =
    getStripeCustomerLabel(charge) || "Non renseigné";

  const commonPayload = {
    id: charge.id,
    paymentIntentId,
    chargeId: charge.id,
    date: charge.created,
    customer: fallbackCustomerLabel,
    grossAmount: (Number(charge?.amount || 0) / 100).toFixed(2),
    feeAmount: (Number(balanceTx?.fee || 0) / 100).toFixed(2),
    netAmount: (Number(balanceTx?.net || 0) / 100).toFixed(2),
    currency: String(charge?.currency || "eur").toLowerCase(),
    status: String(charge?.status || ""),
    refunded: Boolean(charge?.refunded),
    receiptUrl: String(charge?.receipt_url || "").trim(),
    paymentMethodBrand: String(
      charge?.payment_method_details?.card?.brand || "",
    ).trim(),
    paymentMethodLast4: String(
      charge?.payment_method_details?.card?.last4 || "",
    ).trim(),
  };

  if (giftPurchase) {
    const buyerName = buildFullName(
      giftPurchase.buyerFirstName,
      giftPurchase.buyerLastName,
    );

    return {
      ...commonPayload,
      type: "gift_card_purchase",
      customer: buyerName || fallbackCustomerLabel,
      purchaseCode: giftPurchase.purchaseCode,
      giftPurchase,
      reservation: null,
      bankHold: null,
    };
  }

  const reservationCustomerName = buildFullName(
    capturedReservation?.customerFirstName,
    capturedReservation?.customerLastName,
  );

  return {
    ...commonPayload,
    type: "bank_hold_capture",
    customer: reservationCustomerName || fallbackCustomerLabel,
    purchaseCode: "",
    giftPurchase: null,
    reservation: {
      reservationId: capturedReservation?.reservationId || "",
      customerFirstName: capturedReservation?.customerFirstName || "",
      customerLastName: capturedReservation?.customerLastName || "",
      customerEmail: capturedReservation?.customerEmail || "",
      customerPhone: capturedReservation?.customerPhone || "",
      numberOfGuests: capturedReservation?.numberOfGuests || 0,
      reservationDate: capturedReservation?.reservationDate || null,
      reservationTime: capturedReservation?.reservationTime || "",
      reservationStatus: capturedReservation?.reservationStatus || "",
      table: capturedReservation?.table || null,
    },
    bankHold: {
      ...(capturedReservation?.bankHold || {}),
      paymentIntentId,
    },
  };
}

async function buildChargeFormattingContext({
  restaurantId,
  purchasesGiftCards = [],
  charges = [],
}) {
  const paymentIntentIds = charges
    .map((charge) => getStripePaymentIntentId(charge?.payment_intent))
    .filter(Boolean);

  return {
    giftPurchaseByPaymentIntent: buildGiftPurchaseMap(purchasesGiftCards),
    capturedReservationByPaymentIntent: await buildCapturedReservationMap({
      restaurantId,
      paymentIntentIds,
    }),
  };
}

function formatVisibleCharges(charges = [], formattingContext = {}) {
  return (Array.isArray(charges) ? charges : [])
    .map((charge) =>
      formatChargeForDashboard({
        charge,
        ...formattingContext,
      }),
    )
    .filter(Boolean);
}

async function fetchVisibleDashboardCharges({
  stripeInstance,
  restaurantId,
  purchasesGiftCards = [],
  limit = 10,
  startingAfter,
}) {
  const targetCount = Math.max(1, Number(limit) || 10);
  const pageSize = Math.min(100, Math.max(targetCount * 2, 20));

  const charges = [];
  let cursor = startingAfter;
  let lastChargeId = null;
  let hasMore = false;

  while (charges.length < targetCount) {
    const chargesList = await stripeInstance.charges.list({
      limit: pageSize,
      ...(cursor ? { starting_after: cursor } : {}),
      expand: ["data.balance_transaction"],
    });

    if (!chargesList.data.length) {
      hasMore = false;
      break;
    }

    const formattingContext = await buildChargeFormattingContext({
      restaurantId,
      purchasesGiftCards,
      charges: chargesList.data,
    });

    for (let index = 0; index < chargesList.data.length; index += 1) {
      const charge = chargesList.data[index];
      lastChargeId = charge.id;

      const formatted = formatChargeForDashboard({
        charge,
        ...formattingContext,
      });

      if (formatted) {
        charges.push(formatted);
      }

      if (charges.length >= targetCount) {
        hasMore = index < chargesList.data.length - 1 || chargesList.has_more;
        break;
      }
    }

    if (charges.length >= targetCount) break;
    if (!chargesList.has_more) {
      hasMore = false;
      break;
    }

    cursor = chargesList.data[chargesList.data.length - 1]?.id || null;
    if (!cursor) {
      hasMore = false;
      break;
    }
  }

  return {
    charges,
    hasMore,
    lastChargeId,
  };
}

// RECUPERER TOUS LES PAIEMENTS STRIPE (10 par 10)
router.get("/owner/restaurants/:id/payments", async (req, res) => {
  const { id } = req.params;
  const { limit = 10, starting_after } = req.query;

  try {
    const restaurant = await RestaurantModel.findById(id).select(
      "stripeSecretKey purchasesGiftCards",
    );
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey),
    );

    const { charges, hasMore, lastChargeId } =
      await fetchVisibleDashboardCharges({
        stripeInstance,
        restaurantId: id,
        purchasesGiftCards: restaurant?.purchasesGiftCards,
        limit,
        startingAfter: starting_after,
      });

    return res.status(200).json({
      charges,
      has_more: hasMore,
      last_charge_id: lastChargeId,
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
    const restaurant = await RestaurantModel.findById(id).select(
      "stripeSecretKey purchasesGiftCards",
    );
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey),
    );

    const { charges: allCharges } = await fetchVisibleDashboardCharges({
      stripeInstance,
      restaurantId: id,
      purchasesGiftCards: restaurant?.purchasesGiftCards,
      limit,
    });

    // 3) Filtrer sur le nom client réellement affiché
    const lowerQuery = query.toLowerCase();
    const charges = allCharges.filter((charge) =>
      String(charge?.customer || "")
        .toLowerCase()
        .includes(lowerQuery),
    );

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
      decryptApiKey(restaurant.stripeSecretKey),
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
        decryptApiKey(restaurant.stripeSecretKey),
      );

      const balanceTxList = await stripeInstance.balanceTransactions.list({
        limit: Number(limit),
        starting_after,
        payout: payoutId,
        expand: ["data.source", "data.source.charge"],
      });

      // Filtrer pour retirer la transaction de type "payout" elle-même
      const filteredTx = balanceTxList.data.filter(
        (tx) => tx.type !== "payout",
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
        error,
      );
      return res.status(500).json({ message: "Erreur interne du serveur" });
    }
  },
);

// Résumé rapide des ventes de cartes cadeaux (lecture DB uniquement)
router.get("/owner/restaurants/:id/payments/summary", async (req, res) => {
  const { id } = req.params;

  try {
    const restaurant =
      await RestaurantModel.findById(id).select("giftCardSold");
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    const stats = restaurant.giftCardSold || {
      totalSold: 0,
      totalRefunded: 0,
    };

    return res.status(200).json({
      totalSold: stats.totalSold,
      totalRefunded: stats.totalRefunded,
    });
  } catch (error) {
    console.error("Erreur summary-fast :", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Récupération des ventes mensuelles de cartes cadeaux (6 mois)
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
        decryptApiKey(restaurant.stripeSecretKey),
      );

      const sixMonthsAgo =
        Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 60 * 60;

      const params = {
        limit: 100,
        created: { gte: sixMonthsAgo },
      };

      const monthlySalesMap = Object.create(null);

      let hasMore = true;
      let startingAfter = undefined;

      while (hasMore) {
        const page = await stripe.balanceTransactions.list(
          startingAfter ? { ...params, starting_after: startingAfter } : params,
        );

        for (const bt of page.data) {
          // On ne garde que les paiements et remboursements
          if (bt.type !== "charge" && bt.type !== "refund") continue;

          // Date : paiement ou remboursement
          const t = bt.created || bt.available_on;
          const d = new Date(t * 1000);

          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");

          const sortKey = `${year}-${month}`;
          const displayMonth = `${month}/${year}`;

          if (!monthlySalesMap[sortKey]) {
            monthlySalesMap[sortKey] = { netCents: 0, displayMonth };
          }

          // charge => net positif / refund => net négatif
          monthlySalesMap[sortKey].netCents += bt.net || 0;
        }

        hasMore = page.has_more;
        startingAfter = page.data.length
          ? page.data[page.data.length - 1].id
          : undefined;
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
      console.error(
        "Erreur lors de la récupération des ventes mensuelles :",
        error,
      );
      return res.status(500).json({ message: "Erreur interne du serveur" });
    }
  },
);

// Rembourser un paiement
router.post("/owner/restaurants/:id/payments/refund", async (req, res) => {
  const { id } = req.params; // restaurant ID
  const { paymentId } = req.body; // ID du paiement (charge.id)

  try {
    const restaurant = await RestaurantModel.findById(id).select(
      "stripeSecretKey purchasesGiftCards giftCardSold",
    );
    if (!restaurant || !restaurant.stripeSecretKey) {
      return res
        .status(404)
        .json({ message: "Clé Stripe introuvable pour ce restaurant." });
    }

    const stripeInstance = require("stripe")(
      decryptApiKey(restaurant.stripeSecretKey),
    );

    const charge = await stripeInstance.charges.retrieve(paymentId);
    const paymentIntentId = getStripePaymentIntentId(charge?.payment_intent);
    const giftPurchaseByPaymentIntent = buildGiftPurchaseMap(
      restaurant?.purchasesGiftCards,
    );
    const refundedGiftPurchase =
      giftPurchaseByPaymentIntent.get(paymentIntentId) || null;

    // On crée le remboursement via Stripe
    const refund = await stripeInstance.refunds.create({
      charge: paymentId,
    });

    if (refundedGiftPurchase) {
      // 🔁 MAJ stats Stripe cartes cadeaux
      if (!restaurant.giftCardSold) {
        restaurant.giftCardSold = { totalSold: 0, totalRefunded: 0 };
      }
      if (restaurant.giftCardSold.totalSold > 0) {
        restaurant.giftCardSold.totalSold -= 1;
      }
      restaurant.giftCardSold.totalRefunded += 1;
    }

    if (refundedGiftPurchase) {
      // 🔔 SSE: remboursement effectué + stats à jour
      await restaurant.save();

      broadcastToRestaurant(String(restaurant._id), {
        type: "giftcard_refunded",
        paymentId,
        giftCardStats: restaurant.giftCardSold,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Remboursement effectué avec succès",
      transactionType: refundedGiftPurchase
        ? "gift_card_purchase"
        : "bank_hold_capture",
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
