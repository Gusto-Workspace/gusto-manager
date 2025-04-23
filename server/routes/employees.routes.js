const express = require("express");
const router = express.Router();
const SibApiV3Sdk = require("sib-api-v3-sdk");
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

function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur d'instanciation du client Brevo:", err);
    throw err;
  }
}

function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Gusto Manager",
    };
    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.htmlContent = params.htmlContent;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    throw err;
  }
}

// Générateur de mot de passe 8 caractères
function generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const specials = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + upper.toLowerCase() + digits + specials;

  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    specials[Math.floor(Math.random() * specials.length)],
  ];
  while (pw.length < 8) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pw.sort(() => 0.5 - Math.random()).join("");
}

// ADD EMPLOYEE
router.post(
  "/restaurants/:id/employees",
  upload.single("profilePicture"),
  async (req, res) => {
    const restaurantId = req.params.id;

    // Vérification que le restaurant existe
    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Récupération des champs envoyés depuis le formulaire
    const {
      lastName,
      firstName,
      email,
      secuNumber,
      address,
      emergencyContact,
      phone,
      post,
      dateOnPost,
    } = req.body;

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
      const temporaryPassword = generatePassword();
      const newEmployee = new EmployeeModel({
        lastname: lastName,
        firstname: firstName,
        email: email,
        phone: phone,
        secuNumber: secuNumber,
        address: address,
        emergencyContact: emergencyContact,
        password: temporaryPassword,
        restaurant: restaurantId,
        post: post,
        dateOnPost: dateOnPost ? new Date(dateOnPost) : undefined,
        profilePicture,
      });

      await newEmployee.save();

      // Ajout de l'ID de l'employé dans le restaurant
      restaurant.employees.push(newEmployee._id);
      await restaurant.save();

      // ——— Envoi du mail de création ———
      const emailParams = {
        to: [
          {
            email: newEmployee.email,
            name: newEmployee.firstname,
          },
        ],
        subject: "Votre accès employé Gusto Manager",
        htmlContent: `
              <p>Bonjour ${newEmployee.firstname},</p>
              <p>Votre compte employé a été créé avec succès.</p>
              <p>Connectez-vous ici : 
                <a href="https://gusto-manager.com/dashboard/login">
                  https://gusto-manager.com/dashboard/login
                </a>
              </p>
              <p><strong>Identifiant :</strong> ${newEmployee.email}<br/>
                 <strong>Mot de passe temporaire :</strong> ${temporaryPassword}
              </p>
              <p>Merci de modifier votre mot de passe lors de votre première connexion.</p>
              <p>— L’équipe Gusto Manager</p>
            `,
      };
      sendTransactionalEmail(emailParams)
        .then(() => console.log("Mail création employé envoyé"))
        .catch((err) => console.error("Erreur mail création employé :", err));

      // Re-popule le champ employees directement sur l'objet restaurant
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees");

      res.status(201).json({ restaurant : updatedRestaurant });
    } catch (error) {
      console.error("Error creating employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// UPDATE EMPLOYEE (détails généraux & options)
router.patch(
  "/restaurants/:restaurantId/employees/:employeeId",
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const {
        firstname,
        lastname,
        email,
        phone,
        secuNumber,
        address,
        emergencyContact,
        post,
        dateOnPost,
        options,
      } = req.body;

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || employee.restaurant.toString() !== restaurantId) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // 1) Supprimer l'ancienne image si on en reçoit une nouvelle
      if (req.file) {
        if (employee.profilePicture?.public_id) {
          await cloudinary.uploader.destroy(employee.profilePicture.public_id);
        }
        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/employees`
        );
        employee.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      }

      // 2) Champs classiques
      if (firstname !== undefined) employee.firstname = firstname;
      if (lastname !== undefined) employee.lastname = lastname;
      if (email !== undefined) employee.email = email;
      if (phone !== undefined) employee.phone = phone;
      if (secuNumber !== undefined) employee.secuNumber = secuNumber;
      if (address !== undefined) employee.address = address;
      if (emergencyContact !== undefined)
        employee.emergencyContact = emergencyContact;
      if (post !== undefined) employee.post = post;
      if (dateOnPost !== undefined) employee.dateOnPost = new Date(dateOnPost);
      if (options !== undefined) employee.options = options;

      await employee.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error updating employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// UPLOAD DOCUMENTS
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  upload.array("documents"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || employee.restaurant.toString() !== restaurantId) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // uplaod chaque fichier
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `Gusto_Workspace/restaurants/${restaurantId}/employees/docs`,
              resource_type: "auto",
            },
            (err, res) => (err ? reject(err) : resolve(res))
          );
          streamifier.createReadStream(file.buffer).pipe(stream);
        });
        employee.documents.push({
          url: result.secure_url,
          public_id: result.public_id,
          filename: file.originalname,
        });
      }
      await employee.save();

      // renvoyer le restaurant mis à jour
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");
      res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      console.error("Error uploading documents:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// DELETE DOCUMENT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)",
  async (req, res) => {
    const { restaurantId, employeeId, public_id } = req.params;

    try {
      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || employee.restaurant.toString() !== restaurantId) {
        return res.status(404).json({ message: "Employee not found" });
      }

      await cloudinary.uploader.destroy(public_id);

      employee.documents = employee.documents.filter(
        (doc) => doc.public_id !== public_id
      );

      await employee.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      return res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: err.message });
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

      // Re-chargement du restaurant avec la population complète
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      res.status(201).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

module.exports = router;
