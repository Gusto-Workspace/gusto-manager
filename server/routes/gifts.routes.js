const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const authenticateToken = require("../middleware/authentificate-token");

// SSE BUS
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// MIDDLEWARE VERIFY BUYING GIFT CARDS
const {
  verifyPurchaseProof,
} = require("../services/verify-buying-gift-card.service");

// SERVICE NOTIFS
const {
  createAndBroadcastNotification,
} = require("../services/notifications.service");
const {
  computeGiftCardValidUntil,
  getGiftCardAutoHiddenYearForVisibility,
  sanitizeGiftCardSettingsInput,
  sanitizeGiftCardValidityInput,
} = require("../services/gift-card-lifecycle.service");
const {
  sendGiftCardPurchaseEmail,
} = require("../services/gift-card-mailer.service");

function generateGiftCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// SERVICE CUSTOMERS
const {
  upsertCustomer,
  onGiftPurchased,
} = require("../services/customers.service");

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
  const name = String(input.name || "").trim().slice(0, 80);
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

function getGiftCardVisualById(restaurant, visualId) {
  if (!visualId) return null;
  return restaurant?.giftCardSettings?.visuals?.id?.(visualId) || null;
}

function getResolvedGiftCardVisual(restaurant, gift) {
  const visuals = restaurant?.giftCardSettings?.visuals || [];
  const giftVisual = getGiftCardVisualById(restaurant, gift?.visualId);
  const defaultVisual = getGiftCardVisualById(
    restaurant,
    restaurant?.giftCardSettings?.defaultVisualId,
  );

  return giftVisual || defaultVisual || visuals[0] || null;
}

function buildGiftCardVisualSnapshot(restaurant, gift) {
  const visual = getResolvedGiftCardVisual(restaurant, gift);
  if (!visual) return {};

  return {
    visualId: String(visual._id || ""),
    name: visual.name || "",
    imageUrl: visual.imageUrl || "",
    imagePublicId: visual.imagePublicId || "",
    textColor: visual.textColor || "#000000",
    textLayout: visual.textLayout || "right",
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
      buyerFirstName,
      buyerLastName,
      buyerPhone,
      comment,
      hidePrice,
      fallbackGiftCardBackgroundUrl,
      paymentIntentId,
      amount,
    } = req.body;

    try {
      const amt = Number(amount);
      if (!paymentIntentId || !Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: "Invalid payment data" });
      }

      // 1) Charger restaurant + gift (pour vérifier montant)
      const restaurant = await RestaurantModel.findOne({ _id: restaurantId });
      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      const gift = restaurant.giftCards?.id(giftId);
      if (!gift) {
        return res.status(404).json({ error: "Gift card not found" });
      }

      const expectedAmount = Number(gift.value) * 100;
      if (amt !== expectedAmount) {
        return res.status(400).json({ error: "Amount mismatch" });
      }

      // 2) Init giftCardSold si absent (requête séparée => pas de conflit)
      await RestaurantModel.updateOne(
        { _id: restaurantId, giftCardSold: { $exists: false } },
        { $set: { giftCardSold: { totalSold: 0, totalRefunded: 0 } } },
      );

      // 3) validUntil depuis la carte achetée (fallback anciens paramètres)
      const validUntil = computeGiftCardValidUntil(
        gift,
        new Date(),
        restaurant?.giftCardSettings,
      );

      const customer = await upsertCustomer({
        restaurantId,
        firstName: buyerFirstName,
        lastName: buyerLastName,
        email: sendEmail,
        phone: buyerPhone,
      });

      const createdAt = new Date();
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
        message: String(comment || "").slice(0, 500),
        hidePrice: Boolean(hidePrice),
        sendEmail,
        senderPhone: buyerPhone,
        customer: customer?._id || null,
        paymentIntentId,
        amount: amt,
        visualSnapshot: buildGiftCardVisualSnapshot(restaurant, gift),
        buyerFirstName: buyerFirstName || "",
        buyerLastName: buyerLastName || "",
        created_at: createdAt,
      };

      // 4) Insertion atomique anti-doublon
      const upd = await RestaurantModel.updateOne(
        {
          _id: restaurantId,
          "purchasesGiftCards.paymentIntentId": { $ne: paymentIntentId },
        },
        {
          $push: { purchasesGiftCards: newPurchase },
          $inc: { "giftCardSold.totalSold": 1 },
        },
      );

      const modified =
        typeof upd.modifiedCount === "number"
          ? upd.modifiedCount
          : typeof upd.nModified === "number"
            ? upd.nModified
            : 0;

      // 5) Relecture de la purchase (pour SSE + réponse) => elle aura created_at
      const doc = await RestaurantModel.findOne(
        {
          _id: restaurantId,
          "purchasesGiftCards.paymentIntentId": paymentIntentId,
        },
        {
          purchasesGiftCards: { $elemMatch: { paymentIntentId } },
          giftCardSold: 1,
        },
      ).lean();

      const created = doc?.purchasesGiftCards?.[0];
      if (!created) {
        return res
          .status(500)
          .json({ error: "Purchase not found after update" });
      }

      const requestOrigin = req.get("origin");
      const fallbackImageUrl =
        String(fallbackGiftCardBackgroundUrl || "").trim() ||
        (requestOrigin ? `${requestOrigin}/img/assets/bg-gift-card.png` : "");
      let emailStatus = created.emailSentAt
        ? { sent: true, alreadySent: true }
        : { sent: false };

      // 6) SSE : on broadcast la vraie purchase (avec created_at)
      // ✅ broadcast seulement si c'est une création réelle (pas un retry)
      if (modified === 1) {
        broadcastToRestaurant(String(restaurantId), {
          type: "giftcard_purchased",
          purchase: created,
          giftCardStats: doc.giftCardSold,
        });

        await createAndBroadcastNotification({
          restaurantId: String(restaurantId),
          module: "gift_cards",
          type: "giftcard_purchased",
          data: {
            purchaseId: String(created?._id),
            amount: created?.amount,
            value: created?.value,
            beneficiaryFirstName: created?.beneficiaryFirstName,
            beneficiaryLastName: created?.beneficiaryLastName,
            purchaseCode: created?.purchaseCode,
            status: created?.status,
            created_at: created?.created_at,
          },
        });

        await onGiftPurchased(customer?._id, created);
      }

      if (!created.emailSentAt) {
        try {
          const emailResponse = await sendGiftCardPurchaseEmail({
            restaurant,
            purchase: created,
            message: created.message || comment,
            hidePrice: Boolean(created.hidePrice ?? hidePrice),
            fallbackImageUrl,
          });

          if (emailResponse?.skipped) {
            emailStatus = {
              sent: false,
              skipped: true,
              reason: emailResponse.reason,
            };
          } else {
            await RestaurantModel.updateOne(
              { _id: restaurantId, "purchasesGiftCards._id": created._id },
              {
                $set: {
                  "purchasesGiftCards.$.emailSentAt": new Date(),
                  "purchasesGiftCards.$.emailSendError": "",
                },
              },
            );
            emailStatus = { sent: true };
          }
        } catch (emailError) {
          const emailErrorMessage =
            emailError?.response?.body?.message ||
            emailError?.message ||
            "Gift card email failed";

          await RestaurantModel.updateOne(
            { _id: restaurantId, "purchasesGiftCards._id": created._id },
            {
              $set: {
                "purchasesGiftCards.$.emailSendError": String(
                  emailErrorMessage,
                ).slice(0, 500),
              },
            },
          );

          return res.status(500).json({
            error: "Gift card purchased but email failed",
            emailError: emailErrorMessage,
            purchaseCode: created.purchaseCode,
            validUntil: created.validUntil,
            visualSnapshot: created.visualSnapshot,
            alreadyExisted: modified === 0,
          });
        }
      }

      // 7) Réponse idempotente : si retry, on renvoie quand même 200 avec la même purchase
      return res.status(200).json({
        purchaseCode: created.purchaseCode,
        validUntil: created.validUntil,
        visualSnapshot: created.visualSnapshot,
        emailStatus,
        created_at: created.created_at,
        alreadyExisted: modified === 0,
      });
    } catch (error) {
      console.error("Error during gift card purchase:", error);
      return res.status(500).json({ error: "Error during gift card purchase" });
    }
  },
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
          "purchasesGiftCards._id": purchaseId,
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
        .json({ message: "Purchased gift card deleted", restaurant });
    } catch (error) {
      console.error("Error deleting purchased gift card:", error);
      res.status(500).json({ error: "Error deleting purchased gift card" });
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
