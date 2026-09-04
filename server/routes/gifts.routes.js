const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const authenticateToken = require("../middleware/authentificate-token");

const {
  getGiftCardAutoHiddenYearForVisibility,
  sanitizeGiftCardSettingsInput,
  sanitizeGiftCardValidityInput,
} = require("../services/gift-card-lifecycle.service");
const {
  getGiftCardVisualById,
} = require("../services/gift-card-snapshot.service");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("INVALID_GIFT_CARD_VISUAL_FILE"));
    }
    return cb(null, true);
  },
});

function handleGiftCardVisualUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();

    if (error.message === "INVALID_GIFT_CARD_VISUAL_FILE") {
      return res.status(400).json({
        message: "Format invalide. Utilisez une image JPG, PNG ou WebP.",
      });
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "Image trop lourde. La taille maximale est de 5 Mo.",
      });
    }

    return res.status(400).json({ message: "Image invalide." });
  });
}

function uploadFromBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function sanitizeGiftCardVisualInput(input = {}) {
  const name = String(input.name || "")
    .trim()
    .slice(0, 80);
  const rawTextColor = String(input.textColor || "").trim();
  const textColor = /^#[0-9a-fA-F]{6}$/.test(rawTextColor)
    ? rawTextColor
    : "#000000";
  const textLayout = ["right", "center", "left"].includes(input.textLayout)
    ? input.textLayout
    : "right";

  return {
    name: name || "Visuel carte cadeau",
    textColor,
    textLayout,
  };
}

async function findRestaurantWithPopulates(restaurantId) {
  return RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("employees")
    .populate("menus");
}

// ADD RESTAURANT GIFT CARDS
router.post("/restaurants/:id/gifts", async (req, res) => {
  const restaurantId = req.params.id;
  const { value, description, visualId } = req.body;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const validity = sanitizeGiftCardValidityInput(
      req.body,
      restaurant?.giftCardSettings,
    );
    const autoHiddenYear = getGiftCardAutoHiddenYearForVisibility(
      validity,
      new Date(),
      restaurant?.giftCardSettings,
    );
    const nextVisualId = String(visualId || "");
    if (nextVisualId && !getGiftCardVisualById(restaurant, nextVisualId)) {
      return res.status(400).json({ error: "Gift card visual not found" });
    }

    // Crée une nouvelle carte cadeau catalogue avec sa règle de validité.
    const newGiftCard = {
      value,
      description,
      visible: true,
      visualId: nextVisualId,
      ...validity,
    };
    if (autoHiddenYear !== undefined) {
      newGiftCard.validity_auto_hidden_year = autoHiddenYear;
    }

    restaurant.giftCards.push(newGiftCard);
    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus");

    res.status(200).json({ restaurant: updatedRestaurant });
  } catch (error) {
    res.status(500).json({ error: "Error adding gift card" });
  }
});

router.put(
  "/restaurants/:id/gifts/settings",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const rawSettings = req.body?.settings || {};

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const nextSettings = sanitizeGiftCardSettingsInput({
        ...(restaurant?.giftCardSettings?.toObject?.()
          ? restaurant.giftCardSettings.toObject()
          : restaurant?.giftCardSettings || {}),
        ...rawSettings,
      });

      restaurant.giftCardSettings = nextSettings;
      await restaurant.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error updating gift card settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.post(
  "/restaurants/:id/gifts/visuals",
  authenticateToken,
  handleGiftCardVisualUpload,
  async (req, res) => {
    const restaurantId = req.params.id;

    try {
      if (!req.file) {
        return res.status(400).json({ message: "Image required" });
      }

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const cloudinaryResponse = await uploadFromBuffer(
        req.file.buffer,
        `Gusto_Workspace/restaurants/${restaurantId}/gift-card-visuals`,
      );
      const visualInput = sanitizeGiftCardVisualInput(req.body);

      restaurant.giftCardSettings.visuals.push({
        ...visualInput,
        imageUrl: cloudinaryResponse.secure_url,
        imagePublicId: cloudinaryResponse.public_id,
      });

      const createdVisual =
        restaurant.giftCardSettings.visuals[
          restaurant.giftCardSettings.visuals.length - 1
        ];

      if (!restaurant.giftCardSettings.defaultVisualId) {
        restaurant.giftCardSettings.defaultVisualId = String(createdVisual._id);
      }

      await restaurant.save();

      const updatedRestaurant = await findRestaurantWithPopulates(restaurantId);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error adding gift card visual:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.put(
  "/restaurants/:id/gifts/visuals/order",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const orderedVisualIds = Array.isArray(req.body?.orderedVisualIds)
      ? req.body.orderedVisualIds.map(String)
      : [];

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const currentVisuals = restaurant.giftCardSettings.visuals || [];
      const byId = new Map(
        currentVisuals.map((visual) => [String(visual._id), visual]),
      );
      const ordered = orderedVisualIds
        .map((id) => byId.get(id))
        .filter(Boolean);
      const rest = currentVisuals.filter(
        (visual) => !orderedVisualIds.includes(String(visual._id)),
      );

      restaurant.giftCardSettings.visuals = [...ordered, ...rest];
      await restaurant.save();

      const updatedRestaurant = await findRestaurantWithPopulates(restaurantId);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error ordering gift card visuals:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.put(
  "/restaurants/:id/gifts/visuals/:visualId/default",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, visualId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const visual = getGiftCardVisualById(restaurant, visualId);
      if (!visual) {
        return res.status(404).json({ message: "Visual not found" });
      }

      restaurant.giftCardSettings.defaultVisualId = String(visual._id);
      await restaurant.save();

      const updatedRestaurant = await findRestaurantWithPopulates(restaurantId);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error setting default gift card visual:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.put(
  "/restaurants/:id/gifts/visuals/:visualId",
  authenticateToken,
  handleGiftCardVisualUpload,
  async (req, res) => {
    const { id: restaurantId, visualId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const visual = getGiftCardVisualById(restaurant, visualId);
      if (!visual) {
        return res.status(404).json({ message: "Visual not found" });
      }

      const visualInput = sanitizeGiftCardVisualInput({
        ...visual.toObject?.(),
        ...req.body,
      });
      Object.assign(visual, visualInput);

      if (req.file) {
        if (visual.imagePublicId) {
          await cloudinary.uploader.destroy(visual.imagePublicId);
        }

        const cloudinaryResponse = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/gift-card-visuals`,
        );
        visual.imageUrl = cloudinaryResponse.secure_url;
        visual.imagePublicId = cloudinaryResponse.public_id;
      }

      await restaurant.save();

      const updatedRestaurant = await findRestaurantWithPopulates(restaurantId);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error updating gift card visual:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.delete(
  "/restaurants/:id/gifts/visuals/:visualId",
  authenticateToken,
  async (req, res) => {
    const { id: restaurantId, visualId } = req.params;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const visual = getGiftCardVisualById(restaurant, visualId);
      if (!visual) {
        return res.status(404).json({ message: "Visual not found" });
      }

      if (String(restaurant.giftCardSettings.defaultVisualId) === visualId) {
        return res.status(400).json({
          message:
            "Ce visuel est défini par défaut. Choisissez un autre visuel par défaut avant de le supprimer.",
        });
      }

      const isUsedByGiftCard = (restaurant.giftCards || []).some(
        (giftCard) => String(giftCard.visualId || "") === visualId,
      );

      if (isUsedByGiftCard) {
        return res.status(400).json({
          message:
            "Ce visuel est utilisé par une carte cadeau. Réassignez les cartes concernées avant de le supprimer.",
        });
      }

      if (visual.imagePublicId) {
        await cloudinary.uploader.destroy(visual.imagePublicId);
      }

      restaurant.giftCardSettings.visuals.pull(visualId);
      await restaurant.save();

      const updatedRestaurant = await findRestaurantWithPopulates(restaurantId);
      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error deleting gift card visual:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// UPDATE RESTAURANT GIFT CARDS
router.put("/restaurants/:id/gifts/:giftId", async (req, res) => {
  const restaurantId = req.params.id;
  const giftId = req.params.giftId;

  try {
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res
        .status(404)
        .json({ error: "Restaurant or gift card not found" });
    }

    const gift = restaurant.giftCards?.id(giftId);
    if (!gift) {
      return res
        .status(404)
        .json({ error: "Restaurant or gift card not found" });
    }

    if (req.body.value !== undefined) gift.value = req.body.value;
    if (req.body.description !== undefined) {
      gift.description = req.body.description;
    }
    if (req.body.visible !== undefined) gift.visible = req.body.visible;
    if (req.body.visualId !== undefined) {
      const nextVisualId = String(req.body.visualId || "");
      if (nextVisualId && !getGiftCardVisualById(restaurant, nextVisualId)) {
        return res.status(400).json({ error: "Gift card visual not found" });
      }
      gift.visualId = nextVisualId;
    }

    const hasValidityPatch =
      req.body.validity_mode !== undefined ||
      req.body.validity_fixed_months !== undefined ||
      req.body.validity_until_day !== undefined ||
      req.body.validity_until_month !== undefined;

    if (hasValidityPatch) {
      const validity = sanitizeGiftCardValidityInput(
        {
          ...(gift.toObject?.() || gift),
          ...req.body,
        },
        restaurant?.giftCardSettings,
      );
      Object.assign(gift, validity);
    }

    if (hasValidityPatch || req.body.visible === true) {
      const autoHiddenYear = getGiftCardAutoHiddenYearForVisibility(
        gift,
        new Date(),
        restaurant?.giftCardSettings,
      );

      if (autoHiddenYear !== undefined) {
        gift.validity_auto_hidden_year = autoHiddenYear;
      } else if (hasValidityPatch) {
        gift.validity_auto_hidden_year = undefined;
      }
    }

    await restaurant.save();

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus");

    res.status(200).json({ restaurant: updatedRestaurant });
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
      { new: true },
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
          purchasesGiftCards: {
            $elemMatch: {
              _id: purchaseId,
              status: { $ne: "Archived" },
            },
          },
        },
        {
          $set: {
            "purchasesGiftCards.$.status": "Used",
            "purchasesGiftCards.$.useDate": new Date(),
          },
        },
        { new: true },
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
  },
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
          purchasesGiftCards: {
            $elemMatch: {
              _id: purchaseId,
              status: { $ne: "Archived" },
            },
          },
        },
        {
          $set: { "purchasesGiftCards.$.status": "Valid" },
        },
        { new: true },
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
  },
);

// ARCHIVE PURCHASED GIFT CARD
// The historical `/delete` URL is kept for compatibility with existing clients.
// A paid purchase must remain stored so its Stripe transaction stays auditable.
router.delete(
  "/restaurants/:restaurantId/purchases/:purchaseId/delete",
  async (req, res) => {
    const { restaurantId, purchaseId } = req.params;

    try {
      const restaurant = await RestaurantModel.findOneAndUpdate(
        {
          _id: restaurantId,
          "purchasesGiftCards._id": purchaseId,
        },
        {
          $set: {
            "purchasesGiftCards.$.status": "Archived",
          },
        },
        { new: true },
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
        .json({ message: "Purchased gift card archived", restaurant });
    } catch (error) {
      console.error("Error archiving purchased gift card:", error);
      res.status(500).json({ error: "Error archiving purchased gift card" });
    }
  },
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
        restaurant.giftCards.find((cat) => cat._id.toString() === giftCardId),
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
  },
);

module.exports = router;
