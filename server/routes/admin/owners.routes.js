const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MODELS
const OwnerModel = require("../../models/owner.model");
const RestaurantModel = require("../../models/restaurant.model");

// OWNERS LIST
router.get("/admin/owners", async (req, res) => {
  try {
    const owners = await OwnerModel.find(
      {},
      "firstname lastname phoneNumber restaurants email _id created_at"
    ).populate("restaurants", "name");

    res.status(200).json({ owners });
  } catch (error) {
    console.error("Erreur lors de la récupération des propriétaires:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// UPDATE OWNER
router.put("/admin/owners/:id", async (req, res) => {
  const { ownerData } = req.body;

  try {
    // Rechercher le propriétaire par son ID
    const owner = await OwnerModel.findById(req.params.id);

    if (!owner) {
      return res.status(404).json({ message: "Propriétaire non trouvé" });
    }

    // Mettre à jour les champs du propriétaire dans la base de données
    owner.firstname = ownerData.firstname || owner.firstname;
    owner.lastname = ownerData.lastname || owner.lastname;
    owner.email = ownerData.email || owner.email;
    owner.phoneNumber = ownerData.phoneNumber || owner.phoneNumber;

    // Sauvegarder les changements dans la base de données
    await owner.save();

    // Vérifier si le propriétaire a un client Stripe
    if (owner.stripeCustomerId) {
      // Mettre à jour le client Stripe avec les nouvelles informations du propriétaire
      try {
        await stripe.customers.update(owner.stripeCustomerId, {
          email: owner.email,
          name: `${owner.firstname} ${owner.lastname}`,
        });
      } catch (stripeError) {
        console.error(
          "Erreur lors de la mise à jour du client Stripe :",
          stripeError
        );
        return res
          .status(500)
          .json({ message: "Erreur lors de la mise à jour du client Stripe" });
      }
    }

    // Retourner le propriétaire mis à jour
    res.status(200).json({
      message:
        "Propriétaire mis à jour avec succès, et informations Stripe mises à jour",
      owner,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du propriétaire:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// ADD OWNER
router.post("/admin/add-owner", async (req, res) => {
  const { ownerData } = req.body;

  try {
    // 1. Créer un nouveau propriétaire
    const owner = new OwnerModel({
      firstname: ownerData.firstname,
      lastname: ownerData.lastname,
      email: ownerData.email,
      password: ownerData.password,
      phoneNumber: ownerData.phoneNumber,
    });

    await owner.save();

    // 2. Créer le client Stripe pour le nouveau propriétaire
    const customer = await stripe.customers.create({
      email: owner.email,
      name: `${owner.firstname} ${owner.lastname}`,
      metadata: {
        owner_id: owner._id.toString(),
      },
    });

    // 3. Lier l'ID du client Stripe au propriétaire
    owner.stripeCustomerId = customer.id;
    await owner.save();

    // 4. Retourner le propriétaire créé
    res.status(201).json({
      message: "Propriétaire ajouté avec succès",
      owner,
    });
  } catch (error) {
    console.error("Erreur lors de la création du propriétaire:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// DELETE OWNER
router.delete("/admin/owners/:id", async (req, res) => {
  try {
    // 1. Trouver le propriétaire par son ID
    const owner = await OwnerModel.findById(req.params.id);

    if (!owner) {
      return res.status(404).json({ message: "Propriétaire non trouvé" });
    }

    // 2. Supprimer le client de Stripe si l'ID Stripe existe
    if (owner.stripeCustomerId) {
      try {
        await stripe.customers.del(owner.stripeCustomerId);
      } catch (stripeError) {
        console.error(
          "Erreur lors de la suppression du client Stripe:",
          stripeError
        );
        return res
          .status(500)
          .json({ message: "Erreur lors de la suppression du client Stripe" });
      }
    }

    // 3. Mettre à jour tous les restaurants qui appartiennent à ce propriétaire
    await RestaurantModel.updateMany(
      { owner_id: req.params.id },
      { owner_id: null } // On retire le propriétaire du restaurant
    );

    // 4. Supprimer le propriétaire de la base de données
    await OwnerModel.deleteOne({ _id: req.params.id });

    res.status(200).json({
      message:
        "Propriétaire supprimé avec succès et propriétaire retiré des restaurants",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du propriétaire:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
