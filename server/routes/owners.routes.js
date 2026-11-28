const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// CLOUDINARY
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

// MODELS
const OwnerModel = require("../models/owner.model");
const RestaurantModel = require("../models/restaurant.model");
const {
  stripeCustomerUsedByAnyRestaurant,
} = require("../services/billing/stripe-billing.service");
const {
  decorateRestaurantEmployees,
} = require("../services/employees/employee-serialization.service");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");
const { allowPasswordAttempt } = require("../middleware/limit-login");
const EmployeeModel = require("../models/employee.model");
const {
  buildSessionVersionFilter,
  isAccountSessionValid,
  normalizeSessionVersion,
  rotatePasswordSession,
  signAccountToken,
  stripJwtMetadata,
  validatePasswordChangeInput,
} = require("../services/shared/account-session.service");

async function verifyCurrentOwnerPassword(req, res, owner, password) {
  if (!allowPasswordAttempt(req, res, owner.email)) return false;
  if (await owner.comparePassword(password, owner.password)) return true;
  res.status(401).json({ message: "Incorrect current password" });
  return false;
}

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
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};


// GET OWNER DATA
router.get("/owner/get-data", authenticateToken, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ message: "Forbidden" });
  res.set("Cache-Control", "private, no-store");
  try {
    const owner = await OwnerModel.findById(req.user.id).select("-password");
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const restaurant = req.user.restaurantId ? await RestaurantModel.findOne({
      _id: req.user.restaurantId,
      owner_id: req.user.id,
    })
      .populate("owner_id", "firstname")
      .populate("employees")
      .populate("menus") : null;

    const decoratedRestaurant = decorateRestaurantEmployees(
      restaurant,
      restaurant?._id,
      restaurant?.employees || [],
    );

    res.status(200).json({ owner, restaurant: decoratedRestaurant });
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
    const { firstname, lastname, email, phoneNumber, removeProfilePicture, currentPassword } =
      req.body;

    try {
      if (req.user.role !== "owner") return res.status(403).json({ message: "Forbidden" });
      const owner = await OwnerModel.findById(req.user.id);
      if (!owner) return res.status(404).json({ message: "Owner not found" });

      const normalizedEmail = (email || "").trim().toLowerCase();

      if (normalizedEmail && normalizedEmail !== owner.email) {
        if (typeof currentPassword !== "string" || !currentPassword.trim()) {
          return res.status(400).json({ field: "currentPassword", message: "Current password is required" });
        }
        if (!(await verifyCurrentOwnerPassword(req, res, owner, currentPassword))) return;
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
        // Apply the verified email change only while the same credentials are current.
        owner.$where = {
          ...buildSessionVersionFilter(owner._id, req.user.sessionVersion),
          email: owner.email,
          password: owner.password,
        };
        owner.email = normalizedEmail;
        owner.resetCode = undefined;
        owner.resetCodeExpires = undefined;
      }

      // ---------- Mise à jour des infos de base ----------
      if (firstname !== undefined) owner.firstname = firstname;
      if (lastname !== undefined) owner.lastname = lastname;
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
              err?.message || err,
            );
          }
        }

        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/owners/${owner._id}`,
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
              err?.message || err,
            );
          }
        }
        owner.profilePicture = null;
      }

      await owner.save();

      if (!(await isAccountSessionValid(req.user))) {
        return res.status(403).json({ message: "Session revoked" });
      }

      // fresh token (owners)
      const payload = {
        ...stripJwtMetadata(req.user),
        id: owner._id,
        role: "owner",
        restaurantId: req.user.restaurantId,
        firstname: owner.firstname,
        lastname: owner.lastname,
        email: owner.email,
        phoneNumber: owner.phoneNumber,
        stripeCustomerId: owner.stripeCustomerId || null,
        profilePictureUrl: owner.profilePicture?.url || null,
        sessionVersion: normalizeSessionVersion(req.user.sessionVersion),
      };

      const token = signAccountToken(payload);

      // Optional: keep Stripe in sync
      if (
        owner.stripeCustomerId &&
        !(await stripeCustomerUsedByAnyRestaurant(owner.stripeCustomerId))
      ) {
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
      if (error.name === "DocumentNotFoundError") return res.status(403).json({ message: "Session revoked" });
      console.error("Erreur MAJ owner", error.code || error.name);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// UPDATE OWNER PASSWORD
router.put("/owner/update-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (req.user.role !== "owner") return res.status(403).json({ message: "Forbidden" });
    const validationError = validatePasswordChangeInput(
      currentPassword,
      newPassword,
    );
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const owner = await OwnerModel.findById(req.user.id).select({
      _id: 1,
      email: 1,
      password: 1,
    });
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    if (!(await verifyCurrentOwnerPassword(req, res, owner, currentPassword))) return;

    const previousVersion = normalizeSessionVersion(req.user.sessionVersion);
    const updatedOwner = await rotatePasswordSession({
      AccountModel: OwnerModel,
      accountId: owner._id,
      currentPasswordHash: owner.password,
      expectedSessionVersion: previousVersion,
      newPassword,
    });

    if (!updatedOwner) {
      return res.status(403).json({ message: "Session revoked" });
    }

    const token = signAccountToken({
      ...stripJwtMetadata(req.user),
      sessionVersion: previousVersion + 1,
    });

    res.status(200).json({ message: "Password updated successfully", token });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du mot de passe", error.code || error.name);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
