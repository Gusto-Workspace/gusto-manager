const express = require("express");
const router = express.Router();

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

// MODELS
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration de multer pour stocker les fichiers en mémoire
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Fonction pour uploader une image à partir d'un buffer sur Cloudinary
const uploadFromBuffer = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ADD EMPLOYEE
router.post(
  "/restaurants/:id/employees",
  upload.single("profilePicture"),
  async (req, res) => {
    const restaurantId = req.params.id;

    // Vérification que le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees");
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Récupération des champs envoyés depuis le formulaire
    const { lastName, firstName, email, post, dateOnPost } = req.body;

    try {
      // Gestion de l'upload de l'image de profil
      let profilePicture = null;
      if (req.file) {
        const cloudinaryResponse = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/employees`
        );
        profilePicture = {
          url: cloudinaryResponse.secure_url,
          public_id: cloudinaryResponse.public_id,
        };
      }

      // Création du nouvel employé
      const newEmployee = new EmployeeModel({
        lastname: lastName,
        firstname: firstName,
        email: email,
        restaurant: restaurantId,
        post: post,
        dateOnPost: dateOnPost ? new Date(dateOnPost) : undefined,
        profilePicture,
      });

      await newEmployee.save();

      // Ajout de l'ID de l'employé dans le restaurant
      restaurant.employees.push(newEmployee._id);
      await restaurant.save();

      // Re-popule le champ employees directement sur l'objet restaurant
      await restaurant.populate("employees");

      res.status(201).json({ restaurant });
    } catch (error) {
      console.error("Error creating employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// DELETE EMPLOYEE
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      // Recherche du restaurant avec peuplement des employés
      const restaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Recherche de l'employé à supprimer
      const employee = await EmployeeModel.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Optionnel : supprimer l'image associée sur Cloudinary s'il y en a une
      if (employee.profilePicture && employee.profilePicture.public_id) {
        await cloudinary.uploader.destroy(employee.profilePicture.public_id);
      }

      // Suppression de l'employé dans la base de données
      await EmployeeModel.findByIdAndDelete(employeeId);

      // Retirer l'ID de l'employé du tableau du restaurant
      restaurant.employees = restaurant.employees.filter(
        (empId) => empId.toString() !== employeeId
      );
      await restaurant.save();

      // Re-popule le champ employees pour renvoyer des données détaillées
      await restaurant.populate("employees");

      res.status(200).json({
        message: "Employee deleted successfully",
        restaurant,
      });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

module.exports = router;

module.exports = router;
