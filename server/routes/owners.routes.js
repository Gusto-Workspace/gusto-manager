const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);
const SibApiV3Sdk = require("sib-api-v3-sdk");

// CLOUDINARY
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

// MODELS
const OwnerModel = require("../models/owner.model");
const RestaurantModel = require("../models/restaurant.model");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");
const EmployeeModel = require("../models/employee.model");

// ---------- CLOUDINARY / MULTER (pour owners) ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadFromBuffer = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// Fonction pour initialiser le client Brevo
function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur lors de l'instanciation du client:", err);
    throw new Error(err);
  }
}

// Fonction pour envoyer un email transactionnel avec le code de réinitialisation
function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Gusto Manager",
    };
    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.htmlContent = `<p>Votre code de réinitialisation est : <strong>${params.code}</strong></p>`;

    // Envoi de l'email
    return apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    throw new Error(err);
  }
}

// Route pour envoyer le code de réinitialisation de mot de passe
router.post("/owner/send-reset-code", async (req, res) => {
  const { email } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Génère un code de réinitialisation à 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    owner.resetCode = resetCode;
    owner.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // Expire dans 10 minutes
    await owner.save();

    // Paramètres pour l'email
    const paramsEmail = {
      to: [{ email: owner.email, name: owner.firstname }],
      subject: "Votre code de réinitialisation de mot de passe",
      code: resetCode,
    };

    await sendTransactionalEmail(paramsEmail);
    res.status(200).json({ message: "Code envoyé par email" });
  } catch (error) {
    console.error(
      "Erreur lors de l'envoi du code de réinitialisation :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour vérifier le code de réinitialisation
router.post("/owner/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Vérifier le code et l'expiration
    if (owner.resetCode !== code || new Date() > owner.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    res.status(200).json({ message: "Code valide" });
  } catch (error) {
    console.error(
      "Erreur lors de la vérification du code de réinitialisation :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour réinitialiser le mot de passe
router.put("/owner/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    // Vérifie que le code est toujours valide
    if (owner.resetCode !== code || new Date() > owner.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    // Mettre à jour le mot de passe
    owner.password = newPassword; // Le hashing est géré dans le hook "pre('save')"
    owner.resetCode = undefined; // Supprime le code de réinitialisation
    owner.resetCodeExpires = undefined; // Supprime l'expiration du code
    await owner.save();

    res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
  } catch (error) {
    console.error(
      "Erreur lors de la réinitialisation du mot de passe :",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET OWNER DATA
router.get("/owner/get-data", authenticateToken, async (req, res) => {
  try {
    const owner = await OwnerModel.findById(req.user.id).select("-password");
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const restaurant = await RestaurantModel.findById(req.user.restaurantId)
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    res.status(200).json({ owner, restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// UPDATE OWNER DATA
router.put(
  "/owner/update-data",
  authenticateToken,
  upload.single("profilePicture"),
  async (req, res) => {
    const { firstname, lastname, email, phoneNumber, removeProfilePicture } =
      req.body;

    try {
      const owner = await OwnerModel.findById(req.user.id);
      if (!owner) return res.status(404).json({ message: "Owner not found" });

      const normalizedEmail = (email || "").trim().toLowerCase();

      // Only check if email actually changes
      if (normalizedEmail && normalizedEmail !== owner.email) {
        const [ownerDup, employeeDup] = await Promise.all([
          OwnerModel.findOne({
            email: normalizedEmail,
            _id: { $ne: owner._id },
          }),
          EmployeeModel.findOne({ email: normalizedEmail }),
        ]);
        if (ownerDup || employeeDup) {
          return res
            .status(409)
            .json({ message: "L'adresse mail est déjà utilisée" });
        }
      }

      // ---------- Mise à jour des infos de base ----------
      if (firstname !== undefined) owner.firstname = firstname;
      if (lastname !== undefined) owner.lastname = lastname;
      if (normalizedEmail !== undefined && normalizedEmail !== "") {
        owner.email = normalizedEmail;
      }
      if (phoneNumber !== undefined) owner.phoneNumber = phoneNumber;

      // ---------- Photo de profil ----------
      if (req.file) {
        // suppression éventuelle de l'ancienne
        if (owner.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(owner.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de l'ancienne photo owner :",
              err?.message || err
            );
          }
        }

        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/owners/${owner._id}`
        );

        owner.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      } else if (removeProfilePicture === "true") {
        if (owner.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(owner.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de la photo owner :",
              err?.message || err
            );
          }
        }
        owner.profilePicture = null;
      }

      await owner.save();

      // fresh token (owners)
      const jwt = require("jsonwebtoken");
      const payload = {
        id: owner._id,
        role: "owner",
        restaurantId: req.user.restaurantId,
        firstname: owner.firstname,
        lastname: owner.lastname,
        email: owner.email,
        phoneNumber: owner.phoneNumber,
        stripeCustomerId: owner.stripeCustomerId || null,
        profilePictureUrl: owner.profilePicture?.url || null,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET);

      // Optional: keep Stripe in sync
      if (owner.stripeCustomerId) {
        try {
          await stripe.customers.update(owner.stripeCustomerId, {
            email: owner.email,
            name: `${owner.firstname} ${owner.lastname}`,
          });
        } catch (err) {
          console.error("Stripe update error:", err);
          return res.status(500).json({
            message: "Erreur lors de la mise à jour du client Stripe",
          });
        }
      }

      return res.status(200).json({ message: "Owner updated", token });
    } catch (error) {
      console.error("Erreur MAJ owner :", error);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  }
);

// UPDATE OWNER PASSWORD
router.put("/owner/update-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const owner = await OwnerModel.findById(req.user.id);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    const isMatch = await owner.comparePassword(
      currentPassword,
      owner.password
    );
    if (!isMatch)
      return res.status(401).json({ message: "Incorrect current password" });

    owner.password = newPassword;
    await owner.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du mot de passe :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
