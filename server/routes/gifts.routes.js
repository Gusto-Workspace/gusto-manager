const express = require("express");
const router = express.Router();

// MODELS
const RestaurantModel = require("../models/restaurant.model");

// SSE BUS
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// MIDDLEWARE VERIFY BUYING GIFT CARDS
const {
  verifyPurchaseProof,
} = require("../services/verify-buying-gift-card.service");

function generateGiftCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// ADD RESTAURANT GIFT CARDS
router.post("/restaurants/:id/gifts", async (req, res) => {
  const restaurantId = req.params.id;
  const { value, description } = req.body;

  try {
    // Crée une nouvelle carte cadeau sans code ni date de validité
    const newGiftCard = {
      value,
      description,
      visible: true,
    };

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $push: { giftCards: newGiftCard } },
      { new: true }
    )
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus");

    res.status(200).json({ restaurant });
  } catch (error) {
    res.status(500).json({ error: "Error adding gift card" });
  }
});

// UPDATE RESTAURANT GIFT CARDS
router.put("/restaurants/:id/gifts/:giftId", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;
  const { value, description, visible } = req.body;

  try {
    // Mise à jour de la carte cadeau spécifique dans le tableau `giftCards`
    const restaurant = await RestaurantModel.findOneAndUpdate(
      { _id: restaurantId, "giftCards._id": giftId },
      {
        $set: {
          "giftCards.$.value": value,
          "giftCards.$.description": description,
          "giftCards.$.visible": visible,
        },
      },
      { new: true }
    )
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus");

    if (!restaurant) {
      return res
        .status(404)
        .json({ error: "Restaurant or gift card not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    res.status(500).json({ error: "Error updating gift card" });
  }
});

// DELETE RESTAURANT GIFT CARDS
router.delete("/restaurants/:id/gifts/:giftId", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;

  try {
    // Supprime la carte cadeau spécifique dans le tableau `giftCards`
    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $pull: { giftCards: { _id: giftId } } },
      { new: true }
    )
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus");

    if (!restaurant) {
      return res
        .status(404)
        .json({ error: "Restaurant or gift card not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    res.status(500).json({ error: "Error deleting gift card" });
  }
});

// BUY A GIFT CARD (GÉNÉRATION DU CODE)
router.post(
  "/restaurants/:id/gifts/:giftId/purchase",
  verifyPurchaseProof,
  async (req, res) => {
    const restaurantId = req.params.id;
    const giftId = req.params.giftId;

    const {
      beneficiaryFirstName,
      beneficiaryLastName,
      sender,
      sendEmail,
      validUntil: clientValidUntil,
      paymentIntentId,
      amount,
    } = req.body;

    try {
      // 0) Sanity checks (au cas où)
      const amt = Number(amount);
      if (!paymentIntentId || !Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: "Invalid payment data" });
      }

      // 1) Charger restaurant + gift (pour montant + infos)
      const restaurant = await RestaurantModel.findOne({ _id: restaurantId })
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      const gift = restaurant.giftCards?.id(giftId);
      if (!gift) {
        return res.status(404).json({ error: "Gift card not found" });
      }

      // Check montant cohérent côté Gusto
      const expectedAmount = Number(gift.value) * 100;
      if (amt !== expectedAmount) {
        return res.status(400).json({ error: "Amount mismatch" });
      }

      // 2) Init giftCardSold si absent (⚠️ séparé pour éviter conflit Mongo)
      await RestaurantModel.updateOne(
        { _id: restaurantId, giftCardSold: { $exists: false } },
        { $set: { giftCardSold: { totalSold: 0, totalRefunded: 0 } } }
      );

      // 3) validUntil
      let validUntil;
      if (clientValidUntil) {
        const parsed = new Date(clientValidUntil);
        if (!isNaN(parsed.getTime())) validUntil = parsed;
      }
      if (!validUntil) {
        validUntil = new Date();
        validUntil.setMonth(validUntil.getMonth() + 6);
        validUntil.setHours(23, 59, 59, 999);
      }

      // 4) Préparer la purchase
      const purchaseCode = generateGiftCode();

      const newPurchase = {
        value: gift.value,
        description: gift.description,
        purchaseCode,
        validUntil,
        status: "Valid",
        beneficiaryFirstName,
        beneficiaryLastName,
        sender,
        sendEmail,
        paymentIntentId,
        amount: amt,
      };

      // 5) UPDATE ATOMIQUE : push + inc MAIS seulement si ce PI n’existe pas déjà
      const upd = await RestaurantModel.updateOne(
        {
          _id: restaurantId,
          "purchasesGiftCards.paymentIntentId": { $ne: paymentIntentId },
        },
        {
          $push: { purchasesGiftCards: newPurchase },
          $inc: { "giftCardSold.totalSold": 1 },
        }
      );

      const modified =
        typeof upd.modifiedCount === "number"
          ? upd.modifiedCount
          : typeof upd.nModified === "number"
            ? upd.nModified
            : 0;

      // 6) Si PAS modifié => c’est un retry (refresh) : renvoyer la purchase existante (idempotent)
      if (modified === 0) {
        const doc = await RestaurantModel.findOne(
          {
            _id: restaurantId,
            "purchasesGiftCards.paymentIntentId": paymentIntentId,
          },
          { purchasesGiftCards: { $elemMatch: { paymentIntentId } } }
        ).lean();

        const existing = doc?.purchasesGiftCards?.[0];
        if (!existing) {
          // cas très rare/incohérent
          return res.status(409).json({ error: "Payment already used" });
        }

        return res.status(200).json({
          purchaseCode: existing.purchaseCode,
          validUntil: existing.validUntil,
          alreadyExisted: true,
        });
      }

      // 7) Broadcast SSE uniquement si création réelle
      const fresh = await RestaurantModel.findById(restaurantId, {
        giftCardSold: 1,
      }).lean();

      broadcastToRestaurant(String(restaurantId), {
        type: "giftcard_purchased",
        purchase: newPurchase,
        giftCardStats: fresh?.giftCardSold,
      });

      return res.status(200).json({
        purchaseCode: newPurchase.purchaseCode,
        validUntil: newPurchase.validUntil,
        alreadyExisted: false,
      });
    } catch (error) {
      console.error("Error during gift card purchase:", error);
      return res.status(500).json({ error: "Error during gift card purchase" });
    }
  }
);

// UPDATE GIFT CARD STATUS TO USED
router.put(
  "/restaurants/:restaurantId/purchases/:purchaseId/use",
  async (req, res) => {
    const { restaurantId, purchaseId } = req.params;

    try {
      // Mettre à jour le statut de la carte cadeau achetée
      const restaurant = await RestaurantModel.findOneAndUpdate(
        {
          _id: restaurantId,
          "purchasesGiftCards._id": purchaseId,
        },
        {
          $set: {
            "purchasesGiftCards.$.status": "Used",
            "purchasesGiftCards.$.useDate": new Date(),
          },
        },
        { new: true }
      )
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      if (!restaurant) {
        return res
          .status(404)
          .json({ error: "Restaurant or purchase not found" });
      }

      res.status(200).json({ restaurant });
    } catch (error) {
      console.error("Error updating gift card status:", error);
      res.status(500).json({ error: "Error updating gift card status" });
    }
  }
);

// UPDATE GIFT CARD STATUS TO VALID
router.put(
  "/restaurants/:restaurantId/purchases/:purchaseId/validate",
  async (req, res) => {
    const { restaurantId, purchaseId } = req.params;

    try {
      // Mettre à jour le statut de la carte cadeau achetée
      const restaurant = await RestaurantModel.findOneAndUpdate(
        {
          _id: restaurantId,
          "purchasesGiftCards._id": purchaseId,
        },
        {
          $set: { "purchasesGiftCards.$.status": "Valid" },
        },
        { new: true }
      )
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      if (!restaurant) {
        return res
          .status(404)
          .json({ error: "Restaurant or purchase not found" });
      }

      res.status(200).json({ restaurant });
    } catch (error) {
      console.error("Error updating gift card status:", error);
      res.status(500).json({ error: "Error updating gift card status" });
    }
  }
);

// DELETE PURCHASED GIFT CARD
router.delete(
  "/restaurants/:restaurantId/purchases/:purchaseId/delete",
  async (req, res) => {
    const { restaurantId, purchaseId } = req.params;

    try {
      // Supprime une carte cadeau achetée spécifique
      const restaurant = await RestaurantModel.findOneAndUpdate(
        { _id: restaurantId },
        { $pull: { purchasesGiftCards: { _id: purchaseId } } },
        { new: true }
      )
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      if (!restaurant) {
        return res
          .status(404)
          .json({ error: "Restaurant or purchased gift card not found" });
      }

      res
        .status(200)
        .json({ message: "Purchased gift card deleted", restaurant });
    } catch (error) {
      console.error("Error deleting purchased gift card:", error);
      res.status(500).json({ error: "Error deleting purchased gift card" });
    }
  }
);

// UPDATE GIFTCARDS ORDER
router.put(
  "/restaurants/:restaurantId/gifts/giftCards-list/order",
  async (req, res) => {
    const { restaurantId } = req.params;
    const { orderedGiftCardIds } = req.body;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Réorganiser les catégories selon l'ordre donné
      restaurant.giftCards = orderedGiftCardIds.map((giftCardId) =>
        restaurant.giftCards.find((cat) => cat._id.toString() === giftCardId)
      );

      await restaurant.save();

      res.status(200).json({
        message: "GiftCards order updated successfully.",
        restaurant,
      });
    } catch (error) {
      console.error("Error updating GiftCards order:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

module.exports = router;
