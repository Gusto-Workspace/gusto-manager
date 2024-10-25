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
  const { value } = req.body;

  try {
    // Crée une nouvelle carte cadeau sans code ni date de validité
    const newGiftCard = {
      value,
      visible: true,
    };

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $push: { gifts: newGiftCard } },
      { new: true }
    ).populate("owner_id", "firstname");

    res.status(200).json({ restaurant });
  } catch (error) {
    res.status(500).json({ error: "Error adding gift card" });
  }
});

// UPDATE RESTAURANT GIFT CARDS
router.put("/restaurants/:id/gifts/:giftId", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;
  const { value, visible } = req.body;

  try {
    const restaurant = await RestaurantModel.findOneAndUpdate(
      { _id: restaurantId, "gifts._id": giftId },
      {
        $set: {
          "gifts.$.value": value,
          "gifts.$.visible": visible,
        },
      },
      { new: true }
    ).populate("owner_id", "firstname");

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
    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $pull: { gifts: { _id: giftId } } },
      { new: true }
    ).populate("owner_id", "firstname");

    res.status(200).json({ restaurant });
  } catch (error) {
    res.status(500).json({ error: "Error deleting gift card" });
  }
});

// BUY A GIFT CARD (GÉNÉRATION DU CODE)
router.post("/restaurants/:id/gifts/:giftId/purchase", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;

  try {
    // Cherche la carte cadeau correspondante
    const restaurant = await RestaurantModel.findOne({
      _id: restaurantId,
    }).populate("owner_id", "firstname");
    const gift = restaurant.gifts.id(giftId);

    if (!gift) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    // Génère un code de 6 caractères pour l'achat de la carte cadeau
    const purchaseCode = generateGiftCode();

    // Crée un nouvel objet pour l'achat avec code et validité de 6 mois
    const newPurchase = {
      purchaseCode,
      validUntil: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // Validité de 6 mois
      status: "Valid", // Par défaut, le statut est "Valid"
    };

    // Ajoute l'achat dans le tableau des achats de la carte
    gift.purchases.push(newPurchase);

    // Sauvegarde la mise à jour
    await restaurant.save();

    res.status(200).json({ purchaseCode, validUntil: newPurchase.validUntil });
  } catch (error) {
    res.status(500).json({ error: "Error during gift card purchase" });
  }
});

// UPDATE PURCHASE STATUS
router.put("/restaurants/:id/gifts/:giftId/purchases/:purchaseId", async (req, res) => {
  const { id: restaurantId, giftId, purchaseId } = req.params;
  const { status } = req.body;

  console.log("Received Params:", req.params);
  console.log("Received Body:", req.body);

  try {
    const restaurant = await RestaurantModel.findOne({ _id: restaurantId }).populate("owner_id", "firstname");
    console.log("Found Restaurant:", restaurant ? restaurant._id : "Not Found");

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const gift = restaurant.gifts.id(giftId);
    console.log("Found Gift Card:", gift ? gift._id : "Not Found");

    if (!gift) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    // Trouver l'achat spécifique par son `_id` (purchaseId)
    const purchase = gift.purchases.id(purchaseId);
    console.log("Found Purchase:", purchase ? purchase._id : "Not Found");

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    // Met à jour le statut de l'achat si un statut est fourni
    if (status) {
      purchase.status = status;
    }

    // Sauvegarde la mise à jour
    await restaurant.save();

    // Renvoie les données complètes du restaurant mis à jour
    res.status(200).json({ message: "Purchase status updated", restaurant });
  } catch (error) {
    console.error("Error updating purchase status:", error);
    res.status(500).json({ error: "Error updating purchase status" });
  }
});


module.exports = router;
