const express = require("express");
const router = express.Router();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const axios = require("axios");
const path = require("path");
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const OwnerModel = require("../models/owner.model");
const TrainingSession = require("../models/logs/training-session.model");

// ---------- HELPERS MULTI-RESTAURANTS / PROFILES ----------

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function employeeWorksInRestaurant(employee, restaurantId) {
  const target = String(restaurantId);
  return Array.isArray(employee.restaurants)
    ? employee.restaurants.some((id) => String(id) === target)
    : false;
}

function ensureEmployeeRestaurantLink(employee, restaurantId) {
  if (!Array.isArray(employee.restaurants)) {
    employee.restaurants = [];
  }
  const target = String(restaurantId);
  if (!employee.restaurants.some((id) => String(id) === target)) {
    employee.restaurants.push(restaurantId);
  }
}

function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target
  );
}

function getOrCreateRestaurantProfile(employee, restaurantId) {
  let profile = findRestaurantProfile(employee, restaurantId);
  if (!profile) {
    employee.restaurantProfiles = employee.restaurantProfiles || [];
    employee.restaurantProfiles.push({
      restaurant: restaurantId,
      options: {},
      documents: [],
      shifts: [],
      leaveRequests: [],
    });
    profile =
      employee.restaurantProfiles[employee.restaurantProfiles.length - 1];
  }
  return profile;
}

// ---------- CLOUDINARY / MULTER ----------

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

// ---------- BREVO ----------

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

// Générateur de mot de passe 8 caractères
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

// ---------- ADD / IMPORT EMPLOYEE (SNAPSHOT + MULTI-RESTOS) ----------

router.post(
  "/restaurants/:id/employees",
  upload.single("profilePicture"),
  async (req, res) => {
    const restaurantId = req.params.id;

    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

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

    const normalizedEmail = normalizeEmail(email);

    try {
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

      // 1) Vérifier si un employé existe déjà avec cet email
      let existingEmployee = null;
      if (normalizedEmail) {
        existingEmployee = await EmployeeModel.findOne({
          email: normalizedEmail,
        });
      }

      // ---------- CAS 1 : NOUVEL EMPLOYÉ ----------
      if (!existingEmployee) {
        const temporaryPassword = generatePassword();
        const newEmployee = new EmployeeModel({
          lastname: lastName,
          firstname: firstName,
          email: normalizedEmail || undefined,
          phone: phone,
          secuNumber: secuNumber,
          address: address,
          emergencyContact: emergencyContact,
          password: temporaryPassword,
          post: post,
          dateOnPost: dateOnPost ? new Date(dateOnPost) : undefined,
          profilePicture,
          restaurants: [restaurantId],
          restaurantProfiles: [
            {
              restaurant: restaurantId,
              options: {}, // par défaut, tout à false
              documents: [],
              shifts: [],
              leaveRequests: [],
            },
          ],
        });

        await newEmployee.save();

        restaurant.employees.push(newEmployee._id);
        await restaurant.save();

        if (newEmployee.email) {
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
            .catch((err) =>
              console.error("Erreur mail création employé :", err)
            );
        }

        const updatedRestaurant = await RestaurantModel.findById(restaurantId)
          .populate("owner_id", "firstname")
          .populate("menus")
          .populate("employees");

        return res.status(201).json({ restaurant: updatedRestaurant });
      }

      // ---------- CAS 2 : EMPLOYÉ EXISTANT ----------
      ensureEmployeeRestaurantLink(existingEmployee, restaurantId);

      if (profilePicture) {
        existingEmployee.profilePicture = profilePicture;
      }

      // On crée le profil pour ce restaurant si inexistant
      getOrCreateRestaurantProfile(existingEmployee, restaurantId);

      await existingEmployee.save();

      if (
        !restaurant.employees.some(
          (id) => String(id) === String(existingEmployee._id)
        )
      ) {
        restaurant.employees.push(existingEmployee._id);
        await restaurant.save();
      }

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error creating/importing employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---------- UPDATE EMPLOYEE POUR UN RESTO DONNÉ (options par resto) ----------

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
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Photo globale
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

      // Identité globale
      if (firstname !== undefined) employee.firstname = firstname;
      if (lastname !== undefined) employee.lastname = lastname;
      if (phone !== undefined) employee.phone = phone;
      if (secuNumber !== undefined) employee.secuNumber = secuNumber;
      if (address !== undefined) employee.address = address;
      if (emergencyContact !== undefined)
        employee.emergencyContact = emergencyContact;
      if (post !== undefined) employee.post = post;
      if (dateOnPost !== undefined)
        employee.dateOnPost = dateOnPost ? new Date(dateOnPost) : undefined;

      const normalizedEmail = normalizeEmail(email);
      if (email !== undefined) employee.email = normalizedEmail;

      // Options spécifiques à CE restaurant
      const profile = getOrCreateRestaurantProfile(employee, restaurantId);
      if (options !== undefined) {
        profile.options = options;
      }

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

// ---------- DOCUMENTS (par restaurant) ----------

// UPLOAD DOCUMENTS
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  upload.array("documents"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = getOrCreateRestaurantProfile(employee, restaurantId);

      let titles = [];
      if (req.body.titles) {
        titles = Array.isArray(req.body.titles)
          ? req.body.titles
          : [req.body.titles];
      }

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const title = titles[i] || "";

        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const safeName = basename
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_\-]/g, "");

        const folder = `Gusto_Workspace/restaurants/${restaurantId}/employees/docs`;

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

        profile.documents.push({
          url: result.secure_url,
          public_id: result.public_id,
          filename: file.originalname,
          title: title,
        });
      }

      await employee.save();

      const updatedRestaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");

      return res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      console.error("Error uploading documents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// LIST DOCUMENTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
      );

      return res.json({ documents: profile?.documents || [] });
    } catch (err) {
      console.error("Error fetching employee documents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// DOWNLOAD DOCUMENT
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, employeeId, public_id } = req.params;
      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(emp, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const doc = (profile.documents || []).find(
        (d) => d.public_id === public_id
      );
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }

      const response = await axios.get(doc.url, { responseType: "stream" });

      res.setHeader("Content-Type", response.headers["content-type"]);
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
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(employee, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      await cloudinary.uploader.destroy(public_id, {
        resource_type: "raw",
      });

      profile.documents = profile.documents.filter(
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

// ---------- DELETE EMPLOYEE D'UN RESTO (multi-resto) ----------

router.delete(
  "/restaurants/:restaurantId/employees/:employeeId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const restaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // 1) Détacher l'employé du restaurant
      restaurant.employees = restaurant.employees.filter(
        (e) => String(e._id || e) !== String(employeeId)
      );
      await restaurant.save();

      // 2) Retirer ce restaurant de la liste de l'employé
      employee.restaurants = (employee.restaurants || []).filter(
        (id) => String(id) !== String(restaurantId)
      );

      // 3) Supprimer le profil pour ce restaurant
      employee.restaurantProfiles =
        employee.restaurantProfiles?.filter(
          (p) => String(p.restaurant) !== String(restaurantId)
        ) || [];

      // 4) Si l'employé n'est plus rattaché à aucun resto → suppression totale
      if (!employee.restaurants || employee.restaurants.length === 0) {
        // Document & image de profil : on pourrait les supprimer ici
        if (employee.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(
              employee.profilePicture.public_id
            );
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de la photo employé :",
              err
            );
          }
        }

        // Les documents sont stockés par restaurant. Les URLs Cloudinary
        // sont déjà dans des dossiers par resto, donc on ne les parcourt pas ici
        // pour simplifier. À faire si tu veux un nettoyage complet.

        await EmployeeModel.findByIdAndDelete(employeeId);
      } else {
        await employee.save();
      }

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

// ---------- SHIFTS (par restaurant) ----------

// GET SHIFTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
      );

      return res.json({ shifts: profile?.shifts || [] });
    } catch (err) {
      console.error("Erreur fetch shifts:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST SHIFT
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    const { restaurantId, employeeId } = req.params;
    const { title, start, end, leaveRequestId = null } = req.body;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);

    profile.shifts.push({
      title,
      start: new Date(start),
      end: new Date(end),
      leaveRequestId: leaveRequestId || null,
    });

    await emp.save();
    const created = profile.shifts[profile.shifts.length - 1];
    return res.status(201).json({ shift: created, shifts: profile.shifts });
  }
);

// PUT SHIFT
router.put(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    const { restaurantId, employeeId, shiftId } = req.params;
    const { title, start, end } = req.body;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const shift = profile.shifts.id(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

    if (title !== undefined) shift.title = title;
    if (start !== undefined) shift.start = new Date(start);
    if (end !== undefined) shift.end = new Date(end);

    await emp.save();
    return res.json({ shift, shifts: profile.shifts });
  }
);

// DELETE SHIFT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    const { restaurantId, employeeId, shiftId } = req.params;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const shift = profile.shifts.id(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

    shift.deleteOne();
    await emp.save();
    return res.json({ shifts: profile.shifts });
  }
);

// ---------- DEMANDES DE CONGÉS (par restaurant) ----------

// CREATE LEAVE-REQUEST
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const { start, end, type } = req.body;
      if (!start || !end) {
        return res.status(400).json({ message: "start et end sont requis" });
      }

      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = getOrCreateRestaurantProfile(emp, restaurantId);

      profile.leaveRequests.push({
        start: new Date(start),
        end: new Date(end),
        type: ["full", "morning", "afternoon"].includes(type) ? type : "full",
        createdAt: new Date(),
        status: "pending",
      });
      await emp.save();

      const last = profile.leaveRequests[profile.leaveRequests.length - 1];

      // Notifie le restaurant concerné
      broadcastToRestaurant(String(restaurantId), {
        type: "leave_request_created",
        employeeId: String(emp._id),
        restaurantId: String(restaurantId),
        leaveRequest: last,
      });

      return res.status(201).json(profile.leaveRequests);
    } catch (err) {
      console.error("Erreur création leaveRequest:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// LIST LEAVE-REQUESTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const emp = await EmployeeModel.findById(employeeId).lean();
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (emp.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
      );

      return res.json(profile?.leaveRequests || []);
    } catch (err) {
      console.error("Erreur list leaveRequests:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// UPDATE LEAVE-REQUEST STATUS
router.put(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests/:reqId",
  async (req, res) => {
    const { restaurantId, employeeId, reqId } = req.params;
    const { status } = req.body;
    if (!["pending", "approved", "rejected", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "status invalide" });
    }

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const lr = profile.leaveRequests.id(reqId);
    if (!lr) return res.status(404).json({ message: "Request not found" });

    lr.status = status;

    if (status === "approved") {
      const already = profile.shifts.some(
        (s) => String(s.leaveRequestId) === String(lr._id)
      );
      if (!already) {
        profile.shifts.push({
          title: "Congés",
          start: lr.start,
          end: lr.end,
          leaveRequestId: lr._id,
        });
      }
    }

    if (status === "cancelled") {
      profile.shifts = profile.shifts.filter(
        (s) => String(s.leaveRequestId) !== String(lr._id)
      );
    }

    await emp.save();
    return res.json({
      leaveRequest: lr,
      shifts: profile.shifts,
    });
  }
);

// DELETE LEAVE-REQUEST
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests/:reqId",
  async (req, res) => {
    const { restaurantId, employeeId, reqId } = req.params;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const lr = profile.leaveRequests.id(reqId);
    if (!lr) return res.status(404).json({ message: "Request not found" });

    profile.shifts = profile.shifts.filter(
      (s) => String(s.leaveRequestId) !== String(reqId)
    );

    lr.deleteOne();
    await emp.save();

    return res.json({
      leaveRequests: profile.leaveRequests,
      shifts: profile.shifts,
    });
  }
);

// Récupérer les notifications non lues des demandes de congés (par resto)
router.get("/restaurants/:id/leave-requests/unread-count", async (req, res) => {
  try {
    const restaurantId = req.params.id;
    const since = req.query.since ? new Date(req.query.since) : null;
    if (!since)
      return res.status(400).json({ message: "since is required (ISO)" });

    const employees = await EmployeeModel.find(
      { restaurants: restaurantId },
      { restaurantProfiles: 1 }
    ).lean();

    const objectIdToDate = (oid) =>
      new Date(parseInt(String(oid).substring(0, 8), 16) * 1000);

    let count = 0;
    for (const emp of employees) {
      const profile = (emp.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
      );
      if (!profile) continue;

      for (const lr of profile.leaveRequests || []) {
        const createdAt = lr.createdAt
          ? new Date(lr.createdAt)
          : objectIdToDate(lr._id);
        if (createdAt > since) count++;
      }
    }

    return res.json({ unreadLeaveRequests: count });
  } catch (err) {
    console.error("Error unread-count leaveRequests:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ---------- EMPLOYEE ME / UPDATE DATA / PASSWORD ----------

router.get("/employees/me", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "employee") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const emp = await EmployeeModel.findById(req.user.id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const restaurantIdFromToken = req.user.restaurantId;
    let restaurant = null;
    let currentProfile = null;

    if (restaurantIdFromToken) {
      restaurant = await RestaurantModel.findById(restaurantIdFromToken)
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      currentProfile = findRestaurantProfile(emp, restaurantIdFromToken);
    }

    return res.json({ employee: emp, restaurant, currentProfile });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/employees/update-data", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "employee") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { firstname, lastname, email, phone } = req.body;
    const emp = await EmployeeModel.findById(req.user.id);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const normalizedEmail = normalizeEmail(email);

    if (normalizedEmail && normalizedEmail !== emp.email) {
      const [employeeDup, ownerDup] = await Promise.all([
        EmployeeModel.findOne({
          email: normalizedEmail,
          _id: { $ne: emp._id },
        }),
        OwnerModel.findOne({ email: normalizedEmail }),
      ]);
      if (employeeDup || ownerDup) {
        return res
          .status(409)
          .json({ message: "L'adresse mail est déjà utilisée" });
      }
    }

    if (firstname !== undefined) emp.firstname = firstname;
    if (lastname !== undefined) emp.lastname = lastname;
    if (email !== undefined) emp.email = normalizedEmail;
    if (phone !== undefined) emp.phone = phone;

    await emp.save();

    const jwt = require("jsonwebtoken");
    const payload = {
      id: emp._id,
      role: "employee",
      firstname: emp.firstname,
      lastname: emp.lastname,
      email: emp.email,
      phone: emp.phone,
      restaurantId: req.user.restaurantId,
      options: req.user.options || {}, // options déjà liées au resto courant
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ message: "Employee updated", token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/employees/update-password",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { currentPassword, newPassword } = req.body;

      const emp = await EmployeeModel.findById(req.user.id);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const ok = await emp.comparePassword(currentPassword, emp.password);
      if (!ok)
        return res.status(401).json({ message: "Incorrect current password" });

      emp.password = newPassword; // hash via pre('save')
      await emp.save();

      return res.json({ message: "Password updated successfully" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// ---------- TRAINING SESSIONS (global, pas par resto) ----------

router.get("/employees/:employeeId/training-sessions", async (req, res) => {
  try {
    const { employeeId } = req.params;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "50", 10), 1),
      100
    );
    const skip = (page - 1) * limit;

    const emp = await EmployeeModel.findById(employeeId)
      .select("trainingSessions")
      .lean();

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const ids = Array.isArray(emp.trainingSessions) ? emp.trainingSessions : [];
    const total = ids.length;

    if (total === 0) {
      return res.json({ trainingSessions: [], total, page, limit });
    }

    const items = await TrainingSession.find({ _id: { $in: ids } })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const trainingSessions = items.map((s) => {
      const me = (s.attendees || []).find(
        (a) => String(a.employeeId) === String(employeeId)
      );
      return {
        ...s,
        myStatus: me?.status || "attended",
        myNotes: me?.notes || "",
        mySignedAt: me?.signedAt || null,
        myCertificateUrl: me?.certificateUrl || null,
      };
    });

    return res.json({ trainingSessions, total, page, limit });
  } catch (e) {
    console.error("Error fetching training sessions:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
