const express = require("express");
const router = express.Router();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const axios = require("axios");
const path = require("path");

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

      res.status(201).json({ restaurant: updatedRestaurant });
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

// ——— UPLOAD DOCUMENTS ———
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  upload.array("documents"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      // 1. Vérifier que l’employé existe et appartient bien au restaurant
      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || employee.restaurant.toString() !== restaurantId) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // 2. Extraire les titres envoyés dans le même FormData
      //    Si un seul titre, multer/Express mettra req.body.titles sous forme de string
      let titles = [];
      if (req.body.titles) {
        titles = Array.isArray(req.body.titles)
          ? req.body.titles
          : [req.body.titles];
      }

      // 3. Pour chaque fichier reçu, récupérer le titre correspondant (ou chaîne vide)
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const title = titles[i] || "";

        // Calculer un nom "safe" pour Cloudinary
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const safeName = basename
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_\-]/g, "");

        // Dossier Cloudinary : restaurants/<restaurantId>/employees/docs
        const folder = `Gusto_Workspace/restaurants/${restaurantId}/employees/docs`;

        // 4. Upload vers Cloudinary en mode "raw"
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder,
              public_id: safeName,
              overwrite: true,
            },
            (err, r) => {
              if (err) return reject(err);
              resolve(r);
            }
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });

        // 5. Ajouter l’entrée au tableau `documents` de l’employé
        employee.documents.push({
          url: result.secure_url,
          public_id: result.public_id,
          filename: file.originalname,
          title: title,
        });
      }

      // 6. Sauvegarder l’employé mis à jour
      await employee.save();

      // 7. Renvoyer le restaurant complet mis à jour (avec populate pour les employés)
      const updatedRestaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");

      return res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      console.error("Error uploading documents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ——— DOWNLOAD DOCUMENTS ———
router.get(
  "/employees/:employeeId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { employeeId, public_id } = req.params;
      const emp = await EmployeeModel.findById(employeeId);
      if (!emp) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const doc = emp.documents.find((d) => d.public_id === public_id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Streaming depuis Cloudinary
      const response = await axios.get(doc.url, { responseType: "stream" });

      // Propager le type mime
      res.setHeader("Content-Type", response.headers["content-type"]);
      // Forcer le téléchargement avec le vrai nom
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${doc.filename}"`
      );

      response.data.pipe(res);
    } catch (err) {
      console.error("Error in download route:", err);
      res.status(500).json({ message: "Server error" });
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

      await cloudinary.uploader.destroy(public_id, {
        resource_type: "raw",
      });

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

      // 3) Supprimer tous les documents Cloudinary (raw) de l'employé
      if (employee.documents && employee.documents.length > 0) {
        for (const doc of employee.documents) {
          if (doc.public_id) {
            try {
              await cloudinary.uploader.destroy(doc.public_id, {
                resource_type: "raw",
              });
            } catch (err) {
              console.warn(
                `Erreur lors de la suppression du document ${doc.public_id}:`,
                err
              );
            }
          }
        }
      }

      // Optionnel : supprimer l'image associée sur Cloudinary s'il y en a une
      if (employee.profilePicture?.public_id) {
        await cloudinary.uploader.destroy(employee.profilePicture.public_id);
      }

      // Suppression de l'employé dans la base de données
      await EmployeeModel.findByIdAndDelete(employeeId);

      // Retirer l'ID de l'employé du tableau du restaurant
      await RestaurantModel.updateOne(
        { _id: restaurantId },
        { $pull: { employees: employeeId } }
      );

      // Re-chargement du restaurant avec la population complète
      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      if (!updatedRestaurant) {
        return res
          .status(404)
          .json({ message: "Restaurant not found after update" });
      }

      res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET EMPLOYEE DOCUMENTS
router.get("/employees/:employeeId/documents", async (req, res) => {
  try {
    const { employeeId } = req.params;

    console.log();

    // 1. Récupérer l’employé directement
    const employee = await EmployeeModel.findById(employeeId).lean();
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // 2. Renvoyer la liste de ses documents
    return res.json({ documents: employee.documents });
  } catch (err) {
    console.error("Error fetching employee documents:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// 1) GET EMPLOYEE SHIFT
router.get("/employees/:employeeId/shifts", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await EmployeeModel.findById(employeeId).lean();
    if (!employee) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }
    return res.json({ shifts: employee.shifts });
  } catch (err) {
    console.error("Erreur fetch shifts:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST EMPLOYEE SHIFT
router.post("/employees/:employeeId/shifts", async (req, res) => {
  const { employeeId } = req.params;
  const { title, start, end, leaveRequestId = null } = req.body;

  const emp = await EmployeeModel.findById(employeeId);
  if (!emp) return res.status(404).json({ message: "Employé non trouvé" });

  emp.shifts.push({
    title,
    start: new Date(start),
    end: new Date(end),
    leaveRequestId: leaveRequestId || null,
  });

  await emp.save();
  const created = emp.shifts[emp.shifts.length - 1]; // dernier push
  return res.status(201).json({ shift: created, shifts: emp.shifts });
});

// PUT EMPLOYEE SHIFT
router.put("/employees/:employeeId/shifts/:shiftId", async (req, res) => {
  const { employeeId, shiftId } = req.params;
  const { title, start, end } = req.body;

  const emp = await EmployeeModel.findById(employeeId);
  if (!emp) return res.status(404).json({ message: "Employé non trouvé" });

  const shift = emp.shifts.id(shiftId);
  if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

  if (title !== undefined) shift.title = title;
  if (start !== undefined) shift.start = new Date(start);
  if (end !== undefined) shift.end = new Date(end);

  await emp.save();
  return res.json({ shift, shifts: emp.shifts });
});

// 4) DELETE EMPLOYEE SHIFT
router.delete("/employees/:employeeId/shifts/:shiftId", async (req, res) => {
  const { employeeId, shiftId } = req.params;

  const emp = await EmployeeModel.findById(employeeId);
  if (!emp) return res.status(404).json({ message: "Employé non trouvé" });

  const shift = emp.shifts.id(shiftId);
  if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

  shift.deleteOne(); // supprime le sous-doc
  await emp.save();
  return res.json({ shifts: emp.shifts });
});

// ——— DEMANDES DE CONGÉS ———

// 1) Créer une nouvelle demande de congé pour un employé
router.post("/employees/:employeeId/leave-requests", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { start, end, type } = req.body;
    if (!start || !end) {
      return res.status(400).json({ message: "start et end sont requis" });
    }
    const emp = await EmployeeModel.findById(employeeId);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // on pousse la nouvelle demande
    emp.leaveRequests.push({
      start: new Date(start),
      end: new Date(end),
      type: ["full", "morning", "afternoon"].includes(type) ? type : "full",
    });
    await emp.save();

    // on renvoie la liste à jour
    return res.status(201).json(emp.leaveRequests);
  } catch (err) {
    console.error("Erreur création leaveRequest:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// 2) Lister toutes les demandes de congé d’un employé
router.get("/employees/:employeeId/leave-requests", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const emp = await EmployeeModel.findById(employeeId).lean();
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    return res.json(emp.leaveRequests);
  } catch (err) {
    console.error("Erreur list leaveRequests:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// 3) Mettre à jour le statut d’une demande (approved | rejected | cancelled)
router.put("/employees/:employeeId/leave-requests/:reqId", async (req, res) => {
  const { employeeId, reqId } = req.params;
  const { status } = req.body;
  if (!["pending", "approved", "rejected", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "status invalide" });
  }

  const emp = await EmployeeModel.findById(employeeId);
  if (!emp) return res.status(404).json({ message: "Employee not found" });

  const lr = emp.leaveRequests.id(reqId);
  if (!lr) return res.status(404).json({ message: "Request not found" });

  lr.status = status;

  if (status === "approved") {
    // évite doublon de shift relié à CETTE LR
    const already = emp.shifts.some(
      (s) => String(s.leaveRequestId) === String(lr._id)
    );
    if (!already) {
      emp.shifts.push({
        title: "Congés",
        start: lr.start,
        end: lr.end,
        leaveRequestId: lr._id,
      });
    }
  }

  if (status === "cancelled") {
    // supprime UNIQUEMENT les shifts liés par leaveRequestId
    emp.shifts = emp.shifts.filter(
      (s) => String(s.leaveRequestId) !== String(lr._id)
    );
  }

  await emp.save();
  return res.json({
    leaveRequest: lr,
    shifts: emp.shifts,
  });
});

// 4) Supprimer une demande de congé
router.delete(
  "/employees/:employeeId/leave-requests/:reqId",
  async (req, res) => {
    const { employeeId, reqId } = req.params;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const lr = emp.leaveRequests.id(reqId);
    if (!lr) return res.status(404).json({ message: "Request not found" });

    // supprime les shifts liés par ID
    emp.shifts = emp.shifts.filter(
      (s) => String(s.leaveRequestId) !== String(reqId)
    );

    lr.deleteOne();
    await emp.save();

    return res.json({
      leaveRequests: emp.leaveRequests,
      shifts: emp.shifts,
    });
  }
);

module.exports = router;
