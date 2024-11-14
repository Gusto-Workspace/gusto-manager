const express = require("express");
const router = express.Router();
const RestaurantModel = require("../models/restaurant.model");

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
router.post("/restaurants/:id/gifts/:giftId/purchase", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;
  const { beneficiaryFirstName, beneficiaryLastName } = req.body;

  try {
    // Cherche le restaurant et la carte cadeau correspondante
    const restaurant = await RestaurantModel.findOne({
      _id: restaurantId,
    })
      .populate("owner_id", "firstname")
      .populate("menus");

    const gift = restaurant.giftCards.id(giftId);

    if (!gift) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    // Génère un code de 6 caractères pour l'achat de la carte cadeau
    const purchaseCode = generateGiftCode();

    // Crée un nouvel objet pour l'achat avec code, valeur et validité de 6 mois
    const newPurchase = {
      value: gift.value,
      description: gift.description, // Inclut la valeur de la carte cadeau dans l'achat
      purchaseCode,
      validUntil: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // Validité de 6 mois
      status: "Valid", // Par défaut, le statut est "Valid"
      beneficiaryFirstName,
      beneficiaryLastName,
    };

    // Ajoute l'achat dans le tableau des achats de cartes cadeaux du restaurant
    restaurant.purchasesGiftCards.push(newPurchase);

    // Sauvegarde la mise à jour
    await restaurant.save();

    res.status(200).json({ purchaseCode, validUntil: newPurchase.validUntil });
  } catch (error) {
    res.status(500).json({ error: "Error during gift card purchase" });
  }
});

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
          $set: { "purchasesGiftCards.$.status": "Used" },
        },
        { new: true }
      )
        .populate("owner_id", "firstname")
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

module.exports = router;
