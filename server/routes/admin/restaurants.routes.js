const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../../models/restaurant.model");
const OwnerModel = require("../../models/owner.model");
const {
  ensureRestaurantStripeCustomer,
  findRestaurantSubscription,
  isStripeCustomerDedicatedToRestaurant,
} = require("../../services/stripe-billing.service");

// CRYPTO
const {
  encryptApiKey,
  decryptApiKey,
} = require("../../services/encryption.service");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOwnerName(owner = {}) {
  return [owner?.firstname, owner?.lastname]
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .join(" ");
}

async function backfillSingleRestaurantOwnerCustomer(owner) {
  if (!owner?.stripeCustomerId) return;

  const restaurantIds = Array.isArray(owner.restaurants)
    ? owner.restaurants
    : [];
  if (restaurantIds.length !== 1) return;

  const legacyRestaurant = await RestaurantModel.findById(restaurantIds[0]);
  if (!legacyRestaurant || legacyRestaurant.stripeCustomerId) return;

  legacyRestaurant.stripeCustomerId = owner.stripeCustomerId;
  await legacyRestaurant.save();

  try {
    await ensureRestaurantStripeCustomer({
      restaurant: legacyRestaurant,
      owner,
      createIfMissing: false,
      syncExisting: true,
    });
  } catch (error) {
    console.warn(
      "[stripe-billing] impossible de synchroniser le customer legacy du restaurant:",
      error?.message || error,
    );
  }
}

async function assertRestaurantTransferBillingIsSafe(restaurant) {
  if (!restaurant?._id) return;

  const { subscription, stripeCustomerId } = await findRestaurantSubscription({
    restaurantId: restaurant._id,
  });

  if (!subscription) return;

  const isDedicatedRestaurantCustomer =
    await isStripeCustomerDedicatedToRestaurant({
      stripeCustomerId,
      restaurantId: restaurant._id,
    });

  if (isDedicatedRestaurantCustomer) {
    return {
      subscription,
      stripeCustomerId,
      isDedicatedRestaurantCustomer: true,
    };
  }

  const error = new Error(
    "Transfert bloqué : ce restaurant a encore un abonnement Stripe rattaché à un client partagé. Il faut d'abord migrer sa facturation vers un client Stripe dédié.",
  );
  error.statusCode = 409;
  throw error;
}

// GET STRIPE KEY FOR A SPECIFIC RESTAURANT
router.get("/admin/restaurants/:id/stripe-key", async (req, res) => {
  const restaurantId = req.params.id;

  try {
    // Rechercher le restaurant par ID
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant introuvable" });
    }

    // Vérifier si la clé existe
    if (!restaurant.stripeSecretKey) {
      return res.status(200).json({ stripeKey: null });
    }

    // Déchiffrer la clé Stripe
    const decryptedKey = decryptApiKey(restaurant.stripeSecretKey);

    // Retourner la clé déchiffrée
    res.status(200).json({ stripeKey: decryptedKey });
  } catch (error) {
    console.error("Erreur lors de la récupération de la clé Stripe :", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET ALL RESTAURANTS
router.get("/admin/restaurants", authenticateToken, async (req, res) => {
  try {
    const restaurants = await RestaurantModel.find().populate(
      "owner_id",
      "firstname lastname phoneNumber email",
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// ADD RESTAURANT
router.post("/admin/add-restaurant", async (req, res) => {
  const { restaurantData, ownerData, existingOwnerId, stripeSecretKey } =
    req.body;

  try {
    let owner;

    if (existingOwnerId) {
      owner = await OwnerModel.findById(existingOwnerId);
      if (!owner) {
        return res.status(404).json({ message: "Propriétaire non trouvé" });
      }

      await backfillSingleRestaurantOwnerCustomer(owner);
    } else {
      owner = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        email: ownerData.email,
        password: ownerData.password,
        phoneNumber: ownerData.phoneNumber,
      });

      await owner.save();

      const customer = await stripe.customers.create({
        email: owner.email,
        name: `${owner.firstname} ${owner.lastname}`,
        metadata: {
          owner_id: owner._id.toString(),
        },
      });

      owner.stripeCustomerId = customer.id;
      await owner.save();
    }

    let encryptedKey = null;

    // Si une clé Stripe est fournie, validez et chiffrez-la
    if (stripeSecretKey) {
      try {
        const stripeInstance = require("stripe")(stripeSecretKey);
        await stripeInstance.balance.retrieve(); // Valide la clé Stripe
        encryptedKey = encryptApiKey(stripeSecretKey); // Chiffrez la clé Stripe
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Clé Stripe invalide. Veuillez vérifier." });
      }
    }
    // Créer le restaurant avec l'adresse sous forme d'objet
    const newRestaurant = new RestaurantModel({
      name: restaurantData.name,
      address: {
        line1: restaurantData.address.line1,
        zipCode: restaurantData.address.zipCode,
        city: restaurantData.address.city,
        country: restaurantData.address.country || "France",
      },
      phone: restaurantData.phone,
      email: restaurantData.email,
      website: restaurantData.website,
      stripeSecretKey: encryptedKey,
      owner_id: owner._id,
      opening_hours: restaurantData.opening_hours,
      options: {
        dishes: restaurantData.options?.dishes ?? true,
        menus: restaurantData.options?.menus ?? true,
        drinks: restaurantData.options?.drinks ?? true,
        wines: restaurantData.options?.wines ?? true,
        news: restaurantData.options?.news ?? true,
        gift_card: restaurantData.options?.gift_card ?? false,
        reservations: restaurantData.options?.reservations ?? false,
        employees: restaurantData.options?.employees ?? false,
        take_away: restaurantData.options?.take_away ?? false,
        health_control_plan:
          restaurantData.options?.health_control_plan ?? false,
        customers: restaurantData.options?.customers ?? false,
      },
      menus: [],
      dishes: [],
      drinks: [],
      news: [],
    });

    await newRestaurant.save();

    owner.restaurants.push(newRestaurant._id);
    await owner.save();

    try {
      await ensureRestaurantStripeCustomer({
        restaurantId: newRestaurant._id,
        billingAddress: restaurantData.address,
        phone: restaurantData.phone,
        language: restaurantData.language,
        syncExisting: true,
      });
    } catch (error) {
      console.warn(
        "[stripe-billing] impossible d'initialiser le customer du restaurant:",
        error?.message || error,
      );
    }

    const populatedRestaurant = await RestaurantModel.findById(
      newRestaurant._id,
    ).populate("owner_id", "firstname lastname email");

    res.status(201).json({
      message: "Restaurant ajouté avec succès",
      restaurant: populatedRestaurant,
    });
  } catch (error) {
    console.error("Erreur lors de la création du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// UPDATE RESTAURANT
router.put("/admin/restaurants/:id", async (req, res) => {
  const { restaurantData, ownerData, existingOwnerId, stripeSecretKey } =
    req.body;

  try {
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant non trouvé" });
    }

    let previousOwner = null;
    let currentOwner = null;
    let shouldEnsureRestaurantCustomer = false;
    let syncRestaurantCustomerAfterSave = false;
    let transferBillingContext = null;
    let payerChange = null;

    if (
      existingOwnerId &&
      existingOwnerId !== restaurant.owner_id?.toString()
    ) {
      transferBillingContext =
        await assertRestaurantTransferBillingIsSafe(restaurant);

      currentOwner = await OwnerModel.findById(existingOwnerId);
      if (!currentOwner) {
        return res
          .status(404)
          .json({ message: "Nouveau propriétaire non trouvé" });
      }

      await backfillSingleRestaurantOwnerCustomer(currentOwner);

      if (restaurant.owner_id) {
        previousOwner = await OwnerModel.findById(restaurant.owner_id);
        if (previousOwner) {
          previousOwner.restaurants = previousOwner.restaurants.filter(
            (restaurantId) =>
              restaurantId.toString() !== restaurant._id.toString(),
          );
          await previousOwner.save();
        }
      }
      currentOwner.restaurants.push(restaurant._id);
      await currentOwner.save();

      restaurant.owner_id = currentOwner._id;
      shouldEnsureRestaurantCustomer = true;
      syncRestaurantCustomerAfterSave = true;
    } else if (!existingOwnerId && ownerData && ownerData.firstname) {
      transferBillingContext =
        await assertRestaurantTransferBillingIsSafe(restaurant);

      if (restaurant.owner_id) {
        previousOwner = await OwnerModel.findById(restaurant.owner_id);
      }

      currentOwner = new OwnerModel({
        firstname: ownerData.firstname,
        lastname: ownerData.lastname,
        email: ownerData.email,
        password: ownerData.password,
        phoneNumber: ownerData.phoneNumber,
      });

      await currentOwner.save();

      const customer = await stripe.customers.create({
        email: currentOwner.email,
        name: `${currentOwner.firstname} ${currentOwner.lastname}`,
        metadata: {
          owner_id: currentOwner._id.toString(),
        },
      });

      currentOwner.stripeCustomerId = customer.id;
      await currentOwner.save();

      if (previousOwner) {
        previousOwner.restaurants = previousOwner.restaurants.filter(
          (restaurantId) =>
            restaurantId.toString() !== restaurant._id.toString(),
        );
        await previousOwner.save();
      }

      restaurant.owner_id = currentOwner._id;
      currentOwner.restaurants.push(restaurant._id);
      await currentOwner.save();
      shouldEnsureRestaurantCustomer = true;
      syncRestaurantCustomerAfterSave = true;
    } else {
      currentOwner = await OwnerModel.findById(restaurant.owner_id);
      const ownerRestaurantCount = Array.isArray(currentOwner?.restaurants)
        ? currentOwner.restaurants.length
        : 0;

      shouldEnsureRestaurantCustomer =
        Boolean(restaurant.stripeCustomerId) || ownerRestaurantCount <= 1;
      syncRestaurantCustomerAfterSave = shouldEnsureRestaurantCustomer;
    }

    // Mise à jour des informations du restaurant
    restaurant.name = restaurantData.name;
    restaurant.address = {
      line1: restaurantData.address.line1,
      zipCode: restaurantData.address.zipCode,
      city: restaurantData.address.city,
      country: restaurantData.address.country || "France",
    };
    restaurant.phone = restaurantData.phone;
    restaurant.email = restaurantData.email;
    restaurant.website = restaurantData.website;
    restaurant.options = {
      dishes: restaurantData.options?.dishes ?? true,
      menus: restaurantData.options?.menus ?? true,
      drinks: restaurantData.options?.drinks ?? true,
      wines: restaurantData.options?.wines ?? true,
      news: restaurantData.options?.news ?? true,
      gift_card: restaurantData.options?.gift_card ?? false,
      reservations: restaurantData.options?.reservations ?? false,
      employees: restaurantData.options?.employees ?? false,
      take_away: restaurantData.options?.take_away ?? false,
      health_control_plan: restaurantData.options?.health_control_plan ?? false,
      customers: restaurantData.options?.customers ?? false,
    };

    // Gestion de la clé Stripe
    if (stripeSecretKey === null || stripeSecretKey === "") {
      // Supprime la clé Stripe si elle est vide ou null
      restaurant.stripeSecretKey = null;
    } else if (stripeSecretKey) {
      try {
        const stripeInstance = require("stripe")(stripeSecretKey);
        await stripeInstance.balance.retrieve(); // Valide la clé Stripe

        const encryptedKey = encryptApiKey(stripeSecretKey);
        restaurant.stripeSecretKey = encryptedKey;
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Clé Stripe invalide. Veuillez vérifier." });
      }
    }

    await restaurant.save();

    if (shouldEnsureRestaurantCustomer && currentOwner) {
      try {
        await ensureRestaurantStripeCustomer({
          restaurantId: restaurant._id,
          billingAddress: restaurantData.address,
          phone: restaurantData.phone,
          language: restaurantData.language,
          createIfMissing: true,
          syncExisting: syncRestaurantCustomerAfterSave,
        });
      } catch (error) {
        console.warn(
          "[stripe-billing] impossible de synchroniser le customer du restaurant:",
          error?.message || error,
        );
      }
    }

    const transferredWithDedicatedSubscription =
      Boolean(transferBillingContext?.subscription?.id) &&
      Boolean(transferBillingContext?.isDedicatedRestaurantCustomer) &&
      previousOwner &&
      currentOwner &&
      previousOwner._id?.toString() !== currentOwner._id?.toString();

    if (transferredWithDedicatedSubscription) {
      const subscriptionMetadata = {
        ...(transferBillingContext.subscription.metadata || {}),
      };
      const currentOwnerId = currentOwner._id.toString();
      const currentOwnerName = buildOwnerName(currentOwner);
      const currentPayerOwnerId = normalizeString(
        subscriptionMetadata.payerOwnerId,
      );

      const payerAlreadyMatchesOwner =
        currentPayerOwnerId && currentPayerOwnerId === currentOwnerId;

      if (payerAlreadyMatchesOwner) {
        await stripe.subscriptions.update(
          transferBillingContext.subscription.id,
          {
            metadata: {
              ...subscriptionMetadata,
              payerOwnerId: currentOwnerId,
              payerOwnerName: currentOwnerName,
              payerOwnerEmail: normalizeString(currentOwner.email),
              payerChangeRequired: "false",
              pendingPayerOwnerId: "",
              pendingPayerOwnerName: "",
              previousPayerOwnerId: "",
              previousPayerOwnerName: "",
            },
          },
        );
      } else {
        await stripe.subscriptions.update(
          transferBillingContext.subscription.id,
          {
            metadata: {
              ...subscriptionMetadata,
              payerChangeRequired: "true",
              pendingPayerOwnerId: currentOwnerId,
              pendingPayerOwnerName: currentOwnerName,
              previousPayerOwnerId:
                currentPayerOwnerId || previousOwner._id?.toString() || "",
              previousPayerOwnerName:
                normalizeString(subscriptionMetadata.payerOwnerName) ||
                buildOwnerName(previousOwner),
              transferTriggeredAt: new Date().toISOString(),
            },
          },
        );

        payerChange = {
          required: true,
          restaurantId: restaurant._id.toString(),
          subscriptionId: transferBillingContext.subscription.id,
        };
      }
    }

    const updatedRestaurant = await RestaurantModel.findById(
      restaurant._id,
    ).populate("owner_id", "firstname lastname email");

    res.status(200).json({
      message: "Restaurant mis à jour avec succès",
      restaurant: updatedRestaurant,
      payerChangeRequired: Boolean(payerChange?.required),
      payerChange,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du restaurant:", error);
    res
      .status(error?.statusCode || 500)
      .json({ message: error?.message || "Erreur interne du serveur" });
  }
});

// DELETE RESTAURANT
router.delete("/admin/restaurants/:id", async (req, res) => {
  try {
    // Trouver le restaurant à supprimer
    const restaurant = await RestaurantModel.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant non trouvé" });
    }

    // Trouver le propriétaire du restaurant
    const owner = await OwnerModel.findById(restaurant.owner_id);
    if (owner) {
      // Retirer le restaurant de la liste des restaurants du propriétaire
      owner.restaurants = owner.restaurants.filter(
        (restaurantId) => restaurantId.toString() !== restaurant._id.toString(),
      );
      await owner.save();
    }

    // Supprimer le restaurant
    await RestaurantModel.deleteOne({ _id: restaurant._id });

    res.status(200).json({ message: "Restaurant supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
